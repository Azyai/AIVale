# Agent 平台最小业务与协议契约

契约版本为 **1.0.0**，对应开发任务 **P00-T02**。本目录冻结首个纯文本 Agent 闭环的命名、数据类型、归属和接口形状，作为后续数据库、Go DTO、前端类型与接口实现的共同输入。

本任务交付契约材料，相关业务 API 尚未上线。Schema 和样例校验不能代替服务端鉴权、真实计费、数据库兼容性或安全合规验证。

## 文件与验证入口

| 文件 | 用途 |
| --- | --- |
| `core.schema.json` | 公共类型、状态、错误码和最小样例结构 |
| `text-agent.example.json` | 同一个 Agent 从公开请求、受理到文本完成的固定样例 |
| `cases.json` | 合法边界、非法输入及归属冲突的预期结果 |
| `capabilities.openapi.json` | P00-T05全局只读能力探测的OpenAPI 3.1描述及局部响应Schema |
| `capabilities.examples.json` | 探测禁用、配置开启但未就绪、禁用gate拒绝未支持写方法的开发样例 |
| `../validate.py` | 离线校验 Schema、样例及正反案例 |
| `../requirements.txt` | 校验工具依赖，与业务运行时依赖分开 |

在仓库根目录运行：

```powershell
python .agents/agent-platform/contracts/validate.py --output .local-tests/agent-platform/P00-T02/results.json
```

校验依赖 `jsonschema`，本批使用已存在的 4.26.0 环境。需要准备新环境时，按 `requirements.txt` 在隔离 Python 环境安装；这不表示本批安装过依赖。校验不发送 HTTP 请求，不调用模型，也不扣减额度。

Schema 根结构是开发用的完整场景，不是生产请求 DTO。后续实现复用 `$defs` 的公共类型及错误目录，不能把样例 `context` 或固定 Authorization 占位符当成公开 API 字段或真实认证规则。数值采用 Decimal 无损解码后检查安全整数边界，未知事件 payload 中的合法小数仍可保留。

## 公共数据约定

| 项目 | 冻结规则 |
| --- | --- |
| 数据表 | 新表统一使用 `ag_` 前缀；Team、User、模型 Token 和钱包沿用现有体系 |
| ID | JSON、URL 和前端使用规范的正十进制字符串，最大 `9223372036854775807`；内部按有符号 int64 解析 |
| 非法 ID | 拒绝数字 JSON、`0`、负数、正号、前导零、小数、科学计数、空白和溢出，不做静默修正 |
| quota | 非负十进制字符串，最大 int64；`0` 是合法数量，但不能支付正费用调用，不代表无限额度 |
| 时间 | UTC Unix 毫秒数值；旧表秒字段由适配层显式转换，不更改旧字段含义 |
| 整数边界 | 时间、seq、cursor、revision 使用 JSON 安全整数，最大 `9007199254740991`，不得经过浮点舍入恢复原值 |
| 分页 | `page` 默认 1、`page_size` 默认 20，上限 100；返回 `items/total/page/page_size`，空结果为数组 `[]` |
| 事件 | seq 从 1 开始、Run 内严格递增，允许序号间有空隙；cursor 从 0 开始重放；先持久化再发送 |
| 修改版本 | revision 从 1 开始；修改带 expected_revision，冲突返回 409，不采用最后写入覆盖 |

非法字段或未知状态筛选值返回 `400 AG_INVALID_ARGUMENT`；格式合法但不存在或跨工作区的资源使用 `404 AG_RESOURCE_NOT_FOUND`。终态恢复等已知状态下的非法操作使用 `409 AG_INVALID_STATE`。错误响应保留 `success/message/data`，新接口提供稳定 `code/request_id`；完整目录以 Schema 和设计第 6.11 节为准。

ID 和额度必须在词法检查之外校验整数上界。通用 Schema 工具若未启用本目录的格式检查，不能据此宣布溢出边界通过；未来 Go 适配器使用有边界的整数解析，并对 JSON 类型错误直接拒绝。

## 术语与归属

| 名词 | 本契约中的含义 |
| --- | --- |
| Team | 租户和账务主体，承担团队模型费用 |
| Workspace | Team 下的资源及权限空间，同一 Team 的不同工作区仍需授权 |
| Agent | 可持续编辑的稳定资源身份 |
| AgentVersion | 已发布的不可变配置；运行固定到具体版本，不读取之后修改的草稿 |
| Run | 一次执行，具有固定版本、输入、状态、预算和结果 |
| 发起用户 | created_by 对应的用户，承担操作身份与审计归属 |
| caller Token | 公开请求实际认证的模型 Token，不等同浏览器管理凭据或 PAT |
| funding Token | 费用所用凭据引用；公开运行必须等于 caller Token |
| Worker | 执行任务的服务身份，与发起用户不同，不获得父 Token 明文 |
| Run 预算 | 本次执行资源上限，不是再次预扣 Team 钱包 |

样例 `context` 段是开发 fixture 的服务端旁证，用于唯一确定 Team、Workspace、发起用户、caller/funding Token 和 Worker。它不是公开请求体，不得接受客户端声明的归属作为鉴权依据。Agent 版本必须属于该 Agent 和工作区；父 Token 也必须符合当前团队及授权范围。

公开创建请求只包含 `input`、`version_id`、`limits` 和非秘密 `metadata`。不得通过请求体覆盖 workspace_id、created_by、caller_token_id 或 funding_token_id。预算字段统一为 **`limits`**，费用上限使用 `limits.max_cost_quota`，映射到 `Run.budget_limit_quota`；旧拼写 `budget` 不作为兼容别名接受。

## 状态 权限与接口入口

Run 状态只有八种：`queued`、`running`、`waiting_approval`、`cancelling`、`succeeded`、`failed`、`cancelled`、`timed_out`。终态为最后四种，不能直接恢复为运行。最小文本样例采用 queued → running → succeeded；这不是所有后续阶段的完整状态转换表。

未知 Run 状态必须校验失败，不能按成功或已结束处理。未知事件类型允许消费者忽略，不据此改变 Run 状态；因此通用事件类型不能被实现为只允许当前已知事件的封闭枚举。首个事件为 `run.queued`。SSE 的 wire id 和 `Last-Event-ID` 使用 `<run_id>:<seq>`，不能只写序号；同时提供 `after_seq` 时，解析出的 seq 必须一致，且 Run ID 必须匹配当前请求。

公开 Token scope 使用单数：`agent:run`、`run:read`、`run:cancel`、`artifact:read`。管理动作 `run:create` 属于另一层权限；工作区角色为 admin、developer、operator、viewer。有效权限取平台政策、Team 成员、工作区、资源、Token 和运行允许范围的交集，快照不覆盖实时撤销。

| 入口 | 路径 |
| --- | --- |
| 工作区集合 | `/api/agent-platform/workspaces` |
| 管理资源 | `/api/agent-platform/workspaces/:workspace_id/...` |
| 公开创建 | `/v1/agents/:agent_id/runs` |
| 公开运行资源 | `/v1/agent-runs/:run_id` |
| 浏览器工作区 | `/agent-platform/workspaces`、`/agent-platform/w/:workspace_id` |

创建 Run 必须使用 Idempotency-Key。重复请求的规范化摘要包含实际资源路径和有效主体，不能因路由模板相同而混淆两个 Agent。相同 Key 不同请求返回 `409 AG_IDEMPOTENCY_CONFLICT`。

## 最小样例与版本演进

`text-agent.example.json` 只包含 `kind=single`、文本输入输出，以及空 Skill/Tool 绑定。accepted 与 completed 表示同一 Run 的不同快照，事件按 seq 排列，分页样例展示对应 Run。样例必须能明确回答“在哪个工作区、哪个发布版本、谁发起、谁执行、由哪个 Token 支付、预算是多少”。

该样例保存从首个 `run.queued` 到 `run.succeeded` 的完整轨迹，首 seq 为1，终态和时刻必须与 completed 快照一致；中间未知事件可忽略。此完整场景约束不限制通用事件 Schema 将来接收终态之后的合法用量事件。指令、输入和内联输出各限32KiB UTF-8，metadata序列化限4KiB，单TEXT列序列化总量限60KiB；不能用字符数替代字节数。

conversation、workflow、Skills、MCP、脚本、产物和子 Agent 是后续扩展，不通过预填假字段加入首个闭环。扩大输入类型、改变费用单位、ID 形式、终态或事件序号规则属于不兼容修改，应提升主版本并提供迁移；新增可选响应字段或可忽略事件可以按兼容规则演进。请求端仍严格拒绝未支持的危险字段。

后续 P00-T06 实现错误和分页封装时复用本契约及正反案例，并补真实 Go/API 验证；不得以本目录的离线通过替代已经上线接口的行为验收。

## P00-T05 全局只读能力探测

[OpenAPI描述](capabilities.openapi.json)只发布公开的GET `/api/agent-platform/capabilities`，不发布业务资源或写方法。它位于现有API中间件链内，只描述全局有效配置及运行时就绪，不返回Team/Workspace、用户权限或内部连接信息，不从query/header接受租户作用域，也不授予任何操作权限。未来工作区级`W/capabilities`仍需独立完成资源授权，不能用这个公开探测替代。

仅精确GET该路径获得平台总开关豁免。总开关关闭时探测仍返回HTTP200和禁用有效值；HEAD、写方法和子路径不获得该豁免。响应为`success/code/message/request_id/data`，成功码为`OK`，响应头为`Cache-Control: no-store`及`X-Oneapi-Request-Id`（值与JSON的request_id一致）。data包含schema_version=1、五个有效布尔开关和runtime_ready。当前运行引擎未实现，全部配置开启时runtime_ready仍为false；该字段的Schema类型保持boolean，允许后续真实实现报告就绪，不能通过开关本身推断就绪。

成功响应允许未来增加可选字段，当前客户端仍检查必需字段及类型。[开发样例](capabilities.examples.json)中的`disabled200`和`configured_not_ready200`对应已注册GET；`blocked_write503`只说明总开关关闭时，命名空间gate如何拒绝未支持的POST。该POST没有被注册为API，不能据此生成写操作客户端。其错误body复用冻结`core.schema.json#/$defs/errorResponse`，并固定`AG_RUNTIME_UNAVAILABLE`、空field_errors和retryable=false。总开关开启也不会创建业务处理器；当前尚未实现的新建工作区/Run入口仍为404。

在已经启动本地开发应用后，可以执行以下只读请求：

```powershell
curl.exe --include --request GET http://127.0.0.1:3000/api/agent-platform/capabilities
```

这里提供的是可执行命令和开发契约样例；编写文档不会启动应用、调用该地址或证明生产部署状态。局部Schema/样例使用本地jsonschema校验，不等同于完整OpenAPI规范工具检查，也不替代实际路由与前端客户端测试。原`core.schema.json` v1.0.0保持冻结，P00-T02验证入口继续只负责原有场景。
