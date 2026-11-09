# 02 Agent 运行规范

## 1. 当前实现与目标边界

当前平台已接入工作区与Agent定义/版本管理。P02-T08增加主库Run身份和内部元数据创建基础函数，`Probe`仍固定`runtime_ready=false`；`AgentScope`只承载归属值，不是授权。当前尚未接入本规范中的正式Run受理、执行队列、租约、检查点、审批与调用账本。

以下规则约束开发计划 P01 之后的业务实现及相关 P00 基础工作，依据计划第 3–4、6、9 章与 `.agents/agent-platform/contracts/v1/`。运行路线为 Go + Eino；引擎必须封装在适配层，平台自己的状态、事件、ID、权限和 JSON 契约不直接依赖 Eino 内部类型。

- API 负责认证授权、受理、查询和网关；请求处理器不等待完整 Agent 执行。
- Worker 负责领取、执行、检查点和事件；不加载客户脚本到 Go 宿主。
- Sandbox 只执行获准脚本并产出受限文件，不访问主数据库、宿主 socket 或全局配置。
- 数据库保存运行事实，Redis 只做唤醒与缓存；丢失 Redis 消息后仍能从数据库恢复待办。

### P02-T08 元数据基础边界

`service/agentrun/application.CreateMetadata`仅供受控内部使用，生产路由未接入。限定当前管理会话、启用工作区、同域active Agent、显式已发布且未撤销release，以及发起人本人持有的同Team有效资金Token引用；不从请求指定主体，也不把模型Key或管理PAT转为此身份。仅生成manual/production、queued和`auth_snapshot_json.admission=metadata_only`，不是可执行准入；P03必须单独完整授权，禁止Worker把该标记的历史基础记录当作已获准工作。

输入对固定release的受限inline Schema校验，以精确十进制规范化对象和数组；不经过float64、不解析外部引用。业务metadata只接受有界平面标量字段，拒绝身份、Token、限额等保留字段。记录版本中的预算/调用/时间上界，但不检查资金余额或冻结/结算费用，不写运行事件、消息或唤醒。

创建复用`ag_idempotency_keys`，操作为`run.create`，同一已锁定用户/Team/Workspace范围内绑定实际Agent路径、固定版本摘要、资金引用和规范化内容；旧请求重放仍核对当前会话及资源。内部201收据只含创建时ID、版本、模式、queued和时间，不代表正式P03的202受理或实时状态；到期键保留且拒绝复用。Run、完成收据及v8脱敏审计事实同事务，不提供通用状态更新或删除入口。

## 2. 固定版本与上下文

Agent 发布创建不可变 `AgentVersion`，包含模型策略、指令、输入输出契约、固定 Skill 版本及工具配置快照。Run 只能引用同 Workspace 的已发布版本；内部调试先冻结草稿并标记 `mode=debug`，运行不能读取后续变化的草稿。

发布指针回滚只影响新请求，历史 Run 保持原版本。快照不保存密钥明文，也不固化永久权限；成员移除、Token 撤销、工具禁用和技能安全封禁优先于版本快照。

每次受控动作重新计算有效权限。用户输入、Skill 文本、文件、检索片段和工具返回都属于不可信内容，不得扩大工具白名单、凭据范围或执行预算。只传任务所需的授权上下文，不保存或展示模型隐藏推理链。

## 3. Run 八态与竞争

公开状态仅允许下列八种，不因新增执行细节扩展临时状态名。

| 状态 | 含义 | 合法推进与控制 |
| --- | --- | --- |
| `queued` | 已持久化，等待领取 | 有效租约领取后 `running`；取消为 `cancelled`，排队截止为 `timed_out` |
| `running` | 正在执行或恢复 | 可等待审批、请求取消，或提交成功/失败/超时 |
| `waiting_approval` | 检查点已保存，等待指定审批 | 批准后重新 `queued`；拒绝/撤销为 `cancelled`，到期为 `timed_out` |
| `cancelling` | 已阻止新步骤，正在终止执行 | 停止确认后 `cancelled`，硬截止后 `timed_out`；不得启动新调用 |
| `succeeded` | 最终结果已持久化 | 终态，只读结果和费用 |
| `failed` | 不可恢复失败，保留原因和可用产物 | 终态；核查后需要重试时显式创建新 Run |
| `cancelled` | 已停止 | 终态；此前外部操作与实际消耗仍有效 |
| `timed_out` | 排队、审批或执行截止已到 | 终态；已发生调用不自动退款 |

状态变化必须由数据库 CAS 校验当前状态、版本和适用租约。取消先赢得 CAS 后不得再发布成功终态；成功已提交时，取消返回当前终态，不覆写结果。

Run 状态与 `usage_state=pending/partial/final/reconciliation_required` 分离。结果已确定而费用投影待核对时可以是成功 Run；不能因此显示零费用。外部调用结果未知时，Step 为 `outcome_unknown`，Run 必须为 `failed`、`error_code=CALL_OUTCOME_UNKNOWN`、`usage_state=reconciliation_required`，不能误放入执行前审批状态。

## 4. 受理与一次执行

1. API 确定有效主体、Workspace、固定版本和资金 Token，校验输入 Schema、资源授权及预算。
2. 创建 Run 要求 `Idempotency-Key`。规范化请求摘要包含真实资源路径和有效主体；相同 Key 同请求返回同一 Run，不同请求返回 `409 AG_IDEMPOTENCY_CONFLICT`。
3. 在同一事务写幂等记录、Run、首个 `run.queued` 事件与 outbox，提交后才返回 Run ID；事务中不发送网络请求。
4. outbox 派发唤醒，worker 通过条件更新领取、占用并发槽并递增 `lease_epoch`。
5. 加载固定版本和检查点，核对当前权限、总 deadline、并发与预算；不能只信任创建时的授权。
6. 为模型或工具操作确定稳定 step 与逻辑 call ID。需要审批时先存参数摘要和检查点，尚不调用远端。
7. 获准后再次校验参数 digest、依赖版本、凭据状态与权限，持久化执行意图并原子预留预算，再调用外部能力。
8. 结果先持久化，再提交可展示事件并推进下一步。成功时原子保存结果摘要、产物引用、终态及结束事件。

业务入口不得通过 UI 防重复代替数据库幂等，也不得将外部成功响应在持久化前当作本地最终事实。

## 5. Worker 租约与恢复

Run 领取使用状态、租约及版本条件更新，记录 `lease_owner`、期限和递增的 `lease_epoch`。状态、Step、检查点及事件提交校验有效代次，旧 worker 的数据库写入必须被拒绝。

worker 在每次新 claim 前调用已提供的 `agent_setting.CanClaimNewWork()`。关闭总开关或 worker 子开关停止新领取，不自动取消已经通过准入的工作；活动任务的取消和排空是独立流程。现有维护系统任务 runner 不能代替客户 Run 队列。

租约过期后先检查当前步骤的外部调用意图和回执，再决定重新排队或失败待核查。fencing 只能阻止旧 worker 覆写数据库，不能撤销它已发送的请求；旧 worker 可能仍在执行外部写操作时，新 worker 不得同时补跑。

| 步骤 | 可自动恢复的条件 | 不能确定结果时 |
| --- | --- | --- |
| 本地转换 | 固定输入和版本、无外部副作用 | 从保存输入重算 |
| 只读工具 | 平台确认可重试，结果新鲜度可接受 | 记录尝试次数，不声称重试结果必然相同 |
| 模型调用 | 确定未发送，或有可验证的供应商幂等/查询能力 | 保留预留，禁止盲目重发 |
| 外部写工具 | 有效幂等键或能查明已发生结果 | `outcome_unknown`，停止并核查 |
| 沙箱脚本 | 纯文件转换且输出未发布，或具备明确幂等语义 | 有外部写权限时按写工具处理 |

优雅退出先停止接新工作，保存可恢复状态并释放适用资源；不能通过删租约或重置状态伪造执行未发生。不承诺外部副作用 exactly-once。

## 6. 持久化事件与 SSE

- 每个 Run 的 `seq` 从 1 开始严格递增，允许有空隙；`(run_id,seq)` 和 `(run_id,event_key)` 唯一。
- 追加事件在短事务中锁定 Run、校验 epoch、分配 seq、插入事件并更新 `last_event_seq`。提交后才广播；Redis 只负责唤醒。
- 重连读取 `seq > cursor`，客户端按 seq 去重。高频文本可按时间或大小聚合后落库，关键状态、终态及审计事件不能丢。
- SSE `id` 和 `Last-Event-ID` 固定为 `<run_id>:<seq>`；不能只传裸序号。`after_seq` 从 0 开始，header 序号至少 1，两者上限均为 `9007199254740991`。
- 同时提供 `after_seq` 和 `Last-Event-ID` 时序号必须一致，Run ID 必须匹配；不一致返回 400。游标超出留存窗口返回 410 并提供重新读取 Run 摘要的入口，不能伪装成空流。
- 响应禁止缓存和代理缓冲。建立前使用标准 HTTP 错误；建立后异常发送 `stream.error` 并关闭，客户端重新查询 Run。
- 心跳注释不占 seq；断开订阅不取消 Run，也不自动退款。浏览器使用支持取消和认证头的 fetch 流封装，不将 Token 放进 URL。
- 未知事件类型允许忽略，不能令页面崩溃或自行改变 Run 状态；未知 Run 状态仍须拒绝，不能当作成功或已结束。

事件类型沿用正式契约，包括 `run.queued`、`run.started`、Step 事件、`output.delta` / `output.completed`、工具摘要、审批、产物、用量及各终态。仅发送授权可见内容，不包含密钥、完整内部参数或隐藏推理链。

## 7. 审批、取消与截止时间

审批绑定 Run、Step、工具版本、规范化参数 digest、风险原因、审批人范围和有效期。进入 `waiting_approval` 前保存检查点并释放执行槽；批准后重新排队，在执行前复查当前授权与参数，不能跨动作、版本或有效期复用批准。

高风险动作默认禁止发起人自批；单人工作区通过显式策略和管理员审核解决，不自动放宽。拒绝、过期、取消或配置变化使旧批准不可复用。未知外部结果属于核查，不能通过补一次审批使其自动重发。

运行取消先阻止新步骤，再终止当前模型连接、工具或沙箱执行并收敛终态。无法确认远端是否生效时仍保留事实和待核查标记，不能承诺所有副作用已撤销。

排队、审批、实际执行时长和总墙钟 deadline 分别控制。检查点恢复、重新排队和等待子任务均不能延长总 deadline；已超时任务不能通过修改时间字段继续运行。

## 8. 模型入口与预算

浏览器运行选择当前 Team 有权使用的 `funding_token_id`；公开运行资金 Token 等于实际认证的 caller Token，不能从请求体切换付款凭据。Worker 只持有短期 Run 能力凭据，绑定 Run、step、逻辑 call、租约代次、父 Token 引用、模型范围、audience 和到期时间。

受保护 broker 验证服务身份、能力凭据、当前权限及租约，再以验证后的父 Token 引用进入既有网关管线。自定义请求头不是服务身份；Worker 不接收父 Token 或上游模型 Key 明文。

预算与资金分为三层：钱包/订阅真实资金、模型 Token 限制、Run 执行预算。Run 预留只限制执行，不再次预扣 Team 钱包；真实模型费由现有网关预扣与结算。

1. 按固定模型策略、有效价格、输入估计及输出上限计算可解释的调用预留。
2. 在事务中检查已确认费用、未释放预留和本次预留之和不超过适用 Run/根 Run 限额，同时限制模型次数、工具次数、时间与并发。
3. 写调用意图和预算预留后再调用 broker；既有网关仍独立检查真实资金和 Token 额度。
4. 以可信结算事实把预留转成实际费用关联并释放差额，重复事实按唯一键忽略。
5. 已发送但结果未知时保留预留、停止新步骤并进入核查；不能因 Run 终态或租约过期自动释放未知费用。

金额使用既有 quota 单位和有界整数，API 额度用十进制字符串；不自行猜测货币换算，不将浮点乘积直接转 int。实现遵守 `.agents/rules/billing.md` 及 `common/quota_math.go` 的边界、舍入、饱和与审计规则。

无法证明费用上界时，strict 策略拒绝该能力或使用可证明的保守上界；普通策略明确为预算阈值，实际超出仍如实记账并停止后续调用。不得用回答字数代替真实 Token 用量。

### P02-T09 预算准备接口

`service/agentrun/domain`以整数减法计算费用余量和次数/时长边界；`application.PrepareModelCall`通过可信实时事实、可证明完整费用上界的报价及host网关输出校验端口返回只读`preparation_only`。版本、工作区、平台和Run实际限额取交集，请求只能进一步收紧。现阶段一模型调用、零工具、至多64步/300秒，单调用quota不超过`common.MaxQuota`。余额来自既有资金选择器的一个实际资金来源，不相加或以个人钱包回退团队Token；无限Token也不绕过Run/资金限额。

实时事实和报价适配器本批未装配，缺适配保持关闭；metadata_only、未知调用结果、待核账、失效租约、预算不足、未知或无可证明上界的定价及零资金均拒绝。本地组合测试只证明被拒请求没有到达桩模型，不证明生产派发/资金准入。现网预扣估算只按输入，任意表达式代入最大输出一次也不能证明严格上界，不能直接填入此报价端口。

报价绑定完整调用身份、Run修订号、模型/配置摘要及本次输出/时长上界和价格摘要，跨依赖冻结引用与下调参数，不自动重试未知结果。实际执行窗取累计余量与总deadline余量较小者，准备有效期取quote/Run deadline/当前lease最早值，时钟回退拒绝。通过计算不改变预算、资金或计数；P03仍须在事务里重新授权、比较Run revision与lease epoch、原子预留并写调用意图后才派发。

## 9. 调用账本与核账

`ag_gateway_calls` 保存调用意图、`logical_call_id`、attempt、网关 request 及观察到的资金/Token 结果；`ag_usage_items` 是展示与聚合投影，不能反向驱动第二次扣费。既有 `BillingSession` 的进程内互斥不构成跨进程原子结算收据。

| 崩溃窗口 | 必须采取的处理 |
| --- | --- |
| prepared 且确定未发送 | 当前有效租约可接续发送 |
| 已发送且无可信响应 | 标记未知结果，禁止换 request ID 自动重发 |
| 资金已提交而 Token 结果未知 | 分别记录状态，核查或使用专用幂等修复，不重放完整结算 |
| 网关已完成而用量投影缺失 | 根据原回执补投影，不按 Run 终态重新扣费 |
| 取消后仍收到真实费用 | 关联原调用并如实记账，不把 cancelled 显示为固定零费用 |

P02-T09的`types/agent/model_call.go`只冻结内部身份及最小`GatewayCallLink/ModelUsageLink`观测投影，不新增账本表。公开Token caller必须等于funding，attempt为正int32，金额为非负int64十进制字符串；未知最终金额为NULL，只有确认的结算事实能形成模型用量。消费日志ID允许NULL且必须来自可信持久化事件的真实ID，列表显示序号或普通RequestId不能作付款证明。退款关联原项目且单条不超过调用已确认额度，累计净额、来源事件去重及实际资金修正留给P03/P06。

broker attempt 与 relay 内部渠道/provider attempt 分开记录。供应商超时但可能已执行时，渠道切换也可能产生重复调用，不能只因 broker 去重就宣称一次执行。

管理员核账只能关联回执、确认事实和追加更正；自动资金修复需要另外具备稳定 transaction ID 的原子操作设计。未知调用解决前不自动重试，业务重试需新建 Run 并说明原任务关联与重复副作用风险。

## 10. 工作流、子任务与扩展

P09 只执行固定、已验证的 DAG，节点映射到 RunStep，默认失败策略为 `fail_run`；取消兄弟分支但保留真实费用。P10 才启用固定版本子 Agent，约束深度、数量、权限、模型次数和根预算；父聚合与子明细不得重复形成客户账单。

父 Run 等待子任务时保存子 Run ID、协调 Step 和检查点，内部 `execution_phase=waiting_children`，公开 status 仍为 `running`；结转活动时长并释放 worker 租约和 Workspace 执行槽。子终态通过可去重 outbox 唤醒，满足条件后 CAS 转 queued/ready，不重复创建子任务。

等待期间不累计父实际执行时长，总 deadline、取消与授权撤销仍有效。租约扫描跳过无活动 lease 的等待父任务；父取消传递到后代并禁止新后代。必须验证 Workspace 并发为 1 的父子链能完成，不能占住唯一槽同步等待。

MCP、Skills、调度和产物适配见 [适配器与作业规范](03-adapters-and-jobs.md)，权限见 [安全与权限规范](06-security-and-permissions.md)，验证与证据管理见 [测试与验收规范](07-acceptance.md)。

## P03-T01 步骤、事件与可靠通知基础

`ag_run_steps`保存逻辑步骤首尝试，稳定小写ASCII step_key与attempt唯一；`ag_run_events`只追加，Run内seq与event_key分别唯一。事件序号、Run revision/step_count、步骤和运行通知在同一主库事务中提交。当前只创建pending/attempt=1，不分配logical_call_id、不推进外部调用状态。引用事件由服务端实际Run/Step构造；通用存储JSON校验本身不能自动脱敏，后续正文producer须另做授权与脱敏。

内部journal只处理已持久化且完整快照标记execution的Run，不能把metadata_only升级；正式metadata创建保持原状。queued初始化可加入未来准入调用方事务；步骤/事件追加要求running、当前owner/epoch、有效租约、未取消且deadline未过。当前没有正式execution准入、Run认领、运行HTTP或Worker进程；隔离验收的synthetic fixture不构成生产准入。

复用ag_outbox的run_ready/run_event，payload只有Run/Event/可选Step引用。显式投递入口从SQL领取通知，Redis等发布器只唤醒；revision为投递代次，确认/失败匹配owner、revision、attempts及未过期租约。领取累加attempts，最多5次，退避有界；过期可接管，失败达上限保留dead，显式重投保留原event_key。发送成功但确认丢失可能重复发布，消费者仍须用持久化逻辑键去重，不宣称外部模型或网络恰好执行一次。未注册后台消费者，也未装配真实Redis传输。
