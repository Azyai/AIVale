#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$MySqlBin,
    [ValidatePattern('^[a-z0-9]{8,24}$')][string]$RunId = ([DateTimeOffset]::UtcNow.ToString('yyyyMMddHHmmss') + [Guid]::NewGuid().ToString('N').Substring(0, 6))
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$runDirectory = Join-Path $repoRoot ('.local-tests/agent-platform/mysql/' + $RunId)
$environmentScript = Join-Path $PSScriptRoot '../mysql/environment.ps1'
$names = @('GOWORK', 'TEST_AGENT_PLATFORM_OPTION_MYSQL_DSN')
$previousEnvironment = @{}
foreach ($name in $names) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$previousLocation = Get-Location
$statePath = $null
$report = [ordered]@{
    schemaVersion = 1
    task = 'P00-T04'
    runId = $RunId
    startedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    status = 'failed'
    databaseScope = 'isolated MySQL existing Option persistence; no production schema change'
}
try {
    $statePath = & $environmentScript -Action Start -MySqlBin $MySqlBin -RunId $RunId
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($state.runId -ne $RunId -or $state.purpose -ne 'p00-t03-mysql' -or $state.status -ne 'running') { throw 'Invalid isolated environment state.' }
    # Reuse the P00-T03 instance provisioner; only its new fresh database is used.
    $env:GOWORK = 'off'
    $env:TEST_AGENT_PLATFORM_OPTION_MYSQL_DSN = $state.dsns.fresh
    Set-Location -LiteralPath $repoRoot
    $report.sourceCommit = (& git rev-parse HEAD).Trim()
    $report.branch = (& git branch --show-current).Trim()
    $report.goVersion = (& go version).Trim()
    $report.powerShellVersion = $PSVersionTable.PSVersion.ToString()
    $report.mysqlVersion = $state.mysqlVersion
    $report.port = $state.port
    $report.database = $state.databases.fresh
    $report.inputs = @(
        'setting/agent_setting/config.go', 'model/option.go', 'middleware/agent_platform.go',
        'router/main.go', 'controller/misc.go', 'router/agent_platform_test.go',
        '.agents/agent-platform/mysql/environment.ps1', '.agents/agent-platform/feature-flags/verify.ps1'
    ) | ForEach-Object {
        [ordered]@{ path = $_; sha256 = (Get-FileHash -LiteralPath (Join-Path $repoRoot $_) -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    $selector = '^(TestAgentPlatform.*|TestListModelsSupportsOpenAIAndGeminiAuthentication|TestGetStatusReturnsEffectiveOIDCDisplayName)$'
    $report.command = "GOWORK=off go test -json -count=1 -p 2 -timeout 90s ./router ./controller -run '$selector'"
    $stdoutPath = Join-Path $runDirectory 'p00-t04-go-test.jsonl'
    $stderrPath = Join-Path $runDirectory 'p00-t04-go-test.stderr.log'
    $started = [DateTimeOffset]::UtcNow
    & go test -json -count=1 -p 2 -timeout 90s ./router ./controller -run $selector 1> $stdoutPath 2> $stderrPath
    $report.exitCode = $LASTEXITCODE
    $report.durationSeconds = [Math]::Round(([DateTimeOffset]::UtcNow - $started).TotalSeconds, 3)
    $events = @()
    foreach ($line in Get-Content -LiteralPath $stdoutPath) {
        if ($line.StartsWith('{')) { $events += $line | ConvertFrom-Json }
    }
    $report.passedTests = @($events | Where-Object { $_.Action -eq 'pass' -and $_.Test } | ForEach-Object Test)
    $report.failedTests = @($events | Where-Object { $_.Action -eq 'fail' -and $_.Test } | ForEach-Object Test)
    $report.skippedTests = @($events | Where-Object { $_.Action -eq 'skip' -and $_.Test } | ForEach-Object Test)
    if ($report.exitCode -ne 0 -or $report.failedTests.Count -ne 0 -or $report.skippedTests.Count -ne 0) { throw 'Required validation failed or skipped.' }
    foreach ($required in @(
        'TestAgentPlatformCapabilities', 'TestAgentPlatformStatusPreservesLegacyFields',
        'TestAgentPlatformGateScopesAndDrainControls', 'TestAgentPlatformFeatureAdmissionAndInFlightDrain',
        'TestAgentPlatformGateIsWiredIntoProductionRouter', 'TestAgentPlatformOptionMySQL',
        'TestListModelsSupportsOpenAIAndGeminiAuthentication', 'TestGetStatusReturnsEffectiveOIDCDisplayName'
    )) {
        if ($required -cnotin $report.passedTests) { throw "Missing required test evidence: $required" }
    }
    $summaries = @()
    foreach ($event in $events) {
        if ($event.Output) {
            $position = $event.Output.IndexOf('P00_T04_RESULT ')
            if ($position -ge 0) {
                if ($event.Test -cne 'TestAgentPlatformOptionMySQL') { throw 'Unexpected summary source.' }
                $summaries += $event.Output.Substring($position + 'P00_T04_RESULT '.Length).Trim() | ConvertFrom-Json
            }
        }
    }
    if ($summaries.Count -ne 1) { throw 'Missing or duplicated MySQL evidence.' }
    $evidence = $summaries[0]
    foreach ($flag in @('defaults_disabled', 'hot_disable', 'persisted_reload_disabled', 'write_failure_preserves_memory')) {
        if ($evidence.$flag -isnot [bool] -or $evidence.$flag -ne $true) { throw 'Invalid MySQL behavioral evidence.' }
    }
    foreach ($entry in @(@('canonical_options', 5), @('invalid_options', 4), @('audit_rows', 6))) {
        $value = $evidence.($entry[0])
        if (($value -isnot [int] -and $value -isnot [long]) -or $value -ne $entry[1]) { throw 'Invalid MySQL evidence count.' }
    }
    if ($evidence.mysql_version -isnot [string] -or $evidence.mysql_version -notmatch ('^' + [regex]::Escape($state.mysqlVersion) + '(?:[-+].*)?$')) { throw 'MySQL version mismatch.' }
    $report.mysqlEvidence = $evidence
    $report.status = 'passed'
}
catch {
    # Do not expose exceptions that may contain a DSN or generated credentials.
    $report.error = 'Validation or environment setup failed; inspect private local test logs if the run directory exists.'
    Write-Host 'P00-T04 validation failed; no passing result is recorded.'
}
finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process') }
    Set-Location -LiteralPath $previousLocation
    if ($statePath) {
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
        $resultPath = Join-Path $runDirectory 'p00-t04-verification.json'
        $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $resultPath -Encoding utf8
        Write-Host "Verification record: $resultPath"
    }
}
if ($report.status -ne 'passed') { exit 1 }
Write-Host "P00-T04 feature flag validation passed for run $RunId."
