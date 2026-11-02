# P00-T03 MySQL 验证环境

`environment.ps1` 使用 PowerShell 7 在 Windows 上启动独立原生 MySQL 实例。它不读取项目 `.env`、系统 MySQL 服务配置或已有数据目录，不启动或停止已安装的 MySQL 服务。需要同一个 MySQL 安装目录内的 `mysqld.exe`、`mysql.exe` 和 `mysqladmin.exe`。

```powershell
$statePath = & ./.agents/agent-platform/mysql/environment.ps1 -Action Start `
  -MySqlBin 'C:\Program Files\MySQL\MySQL Server 26.7\bin'
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json

# 完成验证后停止这一个实例，保留数据与日志供复核。
& ./.agents/agent-platform/mysql/environment.ps1 -Action Stop -RunId $state.runId
```

可以传入 `-RunId`，但仅接受 8–24 位小写字母和数字。默认值由 UTC 时间和随机后缀组成。`-RunDirectory` 只能是当前仓库的 `.local-tests/agent-platform/mysql/<RunId>`；已有目录禁止复用。脚本拒绝路径中的符号链接和目录联接。

每次启动均创建独立数据目录、随机回环端口及四个数据库：`aivale_p00_t03_<RunId>_fresh`、`_fresh_log`、`_upgrade`、`_upgrade_log`。`aivale_test` 账户只具有这四个库的权限。四库各有一行 `__aivale_test_environment` 标记，记录当前运行编号和 `p00-t03-mysql` 用途。MySQL X Protocol 被禁用；`--no-monitor` 禁用 Windows monitor，使脚本保存的 PID 与实际监听 PID 一致。所选 MySQL 安装须支持此选项。

运行目录已经被仓库的 `.local-tests/` 忽略规则覆盖，并设置仅当前 Windows 用户与 SYSTEM 可访问的继承 ACL。`root.cnf`、`app.cnf`、`bootstrap.sql` 和 `environment.json` 含随机测试凭据，须留在此目录，不应打印或提交。脚本控制台仅输出实例版本和不含凭据的状态文件路径。

`environment.json` 为验证脚本提供 `schemaVersion`、`runId`、`purpose`、`mysqlVersion`、`mySqlBin`、`port`、`pid`、`runDirectory`、`dataDirectory`、`rootClientConfigPath`、`appClientConfigPath`、`databases`、`dsns`、`status`、`startedAtUtc`、`stoppedAtUtc`。`databases` 与 `dsns` 的键均为 `fresh`、`freshLog`、`upgrade`、`upgradeLog`。不要把完整 JSON 输出到共享日志；消费者应仅将需要的 DSN 设置为本次子进程环境变量，并在结束时恢复。

连接前先确认 `127.0.0.1` 的监听进程属于本次 `mysqld`。停止前再次核对进程 PID、可执行文件、独立数据目录、端口归属和四库标记，然后用专用 `root.cnf` 执行正常关闭。启动失败只清理本次创建且身份匹配的子进程。所有等待都有上限，正常停止失败时不会强制终止进程；脚本不会删除任何目录。初始化日志为 `initialize.log`，启动日志为 `server.log`，客户端及停止诊断也只留在本次运行目录。

环境模块已于 2026-11-02 在 Windows、PowerShell 7、MySQL Community Server 26.7.0 上实测：独立实例启动、四库标记、应用账户仅四库授权、私有目录 ACL、正常关闭均通过。该结论仅针对此原生环境；不代表已验证其他 MySQL 版本、Docker、SQLite 或 PostgreSQL。
