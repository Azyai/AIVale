# Run 元数据创建基础契约

P02-T08只提供内部 `CreateMetadata` 用例及 `ag_runs` 持久化基础。当前没有客户Run管理或公开HTTP路由，`runtime_ready`仍为false；本契约不能作为运行、调度、模型调用或资金使用许可。

`run-metadata-foundation.schema.json`描述内部命令值的离线JSON投影，供文档和契约验证使用。`foundationInput`不等于HTTP请求体，`result`不等于HTTP响应。Go的`workspaceID/agentID`和可信管理身份通过函数/仓储参数传入，不在该投影中由请求声明。`IdempotencyKey`是内部命令参数；在后续HTTP接线时仍需独立规定其请求头与认证边界。

当前命令仅接受明确的`version_id`、当前用户本人同Team的`funding_token_id`、对象输入`input`、可选的扁平标量`metadata`及16至128字节可见ASCII幂等键。不接受`current`、draft/debug、调用方指定的主体、权限、执行模式、触发类别、优先级或运行限额。输入按冻结release的受限inline Schema验证，数值以精确十进制规范化及有理数比较；不存在远程Schema加载。

事务锁定有效用户/管理会话、当前Team成员和工作区成员关系、active Agent、具体不可变release及同Team本人有效的资金Token引用。资金检查不读取Key、不检查余额或模型/工具实际运行资格，不预留或结算任何金额。admin/developer/operator仅获得此内部metadata-only创建候选；既有`run:create`完整资源检查仍然关闭。

新Run保持`queued/production/manual`，授权摘要明确`admission=metadata_only`；这不是Worker可领取证明。预算、次数和时长字段只是从已验证版本抄录的有效上界。P03必须补齐完整运行准入、输入事件、可靠投递及Worker接线，本批不生成`run.queued`事件或`run_ready`消息。

Run、`run.create`完成收据和`run_metadata_audit` v8必须同事务提交。scope包含Team、工作区、主体类别/ID和操作，实际Agent路径、固定版本、资金引用及规范化输入/业务metadata进入请求指纹。相同key和意图返回原收据；不同意图冲突。重放仍实时授权，保留的到期key不回收复用。提交响应丢失只能用原key核查，不生成新key重新创建。

收据只有`id/agent_id/agent_version_id/status/mode/created_at`六个字段。`status=queued`描述原创建收据，不伪装成未来生命周期的最新查询；当前版本、草稿及后续Run变化不能回写该收据。内部Result另带原收据`idempotency_expires_at`。持久化收据状态为201；P03的正式HTTP 202受理另行实现。

审计v8使用`aggregate_type=run`，仅记录主体及Team/Workspace/Run/Agent/version引用、固定`run.metadata.create`操作、0→1修订号、请求ID与时间。输入、业务metadata、授权快照、模型指令、原幂等键、凭据和trace正文不进入审计或收据。旧v1至v7审计载荷不接受`run_id`。

JSON Schema无法单独验证UTF-8字节数、数据库归属、实时角色/会话、版本完整性、幂等意图或原子提交。这些条件由真实用例及三库fresh/upgrade验收验证；静态样例通过不代替业务验收。已有工作区和Agent归档保护在`ag_runs`存在时继续关闭，直到后续运行排空适配完成。
