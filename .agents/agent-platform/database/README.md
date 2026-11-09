# 工作区数据库验证门禁

`matrix.py` 每次创建一个新的隔离环境，执行本地 `TestAgentWorkspaceDatabaseMatrix`，核对实际 Go 事件及完整场景摘要，最后正常关闭服务。它不读取业务 DSN、不导入历史结果，不安装或控制系统数据库服务。测试源码、下载的工具、数据库、凭据和详细结果都仅本地保存。

## 执行

项目根目录准备 Python 3.12+、Go、PowerShell 7 及同发行包的数据库工具。MySQL 默认查找 `C:/Program Files/MySQL/MySQL Server 26.7/bin`；PostgreSQL 默认查找 `.local-tests/agent-platform/tools/postgresql-18.6-5/pgsql/bin`。可在本次进程通过 `AIVALE_TEST_MYSQL_BIN` / `AIVALE_TEST_POSTGRES_BIN` 指向其他已准备好的绝对 bin 目录；脚本不自动下载，不把路径推断为版本证明。

MySQL 生命周期复用 [已有隔离环境工具](../mysql/README.md)，其旧任务用途标记只用于确认环境归属；实际用例、任务和证据按本次模式记录。PostgreSQL 见 [隔离环境工具](../postgres/README.md)。SQLite 使用项目现有 Go 驱动及新的真实文件，不要求外部服务。

推荐使用完整工作区配置，基准填写开发前已保存的提交：

```powershell
python .agents/agent-platform/delivery/gate.py --profile workspace --base-ref <开发前提交> --task P01-T01
```

它运行既有 21 项基础检查，再顺序执行 SQLite、MySQL、PostgreSQL 三项真实门禁，共 24 项。`workspace` 当前只接受 P01-T01 及配置中的工作区模型/迁移路径；驱动、其他模型或未知数据库影响不能借用此结果放行。扩展业务前先补相应真实用例和审查范围。

P01-T02改用`--profile workspace-access --task P01-T02`，共25项：基础21项、现有UserAuth到新guard的适配用例、三个引擎的两阶段验证。引擎入口带`--access`时先跑上述迁移用例，再向独立服务测试进程传递同四目标，执行真实工作区访问服务；不会复用旧运行结果，也不重置上一阶段数据。

P01-T03改用`--profile workspace-read --task P01-T03`，仍为25项；每个引擎增加第三阶段的实际生产列表/详情路由测试。引擎入口`--read`隐含`--access`，三个阶段使用同一运行编号与四个隔离目标，后阶段不能破坏前阶段数据。

P01-T04改用`--profile workspace-write --task P01-T04`，仍为25项；引擎入口`--write`隐含`--read/--access`，增加第四阶段创建、编辑及归档验证。准备本地`router/agent_workspace_write_database_test.go`及独立workspace-writes公开契约；后阶段仅修改自己夹具，前阶段数据及独立日志库结构须保留。

P01-T05 使用 `--profile workspace-members --task P01-T05`，仍为 25 项。单引擎 `--members` 隐含前三个参数并增加第五阶段 `TestAgentWorkspaceMembersDatabaseMatrix`；准备本地 `router/agent_workspace_members_database_test.go` 与 workspace-members 公开契约。三库不复用旧运行，不接触业务实例。

P01-T06 使用 `--profile workspace-grants --task P01-T06`，仍为 25 项。单引擎 `--grants` 隐含前五阶段并增加 `TestAgentTokenGrantDatabaseMatrix`，需要本地 `router/agent_token_grant_database_test.go` 与 workspace-token-grants 公开契约。验证主库迁移与唯一索引、管理范围、持久化幂等、旧 `/v1/models` 兼容和真实 TokenAuth 解析/撤销。两场景各 21 项行为、三次连接启动及实际请求数；六阶段同次匹配，仍须正常关闭隔离数据库。

P01-T07 使用 `--profile workspace-grant-governance --task P01-T07`，仍为 25 项。单引擎 `--governance` 隐含前六阶段，新增本地 `router/agent_token_grant_renewal_database_test.go`。验证续发竞争、代次、旧收据和撤销、权限摘要、回滚与历史审计；两场景各 19 项行为、三次连接启动和实际 HTTP 请求，七阶段同次核对和正常关闭。

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
- 不带`--access`时只证明基础持久化引用与范围；成员元数据读取可包含blocked或已退组残留行，不能把仓储函数当鉴权入口，也不据此证明P01-T02访问服务通过。
- `--access`阶段另外要求本地`service/agent/workspace_access_database_test.go`，在fresh/upgrade各验证96个角色动作组合及范围、owner继承、跨团队/工作区隔离、默认角色不授权、实时降权/退组/停用/软删除、会话撤销/过期/版本、归档/暂停及固定安全错误。仓储读取不是授权；只有本次真实身份与当前事实校验成功的工作区层动作才返回范围。
- `--read`另外要求本地`router/agent_workspace_read_database_test.go`。在fresh/upgrade各实际注册生产路由并经过现有UserAuth，验证两个GET的会话限定/默认关闭、可见列表及COUNT分页、owner双事实、显式成员、字面且区分大小写的名称筛选、稳定排序/空态、详情范围、输入拒绝、实时撤权及精确SID/状态/角色、DTO边界、权限摘要、no-store和固定安全错误。只读元数据不构成后续Run或凭据许可。
- 读取阶段以本地Schema验证公开样例、真实响应及负形状；解析器仅允许批准的本地URN，不访问远端。每个场景要求19项行为均通过且实际HTTP请求数为正整数，不接受手填收据替代原始执行事件。

缺源码、无用例、跳过、测试失败、不完整或重复报告、缺场景/启动轮次、错误码不符、工具缺失、关闭失败均不能通过。Go 长日志按 test2json 分片重新拼接，再解析唯一场景摘要；交付门禁再次从原始 Go 日志验证收据，不仅相信手填计数。

## 结果与收尾

每次输出目录包含 `result.json`、Go 原始事件、stderr 和环境启动/关闭日志。随机 DSN 只通过子进程环境传递，不打印到控制台或写入交付结果；环境私有状态仍保存在其独立数据目录。退出码 0 为该引擎完整通过，1 为测试失败，2 为缺资源、证据或收尾不完整；单引擎成功不等于完整矩阵通过。

MySQL/PostgreSQL 必须以状态中的同一运行编号正常停止，关闭命令成功且状态确认 stopped 才完成。启动失败检查本地清理日志；未确认关闭不能填绿。工具不删除旧证据或数据目录，不接受复用运行目录。需要恢复旧应用时保留新增表和数据，不使用删库作为回退。

访问阶段有自己的退出码、Go原始事件和摘要；缺阶段、缺场景、矩阵数量不符、撤销/隔离证明不全、版本或原始事件不一致均不能通过。两阶段各有330秒外部上限；完整访问检查的1200秒上限覆盖启动240秒、两阶段各330秒和停止90秒，失败仍执行同运行编号收尾。

读取阶段也有独立退出码、原始事件和摘要。完整读取检查的1500秒上限覆盖启动240秒、三阶段各330秒和停止90秒；三个顶层测试、两个场景及三个阶段的实际引擎版本须一致，所有失败仍执行同一环境的正常收尾。单独开发验证可在上述引擎命令后加`--read`，但完整交付仍需三库和基础检查。

写阶段要求新幂等/outbox两表只在主库、真实索引与唯一冲突、三次连接启动后schema和数据稳定；通过真实管理会话验证owner创建/管理员原子性、角色和租户范围、严格JSON边界、幂等及即时撤权、revision与并发、归档活动计数和未来依赖拒绝、审计脱敏/投影失败恢复/事务回滚、实际响应Schema。各场景29项行为全true、startup_passes精确整数3及正整数HTTP请求数；四阶段必须同运行编号/版本且各有完整原始事件及唯一摘要。1800秒上限覆盖启动240秒、四阶段各330秒及停止90秒；失败仍正常收尾，不复用旧运行目录。

开发单引擎可追加`--write`；完整交付仍须workspace-write三个引擎及基础检查。新表提前用于本批真实业务，不代表Token授权、后台运行outbox或ClickHouse投影完成；当前归档只开放运行资源接入前的安全边界。

成员阶段沿用四隔离目标，保留各旧阶段数据和结构。真实 HTTP 验证当前 Team 和角色、最后管理员及两管理员竞争、原会话即时撤权、blocked 版本与重授权、严格输入、真实响应契约和成员审计回滚/恢复。两场景均需 19 项行为、精确 3 次连接启动及实际请求数；五阶段原始 Go 事件与同次收据一致，正常收尾。单引擎上限 2160 秒覆盖启动 240 秒、五阶段各 330 秒及停止 90 秒。成员审核不改变已有 ClickHouse/Run 能力边界。

结论只覆盖实际记录版本；本批不使用新版本专有 SQL，不提高仓库最低数据库版本，也不因此声称所有历史库、最低版本、全部认证或账务路径已验证。P00-T01 的历史开放项在本地批次报告单独登记。

## Agent 定义仓储阶段

`--definitions` 隐含全部七个前置阶段，并在同一四个已标记目标上运行 `TestAgentDefinitionDatabaseMatrix`。定义阶段先核对两表尚无业务数据，再在隔离目标重建开发前的无定义表状态，用真实启动验证增量迁移；原有 P01 数据和主/日志结构必须保留。版本号和 slug 的数据库唯一约束、草稿 CAS、不可变配置、父子归属、事务回滚及三次实际连接启动均需验证，`repository_operations` 必须是正整数。详细退出码、原始 Go 事件及场景摘要分别保存；单引擎开发结果仍不等于完整交付。

`--config-validation` 隐含八个前置阶段，追加 `TestAgentConfigModelDatabaseMatrix`。在同次新库与升级库上执行真实模型、会话和工作区政策查询，要求每个场景有实际正整数 `policy_checks` 和全部行为证据；对比草稿、钱包及日志证明校验无写入。不引入新的数据库迁移。


P02-T08直接运行`matrix.py --engine <sqlite|mysql|postgresql> --runs --output <全新忽略目录>`，隐含全部九个前置阶段并强制五类Agent定义/编辑器HTTP回归标记，再顺序运行Run迁移与内部元数据两个阶段。新建/升级主库及日志库、三次启动、实际操作数、同运行身份/版本及正常关闭必须全匹配。Run业务直接调用真实application/repository，不称为公开HTTP运行验收。现有agent-definition delivery profile尚不包含这两个新增阶段，不能代替本命令。

新增ag_runs后，归档按既有保护关闭；历史pre-runtime归档用例仅在验证Run表为空的标记测试库中临时移表，并在重启schema对比前恢复，新的Run阶段必须对真实schema验证503。不得把测试夹具用于生产迁移或以零计数绕过保护。

## P03-T01 步骤事件及运行通知

在仓库根运行`python .agents/agent-platform/database/matrix.py --engine <sqlite|mysql|postgresql> --run-journal --output .local-tests/agent-platform/delivery/<全新目录>`。该参数隐含--runs的十一前置阶段及五类Agent HTTP回归，再执行model/router两个`TestAgentRunJournalDatabaseMatrix`，共十三阶段。需要本地ignored测试源，缺少即失败；不接受旧报告或跳过。两新阶段严格检查同engine/run_id/版本、fresh/upgrade、实际操作数和必需布尔断言；存储必须三次真实启动、保留旧ag_runs/其他数据及独立日志；应用必须实际子进程提交后退出再补投、步骤去重、原子回滚、过期/旧回执拒绝、dead及同记录重投、审计分流。三库完整通过并确认隔离服务正常停止才算本批验收，旧agent-definition交付profile不包含这两阶段。

测试仅在标记隔离库中显式构造synthetic execution Run。正式metadata创建不能获得execution准入，当前无公开Run HTTP、Worker认领/进程或真实模型传输。新表/索引和投递事务已实现不等于执行闭环或费用核账完成；详细长期边界见docs/project/02、04–07及内部run-journal-foundation合同。
