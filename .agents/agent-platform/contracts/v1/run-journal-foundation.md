# P03-T01 Run步骤、事件与可靠通知基础

本合同冻结内部 Go 模型、事务原语和端口的离线投影，不是 HTTP 接口、执行凭据或模型调用许可。`runtime_ready=false`。当前管理入口仍只创建 `metadata_only`；本批不提供 production execution admission、Run 租约认领、后台 worker、模型调用或账务操作。隔离测试中的 execution-admitted Run 是明确标记的 synthetic fixture，不能视为生产准入。

`ag_run_steps` 保存固定逻辑步骤的独立 attempt；kind 有 model、tool、skill_load、sandbox、approval、workflow_node 六种，状态字典有 pending、running、waiting_approval、succeeded、failed、cancelled、outcome_unknown、skipped 八种。本批只创建 pending、attempt=1，无 logical_call_id、外部回执或结果；pending model 行也不授权外部调用。唯一 `(run_id,step_key,attempt)`，重放必须核对完整不可变意图，不覆盖历史。`pendingStepIntent` 是内部 json:"-" 字段的离线对象投影，input/target_ref/retry_policy 对应内部 JSON 字符串；未知字段和 status/attempt 覆盖被拒绝。JSON 对象最多60KiB、输入与 input_hash 成对；schema不能证明摘要匹配或自动脱敏。

`ag_run_events` 只追加，无 UpdatedAt/Revision；唯一 `(run_id,seq)` 和 `(run_id,event_key)`。seq 是1起的安全整数，最大9007199254740991；ID用规范正int64十进制字符串，事件键为小写SHA256。event_type是1..48字节可见ASCII开放词汇，未知事件名不能驱动状态变化。载荷为版本1、最多16KiB的严格JSON对象，visibility为user/admin；不能记录凭据或隐藏推理。通用JSON格式校验不证明内容已脱敏。

`model.WithAgentRunJournal` 只对确认回滚的忙/死锁有界重试；不确定COMMIT不自动重放。`InitializeAgentRunJournal` 参加调用方现有事务，要求已由可信未来准入生成的完整 execution 快照、queued、epoch0且无lease，原子保存首个run.queued、Run序号/revision及run_ready；不能提升metadata_only。未来准入须把Run插入也放入同一事务。`EnsureAgentRunPendingStep` 与 `AppendAgentRunReferenceEvent` 要求running、当前owner/epoch、未过期lease、有效deadline且未取消；它们原子写Run修订、步骤/事件及通知。当前生产者只生成run.queued、step.created或从持久化事实构造的引用型开放事件，不接收调用方payload或伪造新状态。

`EnqueueAgentRunNotification` 复用 `ag_outbox`，仅有 `run_ready`、`run_event` 两kind。通知payload严格只含 schema_version、run_id、event_id、event_seq及可选step_id；不含输入、事件正文、资金Token或凭据。必须校验实际同Team/Workspace/Run/Event/Step引用和seq；run_ready绑定首个无step的run.queued。event_key稳定由kind、Run和持久化事件key的SHA256产生；同键返回原通知，异意图冲突，运行通知不允许ON CONFLICT upsert。现有八类审计投影继续只领取审计白名单，不领取运行通知。

`ClaimAgentRunNotification` 只领取两kind的到期pending或过期delivering；每次领取attempts/revision递增，owner为1..96字节可见ASCII，TTL为1..60000ms。`AckAgentRunNotification` / `RetryAgentRunNotification` 精确匹配id、Team/Workspace、kind、revision、attempts、owner、原lease截止及当前未过期条件；旧receipt不能确认。投递调用在claim提交后、业务事务外执行；确认前崩溃会重投同一事实，消费者必须按逻辑步骤/事件唯一键去重。投递lease不等于Run lease。

失败只存固定delivery_failed，退避按1s指数增长并封顶60s；当前每轮最多5次，最后失败或第5次claim到期进入dead。`ReplayAgentRunNotification` 对dead/revision作CAS，保留同一key/payload/聚合，重置attempts开启显式新一轮。领取前预留claim与finish两次安全revision余量，dead重投前预留replay、claim、finish三次；边界耗尽直接拒绝。每次Claim最多清理100条耗尽消息；不启动后台服务。application的JournalRepository/RunNotificationRepository和RunWakeupPublisher端口、repository的显式适配与DeliverNextNotification调用分离持久化和唤醒；Redis只作提示，数据库是事实源。

Schema及样例只验证离线形状，不能独立证明实际权限、事务原子性、引用一致、重复源键、UTF-8字节上限、摘要正确或租约新鲜度。这些由Go实现与真实三库验收负责。未投递/dead事实保留；本批无自动清理、SSE路由、运行取消、外部重试或费用核账实现。
