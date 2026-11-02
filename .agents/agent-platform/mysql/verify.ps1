#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$MySqlBin,
    [ValidatePattern('^[a-z0-9]{8,24}$')][string]$RunId = ([DateTimeOffset]::UtcNow.ToString('yyyyMMddHHmmss') + [Guid]::NewGuid().ToString('N').Substring(0, 6)),
    [switch]$KeepRunning
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$runDirectory = Join-Path $repoRoot ('.local-tests/agent-platform/mysql/' + $RunId)
$environmentScript = Join-Path $PSScriptRoot 'environment.ps1'
$environmentNames = @('GOWORK', 'TEST_AGENT_MYSQL_FRESH_DSN', 'TEST_AGENT_MYSQL_FRESH_LOG_DSN', 'TEST_AGENT_MYSQL_UPGRADE_DSN', 'TEST_AGENT_MYSQL_UPGRADE_LOG_DSN')
$previousEnvironment = @{}
foreach ($name in $environmentNames) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$previousLocation = Get-Location
$statePath = $null
$resultPath = Join-Path $runDirectory 'verification.json'
$report = [ordered]@{
    schemaVersion = 1
    task = 'P00-T03'
    databaseScope = 'mysql-only'
    runId = $RunId
    startedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    status = 'failed'
    legacySource = [ordered]@{
        tag = 'v1.0.0-rc.42'
        commit = '6370b29424168039e94d40d610191e7d2e65dbf4'
        fixture = 'sanitized minimal schema projection with explicit BIGINT quota compatibility; not a release database dump'
    }
}
try {
    $statePath = & $environmentScript -Action Start -MySqlBin $MySqlBin -RunId $RunId
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($state.runId -ne $RunId -or $state.purpose -ne 'p00-t03-mysql' -or $state.status -ne 'running') { throw 'Invalid isolated environment state.' }
    $env:GOWORK = 'off'
    $env:TEST_AGENT_MYSQL_FRESH_DSN = $state.dsns.fresh
    $env:TEST_AGENT_MYSQL_FRESH_LOG_DSN = $state.dsns.freshLog
    $env:TEST_AGENT_MYSQL_UPGRADE_DSN = $state.dsns.upgrade
    $env:TEST_AGENT_MYSQL_UPGRADE_LOG_DSN = $state.dsns.upgradeLog
    Set-Location -LiteralPath $repoRoot
    $report.sourceCommit = (& git rev-parse HEAD).Trim()
    $report.branch = (& git branch --show-current).Trim()
    $report.goVersion = (& go version).Trim()
    $report.mysqlVersion = $state.mysqlVersion
    $report.inputs = @(
        'model/agent_platform_mysql_test.go',
        '.agents/agent-platform/mysql/environment.ps1',
        '.agents/agent-platform/mysql/verify.ps1'
    ) | ForEach-Object {
        [ordered]@{ path = $_; sha256 = (Get-FileHash -LiteralPath (Join-Path $repoRoot $_) -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    $report.port = $state.port
    $report.databases = $state.databases
    $report.command = "GOWORK=off go test -json -count=1 -p 2 -timeout 5m ./model -run '^TestAgentPlatformMySQLValidation$'"
    $stdoutPath = Join-Path $runDirectory 'go-test.jsonl'
    $stderrPath = Join-Path $runDirectory 'go-test.stderr.log'
    $started = [DateTimeOffset]::UtcNow
    & go test -json -count=1 -p 2 -timeout 5m ./model -run '^TestAgentPlatformMySQLValidation$' 1> $stdoutPath 2> $stderrPath
    $report.exitCode = $LASTEXITCODE
    $report.durationSeconds = [Math]::Round(([DateTimeOffset]::UtcNow - $started).TotalSeconds, 3)
    $events = @()
    foreach ($line in Get-Content -LiteralPath $stdoutPath) {
        if ($line.StartsWith('{')) { $events += $line | ConvertFrom-Json }
    }
    $report.passedTests = @($events | Where-Object { $_.Action -eq 'pass' -and $_.Test } | ForEach-Object Test)
    $report.failedTests = @($events | Where-Object { $_.Action -eq 'fail' -and $_.Test } | ForEach-Object Test)
    $report.skippedTests = @($events | Where-Object { $_.Action -eq 'skip' -and $_.Test } | ForEach-Object Test)
    $summaries = @()
    foreach ($event in $events) {
        if ($event.Output) {
            $position = $event.Output.IndexOf('P00_T03_RESULT ')
            if ($position -ge 0) {
                $summary = $event.Output.Substring($position + 'P00_T03_RESULT '.Length).Trim() | ConvertFrom-Json
                if ($summary.scenario -cnotin @('fresh', 'upgrade') -or $event.Test -cne "TestAgentPlatformMySQLValidation/$($summary.scenario)") {
                    throw 'Scenario evidence came from an unexpected test.'
                }
                $summaries += $summary
            }
        }
    }
    $report.scenarios = $summaries
    if ($report.exitCode -ne 0) { throw 'MySQL validation failed. Inspect the local test logs; no result is reported as passing.' }
    if ($report.failedTests.Count -ne 0) { throw 'MySQL validation contains a failed test event.' }
    if ($report.skippedTests.Count -ne 0) { throw 'MySQL validation skipped required tests.' }
    foreach ($scenario in @('fresh', 'upgrade')) {
        $summary = @($summaries | Where-Object scenario -eq $scenario)
        if ($summary.Count -ne 1 -or "TestAgentPlatformMySQLValidation/$scenario" -cnotin $report.passedTests) {
            throw "Missing or incomplete $scenario validation evidence."
        }
        $evidence = $summary[0]
        foreach ($flag in @('schema_stable', 'data_preserved', 'unique_constraints_verified')) {
            if ($evidence.$flag -isnot [bool] -or $evidence.$flag -ne $true) { throw "Invalid $scenario boolean evidence." }
        }
        foreach ($field in @('startup_count', 'main_tables', 'log_tables')) {
            if (($evidence.$field -isnot [long] -and $evidence.$field -isnot [int]) -or $evidence.$field -le 0) {
                throw "Invalid $scenario numeric evidence."
            }
        }
        if ($evidence.startup_count -ne 3 -or $evidence.mysql_version -isnot [string] -or
            $evidence.mysql_version -notmatch ('^' + [regex]::Escape($state.mysqlVersion) + '(?:[-+].*)?$')) {
            throw "Invalid $scenario startup count or MySQL version."
        }
        if ($scenario -eq 'upgrade' -and ($evidence.legacy_tag -cne $report.legacySource.tag -or
            $evidence.legacy_commit -cne $report.legacySource.commit -or $evidence.fixture_kind -cne 'minimal_projection_quota64_compatible' -or
            $evidence.legacy_projection_preserved -isnot [bool] -or $evidence.legacy_projection_preserved -ne $true)) {
            throw 'Missing or invalid legacy projection evidence.'
        }
    }
    if ('TestAgentPlatformMySQLValidation' -notin $report.passedTests) { throw 'Required top-level test did not pass.' }
    $report.status = 'passed'
}
catch {
    # Do not include exception text: driver/process exceptions can contain credentials.
    $report.error = 'Validation or environment setup failed; inspect private local logs.'
    Write-Host 'MySQL validation failed; the local verification record contains status and log locations.'
}
finally {
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process') }
    Set-Location -LiteralPath $previousLocation
    if ($statePath -and -not $KeepRunning) {
        try {
            $null = & $environmentScript -Action Stop -RunId $RunId -RunDirectory $runDirectory
            $report.environmentStopped = $true
        }
        catch {
            $report.environmentStopped = $false
            $report.status = 'failed'
            $report.error = 'Could not confirm shutdown of the isolated instance; inspect its local environment state.'
        }
    }
    $report.endedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    if (Test-Path -LiteralPath $runDirectory) {
        $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $resultPath -Encoding utf8
        Write-Host "Verification record: $resultPath"
    }
}
if ($report.status -ne 'passed') { exit 1 }
Write-Host "MySQL fresh/upgrade/restart validation passed for run $RunId."
