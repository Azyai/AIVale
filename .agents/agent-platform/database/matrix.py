"""Execute isolated workspace migration and access checks, then stop the server.

This engineering runner does not ship local test sources or accept old evidence.
It never reads application DSNs or controls an installed database service.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / '.agents/agent-platform/delivery'))
from gate import (
    agent_config_model_log_result, agent_definition_log_result, database_log_result, go_test_summary, stop_process, workspace_access_log_result,
    workspace_governance_log_result, workspace_grants_log_result, workspace_members_log_result,
    workspace_read_log_result, workspace_write_log_result,
)


def run_logged(argv: list[str], env: dict, output: Path, name: str, timeout: int) -> int:
    with (output / (name + '.stdout.log')).open('wb') as stdout, (output / (name + '.stderr.log')).open('wb') as stderr:
        process = subprocess.Popen(
            argv, cwd=REPO, env=env, stdout=stdout, stderr=stderr,
            start_new_session=os.name != 'nt',
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0,
        )
        try:
            return process.wait(timeout=timeout)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            stop_process(process)
            raise


def execute(engine: str, output: Path, access: bool = False, read: bool = False, write: bool = False, members: bool = False, grants: bool = False, governance: bool = False, definitions: bool = False, config_validation: bool = False, runs: bool = False, run_journal: bool = False) -> dict:
    runs = runs or run_journal
    config_validation = config_validation or runs
    definitions = definitions or config_validation
    governance = governance or definitions
    grants = grants or governance
    members = members or grants
    write = write or members
    read = read or write
    access = access or read
    run_id = datetime.now(timezone.utc).strftime('%y%m%d%H%M%S') + uuid.uuid4().hex[:8]
    report = {
        'schema_version': 1, 'engine': engine, 'run_id': run_id, 'status': 'incomplete',
        'started_at_utc': datetime.now(timezone.utc).isoformat(),
        'cleanup': {'stopped': False}, 'go_exit_code': None,
        'access_requested': access,
        'read_requested': read,
        'write_requested': write,
        'members_requested': members,
        'grants_requested': grants,
        'governance_requested': governance,
        'definitions_requested': definitions,
        'config_validation_requested': config_validation,
        'runs_requested': runs,
        'run_journal_requested': run_journal,
    }
    owned_output = None
    state_path = None
    script = None
    pwsh = shutil.which('pwsh')
    try:
        requested = output if output.is_absolute() else REPO / output
        for component in (requested, *requested.parents):
            if component.is_symlink() or getattr(component, 'is_junction', lambda: False)():
                raise ValueError('Local output must not traverse links or junctions.')
            if component == REPO:
                break
        allowed = REPO / '.local-tests/agent-platform/delivery'
        output = requested.resolve()
        if output == allowed or not output.is_relative_to(allowed) or output.exists():
            raise ValueError('Output must be a new directory inside the ignored delivery tree.')
        if subprocess.run(['git', 'check-ignore', '-q', '--', str(output.relative_to(REPO) / 'result.json')], cwd=REPO, check=False).returncode != 0:
            raise ValueError('Output must be ignored by Git.')
        output.mkdir(parents=True)
        owned_output = output
        if not shutil.which('go') or not (REPO / 'model/agent_workspace_database_test.go').is_file():
            raise ValueError('Go and the required local workspace database test must exist.')
        if access and not (REPO / 'service/agent/workspace_access_database_test.go').is_file():
            raise ValueError('The required local workspace access database test is missing.')
        if read and not (REPO / 'router/agent_workspace_read_database_test.go').is_file():
            raise ValueError('The required local workspace HTTP read database test is missing.')
        if write and not (REPO / 'router/agent_workspace_write_database_test.go').is_file():
            raise ValueError('The required local workspace lifecycle database test is missing.')
        if members and not (REPO / 'router/agent_workspace_members_database_test.go').is_file():
            raise ValueError('The required local workspace members database test is missing.')
        if grants and not (REPO / 'router/agent_token_grant_database_test.go').is_file():
            raise ValueError('The required local workspace token grant database test is missing.')
        if governance and not (REPO / 'router/agent_token_grant_renewal_database_test.go').is_file():
            raise ValueError('The required local workspace token grant renewal database test is missing.')
        if definitions and not (REPO / 'model/agent_definition_database_test.go').is_file():
            raise ValueError('The required local Agent definition database test is missing.')
        if config_validation and not (REPO / 'service/agent/agent_config_model_database_test.go').is_file():
            raise ValueError('The required local Agent config model database test is missing.')
        if runs and any(not (REPO / name).is_file() for name in ('model/agent_run_database_test.go', 'router/agent_run_database_test.go')):
            raise ValueError('The required local Run metadata migration and behavior tests are missing.')
        if run_journal and any(not (REPO / name).is_file() for name in ('model/agent_run_journal_database_test.go', 'router/agent_run_journal_database_test.go')):
            raise ValueError('The required local Run journal migration and application tests are missing.')
        env = os.environ.copy()
        if runs:
            for name in ('TEST_AGENT_DEFINITION_READ', 'TEST_AGENT_DEFINITION_WRITE', 'TEST_AGENT_DEFINITION_PUBLISH', 'TEST_AGENT_DEFINITION_LIFECYCLE', 'TEST_AGENT_EDITOR'):
                env[name] = '1'
        env['GOWORK'] = 'off'
        env['TEST_AGENT_WORKSPACE_ENGINE'] = engine
        env['TEST_AGENT_WORKSPACE_RUN_ID'] = run_id
        if engine == 'sqlite':
            run_directory = output / 'sqlite'
            run_directory.mkdir()
            dsns = {role: str(run_directory / (role + '.db')) for role in ('fresh', 'freshLog', 'upgrade', 'upgradeLog')}
        else:
            if os.name != 'nt' or not pwsh:
                raise ValueError('Native service fixtures currently require Windows and PowerShell 7.')
            folder = 'mysql' if engine == 'mysql' else 'postgres'
            script = REPO / '.agents/agent-platform' / folder / 'environment.ps1'
            run_directory = REPO / '.local-tests/agent-platform' / folder / run_id
            for component in (run_directory, *run_directory.parents):
                if component.is_symlink() or getattr(component, 'is_junction', lambda: False)():
                    raise ValueError('The environment directory must not traverse links.')
                if component == REPO:
                    break
            if run_directory.exists():
                raise ValueError('Refusing to reuse or clean up an existing database environment.')
            state_path = run_directory / 'environment.json'
            if engine == 'mysql':
                binary = Path(os.environ.get('AIVALE_TEST_MYSQL_BIN', r'C:\Program Files\MySQL\MySQL Server 26.7\bin'))
                binary_arg, executable = '-MySqlBin', 'mysqld.exe'
            else:
                binary = Path(os.environ.get('AIVALE_TEST_POSTGRES_BIN', str(REPO / '.local-tests/agent-platform/tools/postgresql-18.6-5/pgsql/bin')))
                binary_arg, executable = '-PostgresBin', 'postgres.exe'
            if not binary.is_absolute() or not (binary / executable).is_file() or not script.is_file():
                raise ValueError('The configured isolated database binaries or environment tool are missing.')
            start = [pwsh, '-NoLogo', '-NoProfile', '-NonInteractive', '-File', str(script), '-Action', 'Start', binary_arg, str(binary), '-RunId', run_id]
            report['start_argv'] = start
            if run_logged(start, env, output, 'environment-start', 240) != 0:
                raise ValueError('Isolated database startup failed; inspect local startup logs.')
            state = json.loads(state_path.read_text(encoding='utf-8-sig'))
            expected_purpose = 'p00-t03-mysql' if engine == 'mysql' else 'p01-t01-postgres'
            if state.get('runId') != run_id or state.get('purpose') != expected_purpose or state.get('status') != 'running':
                raise ValueError('The isolated environment state identity is invalid.')
            dsns = state['dsns']
        env['TEST_AGENT_WORKSPACE_RUN_DIRECTORY'] = str(run_directory)
        for role, suffix in {'fresh': 'FRESH', 'freshLog': 'FRESH_LOG', 'upgrade': 'UPGRADE', 'upgradeLog': 'UPGRADE_LOG'}.items():
            env['TEST_AGENT_WORKSPACE_' + suffix + '_DSN'] = dsns[role]
        argv = [shutil.which('go'), 'test', '-mod=readonly', '-count=1', '-json', '-timeout=5m', './model', '-run', '^TestAgentWorkspaceDatabaseMatrix$']
        report['go_argv'] = argv
        report['go_exit_code'] = run_logged(argv, env, output, 'go-test', 330)
        if report['go_exit_code'] != 0:
            report['status'] = 'failed'
            raise ValueError('The real database test failed; inspect ignored Go logs.')
        report.update(database_log_result(output / 'go-test.stdout.log', engine, run_id))
        if access:
            access_argv = [shutil.which('go'), 'test', '-mod=readonly', '-count=1', '-json', '-timeout=5m', './service/agent', '-run', '^TestAgentWorkspaceAccessDatabaseMatrix$']
            report['access_go_argv'] = access_argv
            report['access_go_exit_code'] = run_logged(access_argv, env, output, 'access-go-test', 330)
            if report['access_go_exit_code'] != 0:
                report['status'] = 'failed'
                raise ValueError('The real workspace access test failed; inspect ignored Go logs.')
            actual_access = workspace_access_log_result(output / 'access-go-test.stdout.log', engine, run_id)
            if actual_access['tests']['top_level_passed'] != 1 or actual_access['evidence']['version'] != report['evidence']['version']:
                raise ValueError('Workspace access must match the migration database version and exact test.')
            report['access_tests'] = actual_access['tests']
            report['access_evidence'] = actual_access['evidence']
        if read:
            read_argv = [shutil.which('go'), 'test', '-mod=readonly', '-count=1', '-json', '-timeout=5m', './router', '-run', '^TestAgentWorkspaceReadDatabaseMatrix$']
            report['read_go_argv'] = read_argv
            report['read_go_exit_code'] = run_logged(read_argv, env, output, 'read-go-test', 330)
            if report['read_go_exit_code'] != 0:
                report['status'] = 'failed'
                raise ValueError('The real workspace HTTP read test failed; inspect ignored Go logs.')
            actual_read = workspace_read_log_result(output / 'read-go-test.stdout.log', engine, run_id)
            if actual_read['tests']['top_level_passed'] != 1 or actual_read['evidence']['version'] != report['evidence']['version']:
                raise ValueError('Workspace HTTP read must match the migration database version and exact test.')
            report['read_tests'] = actual_read['tests']
            report['read_evidence'] = actual_read['evidence']
        if write:
            write_argv = [shutil.which('go'), 'test', '-mod=readonly', '-count=1', '-json', '-timeout=5m', './router', '-run', '^TestAgentWorkspaceWriteDatabaseMatrix$']
            report['write_go_argv'] = write_argv
            report['write_go_exit_code'] = run_logged(write_argv, env, output, 'write-go-test', 330)
            if report['write_go_exit_code'] != 0:
                report['status'] = 'failed'
                raise ValueError('The real workspace lifecycle test failed; inspect ignored Go logs.')
            actual_write = workspace_write_log_result(output / 'write-go-test.stdout.log', engine, run_id)
            if actual_write['tests']['top_level_passed'] != 1 or actual_write['evidence']['version'] != report['evidence']['version']:
                raise ValueError('Workspace lifecycle must match the migration database version and exact test.')
            report['write_tests'] = actual_write['tests']
            report['write_evidence'] = actual_write['evidence']
        if members:
            members_argv = [shutil.which('go'), 'test', '-mod=readonly', '-count=1', '-json', '-timeout=5m', './router', '-run', '^TestAgentWorkspaceMembersDatabaseMatrix$']
            report['members_go_argv'] = members_argv
            report['members_go_exit_code'] = run_logged(members_argv, env, output, 'members-go-test', 330)
            if report['members_go_exit_code'] != 0:
                report['status'] = 'failed'
                raise ValueError('The real workspace members test failed; inspect ignored Go logs.')
            actual_members = workspace_members_log_result(output / 'members-go-test.stdout.log', engine, run_id)
            if actual_members['tests']['top_level_passed'] != 1 or actual_members['evidence']['version'] != report['evidence']['version']:
                raise ValueError('Workspace members must match the migration database version and exact test.')
            report['members_tests'] = actual_members['tests']
            report['members_evidence'] = actual_members['evidence']
        if grants:
            grants_argv = [shutil.which('go'), 'test', '-mod=readonly', '-count=1', '-json', '-timeout=5m', './router', '-run', '^TestAgentTokenGrantDatabaseMatrix$']
            report['grants_go_argv'] = grants_argv
            report['grants_go_exit_code'] = run_logged(grants_argv, env, output, 'grants-go-test', 330)
            if report['grants_go_exit_code'] != 0:
                report['status'] = 'failed'
                raise ValueError('The real workspace token grant test failed; inspect ignored Go logs.')
            actual_grants = workspace_grants_log_result(output / 'grants-go-test.stdout.log', engine, run_id)
            if actual_grants['tests']['top_level_passed'] != 1 or actual_grants['evidence']['version'] != report['evidence']['version']:
                raise ValueError('Workspace token grants must match the migration database version and exact test.')
            report['grants_tests'] = actual_grants['tests']
            report['grants_evidence'] = actual_grants['evidence']
        if governance:
            argv = [shutil.which('go'), 'test', '-mod=readonly', '-count=1', '-json', '-timeout=5m', './router', '-run', '^TestAgentTokenGrantRenewalDatabaseMatrix$']
            report['governance_go_argv'] = argv
            report['governance_go_exit_code'] = run_logged(argv, env, output, 'governance-go-test', 330)
            if report['governance_go_exit_code'] != 0:
                report['status'] = 'failed'
                raise ValueError('The real workspace token grant renewal test failed; inspect ignored Go logs.')
            actual_governance = workspace_governance_log_result(output / 'governance-go-test.stdout.log', engine, run_id)
            if actual_governance['tests']['top_level_passed'] != 1 or actual_governance['evidence']['version'] != report['evidence']['version']:
                raise ValueError('Workspace token grant renewal must match the migration database version and exact test.')
            report['governance_tests'] = actual_governance['tests']
            report['governance_evidence'] = actual_governance['evidence']
        if definitions:
            definitions_argv = [shutil.which('go'), 'test', '-mod=readonly', '-count=1', '-json', '-timeout=5m', './model', '-run', '^TestAgentDefinitionDatabaseMatrix$']
            report['definitions_go_argv'] = definitions_argv
            report['definitions_go_exit_code'] = run_logged(definitions_argv, env, output, 'definitions-go-test', 330)
            if report['definitions_go_exit_code'] != 0:
                report['status'] = 'failed'
                raise ValueError('The real Agent definition database test failed; inspect ignored Go logs.')
            actual_definitions = agent_definition_log_result(output / 'definitions-go-test.stdout.log', engine, run_id)
            if actual_definitions['tests']['top_level_passed'] != 1 or actual_definitions['evidence']['version'] != report['evidence']['version']:
                raise ValueError('Agent definitions must match the migration database version and exact test.')
            report['definitions_tests'] = actual_definitions['tests']
            report['definitions_evidence'] = actual_definitions['evidence']
        if config_validation:
            config_argv = [shutil.which('go'), 'test', '-mod=readonly', '-count=1', '-json', '-timeout=5m', './service/agent', '-run', '^TestAgentConfigModelDatabaseMatrix$']
            report['config_validation_go_argv'] = config_argv
            report['config_validation_go_exit_code'] = run_logged(config_argv, env, output, 'config-validation-go-test', 330)
            if report['config_validation_go_exit_code'] != 0:
                report['status'] = 'failed'
                raise ValueError('The real Agent configuration validation test failed; inspect ignored Go logs.')
            actual_config = agent_config_model_log_result(output / 'config-validation-go-test.stdout.log', engine, run_id)
            if actual_config['tests']['top_level_passed'] != 1 or actual_config['evidence']['version'] != report['evidence']['version']:
                raise ValueError('Agent config validation must match the migration database version and exact test.')
            report['config_validation_tests'] = actual_config['tests']
            report['config_validation_evidence'] = actual_config['evidence']
        if runs:
            output_text = ''.join(json.loads(line).get('Output', '') for line in (output / 'read-go-test.stdout.log').read_text(encoding='utf8').splitlines() if line.strip())
            report['definition_http_regression'] = {}
            for marker in ('AGENT_DEFINITION_READ_HTTP_RESULT ', 'AGENT_DEFINITION_WRITE_HTTP_RESULT ', 'AGENT_DEFINITION_PUBLISH_HTTP_RESULT ', 'AGENT_DEFINITION_LIFECYCLE_HTTP_RESULT ', 'AGENT_EDITOR_HTTP_RESULT '):
                summaries = [json.loads(line.split(marker, 1)[1]) for line in output_text.splitlines() if marker in line]
                if len(summaries) != 2 or {item.get('scenario') for item in summaries} != {'fresh', 'upgrade'}:
                    raise ValueError('Run metadata prerequisites lack complete definition/editor HTTP regression markers.')
                for item in summaries:
                    count = item.get('http_requests')
                    if item.get('engine') != engine or item.get('run_id') != run_id or type(count) is not int or count < 1 or any(value is False for value in item.values()):
                        raise ValueError('Definition/editor HTTP regression identity, request count or assertion is invalid.')
                report['definition_http_regression'][marker.strip()] = summaries
            for label, package, test, marker, metadata in (
                ('runs', './model', 'TestAgentRunDatabaseMatrix', 'AGENT_RUN_DATABASE_RESULT ', False),
                ('run_metadata', './router', 'TestAgentRunMetadataDatabaseMatrix', 'AGENT_RUN_METADATA_RESULT ', True),
            ):
                argv = [shutil.which('go'), 'test', '-mod=readonly', '-count=1', '-json', '-timeout=5m', package, '-run', '^' + test + '$']
                report[label + '_go_argv'] = argv
                report[label + '_go_exit_code'] = run_logged(argv, env, output, label + '-go-test', 330)
                if report[label + '_go_exit_code'] != 0:
                    report['status'] = 'failed'
                    raise ValueError('The real Run metadata ' + label + ' stage failed; inspect ignored Go logs.')
                actual_run = run_metadata_log_result(output / (label + '-go-test.stdout.log'), engine, run_id, test, marker, metadata)
                if actual_run['tests']['top_level_passed'] != 1 or actual_run['evidence']['version'] != report['evidence']['version']:
                    raise ValueError('Run metadata must match the migration database version and exact test.')
                report[label + '_tests'] = actual_run['tests']
                report[label + '_evidence'] = actual_run['evidence']
        if run_journal:
            for label, package, marker, application in (
                ('run_journal_storage', './model', 'AGENT_RUN_JOURNAL_DATABASE_RESULT ', False),
                ('run_journal_application', './router', 'AGENT_RUN_JOURNAL_APPLICATION_RESULT ', True),
            ):
                test = 'TestAgentRunJournalDatabaseMatrix'
                argv = [shutil.which('go'), 'test', '-mod=readonly', '-count=1', '-json', '-timeout=5m', package, '-run', '^' + test + '$']
                report[label + '_go_argv'] = argv
                report[label + '_go_exit_code'] = run_logged(argv, env, output, label + '-go-test', 330)
                if report[label + '_go_exit_code'] != 0:
                    report['status'] = 'failed'
                    raise ValueError('The real Run journal ' + label + ' stage failed; inspect ignored Go logs.')
                actual = run_journal_log_result(output / (label + '-go-test.stdout.log'), engine, run_id, marker, application)
                if actual['tests']['top_level_passed'] != 1 or actual['evidence']['version'] != report['evidence']['version']:
                    raise ValueError('Run journal must match the migration database version and exact test.')
                report[label + '_tests'] = actual['tests']
                report[label + '_evidence'] = actual['evidence']
        report['status'] = 'passed'
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError, KeyboardInterrupt) as error:
        report['reason'] = str(error) or type(error).__name__
    finally:
        if owned_output is not None:
            try:
                if engine == 'sqlite':
                    report['cleanup'] = {'stopped': True, 'method': 'test process exited and its database handles closed'}
                elif state_path is not None and state_path.is_file():
                    state = json.loads(state_path.read_text(encoding='utf-8-sig'))
                    if state.get('runId') != run_id:
                        raise ValueError('Refusing cleanup of an environment with another run identity.')
                    if state.get('status') == 'running':
                        stop = [pwsh, '-NoLogo', '-NoProfile', '-NonInteractive', '-File', str(script), '-Action', 'Stop', '-RunId', run_id]
                        report['stop_exit_code'] = run_logged(stop, os.environ.copy(), owned_output, 'environment-stop', 90)
                        state = json.loads(state_path.read_text(encoding='utf-8-sig'))
                    report['cleanup'] = {'stopped': state.get('status') == 'stopped' and report.get('stop_exit_code', 0) == 0, 'state': str(state_path)}
                    if not report['cleanup']['stopped']:
                        raise ValueError('Normal shutdown of the isolated database was not confirmed.')
                else:
                    report['cleanup'] = {'stopped': False, 'reason': 'No completed environment state was created; inspect startup cleanup logs.'}
            except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError, KeyboardInterrupt) as error:
                report['cleanup'] = {'stopped': False, 'reason': str(error) or type(error).__name__}
            if report['status'] == 'passed' and not report['cleanup']['stopped']:
                report['status'] = 'incomplete'
                report['reason'] = 'Database checks passed but environment shutdown did not complete.'
            report['completed_at_utc'] = datetime.now(timezone.utc).isoformat()
            (owned_output / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report



def run_metadata_log_result(path: Path, engine: str, run_id: str, test: str, marker: str, metadata: bool) -> dict:
    result = go_test_summary(path, test, marker)
    evidence = result['evidence']
    if evidence.get('engine') != engine or evidence.get('run_id') != run_id or not evidence.get('version'):
        raise ValueError('Run metadata evidence does not match this engine and isolated run.')
    scenarios = evidence.get('scenarios', [])
    if len(scenarios) != 2 or {scenario.get('name') for scenario in scenarios} != {'fresh', 'upgrade'}:
        raise ValueError('Run metadata requires both fresh and upgraded databases.')
    storage_fields = ('isolated_schema', 'indexes_verified', 'prior_rows_preserved', 'scope_isolation', 'parent_consistency',
                      'status_vocabulary', 'initial_state', 'mutation_rejected', 'transaction_rollback', 'restart_preservation')
    metadata_fields = ('live_session', 'scope_isolation', 'funding_reference', 'fixed_release', 'same_key_replay',
                       'different_intent_conflict', 'concurrent_single_run', 'transaction_rollback', 'audit_redacted',
                       'no_execution', 'archive_fail_closed')
    for scenario in scenarios:
        count = scenario.get('metadata_operations' if metadata else 'repository_operations')
        if type(count) is not int or count < 1 or any(scenario.get(field) is not True for field in (metadata_fields if metadata else storage_fields)):
            raise ValueError('Run metadata lacks executed operations or required assertions.')
        if not metadata and (type(scenario.get('startup_passes')) is not int or scenario.get('startup_passes') != 3):
            raise ValueError('Run storage requires exactly three successful startup passes.')
    return result


def run_journal_log_result(path: Path, engine: str, run_id: str, marker: str, application: bool) -> dict:
    result = go_test_summary(path, 'TestAgentRunJournalDatabaseMatrix', marker)
    evidence = result['evidence']
    if evidence.get('engine') != engine or evidence.get('run_id') != run_id or not evidence.get('version'):
        raise ValueError('Run journal evidence does not match this engine and isolated run.')
    scenarios = evidence.get('scenarios', [])
    if len(scenarios) != 2 or {scenario.get('name') for scenario in scenarios} != {'fresh', 'upgrade'}:
        raise ValueError('Run journal requires both fresh and upgraded databases.')
    storage_fields = ('isolated_schema', 'indexes_verified', 'prior_rows_preserved', 'scope_isolation', 'parent_consistency',
                      'initial_state', 'mutation_rejected', 'transaction_rollback', 'restart_preservation')
    app_fields = ('metadata_only_closed', 'scope_isolation', 'queued_atomic', 'step_deduplicated', 'event_sequence',
                  'stale_fence_rejected', 'transaction_rollback', 'post_commit_exit_recovery', 'at_least_once_delivery',
                  'delivery_fence', 'retry_dead', 'audit_separation', 'reference_redacted', 'no_execution')
    for scenario in scenarios:
        count = scenario.get('journal_operations' if application else 'repository_operations')
        if type(count) is not int or count < 1 or any(scenario.get(field) is not True for field in (app_fields if application else storage_fields)):
            raise ValueError('Run journal lacks executed operations or required assertions.')
        if not application and scenario.get('startup_passes') != 3:
            raise ValueError('Run journal storage requires exactly three successful startup passes.')
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', choices=('sqlite', 'mysql', 'postgresql'), required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--access', action='store_true', help='After migration validation, execute P01-T02 live workspace authorization cases.')
    parser.add_argument('--read', action='store_true', help='Execute migration, access and P01-T03 real workspace HTTP read stages in order.')
    parser.add_argument('--write', action='store_true', help='Execute migration, access, reads and P01-T04 lifecycle stages in order.')
    parser.add_argument('--members', action='store_true', help='Execute the four prerequisite stages and P01-T05 members in order.')
    parser.add_argument('--grants', action='store_true', help='Execute the five prerequisite stages and P01-T06 token grants in order.')
    parser.add_argument('--governance', action='store_true', help='Execute the six prerequisite stages and P01-T07 token grant governance in order.')
    parser.add_argument('--definitions', action='store_true', help='Execute the seven prerequisite stages and P02-T01 Agent definition persistence in order.')
    parser.add_argument('--config-validation', action='store_true', help='Execute the eight prerequisite stages and P02-T02 model and workspace policy checks in order.')
    parser.add_argument('--runs', action='store_true', help='Execute all prerequisite stages, Run metadata migration and internal creation checks; no runtime execution.')
    parser.add_argument('--run-journal', action='store_true', help='Execute all 11 prerequisites plus Run steps/events migration and recoverable notification delivery; no worker or model execution.')
    args = parser.parse_args()
    report = execute(args.engine, args.output, args.access, args.read, args.write, args.members, args.grants, args.governance, args.definitions, args.config_validation, args.runs, args.run_journal)
    print(json.dumps({key: report.get(key) for key in ('engine', 'status', 'run_id', 'reason', 'cleanup')}, ensure_ascii=False))
    return {'passed': 0, 'failed': 1, 'incomplete': 2}[report['status']]


if __name__ == '__main__':
    raise SystemExit(main())
