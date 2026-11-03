# 工作区数据库验证门禁

`matrix.py` 每次创建一个新的隔离环境，执行本地 `TestAgentWorkspaceDatabaseMatrix`，核对实际 Go 事件及完整场景摘要，最后正常关闭服务。它不读取业务 DSN、不导入历史结果，不安装或控制系统数据库服务。测试源码、下载的工具、数据库、凭据和详细结果都仅本地保存。

## 执行

项目根目录准备 Python 3.12+、Go、PowerShell 7 及同发行包的数据库工具。MySQL 默认查找 `C:/Program Files/MySQL/MySQL Server 26.7/bin`；PostgreSQL 默认查找 `.local-tests/agent-platform/tools/postgresql-18.6-5/pgsql/bin`。可在本次进程通过 `AIVALE_TEST_MYSQL_BIN` / `AIVALE_TEST_POSTGRES_BIN` 指向其他已准备好的绝对 bin 目录；脚本不自动下载，不把路径推断为版本证明。

MySQL 生命周期复用 [已有隔离环境工具](../mysql/README.md)，其旧任务用途标记只用于确认环境归属；本次实际用例、任务和证据仍属于 P01-T01。PostgreSQL 见 [隔离环境工具](../postgres/README.md)。SQLite 使用项目现有 Go 驱动及新的真实文件，不要求外部服务。

推荐使用完整工作区配置，基准填写开发前已保存的提交：

```powershell
python .agents/agent-platform/delivery/gate.py --profile workspace --base-ref <开发前提交> --task P01-T01
```

它运行既有 21 项基础检查，再顺序执行 SQLite、MySQL、PostgreSQL 三项真实门禁，共 24 项。`workspace` 当前只接受 P01-T01 及配置中的工作区模型/迁移路径；驱动、其他模型或未知数据库影响不能借用此结果放行。扩展业务前先补相应真实用例和审查范围。

开发时可单独验证一个引擎（输出必须是 delivery 忽略目录下尚不存在的新目录）：

```powershell
python .agents/agent-platform/database/matrix.py --engine sqlite --output .local-tests/agent-platform/delivery/<唯一运行目录>
# --engine 另可为 mysql 或 postgresql。
```

## 验证合同

- 每个引擎使用 fresh 主库/独立日志库、upgrade 主库/独立日志库四个新目标；连接前校验本机地址、显式端口、数据库名及用途标记。SQLite 文件必须新建且位于本次忽略目录内。
- fresh 与 upgrade 均执行真实 `InitDB` / `InitLogDB` 首次启动及两次连接关闭后的启动；数据库服务在场景期间持续运行。这不是数据库服务崩溃或应用全进程重启测试。
- upgrade 分别记录发布标签 `v1.0.0-rc.42` 的 users/tokens/channels/logs 最小冻结投影，以及本批开发前 `a65d1f7de` 的 Team/TeamMember 投影。该发布版本无 Team；两份来源不能混称完整旧版数据库备份。
- 逐项比较主/日志结构和数据、旧投影列与已有团队；核对两张新增表只出现在主库、四个索引的列顺序和唯一性、真实重复键错误、同名及跨团队 slug、未知父级/跨团队/退出成员拒绝、分页范围及事务回滚。
- 只证明基础持久化引用与范围；成员元数据读取可包含 blocked 或已退组残留行。P01-T02 的每次访问判定、Team owner 继承及角色动作矩阵尚未交付，不能把仓储函数当鉴权入口。

缺源码、无用例、跳过、测试失败、不完整或重复报告、缺场景/启动轮次、错误码不符、工具缺失、关闭失败均不能通过。Go 长日志按 test2json 分片重新拼接，再解析唯一场景摘要；交付门禁再次从原始 Go 日志验证收据，不仅相信手填计数。

## 结果与收尾

每次输出目录包含 `result.json`、Go 原始事件、stderr 和环境启动/关闭日志。随机 DSN 只通过子进程环境传递，不打印到控制台或写入交付结果；环境私有状态仍保存在其独立数据目录。退出码 0 为该引擎完整通过，1 为测试失败，2 为缺资源、证据或收尾不完整；单引擎成功不等于完整矩阵通过。

MySQL/PostgreSQL 必须以状态中的同一运行编号正常停止，关闭命令成功且状态确认 stopped 才完成。启动失败检查本地清理日志；未确认关闭不能填绿。工具不删除旧证据或数据目录，不接受复用运行目录。需要恢复旧应用时保留新增表和数据，不使用删库作为回退。

结论只覆盖实际记录版本；本批不使用新版本专有 SQL，不提高仓库最低数据库版本，也不因此声称所有历史库、最低版本、全部认证或账务路径已验证。P00-T01 的历史开放项在本地批次报告单独登记。
