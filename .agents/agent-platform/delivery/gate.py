"""Run versioned build or scoped platform delivery checks.

Results belong to ignored local storage. This tool never commits, deploys,
changes feature switches, starts database services, or certifies a release.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import subprocess
import sys
import time
import uuid


CONFIG_PATH = Path(__file__).with_name('checks.json')


def git(repo: Path, *args: str) -> bytes:
    return subprocess.check_output(
        ['git', '-C', str(repo), *args], stderr=subprocess.PIPE, timeout=30
    )


def source_path(repo: Path, value: str) -> Path:
    path = Path(value)
    if path.is_absolute() or '..' in path.parts:
        raise ValueError('Source paths must be relative to the repository.')
    resolved = (repo / path).resolve()
    if not resolved.is_relative_to(repo):
        raise ValueError('Source paths must stay inside the repository.')
    return resolved


def snapshot(repo: Path, base: str, checks: list[dict], config: dict) -> dict:
    changed = set(git(repo, 'diff', '--no-renames', '--name-only', '-z', base, '--').decode().split('\0'))
    changed.update(git(repo, 'diff', '--no-renames', '--name-only', '-z', base, 'HEAD', '--').decode().split('\0'))
    changed.update(git(repo, 'diff', '--cached', '--no-renames', '--name-only', '-z', '--').decode().split('\0'))
    untracked = set(git(repo, 'ls-files', '--others', '--exclude-standard', '-z').decode().split('\0'))
    changed.discard('')
    untracked.discard('')
    required = {item for check in checks for item in check['required_files']}
    digest = hashlib.sha256()
    digest.update(git(repo, 'rev-parse', 'HEAD'))
    digest.update(git(repo, 'diff', '--binary', '--no-ext-diff', '--no-textconv', base, '--'))
    digest.update(git(repo, 'diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv', '--'))
    digest.update(json.dumps(config, sort_keys=True).encode())
    for name in sorted(required | untracked):
        path = source_path(repo, name)
        digest.update(name.encode())
        if not path.is_file():
            digest.update(b'missing')
            continue
        with path.open('rb') as source:
            for block in iter(lambda: source.read(1024 * 1024), b''):
                digest.update(block)
    return {
        'head': git(repo, 'rev-parse', 'HEAD').decode().strip(),
        'input_digest': digest.hexdigest(),
        'changed_paths': sorted(changed | untracked),
        'required_local_inputs': sorted(required),
    }


def validate_checks(repo: Path, config: dict, profile: str) -> list[dict]:
    if not isinstance(config, dict) or config.get('schema_version') != 1 or profile not in ('build', 'foundation', 'workspace', 'workspace-access'):
        raise ValueError('Unsupported configuration or profile.')
    checks = config['checks']
    ids = [check['id'] for check in checks]
    if len(ids) != len(set(ids)):
        raise ValueError('Check IDs must be unique.')
    registry = dict(zip(ids, checks))
    selection = config['profiles'][profile]
    if not selection or len(selection) != len(set(selection)):
        raise ValueError('A profile must contain unique checks.')
    selected = [registry[name] for name in selection]
    for check in selected:
        if not re.fullmatch(r'[a-z][a-z0-9-]{0,79}', check['id']):
            raise ValueError('Invalid check ID.')
        if check['kind'] not in ('command', 'go_tests', 'vitest', 'database'):
            raise ValueError('Unsupported check kind.')
        if not isinstance(check['argv'], list) or not check['argv'] or not all(isinstance(arg, str) and arg for arg in check['argv']):
            raise ValueError('Commands must be nonempty argument arrays.')
        if not 0 < check['timeout_seconds'] <= 3600:
            raise ValueError('A bounded command timeout is required.')
        if check.get('env', {}) not in ({}, {'GOWORK': 'off'}):
            raise ValueError('Only the independent-module GOWORK override is supported.')
        if not source_path(repo, check['cwd']).is_dir():
            raise ValueError('A check working directory is missing.')
        if not isinstance(check['required_files'], list):
            raise ValueError('Checks must declare their required inputs.')
        missing = [name for name in check['required_files'] if not source_path(repo, name).is_file()]
        if missing:
            raise ValueError('Missing required local inputs: ' + ', '.join(missing))
        if not shutil.which(check['argv'][0]):
            raise ValueError('Required executable unavailable: ' + check['argv'][0])
        if check['kind'] == 'go_tests' and not check.get('expected_tests'):
            raise ValueError('Go checks require explicit expected test names.')
        if check['kind'] == 'vitest' and not check.get('expected_files'):
            raise ValueError('Vitest checks require explicit expected files.')
    if profile == 'build' and any(check['kind'] != 'command' for check in selected):
        raise ValueError('Build-only profiles cannot claim local test execution.')
    if profile == 'foundation' and not any(check['kind'] in ('go_tests', 'vitest') for check in selected):
        raise ValueError('Foundation acceptance requires actual test checks.')
    if profile in ('workspace', 'workspace-access'):
        engines = [check.get('engine') for check in selected if check['kind'] == 'database']
        if sorted(engines) != ['mysql', 'postgresql', 'sqlite']:
            raise ValueError('Workspace acceptance requires exactly one live check per database engine.')
        if profile == 'workspace-access' and any(check.get('access') is not True for check in selected if check['kind'] == 'database'):
            raise ValueError('Workspace access requires the live access stage on every database engine.')
    return selected


def stop_process(process: subprocess.Popen) -> bool:
    if process.poll() is not None:
        return False
    tree_stopped = True
    if os.name == 'nt':
        cleanup = subprocess.run(
            ['taskkill', '/PID', str(process.pid), '/T', '/F'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15,
            check=False,
        )
        tree_stopped = cleanup.returncode == 0
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    if process.poll() is None:
        process.kill()
    process.wait(timeout=15)
    return tree_stopped


def go_test_result(path: Path, expected: list[str]) -> dict:
    events = [json.loads(line) for line in path.read_text(encoding='utf-8-sig').splitlines() if line.strip()]
    if any(event.get('Action') in ('skip', 'fail') for event in events):
        raise ValueError('Go tests failed or skipped required coverage.')
    run_events = [(event.get('Package'), event['Test']) for event in events if event.get('Action') == 'run' and event.get('Test')]
    pass_events = [(event.get('Package'), event['Test']) for event in events if event.get('Action') == 'pass' and event.get('Test')]
    ran, passed = set(run_events), set(pass_events)
    packages = {event.get('Package') for event in events if event.get('Action') == 'pass' and not event.get('Test')}
    if len(ran) != len(run_events) or len(passed) != len(pass_events):
        raise ValueError('Go output contains duplicate test events.')
    if any(not package or package not in packages for package, _ in ran):
        raise ValueError('Go test packages did not finish successfully.')
    names = {name for _, name in passed if '/' not in name}
    if not ran or ran != passed or not set(expected).issubset(names):
        raise ValueError('Go output lacks the required executed and passed tests.')
    return {'top_level_passed': len(names), 'passed_events': len(passed), 'failed': 0, 'skipped': 0}


def vitest_result(path: Path, cwd: Path, expected: list[str]) -> dict:
    report = json.loads(path.read_text(encoding='utf-8-sig'))
    if report.get('success') is not True:
        raise ValueError('Vitest did not report success.')
    if any(report.get(field, 0) != 0 for field in ('numFailedTests', 'numPendingTests', 'numTodoTests')):
        raise ValueError('Vitest contains failed, skipped, or todo tests.')
    executed = set()
    assertions = 0
    for suite in report['testResults']:
        name = Path(suite['name'])
        name = name if name.is_absolute() else cwd / name
        normalized = name.resolve()
        if normalized in executed:
            raise ValueError('Vitest output contains a duplicate file result.')
        executed.add(normalized)
        cases = suite['assertionResults']
        if suite['status'] != 'passed' or not cases or any(case['status'] != 'passed' for case in cases):
            raise ValueError('A Vitest file is empty or contains non-passing assertions.')
        assertions += len(cases)
    wanted = {(cwd / name).resolve() for name in expected}
    if executed != wanted or assertions == 0 or assertions != report.get('numTotalTests') or assertions != report.get('numPassedTests'):
        raise ValueError('Vitest output does not match the declared files and test counts.')
    return {'files_passed': len(executed), 'tests_passed': assertions, 'failed': 0, 'skipped': 0}


def validate_database_evidence(evidence: dict, engine: str, run_id: str) -> None:
    if evidence.get('engine') != engine or evidence.get('run_id') != run_id or not evidence.get('version'):
        raise ValueError('Database evidence does not match this engine and isolated run.')
    if evidence.get('legacy_source') != 'v1.0.0-rc.42@6370b29424168039e94d40d610191e7d2e65dbf4:minimal_projection':
        raise ValueError('Database evidence lacks the frozen released-schema projection source.')
    if evidence.get('team_fixture_source') != 'a65d1f7de:pre_batch_team_projection':
        raise ValueError('Database evidence lacks the pre-batch Team projection source.')
    scenarios = evidence.get('scenarios', [])
    if len(scenarios) != 2 or {scenario.get('name') for scenario in scenarios} != {'fresh', 'upgrade'}:
        raise ValueError('Fresh and upgrade database scenarios are both required.')
    fields = (
        'main_schema_stable', 'log_schema_stable', 'main_data_stable', 'log_data_stable',
        'agent_tables_main_only', 'index_definitions_verified', 'slug_duplicate_rejected',
        'member_duplicate_rejected', 'same_name_allowed', 'cross_team_slug_allowed',
        'unknown_team_rejected', 'cross_team_read_denied', 'cross_team_member_rejected',
        'removed_team_member_rejected', 'transaction_rollback', 'pagination_scoped',
    )
    for scenario in scenarios:
        if scenario.get('startup_passes') != 3 or any(scenario.get(field) is not True for field in fields):
            raise ValueError('A database scenario lacks required executed behavior or three startup passes.')
        if scenario.get('name') == 'upgrade' and any(scenario.get(field) is not True for field in ('legacy_data_preserved', 'old_team_data_preserved')):
            raise ValueError('Upgrade did not preserve released projection and existing Team data.')
        if str(scenario.get('duplicate_error_code')) != {'mysql': '1062', 'postgresql': '23505', 'sqlite': '2067'}[engine]:
            raise ValueError('Unique-constraint rejection lacks the actual engine error code.')


def validate_workspace_access_evidence(evidence: dict, engine: str, run_id: str) -> None:
    if evidence.get('engine') != engine or evidence.get('run_id') != run_id or not evidence.get('version'):
        raise ValueError('Workspace access evidence does not match this engine and isolated run.')
    scenarios = evidence.get('scenarios', [])
    if len(scenarios) != 2 or {scenario.get('name') for scenario in scenarios} != {'fresh', 'upgrade'}:
        raise ValueError('Workspace access must execute on fresh and upgraded databases.')
    fields = (
        'roles_verified', 'role_scopes_verified', 'conditional_actions_denied', 'owner_inheritance',
        'cross_tenant_denied', 'workspace_isolation', 'default_role_denied', 'root_no_bypass',
        'member_blocked_denied', 'member_removed_denied', 'team_exit_denied', 'user_disabled_denied',
        'user_deleted_denied', 'role_downgrade_effective', 'session_revoked_denied',
        'session_expired_denied', 'session_version_denied', 'user_auth_version_denied',
        'archived_denied', 'suspended_restricted', 'unknown_inputs_denied', 'context_failure_denied',
        'database_failure_denied', 'safe_errors', 'fixtures_only',
        'transaction_snapshot_denied', 'prepared_base_allowed',
    )
    for scenario in scenarios:
        if scenario.get('role_action_cases') != 96 or any(scenario.get(field) is not True for field in fields):
            raise ValueError('Workspace access lacks the full role/action matrix or required revocation and isolation evidence.')


def database_result(path: Path, engine: str, access: bool = False) -> dict:
    report = json.loads(path.read_text(encoding='utf-8-sig'))
    if report.get('schema_version') != 1 or report.get('status') != 'passed' or report.get('engine') != engine:
        raise ValueError('The live database runner did not complete successfully.')
    if report.get('cleanup', {}).get('stopped') is not True or report.get('go_exit_code') != 0:
        raise ValueError('Database validation or isolated environment shutdown is incomplete.')
    tests = report['tests']
    if tests.get('top_level_passed') != 1 or tests.get('failed') != 0 or tests.get('skipped') != 0:
        raise ValueError('Database test did not actually execute and pass without skips.')
    actual = database_log_result(path.parent / 'go-test.stdout.log', engine, report['run_id'])
    if report['tests'] != actual['tests'] or report['evidence'] != actual['evidence']:
        raise ValueError('Database receipt differs from the actual Go events and scenario summary.')
    if access:
        if report.get('access_requested') is not True or report.get('access_go_exit_code') != 0:
            raise ValueError('The live workspace access stage was not executed successfully.')
        actual_access = workspace_access_log_result(path.parent / 'access-go-test.stdout.log', engine, report['run_id'])
        if report.get('access_tests') != actual_access['tests'] or report.get('access_evidence') != actual_access['evidence']:
            raise ValueError('Workspace access receipt differs from the actual Go events and summary.')
        if actual_access['tests']['top_level_passed'] != 1 or actual_access['evidence']['version'] != actual['evidence']['version']:
            raise ValueError('Workspace access must use the same real database version and exact top-level test.')
    return report


def go_test_summary(path: Path, test_name: str, marker: str) -> dict:
    tests = go_test_result(path, [test_name])
    records = []
    chunks = []
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        if not line.strip():
            continue
        event = json.loads(line)
        if event.get('Action') == 'output' and event.get('Test') == test_name:
            chunks.append(event.get('Output', ''))
    # test2json splits long t.Log lines into multiple events. Reassemble the
    # selected test's output before parsing the single completed JSON summary.
    for line in ''.join(chunks).splitlines():
        output = line.strip()
        if marker in output:
            records.append(json.loads(output.split(marker, 1)[1]))
    if len(records) != 1:
        raise ValueError('Exactly one completed database scenario summary is required.')
    return {'tests': tests, 'evidence': records[0]}


def database_log_result(path: Path, engine: str, run_id: str) -> dict:
    result = go_test_summary(path, 'TestAgentWorkspaceDatabaseMatrix', 'AGENT_WORKSPACE_DATABASE_RESULT ')
    validate_database_evidence(result['evidence'], engine, run_id)
    return result


def workspace_access_log_result(path: Path, engine: str, run_id: str) -> dict:
    result = go_test_summary(path, 'TestAgentWorkspaceAccessDatabaseMatrix', 'AGENT_WORKSPACE_ACCESS_DATABASE_RESULT ')
    validate_workspace_access_evidence(result['evidence'], engine, run_id)
    return result


def run_check(repo: Path, output: Path, check: dict) -> dict:
    argv = list(check['argv'])
    report_path = output / (check['id'] + '.results.json')
    if check['kind'] == 'vitest':
        argv.append('--outputFile=' + str(report_path))
    database_output = output / (check['id'] + '.database')
    if check['kind'] == 'database':
        argv.extend(['--output', str(database_output)])
    argv[0] = shutil.which(argv[0]) or argv[0]
    cwd = source_path(repo, check['cwd'])
    result = {'id': check['id'], 'gate': check['gate'], 'status': 'failed', 'argv': argv, 'cwd': str(cwd), 'exit_code': None}
    started = time.monotonic()
    process = None
    stdout_path = output / (check['id'] + '.stdout.log')
    stderr_path = output / (check['id'] + '.stderr.log')
    try:
        env = os.environ.copy()
        env.update(check.get('env', {}))
        with stdout_path.open('wb') as stdout, stderr_path.open('wb') as stderr:
            process = subprocess.Popen(
                argv, cwd=cwd, env=env, stdout=stdout, stderr=stderr,
                start_new_session=os.name != 'nt',
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0,
            )
            try:
                result['exit_code'] = process.wait(timeout=check['timeout_seconds'])
            except subprocess.TimeoutExpired:
                result['tree_cleanup_confirmed'] = stop_process(process)
                result['exit_code'] = process.returncode
                result['reason'] = 'Command timed out; process-tree cleanup was attempted.'
                if not result['tree_cleanup_confirmed']:
                    result['reason'] += ' Complete process-tree termination could not be confirmed.'
                return result
        if result['exit_code'] != 0:
            if check['kind'] == 'database' and result['exit_code'] == 2:
                result['status'] = 'incomplete'
            result['reason'] = 'Command returned a nonzero exit code; inspect its local logs.'
            return result
        if check['kind'] == 'go_tests':
            result['tests'] = go_test_result(stdout_path, check['expected_tests'])
        elif check['kind'] == 'vitest':
            result['tests'] = vitest_result(report_path, cwd, check['expected_files'])
        elif check['kind'] == 'database':
            access = check.get('access', False)
            database = database_result(database_output / 'result.json', check['engine'], access)
            result['tests'] = dict(database['tests'])
            if access:
                result['tests'] = {key: value + database['access_tests'][key] for key, value in result['tests'].items()}
            result['database'] = {
                'engine': check['engine'], 'version': database['evidence']['version'],
                'run_id': database['run_id'], 'result': str(database_output / 'result.json'),
            }
            if access:
                result['database']['access_verified'] = True
        result['status'] = 'passed'
        return result
    except KeyboardInterrupt:
        if process is not None:
            result['tree_cleanup_confirmed'] = stop_process(process)
            result['exit_code'] = process.returncode
        result['reason'] = 'Command interrupted; unfinished work cannot count as passed.'
        return result
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        result['reason'] = str(error)
        return result
    finally:
        if process is not None and process.poll() is None:
            stop_process(process)
        result['seconds'] = round(time.monotonic() - started, 3)


def database_impact_paths(paths: list[str]) -> list[str]:
    """Conservative scope guard, not a semantic database-diff classifier.

    Go or deployment changes need a wider, reviewed gate before acceptance,
    including apparently harmless edits. There is no caller-supplied waiver.
    """
    impacted = []
    for name in paths:
        lower = name.lower()
        path = Path(lower)
        if path.suffix == '.md':
            continue
        if (
            lower.startswith(('model/', 'migration/', 'migrations/', 'deploy/', 'docker/', 'helm/'))
            or path.suffix in ('.go', '.sql', '.yaml', '.yml', '.toml', '.ini', '.cnf', '.env')
            or path.name in ('go.mod', 'go.sum')
            or path.name.startswith(('dockerfile', 'compose.', 'docker-compose', '.env'))
            or 'database' in path.name or 'datasource' in path.name
        ):
            impacted.append(name)
    return impacted


def run_gate(repo: Path, config: dict, profile: str, base_ref: str, task: str, output: Path, schema_change: bool = False) -> dict:
    repo = repo.resolve()
    report = {
        'schema_version': 1, 'task': task, 'profile': profile,
        'status': 'incomplete', 'acceptance': 'not_run',
        'scope': {'foundation': 'selected_p00_foundation', 'workspace': 'selected_p01_workspace', 'workspace-access': 'selected_p01_workspace_access', 'build': 'build_only'}[profile],
        'full_repository_acceptance': False,
        'historical_full_baseline': 'unresolved; selected checks do not close P00-T01 history',
        'database': {'status': 'not_applicable'}, 'checks': [],
        'started_at_utc': datetime.now(timezone.utc).isoformat(),
        'environment': {'python': platform.python_version(), 'platform': platform.platform()},
    }
    owned_output = None
    try:
        requested = output if output.is_absolute() else repo / output
        for component in (requested, *requested.parents):
            if component.is_symlink() or getattr(component, 'is_junction', lambda: False)():
                raise ValueError('Output ancestors must not be symbolic links or junctions.')
            if component == repo:
                break
        allowed = (repo / '.local-tests/agent-platform/delivery').resolve()
        target = requested.resolve()
        if not allowed.is_relative_to(repo) or target == allowed or not target.is_relative_to(allowed):
            raise ValueError('Output must be a new run directory under repository/.local-tests/agent-platform/delivery.')
        if target.exists():
            raise ValueError('Refusing to reuse an existing result directory.')
        ignored_probe = (target / 'result.json').relative_to(repo).as_posix()
        if subprocess.run(['git', '-C', str(repo), 'check-ignore', '-q', '--', ignored_probe], check=False).returncode != 0:
            raise ValueError('Result paths must be ignored by Git.')
        target.mkdir(parents=True)
        owned_output = target
        report['output'] = str(target)
        if not re.fullmatch(r'P\d{2}-T\d{2}', task):
            raise ValueError('A single explicit plan task ID is required.')
        base = git(repo, 'rev-parse', '--verify', '--end-of-options', base_ref + '^{commit}').decode().strip()
        report['base_commit'] = base
        selected = validate_checks(repo, config, profile)
        report['checks'] = [{'id': check['id'], 'status': 'not_run', 'reason': 'Awaiting preceding checks.'} for check in selected]
        initial = snapshot(repo, base, selected, config)
        report['inputs'] = initial
        database_paths = database_impact_paths(initial['changed_paths'])
        if schema_change or database_paths or profile in ('workspace', 'workspace-access'):
            report['database'] = {
                'status': 'incomplete', 'trigger_paths': database_paths,
                'explicit_schema_change': schema_change,
                'required_engines': ['sqlite', 'mysql', 'postgresql'],
                'reason': 'This scope requires the live database profile and its full selected matrix. P00-T03 is not a schema-change exception.',
            }
            if profile == 'foundation':
                raise ValueError('Schema/database-impacting scope requires the missing live three-engine gate.')
        if profile in ('workspace', 'workspace-access'):
            scope = config['workspace_scope' if profile == 'workspace' else 'workspace_access_scope']
            unsupported = sorted(set(database_paths) - set(scope['allowed_impact_paths']))
            if task not in scope['tasks'] or unsupported:
                raise ValueError('Workspace checks cover only their declared task and database-impact paths; unsupported paths: ' + ', '.join(unsupported))
        for executable in ('go', 'bun', 'git'):
            if shutil.which(executable):
                args = [executable, 'version'] if executable == 'go' else [executable, '--version']
                version = subprocess.run(args, capture_output=True, text=True, timeout=15, check=False)
                report['environment'][executable] = version.stdout.strip()
        for index, check in enumerate(selected):
            print('Running ' + check['id'], flush=True)
            report['checks'][index] = run_check(repo, target, check)
            (target / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            if report['checks'][index]['status'] != 'passed':
                report['status'] = 'incomplete' if report['checks'][index]['status'] == 'incomplete' else 'failed'
                report['reason'] = 'A required check failed; remaining checks were not run.'
                return report
        final = snapshot(repo, base, selected, config)
        if final['input_digest'] != initial['input_digest']:
            report['final_inputs'] = final
            raise ValueError('Declared source inputs changed during verification; rerun on the final inputs.')
        report['status'] = 'passed'
        if profile == 'foundation':
            report['acceptance'] = 'selected_foundation'
        elif profile in ('workspace', 'workspace-access'):
            report['acceptance'] = 'selected_workspace' if profile == 'workspace' else 'selected_workspace_access'
            report['database'] = {
                'status': 'passed', 'trigger_paths': database_paths,
                'explicit_schema_change': schema_change,
                'engines': [check['database'] for check in report['checks'] if 'database' in check],
            }
        return report
    except KeyboardInterrupt:
        report['status'] = 'failed'
        report['reason'] = 'Verification interrupted; unfinished checks do not count as passed.'
        return report
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        report['reason'] = str(error)
        return report
    finally:
        report['completed_at_utc'] = datetime.now(timezone.utc).isoformat()
        if owned_output is not None:
            (owned_output / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', choices=('build', 'foundation', 'workspace', 'workspace-access'), default='foundation')
    parser.add_argument('--base-ref', required=True, help='Reviewed Git baseline; tracked, staged and untracked changes are included.')
    parser.add_argument('--task', required=True, help='Plan task, for example P00-T09.')
    parser.add_argument('--schema-change', action='store_true', help='Add a database-impacting scope; this never waives detected changes.')
    parser.add_argument('--output', type=Path, help='New directory under .local-tests/agent-platform/delivery/.')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[3]
    output = args.output or repo / '.local-tests/agent-platform/delivery' / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex[:8])
    if not output.is_absolute():
        output = repo / output
    try:
        config = json.loads(CONFIG_PATH.read_text(encoding='utf-8-sig'))
    except (OSError, ValueError) as error:
        print('Cannot load gate configuration: ' + str(error), file=sys.stderr)
        return 2
    report = run_gate(repo, config, args.profile, args.base_ref, args.task, output, args.schema_change)
    print(json.dumps({key: report.get(key) for key in ('status', 'scope', 'acceptance', 'output', 'reason')}, ensure_ascii=False), flush=True)
    return {'passed': 0, 'failed': 1, 'incomplete': 2}[report['status']]


if __name__ == '__main__':
    raise SystemExit(main())
