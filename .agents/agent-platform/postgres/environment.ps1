#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Start', 'Stop')][string]$Action,
    [string]$PostgresBin,
    [ValidatePattern('^[a-z0-9]{8,24}$')][string]$RunId,
    [string]$RunDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
if (-not $IsWindows) { throw 'This isolated-instance script requires Windows and PowerShell 7.' }
if (-not $RunId) {
    if ($Action -eq 'Stop') { throw 'Stop requires the RunId returned by Start.' }
    $RunId = [DateTime]::UtcNow.ToString('yyMMddHHmmss') + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(4)).ToLowerInvariant()
}
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$expectedDirectory = [IO.Path]::GetFullPath((Join-Path $repository ".local-tests/agent-platform/postgres/$RunId"))
if (-not $RunDirectory) { $RunDirectory = $expectedDirectory }
$RunDirectory = [IO.Path]::GetFullPath($RunDirectory).TrimEnd('\', '/')
if (-not [string]::Equals($RunDirectory, $expectedDirectory, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'RunDirectory must be repository/.local-tests/agent-platform/postgres/<RunId>.'
}
for ($candidate = $RunDirectory; $candidate -and $candidate.Length -ge $repository.Length; $candidate = [IO.Path]::GetDirectoryName($candidate)) {
    if ((Test-Path -LiteralPath $candidate) -and ((Get-Item -LiteralPath $candidate -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'The isolated run path must not contain a junction or symbolic link.'
    }
}
$statePath = Join-Path $RunDirectory 'environment.json'
$dataDirectory = Join-Path $RunDirectory 'data'
$rootConfig = Join-Path $RunDirectory 'admin.pgpass'
$appConfig = Join-Path $RunDirectory 'app.pgpass'
$databaseNames = [ordered]@{}
foreach ($suffix in @('fresh', 'fresh_log', 'upgrade', 'upgrade_log')) {
    $field = switch ($suffix) { 'fresh_log' { 'freshLog' } 'upgrade_log' { 'upgradeLog' } default { $suffix } }
    $databaseNames[$field] = "aivale_p01_t01_${RunId}_$suffix"
}

if (-not ('AivalePostgresStandardHandles' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AivalePostgresStandardHandles {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetStdHandle(int handle);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetHandleInformation(IntPtr handle, out uint flags);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
}
'@
}

function Start-IsolatedChild([string]$Executable, [string[]]$ProcessArguments, [string]$OutputLog, [string]$ErrorLog) {
    # PostgreSQL's Windows launcher can inherit additional parent handles. Keep
    # this CLI's pipes out of the long-lived server so capture_output can see EOF.
    $changed = @()
    try {
        foreach ($standardId in @(-10, -11, -12)) {
            $handle = [AivalePostgresStandardHandles]::GetStdHandle($standardId)
            [uint32]$flags = 0
            if ([AivalePostgresStandardHandles]::GetHandleInformation($handle, [ref]$flags) -and ($flags -band 1)) {
                if (-not [AivalePostgresStandardHandles]::SetHandleInformation($handle, 1, 0)) {
                    throw 'Unable to isolate standard-handle inheritance for PostgreSQL.'
                }
                $changed += @{ handle = $handle; flags = $flags }
            }
        }
        return Start-Process -FilePath $Executable -ArgumentList $ProcessArguments -WindowStyle Hidden -RedirectStandardOutput $OutputLog -RedirectStandardError $ErrorLog -PassThru
    }
    finally {
        foreach ($item in $changed) {
            if (-not [AivalePostgresStandardHandles]::SetHandleInformation($item.handle, 1, ($item.flags -band 1))) {
                throw 'Unable to restore standard-handle flags after PostgreSQL launch.'
            }
        }
    }
}

function Assert-OwnedServer([int]$ServerProcessId, [string]$ServerBin, [int]$Port, [switch]$RequireListener) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ServerProcessId"
    $commandLine = if ($process) { $process.CommandLine.Replace('/', '\') } else { '' }
    $dataArgument = '(?:^|\s)-D\s+(?:"' + [regex]::Escape($dataDirectory) + '"|' + [regex]::Escape($dataDirectory) + ')(?=\s|$)'
    if (-not $process -or -not [string]::Equals($process.ExecutablePath, (Join-Path $ServerBin 'postgres.exe'), [StringComparison]::OrdinalIgnoreCase) -or
        $commandLine -notmatch $dataArgument -or $commandLine -notmatch "(?:^|\s)-p\s+$Port(?=\s|$)" -or
        $commandLine -notmatch '(?:^|\s)-h\s+127\.0\.0\.1(?=\s|$)') {
        throw 'Refusing to control a process whose executable and isolated datadir/port do not match.'
    }
    if ($RequireListener) {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort $Port -ErrorAction SilentlyContinue)
        if ($listeners.Count -ne 1 -or $listeners[0].OwningProcess -ne $ServerProcessId) {
            throw 'Refusing a client connection: loopback listener does not belong to this run.'
        }
    }
}

function Invoke-IsolatedPsql([string]$ClientConfig, [string]$User, [string]$Database, [string]$Query, [string]$File) {
    $previous = @{}
    foreach ($name in @('PGPASSFILE', 'PGCONNECT_TIMEOUT', 'PGSSLMODE', 'PGOPTIONS', 'PGSERVICE')) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    try {
        $env:PGPASSFILE = $ClientConfig
        $env:PGCONNECT_TIMEOUT = '2'
        $env:PGSSLMODE = 'disable'
        $env:PGOPTIONS = '-c statement_timeout=5000'
        $env:PGSERVICE = $null
        $arguments = @('-X', '--no-password', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', '--host=127.0.0.1', "--port=$port", "--username=$User", "--dbname=$Database")
        if ($File) { $arguments += "--file=$File" } else { $arguments += "--command=$Query" }
        $result = & (Join-Path $PostgresBin 'psql.exe') @arguments 2> (Join-Path $RunDirectory 'client-error.log')
        if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL client failed; inspect private client-error.log.' }
        return (($result | Out-String).Trim())
    }
    finally {
        foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    }
}

function Assert-TestMarkers([string]$ClientConfig, [string]$User) {
    foreach ($database in $databaseNames.Values) {
        $query = "SELECT COUNT(*)::text || ':' || COUNT(*) FILTER (WHERE run_id = '$RunId' AND purpose = 'p01-t01-postgres')::text FROM __aivale_test_environment"
        if ((Invoke-IsolatedPsql $ClientConfig $User $database $query '') -ne '1:1') {
            throw 'Isolated database marker mismatch; refusing further action.'
        }
    }
}

if ($Action -eq 'Stop') {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($state.schemaVersion -ne 1 -or $state.runId -ne $RunId -or $state.purpose -ne 'p01-t01-postgres' -or
        $state.runDirectory -ne $RunDirectory -or $state.dataDirectory -ne $dataDirectory -or
        $state.rootClientConfigPath -ne $rootConfig -or $state.appClientConfigPath -ne $appConfig -or
        $state.port -lt 1024 -or $state.port -gt 65535 -or $state.pid -le 0) {
        throw 'Invalid isolated PostgreSQL environment state.'
    }
    foreach ($field in $databaseNames.Keys) {
        if ($state.databases.$field -ne $databaseNames[$field]) { throw 'Database names do not match this run.' }
    }
    $PostgresBin = [IO.Path]::GetFullPath($state.postgresBin).TrimEnd('\', '/')
    $port = [int]$state.port
    if ($state.status -eq 'stopped') { Write-Output $statePath; return }
    Assert-OwnedServer $state.pid $PostgresBin $port -RequireListener
    Assert-TestMarkers $rootConfig 'aivale_admin'
    & (Join-Path $PostgresBin 'pg_ctl.exe') stop -D $dataDirectory -m fast -w -t 30 1> (Join-Path $RunDirectory 'shutdown.log') 2> (Join-Path $RunDirectory 'shutdown-error.log')
    if ($LASTEXITCODE -ne 0) { throw 'Verified isolated instance did not stop cleanly; no forced stop was attempted.' }
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while (Get-Process -Id $state.pid -ErrorAction SilentlyContinue) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Timed out waiting for isolated PostgreSQL shutdown.' }
        Start-Sleep -Milliseconds 100
    }
    $state.status = 'stopped'
    $state.stoppedAtUtc = [DateTime]::UtcNow.ToString('o')
    $state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding utf8
    Write-Host "Stopped isolated PostgreSQL $($state.postgresVersion); retained $RunDirectory"
    Write-Output $statePath
    return
}

if (-not $PostgresBin) { throw 'Start requires an explicit PostgreSQL bin directory.' }
if (Test-Path -LiteralPath $RunDirectory) { throw 'Start requires a new RunId; existing run directories are never reused or removed.' }
$PostgresBin = [IO.Path]::GetFullPath($PostgresBin).TrimEnd('\', '/')
foreach ($executable in @('postgres.exe', 'initdb.exe', 'pg_ctl.exe', 'psql.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $PostgresBin $executable) -PathType Leaf)) { throw "Missing required executable: $executable" }
}
$versionOutput = & (Join-Path $PostgresBin 'postgres.exe') --version 2>&1
if ($LASTEXITCODE -ne 0 -or ($versionOutput | Out-String) -notmatch 'PostgreSQL\)\s+([0-9.]+)') {
    throw 'Unable to identify the dedicated PostgreSQL binary version.'
}
$postgresVersion = $Matches[1]
[void][IO.Directory]::CreateDirectory($RunDirectory)
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
foreach ($identity in @([Security.Principal.WindowsIdentity]::GetCurrent().User, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
}
Set-Acl -LiteralPath $RunDirectory -AclObject $acl
$portReservation = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$portReservation.Start()
$port = $portReservation.LocalEndpoint.Port
$portReservation.Stop()
$adminPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
$appPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
"127.0.0.1:${port}:*:aivale_admin:$adminPassword" | Set-Content -LiteralPath $rootConfig -Encoding utf8NoBOM
"127.0.0.1:${port}:*:aivale_test:$appPassword" | Set-Content -LiteralPath $appConfig -Encoding utf8NoBOM
$passwordFile = Join-Path $RunDirectory 'initialize-password.txt'
$adminPassword | Set-Content -LiteralPath $passwordFile -Encoding utf8NoBOM
$bootstrapPath = Join-Path $RunDirectory 'bootstrap.sql'
$bootstrap = @(
    "CREATE ROLE aivale_test NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT LOGIN PASSWORD '$appPassword';",
    'REVOKE ALL ON DATABASE postgres FROM PUBLIC;',
    'REVOKE ALL ON DATABASE template0 FROM PUBLIC;',
    'REVOKE ALL ON DATABASE template1 FROM PUBLIC;'
)
foreach ($database in $databaseNames.Values) {
    $bootstrap += "CREATE DATABASE $database OWNER aivale_test ENCODING 'UTF8' TEMPLATE template0;"
    $bootstrap += "REVOKE ALL ON DATABASE $database FROM PUBLIC;"
}
$bootstrap | Set-Content -LiteralPath $bootstrapPath -Encoding utf8NoBOM
$server = $null
$initializer = $null
$launcher = $null
try {
    $initializer = Start-IsolatedChild (Join-Path $PostgresBin 'initdb.exe') @('-D', ('"{0}"' -f $dataDirectory), '--username=aivale_admin', ('--pwfile="{0}"' -f $passwordFile), '--encoding=UTF8', '--locale=C', '--auth-local=scram-sha-256', '--auth-host=scram-sha-256') (Join-Path $RunDirectory 'initialize.log') (Join-Path $RunDirectory 'initialize-error.log')
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    while (-not $initializer.WaitForExit(250)) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Isolated PostgreSQL initialization exceeded 90 seconds.' }
    }
    if ($initializer.ExitCode -ne 0) { throw 'PostgreSQL initialization failed; inspect private initialize logs.' }
    # pg_ctl uses PostgreSQL's restricted-token launch on Windows, including when
    # this shell belongs to an administrator. Do not launch postgres.exe directly.
    $launcher = Start-IsolatedChild (Join-Path $PostgresBin 'pg_ctl.exe') @('start', '-D', ('"{0}"' -f $dataDirectory), '-l', ('"{0}"' -f (Join-Path $RunDirectory 'server.log')), '-o', ('"-p {0} -h 127.0.0.1"' -f $port), '-w', '-t', '60') (Join-Path $RunDirectory 'startup.log') (Join-Path $RunDirectory 'startup-error.log')
    $deadline = [DateTime]::UtcNow.AddSeconds(70)
    while (-not $launcher.WaitForExit(250)) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Isolated PostgreSQL launcher exceeded 70 seconds.' }
    }
    if ($launcher.ExitCode -ne 0) { throw 'Isolated PostgreSQL startup failed; inspect private startup logs.' }
    $serverProcessId = [int](Get-Content -LiteralPath (Join-Path $dataDirectory 'postmaster.pid') -TotalCount 1)
    $server = Get-Process -Id $serverProcessId
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    do {
        if ($server.HasExited) { throw 'Isolated PostgreSQL exited; inspect private server logs.' }
        $listeners = @(Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort $port -ErrorAction SilentlyContinue)
        if ($listeners.Count -eq 1 -and $listeners[0].OwningProcess -eq $server.Id) { break }
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Isolated PostgreSQL did not become ready within 60 seconds.' }
        Start-Sleep -Milliseconds 100
    } while ($true)
    Assert-OwnedServer $server.Id $PostgresBin $port -RequireListener
    $null = Invoke-IsolatedPsql $rootConfig 'aivale_admin' 'postgres' '' $bootstrapPath
    foreach ($database in $databaseNames.Values) {
        $query = "CREATE TABLE __aivale_test_environment (run_id varchar(32) PRIMARY KEY, purpose varchar(32) NOT NULL); INSERT INTO __aivale_test_environment VALUES ('$RunId', 'p01-t01-postgres'); GRANT SELECT ON __aivale_test_environment TO aivale_test;"
        $null = Invoke-IsolatedPsql $rootConfig 'aivale_admin' $database $query ''
    }
    Assert-TestMarkers $rootConfig 'aivale_admin'
    Assert-TestMarkers $appConfig 'aivale_test'
    $dsns = [ordered]@{}
    foreach ($field in $databaseNames.Keys) {
        $dsns[$field] = 'postgresql://aivale_test:{0}@127.0.0.1:{1}/{2}?sslmode=disable' -f $appPassword, $port, $databaseNames[$field]
    }
    $state = [ordered]@{
        schemaVersion = 1; runId = $RunId; purpose = 'p01-t01-postgres'; postgresVersion = $postgresVersion
        postgresBin = $PostgresBin; port = $port; pid = $server.Id; runDirectory = $RunDirectory; dataDirectory = $dataDirectory
        rootClientConfigPath = $rootConfig; appClientConfigPath = $appConfig; databases = $databaseNames; dsns = $dsns
        status = 'running'; startedAtUtc = [DateTime]::UtcNow.ToString('o'); stoppedAtUtc = $null
    }
    $state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding utf8
    Write-Host "Started isolated PostgreSQL $postgresVersion; private state: $statePath"
    Write-Output $statePath
}
catch {
    # Stop only processes created by this invocation, after verifying their identity.
    $serverPidPath = Join-Path $dataDirectory 'postmaster.pid'
    if ($null -eq $server -and (Test-Path -LiteralPath $serverPidPath -PathType Leaf)) {
        $serverProcessId = 0
        if ([int]::TryParse((Get-Content -LiteralPath $serverPidPath -TotalCount 1), [ref]$serverProcessId)) {
            $server = Get-Process -Id $serverProcessId -ErrorAction SilentlyContinue
        }
    }
    foreach ($ownedProcess in @($server, $initializer)) {
        if ($null -ne $ownedProcess -and -not $ownedProcess.HasExited) {
            $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($ownedProcess.Id)"
            $commandLine = if ($current) { $current.CommandLine.Replace('/', '\') } else { '' }
            $dataArgument = '(?:^|\s)-D\s+(?:"' + [regex]::Escape($dataDirectory) + '"|' + [regex]::Escape($dataDirectory) + ')(?=\s|$)'
            $expectedExecutable = if ($ownedProcess -eq $server) { 'postgres.exe' } else { 'initdb.exe' }
            if ($current -and [string]::Equals($current.ExecutablePath, (Join-Path $PostgresBin $expectedExecutable), [StringComparison]::OrdinalIgnoreCase) -and $commandLine -match $dataArgument) {
                & taskkill.exe /PID $ownedProcess.Id /T /F 1> (Join-Path $RunDirectory 'failure-cleanup.log') 2> (Join-Path $RunDirectory 'failure-cleanup-error.log')
                [void]$ownedProcess.WaitForExit(10000)
            }
        }
    }
    if ($null -ne $launcher -and -not $launcher.HasExited) {
        Stop-Process -InputObject $launcher -Force
        [void]$launcher.WaitForExit(10000)
    }
    throw
}
