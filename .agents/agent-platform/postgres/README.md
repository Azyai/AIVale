# PostgreSQL 隔离验证环境

`environment.ps1` 在 Windows / PowerShell 7 中管理单次独立 PostgreSQL 实例，不安装或修改 Windows 服务，不读取项目业务 DSN、已有数据目录或系统数据库配置。数据库测试源码、下载的二进制、随机凭据、数据和日志只留在 `.local-tests/` 中。

## 二进制准备

需要同一 PostgreSQL 发行包的 `postgres.exe`、`initdb.exe`、`pg_ctl.exe`、`psql.exe` 及其配套 `lib/share` 资源。可以使用已安装发行包，也可以从 [PostgreSQL 官方 Windows 下载入口](https://www.postgresql.org/download/windows/) 所链接的 [EDB 免安装归档](https://www.enterprisedb.com/download-postgresql-binaries) 获取固定版本。解压到被 Git 忽略的本地工具目录，记录实际下载 URL、版本、归档 SHA256 和二进制版本，不把二进制或一次性下载记录入库。

数据库结论只覆盖实际运行的版本；支持的最低版本仍遵循仓库要求。若实现依赖版本特性，还须按项目约定验证相应最低版本。此工具不升级任何项目数据库驱动，也不自动下载或安装服务。

## 启动与关闭

```powershell
$statePath = & ./.agents/agent-platform/postgres/environment.ps1 -Action Start `
  -PostgresBin '<本地固定版本发行包的绝对bin目录>'
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json

# 消费者只把本次需要的DSN传给子进程，结束后关闭同一运行编号。
& ./.agents/agent-platform/postgres/environment.ps1 -Action Stop -RunId $state.runId
```

`Start` 可指定 8–24 位小写字母/数字的 `-RunId`。每次必须新编号；脚本不复用或删除旧目录。数据仅写入当前仓库 `.local-tests/agent-platform/postgres/<RunId>`，`-RunDirectory` 如提供也必须精确等于该路径。任意输出祖先的 symlink/junction 均被拒绝。目录设置仅当前 Windows 用户与 SYSTEM 可访问的 ACL。

初始化使用随机密码及 SCRAM 认证。服务通过 `pg_ctl` 的 Windows restricted-token 启动路径运行，不直接以管理员身份运行 `postgres.exe`。启动子进程时暂时清除当前CLI标准句柄的继承标志并在随后还原，防止后台服务持有调用者的匿名管道而阻止结果读取完成。监听仅绑定随机 `127.0.0.1` 端口；启动、初始化和关闭等待有上限。控制台只输出版本、诊断及状态文件路径，不输出完整 DSN 或密码。`Start` 成功输出流中的唯一值是状态路径（诊断使用 `Write-Host`）；进程日志的调用方可解析最后一行路径。

创建 `aivale_admin` 管理员和不具有 superuser/createdb/createrole 的 `aivale_test` 应用账户。应用账户仅拥有四个本次数据库，系统模板及 postgres 数据库对 PUBLIC 的连接权限在本隔离实例中被撤销。四个库为 `aivale_p01_t01_<RunId>_fresh`、`_fresh_log`、`_upgrade`、`_upgrade_log`，均建立 `__aivale_test_environment(run_id, purpose)` 单行标记，`purpose=p01-t01-postgres`。

私有 `environment.json` 字段为：

- `schemaVersion=1`、`purpose=p01-t01-postgres`、`runId`、`postgresVersion`、`postgresBin`。
- `port`、`pid`、`runDirectory`、`dataDirectory`、`rootClientConfigPath`、`appClientConfigPath`。
- `databases`、`dsns`，键均为 `fresh`、`freshLog`、`upgrade`、`upgradeLog`。
- `status`、`startedAtUtc`、`stoppedAtUtc`。

DSN 采用 `postgresql://aivale_test:<随机hex>@127.0.0.1:<随机端口>/<本次库>?sslmode=disable`。无TLS仅用于本机隔离测试，不作为生产连接模板。`admin.pgpass`、`app.pgpass`、初始化密码文件、bootstrap SQL 和状态文件含凭据，不得输出或提交。

关闭前核对状态路径、运行编号、库名、PID、二进制绝对路径、数据目录/端口启动参数、回环监听归属及四库标记。通过后调用 `pg_ctl stop -m fast -w -t 30` 完成有检查点的正常关闭；不使用 immediate 或强制关闭作为成功。状态仅在确认进程退出后写为 stopped，重复 Stop 返回已停止路径。正常 Stop 失败不会强制终止进程。

启动异常时只清理由本次创建且通过可执行文件/独立数据目录核验的子进程树；不会按进程名批量停止。失败实例的数据和日志保留供本机排查，不自动删除。

此脚本仅准备数据库环境；环境启动成功不代表模型迁移、约束、旧库升级、事务或业务验收通过。对应矩阵由独立执行入口实际运行本地用例并核对结果，缺少环境、用例或关闭结果时不得放行。
