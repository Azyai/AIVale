#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Start', 'Stop')][string]$Action,
    [string]$MySqlBin = 'C:\Program Files\MySQL\MySQL Server 26.7\bin',
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
$expectedDirectory = [IO.Path]::GetFullPath((Join-Path $repository ".local-tests/agent-platform/mysql/$RunId"))
if (-not $RunDirectory) { $RunDirectory = $expectedDirectory }
$RunDirectory = [IO.Path]::GetFullPath($RunDirectory).TrimEnd('\', '/')
if (-not [string]::Equals($RunDirectory, $expectedDirectory, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'RunDirectory must be repository/.local-tests/agent-platform/mysql/<RunId>.'
}
for ($candidate = $RunDirectory; $candidate -and $candidate.Length -ge $repository.Length; $candidate = [IO.Path]::GetDirectoryName($candidate)) {
    if ((Test-Path -LiteralPath $candidate) -and ((Get-Item -LiteralPath $candidate -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'The isolated run path must not contain a junction or symbolic link.'
    }
}
$statePath = Join-Path $RunDirectory 'environment.json'
$dataDirectory = Join-Path $RunDirectory 'data'
$rootConfig = Join-Path $RunDirectory 'root.cnf'
$appConfig = Join-Path $RunDirectory 'app.cnf'
$databaseNames = [ordered]@{}
foreach ($suffix in @('fresh', 'fresh_log', 'upgrade', 'upgrade_log')) {
    $field = switch ($suffix) { 'fresh_log' { 'freshLog' } 'upgrade_log' { 'upgradeLog' } default { $suffix } }
    $databaseNames[$field] = "aivale_p00_t03_${RunId}_$suffix"
}

function Assert-OwnedServer([int]$ServerProcessId, [string]$ServerBin, [int]$Port, [switch]$RequireListener) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ServerProcessId"
    $expectedExecutable = Join-Path $ServerBin 'mysqld.exe'
    $dataArgument = [regex]::Escape("--datadir=$dataDirectory")
    $quotedValue = '--datadir="' + [regex]::Escape($dataDirectory) + '"'
    if (-not $process -or -not [string]::Equals($process.ExecutablePath, $expectedExecutable, [StringComparison]::OrdinalIgnoreCase) -or
        -not $process.CommandLine.Contains('--no-defaults') -or
        $process.CommandLine -notmatch "(?i)(?:^|\s)(?:`"$dataArgument`"|$quotedValue|$dataArgument)(?=\s|$)" -or
        $process.CommandLine -notmatch "(?:^|\s)--port=$Port(?=\s|$)") {
        throw 'Refusing to control a process whose executable and isolated datadir/port do not match.'
    }
    if ($RequireListener) {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort $Port -ErrorAction SilentlyContinue)
        if ($listeners.Count -ne 1 -or $listeners[0].OwningProcess -ne $ServerProcessId) {
            throw 'Refusing a client connection: loopback listener does not belong to this run.'
        }
    }
}

function Invoke-TestMySql([string]$ClientConfig, [string]$Query) {
    $result = & (Join-Path $MySqlBin 'mysql.exe') "--defaults-file=$ClientConfig" --batch --skip-column-names --connect-timeout=2 -e $Query 2> (Join-Path $RunDirectory 'client-error.log')
    if ($LASTEXITCODE -ne 0) { throw "Isolated MySQL client failed; inspect $RunDirectory/client-error.log locally." }
    return (($result | Out-String).Trim())
}

function Assert-TestMarkers([string]$ClientConfig) {
    foreach ($database in $databaseNames.Values) {
        $query = 'SELECT CONCAT(COUNT(*), '':'', COALESCE(SUM(run_id = ''{0}'' AND purpose = ''p00-t03-mysql''), 0)) FROM `{1}`.__aivale_test_environment' -f $RunId, $database
        if ((Invoke-TestMySql $ClientConfig $query) -ne '1:1') { throw "Test marker mismatch in $database; refusing further action." }
    }
}

if ($Action -eq 'Stop') {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($state.schemaVersion -ne 1 -or $state.runId -ne $RunId -or $state.purpose -ne 'p00-t03-mysql' -or
        $state.runDirectory -ne $RunDirectory -or $state.dataDirectory -ne $dataDirectory -or
        $state.rootClientConfigPath -ne $rootConfig -or $state.appClientConfigPath -ne $appConfig -or
        $state.port -lt 1024 -or $state.port -gt 65535 -or $state.pid -le 0) { throw 'Invalid isolated environment state.' }
    foreach ($field in $databaseNames.Keys) {
        if ($state.databases.$field -ne $databaseNames[$field]) { throw 'Database names do not match this run.' }
    }
    $MySqlBin = [IO.Path]::GetFullPath($state.mySqlBin)
    if ($state.status -eq 'stopped') { Write-Output $statePath; return }
    Assert-OwnedServer $state.pid $MySqlBin $state.port -RequireListener
    Assert-TestMarkers $rootConfig
    & (Join-Path $MySqlBin 'mysqladmin.exe') "--defaults-file=$rootConfig" --connect-timeout=2 shutdown 2> (Join-Path $RunDirectory 'shutdown-error.log')
    if ($LASTEXITCODE -ne 0) { throw 'Verified isolated instance did not accept shutdown; no forced stop was attempted.' }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while (Get-Process -Id $state.pid -ErrorAction SilentlyContinue) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Timed out waiting for isolated MySQL shutdown; no forced stop was attempted.' }
        Start-Sleep -Milliseconds 200
    }
    $state.status = 'stopped'
    $state.stoppedAtUtc = [DateTime]::UtcNow.ToString('o')
    $state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding utf8
    Write-Host "Stopped isolated MySQL $($state.mysqlVersion); retained $RunDirectory"
    Write-Output $statePath
    return
}

if (Test-Path -LiteralPath $RunDirectory) { throw 'Start requires a new RunId; existing run directories are never reused or removed.' }
$MySqlBin = [IO.Path]::GetFullPath($MySqlBin).TrimEnd('\', '/')
foreach ($executable in @('mysqld.exe', 'mysql.exe', 'mysqladmin.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $MySqlBin $executable) -PathType Leaf)) { throw "Missing required executable: $executable" }
}
$versionOutput = & (Join-Path $MySqlBin 'mysqld.exe') --no-defaults --version 2>&1
if ($LASTEXITCODE -ne 0 -or ($versionOutput | Out-String) -notmatch '\bVer\s+([0-9.]+)\s+for\b') { throw 'Unable to identify the dedicated MySQL binary version.' }
$mysqlVersion = $Matches[1]
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
$rootPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
$appPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
foreach ($credential in @(@('root', $rootPassword, $rootConfig), @('aivale_test', $appPassword, $appConfig))) {
    "[client]`nprotocol=tcp`nhost=127.0.0.1`nport=$port`nuser=$($credential[0])`npassword=$($credential[1])`n" | Set-Content -LiteralPath $credential[2] -Encoding utf8NoBOM
}
$bootstrap = @(
    "ALTER USER 'root'@'localhost' IDENTIFIED BY '$rootPassword';",
    "CREATE USER 'root'@'127.0.0.1' IDENTIFIED BY '$rootPassword';",
    "GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;",
    "CREATE USER 'aivale_test'@'127.0.0.1' IDENTIFIED BY '$appPassword';"
)
foreach ($database in $databaseNames.Values) {
    $bootstrap += 'CREATE DATABASE `{0}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;' -f $database
    $bootstrap += 'GRANT ALL PRIVILEGES ON `{0}`.* TO ''aivale_test''@''127.0.0.1'';' -f $database
    $bootstrap += 'CREATE TABLE `{0}`.__aivale_test_environment (run_id varchar(32) PRIMARY KEY, purpose varchar(32) NOT NULL);' -f $database
    $bootstrap += 'INSERT INTO `{0}`.__aivale_test_environment VALUES (''{1}'', ''p00-t03-mysql'');' -f $database, $RunId
}
$bootstrapPath = Join-Path $RunDirectory 'bootstrap.sql'
$bootstrap | Set-Content -LiteralPath $bootstrapPath -Encoding utf8NoBOM
$server = $null
$initializer = $null
try {
    $baseDirectory = Split-Path $MySqlBin -Parent
    $initializer = Start-Process -FilePath (Join-Path $MySqlBin 'mysqld.exe') -ArgumentList @('--no-defaults', '--no-monitor', '--initialize-insecure', ('--basedir="{0}"' -f $baseDirectory), ('--datadir="{0}"' -f $dataDirectory), ('--log-error="{0}"' -f (Join-Path $RunDirectory 'initialize.log'))) -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    while (-not $initializer.WaitForExit(500)) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Isolated MySQL initialization exceeded 90 seconds.' }
    }
    if ($initializer.ExitCode -ne 0) { throw "MySQL initialization failed; inspect $RunDirectory/initialize.log locally." }
    $server = Start-Process -FilePath (Join-Path $MySqlBin 'mysqld.exe') -ArgumentList @('--no-defaults', '--no-monitor', ('--basedir="{0}"' -f $baseDirectory), ('--datadir="{0}"' -f $dataDirectory), "--port=$port", '--bind-address=127.0.0.1', '--mysqlx=OFF', '--skip-name-resolve', ('--pid-file="{0}"' -f (Join-Path $RunDirectory 'mysqld.pid')), ('--log-error="{0}"' -f (Join-Path $RunDirectory 'server.log')), ('--init-file="{0}"' -f $bootstrapPath)) -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    do {
        if ($server.HasExited) { throw "Isolated MySQL exited; inspect $RunDirectory/server.log locally." }
        $listeners = @(Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort $port -ErrorAction SilentlyContinue)
        if ($listeners.Count -eq 1 -and $listeners[0].OwningProcess -eq $server.Id) { break }
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Isolated MySQL did not become ready within 60 seconds.' }
        Start-Sleep -Milliseconds 200
    } while ($true)
    Assert-OwnedServer $server.Id $MySqlBin $port -RequireListener
    Assert-TestMarkers $rootConfig
    Assert-TestMarkers $appConfig
    $dsns = [ordered]@{}
    foreach ($field in $databaseNames.Keys) { $dsns[$field] = 'aivale_test:{0}@tcp(127.0.0.1:{1})/{2}?charset=utf8mb4&parseTime=True&loc=Local' -f $appPassword, $port, $databaseNames[$field] }
    $state = [ordered]@{
        schemaVersion = 1; runId = $RunId; purpose = 'p00-t03-mysql'; mysqlVersion = $mysqlVersion
        mySqlBin = $MySqlBin; port = $port; pid = $server.Id; runDirectory = $RunDirectory; dataDirectory = $dataDirectory
        rootClientConfigPath = $rootConfig; appClientConfigPath = $appConfig; databases = $databaseNames; dsns = $dsns
        status = 'running'; startedAtUtc = [DateTime]::UtcNow.ToString('o'); stoppedAtUtc = $null
    }
    $state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding utf8
    Write-Host "Started isolated MySQL $mysqlVersion; private state: $statePath"
    Write-Output $statePath
} catch {
    # Failure cleanup may stop only the child processes created in this invocation.
    foreach ($ownedProcess in @($server, $initializer)) {
        if ($null -ne $ownedProcess -and -not $ownedProcess.HasExited) {
            $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($ownedProcess.Id)"
            $dataArgument = [regex]::Escape("--datadir=$dataDirectory")
            $quotedValue = '--datadir="' + [regex]::Escape($dataDirectory) + '"'
            if ($current -and [string]::Equals($current.ExecutablePath, (Join-Path $MySqlBin 'mysqld.exe'), [StringComparison]::OrdinalIgnoreCase) -and
                $current.CommandLine -match "(?i)(?:^|\s)(?:`"$dataArgument`"|$quotedValue|$dataArgument)(?=\s|$)") {
                Stop-Process -InputObject $ownedProcess -Force
                [void]$ownedProcess.WaitForExit(10000)
            }
        }
    }
    throw
}
