# 智能体平台基础交付门禁

`gate.py` 执行版本管理中的 `checks.json`。它保存本次实际命令、工具版本、基准与输入摘要、退出码和用例结果；不提交Git、不部署、不控制系统数据库服务、不修改开关。数据库配置会创建并关闭本次隔离测试实例。

## 使用

在仓库根目录使用 Python 3.12 或更高版本，以及项目要求的 Go、Bun 和 Git。先在开发前记录基准，开发完成后使用同一个基准：

```powershell
$taskBaseCommit = git rev-parse HEAD
# 完成本批开发后，仍使用上面保存的提交 ID。
python .agents/agent-platform/delivery/gate.py --profile foundation --base-ref $taskBaseCommit --task P00-T09
```

后续任务替换任务编号和开发前基准。已经提交的改动也必须包含在基准范围内，不能在开发后重新取 `HEAD` 排除本批代码。工具合并 `base→HEAD`、暂存区、工作区和未跟踪文件；源文件在验证过程中变化时，结论为未完成。

仅做公共构建检查可运行：

```powershell
python .agents/agent-platform/delivery/gate.py --profile build --base-ref HEAD --task P00-T09
```

| 模式 | 实际职责 | 成功含义 |
| --- | --- | --- |
| `build` | 锁定前端依赖、类型/前端构建、根和独立 Go 模块构建/vet、模块校验、工作区及暂存差异检查 | `scope=build_only`、`acceptance=not_run`；不是验收通过 |
| `foundation` | 上述检查，加固定的 Agent、认证、JSON、限流、权限、离线旧模型协议和前端工作台回归 | 仅 `selected_p00_foundation` 所选用例通过；不是全仓、完整P00阶段或生产发布证明 |
| `workspace` | 上述21项，加工作区 SQLite/MySQL/PostgreSQL 三个真实隔离环境验证 | 仅配置声明的 P01-T01 模型/迁移及所选基础，`acceptance=selected_workspace`；不代表后续角色鉴权或其他数据库变更已验证 |
| `workspace-access` | 基础21项、管理会话适配验证，以及三个引擎各自的迁移和访问判定两阶段验证，共25项 | 仅P01-T02的工作区层访问判定，`acceptance=selected_workspace_access`；不授予后续资源正文、凭据或运行许可 |
| `workspace-read` | 基础21项、管理会话适配验证，以及三个引擎各自的迁移、访问判定、真实生产路由三阶段验证，共25项 | 仅P01-T03工作区列表/详情和所选基础，`acceptance=selected_workspace_read`；不是工作区写操作或完整认证验收 |
| `workspace-write` | 基础21项、管理会话适配，以及三个引擎各自迁移、访问、只读HTTP、写生命周期四阶段验证，共25项 | 仅P01-T04工作区创建/编辑/归档和所选基础，`acceptance=selected_workspace_write`；不代表后续Run或通用outbox已交付 |
| `workspace-members` | 基础21项、管理会话适配，以及三个引擎在上述四阶段后增加成员管理，共25项 | 仅P01-T05成员列表/添加/改角色/移除及所选回归，`acceptance=selected_workspace_members`；不代表工作区页面或Run已交付 |
| `workspace-grants` | 基础21项、管理会话适配，三个引擎在上述五阶段后增加 Key 授权，共25项 | 仅 P01-T06 工作区授权表、管理接口、实时解析和所选回归，`acceptance=selected_workspace_grants`；不代表 Run 或模型结算已验证 |
| `workspace-grant-governance` | 基础21项、管理会话适配，三库在前六阶段后增加续发与摘要，共25项 | 仅 P01-T07 续发、权限摘要、代次复查和所选回归，`acceptance=selected_workspace_grant_governance` |

现有公共 CI 继续只做构建和静态检查。它没有本地测试源码，不因 `build` 返回 0 而完成验收。

## 前置条件和结果

- `foundation` 逐一检查固定的本地测试和辅助文件。缺文件、缺命令、零用例、必需 Go 名称未运行、跳过、失败、重复/不完整报告或前端文件未执行，都不能通过。不提供跳过测试或 `passWithNoTests` 选项。
- Go 使用只读模块、`-count=1` 和包超时；真实前端构建先于根 Go 构建。两个独立模块各自使用 `GOWORK=off`。
- 所有命令使用参数数组，不执行 shell 字符串。首个失败阻断后续检查；超时/中断尝试终止本工具启动的进程树，并记录清理是否确认，未完成项不记绿。
- 默认新建 `.local-tests/agent-platform/delivery/<UTC时间-随机标识>/`，详细日志和 `result.json` 只保留本地。`--output` 也只能指定该忽略目录下尚不存在的新目录；拒绝旧目录、外逃路径和 symlink/junction 祖先。工具不会删除旧证据。
- 退出码 `0` 表示该模式已完成，`1` 表示检查失败，`2` 表示缺资源、范围不受支持或输入变化等未完成。必须同时读取 `scope` 和 `acceptance`，不能只看退出码。

从 [batch-template.md](batch-template.md) 复制空白模板到忽略目录填写本批记录。填写后的模板、测试源码、夹具、日志、截图及报告不进入 Git；固定命令配置、门禁工具和空白模板属于长期工程内容。

## 数据库与后续范围

此版 `foundation` 是 P00 工程基础的所选回归配置，不是任意业务改动的放行器。对 Go 源码、Go 模块元数据、模型/迁移、SQL、数据库或部署配置采用保守范围判断；即使实际只是 Go 注释，也要求先明确适用范围并扩充相应门禁。`--schema-change` 只能收紧判定，不能覆盖自动检测。

这些变更缺少真实 SQLite/MySQL/PostgreSQL 门禁时，数据库状态为 `incomplete`，本地验收返回非零。`foundation` 不包含数据库执行器，也不接受手填的旧报告作为绿灯。P01-T01 使用新增 `workspace` 配置和 [真实数据库入口](../database/README.md)，三库各需空库/升级、三次启动、数据/索引/范围与回滚验证，并确认服务关闭。其他数据库任务必须先补对应检查；无数据库影响时只记不适用，不伪造三库通过。

```powershell
python .agents/agent-platform/delivery/gate.py --profile workspace --base-ref <开发前提交> --task P01-T01
```

`workspace` 配置强制三个引擎各一项，限定任务和数据库影响路径；改驱动、其他模型或未知范围会继续标记未完成。每项只读取本工具本次创建的子目录，重新核对 Go 原始事件、场景摘要与收据一致，不提供外部旧报告导入参数。

P01-T02使用`--profile workspace-access --task P01-T02`，仍需保存并指定开发前基准。该配置另外固定管理会话适配用例；三个数据库检查必须显式启用`--access`，迁移阶段通过后，在同一隔离环境的新建/升级目标上实际执行权限服务。每场景核对四角色×24动作、权限范围、会话/用户/成员撤销、跨租户及错误脱敏；没有访问阶段的P01-T01旧结果不能代替。两阶段的原始Go事件、唯一场景摘要、实际版本和收据都须一致，最后确认正常收尾。

P01-T03使用`--profile workspace-read --task P01-T03`及开发前基准。三个引擎必须同时声明`access:true`与`read:true`，执行器的`--read`隐含`--access`；每个引擎顺序执行模型迁移、权限服务、实际`SetApiRouter`和UserAuth会话链路。列表先按实时可见范围COUNT再分页，验证owner双事实、显式成员、区分大小写的字面筛选、稳定排序与空页、详情隔离、会话撤销及精确枚举、白名单DTO、权限摘要、固定错误和no-store。公开样例、实际响应和负形状样例由本地Schema解析器验证，仅解析批准的本地URN。

每个fresh/upgrade场景必须记录全部19项行为及正整数实际HTTP请求数；不以固定请求数代替行为断言。门禁重新读取三阶段原始Go事件，与收据、唯一场景摘要、引擎/运行编号/版本逐项核对。缺阶段、缺文件、零请求、跳过或收尾不全均不能通过；三阶段完整检查每引擎上限1500秒。历史完整PAT路由目录开放项单独保留，本配置不把所选绿色用例外推为全量通过。

### 工作区阶段整体回归

P01-T09 使用 `--profile workspace-grant-governance --task P01-T09`，除了七阶段，还核对每个新库/升级场景中的 `p01_t09` 证据与实际正整数请求计数。四种角色、双客户工作区和 Key 隔离、旧会话、授权代次，以及旧 Token CRUD、实际模型转发与钱包结算行为缺一项均拒绝。模型请求只发往测试进程内的模拟上游；相关本地用例必须存在，不能用仅编译、模型列表接口或旧收据替代。

### Agent 定义持久化

P02-T01 使用 `--profile agent-definition --task P02-T01 --schema-change`。三个引擎在七阶段之后实际运行第八阶段；定义与版本表、父子归属、版本号唯一、不可变快照、条件更新、回滚及三次启动保留均须由同次原始 Go 事件验证。该范围仅是存储基础，不开放 Agent API、发布服务或模型运行。

P00-T03 的 MySQL-only 约定只覆盖它原有的隔离启动环境。把 `--task` 改成 `P00-T03` 不能豁免新的 schema 或其他数据库变更。`build` 可编译数据库相关代码，但仍明确未执行验收。

P01-T04使用`--profile workspace-write --task P01-T04`及开发前基准，限定本批写链路、主库加法迁移与严格JSON codec影响路径。三个数据库检查必须同时声明access/read/write；执行器`--write`隐含前两阶段，在同一四隔离目标上增加实际生产写路由。两个新表只在主库、索引/唯一约束、三次连接启动稳定、owner及初始管理员原子性、幂等scope/重放撤权/过期保留、revision及并发、归档保护、事务审计与日志故障恢复均须真实验证。

写阶段各fresh/upgrade要求29项行为全true、startup_passes为精确整数3、http_requests为精确正整数。门禁重建四阶段原始Go事件并核对收据、唯一摘要、引擎/运行编号/版本及正常收尾；缺任一阶段、跳过、错误或输入变化均不能放行。完整单引擎上限1800秒覆盖启动240秒、四阶段各330秒及停止90秒。此配置不宣称归档已完成Run排空/停止计划、通用后台投递、ClickHouse审计投影或最低数据库版本验收。

P01-T08c 使用 `--profile workspace-write --task P01-T08`，具有独立的 Go 影响范围。在上述四阶段基础上，fresh/upgrade 写阶段原始摘要还须各有 `create_eligibility=true` 和 `create_eligibility_http_requests`（精确正整数且不超过实际请求总数），证明团队所有者资格读取和创建 Team 前置条件已执行；仅有 P01-T04 证据不能验收 P01-T08c。

增加新领域或修改固定命令时，先补相关门禁和本地行为验证，再更新配置及计划；固定的 P00 用例不能代替跨租户、迁移、账务、运行恢复、真实网络或视觉验收。

P01-T05 使用 `--profile workspace-members --task P01-T05` 与开发前基准。成员阶段校验真实生产会话、租户隔离、owner/admin层级、最后管理员及竞争、修订和撤权、严格输入/分页/契约、事务及审计。固定配置要求三库皆含五阶段，成员阶段本地源码必须存在。各 fresh/upgrade 核对 19 项布尔值、精确 3 次连接启动及正整数请求数，按同运行编号/引擎版本和原始事件核对收据；2160 秒引擎上限覆盖启动、5×330 秒阶段及停止。此模式只允许 P01-T05 已声明影响范围，不作为数据库或全量测试豁免。

P01-T06 使用 `--profile workspace-grants --task P01-T06` 与开发前基准。三库各跑六阶段；Key 阶段 fresh/upgrade 各要求 21 项行为、精确三次连接启动及正整数请求数，以同次实际原始 Go 事件核对收据，禁止复用旧证据。单引擎上限 2520 秒。管理接口走真实生产路由；运行鉴权使用仅本地探针，不开放生产 Run 路由。

P01-T07 使用 `--profile workspace-grant-governance --task P01-T07` 与开发前基准。续发阶段在同次前六阶段之后执行；fresh/upgrade 各有 19 项严格行为、三次连接启动和真实请求数。单引擎上限 2820 秒；原始事件、收据与停机缺一不可，旧证据不能替代。

计划中 P00-T01 的历史全量失败/超时保持未决。旧模型的固定离线转换、流和模型列表鉴权回归只证明其所选范围，不关闭历史问题，也不等同真实模型调用或扣费 E2E。
