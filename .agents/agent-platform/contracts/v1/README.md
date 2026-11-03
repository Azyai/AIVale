# Agent 平台最小业务与协议契约

当前公共契约版本为 **1.1.0**。首个纯文本Agent契约由 **P00-T02** 建立，**P00-T06** 在同一v1目录显式补充通用内部错误与分页排序约定。它是后续数据库、Go DTO、前端类型与接口实现的共同输入。

P01-T03在共享1.1.0契约上新增独立版本1.0.0的工作区只读接口描述，正式注册API-001/003；其他远期业务仍不因契约存在而开放。Schema和样例校验不能代替服务端鉴权、真实计费、数据库兼容性或安全合规验证。

P01-T04以独立1.0.0版本的`workspace-writes.*`补充API-002/004/005工作区创建、编辑和运行域尚未接入前的归档；不改既有读取或探测响应。新建/归档返回不可变收据，编辑返回既有详情形状；运行执行与计划排空仍未开放。

## 文件与验证入口

| 文件 | 用途 |
| --- | --- |
| `core.schema.json` | 公共类型、状态、错误码和最小样例结构 |
| `text-agent.example.json` | 同一个 Agent 从公开请求、受理到文本完成的固定样例 |
| `cases.json`（仅本地） | 合法边界、非法输入及归属冲突的测试预期，不随 Git 分发 |
| `capabilities.openapi.json` | P00-T05全局只读能力探测的OpenAPI 3.1描述及局部响应Schema |
| `capabilities.examples.json` | 探测禁用、配置开启但未就绪、禁用gate拒绝未支持写方法的开发样例 |
| `transport.schema.json` | P00-T06共享成功、分页响应及公开传输样例Schema，不发布新的业务路由 |
| `transport.examples.json` | 长期公开的ID、分页、成功与安全错误示例，不是某次验收记录或测试专用反例集 |
| `workspaces.schema.json` | P01-T03工作区列表/详情显式DTO、字符串ID与安全数值、空态及字段白名单；独立版本1.0.0，不改旧core/probe协议 |
| `workspaces.openapi.json` | API-001/003的管理会话身份、page/page_size/sort/q、错误与no-store规则；不声明写接口或API-118 |
| `workspaces.examples.json` | 合成的列表/详情、无团队/无结果/空页及固定错误开发示例，不是执行报告 |
| `workspace-writes.schema.json` | P01-T04创建/编辑/归档请求、最小不可变收据和固定响应；编辑复用既有详情Schema |
| `workspace-writes.openapi.json` | API-002/004/005的管理会话、严格JSON、revision、幂等键及归档限制 |
| `workspace-writes.examples.json` | 合成的创建/重放、编辑、归档及安全错误开发示例，不是执行报告 |
| `../validate.py`（仅本地） | 离线校验 Schema、样例及正反案例的测试入口，不随 Git 分发 |
| `../requirements.txt` | 校验工具依赖，与业务运行时依赖分开 |

测试入口与专用案例仅保留本地；新克隆须先具备上述文件，缺少时标记为未验证，不能宣称契约测试通过。正式 Schema、OpenAPI、公开开发示例和工具依赖继续版本管理。规则见 [测试与验收规范](../../../../docs/project/07-acceptance.md)。

工作区名称查询`q`最多128个Unicode码点且UTF-8原始值最多512字节，随后修剪首尾空白；按区分大小写的字面子串匹配，`%`、`_`、`!`、反斜线无通配含义。列表只接受单值`page/page_size/sort/q`，详情不接受query；排序复用共享白名单。`effective_permissions`只含当前角色/状态下可直接通过工作区层判定的动作，元数据范围不含私密正文，缺实际资源条件的动作不列出。列表`empty_reason`为null、no_team、no_results或page_out_of_range；归档/跨租户详情统一不可见。

在具备本地共享契约用例的仓库根目录运行：

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
| 分页 | `page` 默认1且不超过JSON安全整数，`page_size` 默认20、范围1–100；返回 `items/total/page/page_size`，total非负且不超过JSON安全整数，空结果为数组 `[]` |
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

P00-T06的共享工具复用本契约；测试源码、负向案例和详细结果仅保留本地。离线Schema校验不能代替真实Go/HTTP边界验证，也不代表尚未发布的业务接口已经可调用。

## P01-T04 工作区生命周期写入

三个写入口继续受默认关闭的平台总开关控制，只接受现有显式Bearer管理会话；不从Cookie、PAT、模型Token、body或自定义租户头建立身份。创建仅限当前Team双事实owner；编辑/归档要求当前owner或显式active admin，active/suspended工作区可管理。具体状态与范围仍在业务事务中重新检查，HTTP认证结果不能替代实时授权。

请求只接受`application/json`及可选`charset=utf-8`，Content-Encoding为空/identity，不接受任何query。body最多1MiB，必须是唯一完整对象，字段名精确匹配白名单；拒绝重复解码key（含转义后重名）、未知字段、大小写变体、null、非法UTF-8、未成对surrogate及拼接JSON。`expected_revision`须为1到`9007199254740991`的规范正整数JSON词法，不能传字符串、小数或指数。标准JSON Schema只判断解析后的数值，不能独立验证源词法或UTF-8字节上限；这些约束由HTTP边界与服务执行，Schema中相应`x-*`仅记录补充规则。

创建body为必需name、可选description/slug。name在修剪前最多128码点/512字节，修剪后非空；description最多4096字节并保留首尾空白；二者须合法UTF-8且无NUL。slug若提供，必须是1–64位规范小写ASCII，不静默修剪或转小写；缺省值由服务生成一次。名称允许重复，Team内slug唯一且归档后不回收。201 data只含`id/slug/status=active/revision=1/created_at`，不回放易变化的名称、描述或权限；需要当前信息时请求授权GET。

编辑只接受可选name/description和必需expected_revision，至少提供一个可编辑字段；description空串可清除描述。禁止更改slug、Team、主体、状态、策略及预算。200 data复用既有详情契约；旧revision为409，错误data不添加current_revision，客户端通过授权GET刷新。

归档body为expected_revision及reason。reason在修剪前最多512码点/2048字节，修剪后非空；不在审计中保存原文。当前只支持运行域尚未接入前的归档：active_run_count为正返回409；若已存在ag_runs/ag_schedules/ag_schedule_fires表，在对应领域适配完成前返回503，不能假装已经停止计划或排空真实任务。200 data为`id/status=archived/revision/archived_at/blocking_run_count=0`，不提供虚构的stopped_schedule_count。归档不物理删除资源或回收slug，一般列表/详情不再显示该对象；历史运行的读取例外需在后续运行领域单独实现。

两个POST必须携带单值`Idempotency-Key`，长度16–128，字符为可见ASCII 0x21–0x7e，不修剪；原key不进入存储或审计。成功和同key成功重放返回`Idempotency-Key-Expires-At`响应头，值为原收据的UTC Unix毫秒规范十进制字符串，初始保留期至少24小时。本版本不清理/替换过期行：超过该时间仍返回已存同请求收据，异请求继续409，不将过期key复用为新的副作用。每次重放仍检查当前授权；创建目标已归档不可重放，归档同key重放仅对当前仍有该对象管理权的主体返回原收据。PATCH由revision CAS控制，不要求该header。

工作区变更、完成收据和去内容化审计outbox同一主库事务落地；审计投影到独立日志存储的失败不能把已提交业务改报回滚。HTTP始终只返回固定安全envelope和no-store，不暴露内部审计payload、SQL、原key或私密请求内容。公开示例用于开发说明，不能作为本地或生产执行结果。

## P00-T05 全局只读能力探测

[OpenAPI描述](capabilities.openapi.json)只发布公开的GET `/api/agent-platform/capabilities`，不发布业务资源或写方法。它位于现有API中间件链内，只描述全局有效配置及运行时就绪，不返回Team/Workspace、用户权限或内部连接信息，不从query/header接受租户作用域，也不授予任何操作权限。未来工作区级`W/capabilities`仍需独立完成资源授权，不能用这个公开探测替代。

仅精确GET该路径获得平台总开关豁免。总开关关闭时探测仍返回HTTP200和禁用有效值；HEAD、写方法和子路径不获得该豁免。响应为`success/code/message/request_id/data`，成功码为`OK`，响应头为`Cache-Control: no-store`及`X-Oneapi-Request-Id`（值与JSON的request_id一致）。data包含schema_version=1、五个有效布尔开关和runtime_ready。当前运行引擎未实现，全部配置开启时runtime_ready仍为false；该字段的Schema类型保持boolean，允许后续真实实现报告就绪，不能通过开关本身推断就绪。

成功响应允许未来增加可选字段，当前客户端仍检查必需字段及类型。[开发样例](capabilities.examples.json)中的`disabled200`和`configured_not_ready200`对应已注册GET；`blocked_write503`只说明总开关关闭时，命名空间gate如何拒绝未支持的POST。该POST没有被注册为API，不能据此生成写操作客户端。其错误body复用冻结`core.schema.json#/$defs/errorResponse`，并固定`AG_RUNTIME_UNAVAILABLE`、空field_errors和retryable=false。总开关开启也不会创建业务处理器；当前尚未实现的新建工作区/Run入口仍为404。

在已经启动本地开发应用后，可以执行以下只读请求：

```powershell
curl.exe --include --request GET http://127.0.0.1:3000/api/agent-platform/capabilities
```

这里提供的是可执行命令和开发契约样例；编写文档不会启动应用、调用该地址或证明生产部署状态。局部Schema/样例校验不等同于完整OpenAPI规范工具检查，也不替代实际路由与前端客户端测试。该探测的`schema_version=1`、OpenAPI文档自身版本1.0.0及请求响应形状保持不变；共享core契约版本演进见下节。

## P00-T06 共享传输契约与版本演进

1.1.0在原22个错误码之外增加`AG_INTERNAL_ERROR`，HTTP状态500，固定安全消息为`The request could not be completed`。未知或未经分类的内部错误不能冒充平台关闭的503。原错误码、HTTP状态和`success/code/message/request_id/data`形状不变；公开文本场景仅同步顶层contract_version，业务内容不变。严格固定旧版本的Schema消费者应显式升级到1.1.0；不能把新目录与旧版本声明混用。

根模块的`types/agent`定义固定错误目录及安全wire类型，`pkg/agentapi`负责HTTP适配。受控错误允许通过普通Go包装保留错误分类，未知错误返回通用500；内部cause、SQL、密钥、绝对路径和原始上游内容不进入message或field_errors。字段错误只由服务端声明的字段名和静态规则文案构造，不能传入被拒绝值或`err.Error()`；长度限制以合法Unicode字符计，path/message各不超过256，field_errors最多100，空数组保持`[]`。retryable默认false，只有后续操作具备幂等与结果证据时才能另行定义重试政策；普通Context取消不自动构成步骤超时、未知执行结果或账务待核对。

HTTP响应由同一适配器设置服务端request_id及`X-Oneapi-Request-Id`，值长1–64；从可信请求上下文读取有效值，缺失或非法时重新生成，不信任客户端同名header。200/201成功使用`OK`，202使用`ACCEPTED`，适配器不静默修正不合法的状态/code组合。能力探测及功能禁用拒绝采用该公共工具，旧模型协议与旧管理接口不进行全站响应迁移。

Agent保留命名空间内的局部兜底在响应尚未提交时返回通用500；已写出响应后仅中止，不能追加另一份JSON或泄露panic内容。该边界不等于重写全站Recovery或证明全站日志/审计合规。安全设计依据为OWASP ASVS 5.0.0的输入正向校验与安全错误要求，参见 [Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) 与 [Error Handling](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html)；本契约不声明通过整站ASVS认证。

### ID与分页输入

`ParseID`先验证ASCII十进制词法和长度，再按有符号int64转换。`ParseJSONID`经common包装将JSON解为字符串后应用同一规则；JSON数字、null、对象或数组不能先转换浮点再恢复ID。传输层解析不代表资源归属或操作授权。

分页工具只拥有`page/page_size/sort`三个查询参数。未提供参数才采用默认1/20；显式空值、重复参数、旧`p`或未知键拒绝，数字必须是无前导零的正十进制形式。端点需要的业务筛选参数应先由该控制器按自身契约解析并移出，再调用共享分页解析器，不能将工具对未知参数的拒绝改为全量忽略。

sort使用`字段:方向`，多项以逗号连接；仅允许以下八个输入值，精确区分大小写，不接受空白、重复字段或SQL片段：

```text
id:asc
id:desc
created_at:asc
created_at:desc
created_at:asc,id:asc
created_at:asc,id:desc
created_at:desc,id:asc
created_at:desc,id:desc
```

默认`created_at:desc,id:desc`；省略ID时补`id:desc`稳定次序，ID必须是最后一项。解析器返回受控字段和方向枚举，模型层只能映射这些枚举，不能将原始sort字符串拼到SQL。

`PageQuery`以私有字段保存验证结果，排序切片防御复制；零值不是有效查询。offset使用checked int64运算，它是内部数据库偏移，不作为JSON数字公开，可能大于JavaScript安全整数。`NewPage`将nil items规范成空数组，检查total安全整数、页大小及结果数量；无效服务端查询或仓储数据作为内部500处理，不伪装成客户400，也不静默截断结果。P00-T06时共享工具通过本地HTTP harness验证；P01-T03工作区列表进一步接入真实数据库与生产路由，验证范围及执行结果仍单独保存在本地。
