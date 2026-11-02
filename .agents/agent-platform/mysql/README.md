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

## 一条命令完成验证

在仓库根目录的 PowerShell 7 中执行：

```powershell
& ./.agents/agent-platform/mysql/verify.ps1 `
  -MySqlBin 'C:\Program Files\MySQL\MySQL Server 26.7\bin'
```

需要 `go`、`git` 在 PATH 中，Go 依赖已可用；MySQL 安装须满足上面的程序要求。每次执行自动生成新运行编号，顺序完成独立实例启动、四库创建、Go 测试、结果归档和正常关闭。失败返回非零退出码。不要把之前手动启动的环境传给此入口；它必须使用新的空库。可用 `-RunId` 指定尚未使用过的编号。

验证实际运行：

```text
GOWORK=off go test -json -count=1 -p 2 -timeout 5m ./model -run '^TestAgentPlatformMySQLValidation$'
```

入口仅在本次进程中设置 `GOWORK` 及四个 `TEST_AGENT_MYSQL_*_DSN`，随后恢复原值。Go 测试要求四库名称、运行编号和用途标记一致，初始时只允许环境标记表；拒绝远程地址、非显式端口和不合规则的库名。普通 `go test` 未配置 DSN 时会 SKIP，这只表示未运行 MySQL 验证；统一入口遇到 SKIP、非零退出码、缺少场景摘要或关闭失败时不会报告通过。

`fresh` 和 `upgrade` 都使用实际 `InitDB` / `InitLogDB`，各执行首次启动及两次连接关闭后的启动。对表、列、索引、约束做完整元数据快照比较；对用户、Token、渠道、Team、成员、日志和 options 做数据快照比较，含中文和超出 INT32 的额度。重复 Token key、团队邀请码及成员 user_id 必须返回 MySQL 1062，已有数据保持。这里的“重启”是关闭数据库连接后重新调用启动入口，MySQL 服务实例在测试期间持续运行。

升级样例源于发布标签祖先 `v1.0.0-rc.42`（`6370b29424168039e94d40d610191e7d2e65dbf4`）的选定 users/tokens/channels/logs 字段；测试中的四个旧模型定义就是冻结投影。首次迁移前保存全部旧投影列与行，迁移后用同一列集逐项比较，排除新增列。额度列显式使用 BIGINT 以满足现有启动前置条件。它不是完整发布库备份，不证明所有历史数据迁移。该版本无 Team，测试只在当前迁移后创建 Team/成员/团队 Token，再验证其重启保留。未涉及的账单记录、并发预算结算和未来 `ag_*` 表需在各自任务验证。

## 查看结果与保留环境

每次的 `.local-tests/agent-platform/mysql/<RunId>/verification.json` 不含凭据，记录提交、分支、输入文件 SHA256、版本、场景、退出码及关闭结果。`go-test.jsonl` 和 `go-test.stderr.log` 留作本机原始诊断；它们可能包含 SQL 和测试数据，不直接提交。仓库可审核的脱敏结果见 [P00-T03 记录](../records/P00-T03.md) 与 [机器可读结果](../records/P00-T03.results.json)。

仅需要检查数据时可加 `-KeepRunning`；此时脚本保留实例，必须用记录里的编号显式关闭：

```powershell
& ./.agents/agent-platform/mysql/verify.ps1 `
  -MySqlBin 'C:\Program Files\MySQL\MySQL Server 26.7\bin' -KeepRunning
# 将控制台返回的真实运行编号填入下一行。
& ./.agents/agent-platform/mysql/environment.ps1 -Action Stop -RunId '<RunId>'
```

`-KeepRunning` 的报告不会包含 `environmentStopped=true`，不能将它作为已完成环境回收的交付证据。正常停止后数据、配置和日志仍保留在私有目录；不要重新运行同编号测试，因为测试要求空库。
