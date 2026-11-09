# Agent 平台最小业务与协议契约

当前公共契约版本为 **1.1.0**。首个纯文本Agent契约由 **P00-T02** 建立，**P00-T06** 在同一v1目录显式补充通用内部错误与分页排序约定。它是后续数据库、Go DTO、前端类型与接口实现的共同输入。

P01-T03在共享1.1.0契约上新增独立版本1.0.0的工作区只读接口描述，正式注册API-001/003；其他远期业务仍不因契约存在而开放。Schema和样例校验不能代替服务端鉴权、真实计费、数据库兼容性或安全合规验证。

P01-T04以独立1.0.0版本的`workspace-writes.*`补充API-002/004/005工作区创建、编辑和运行域尚未接入前的归档；不改既有读取或探测响应。新建/归档返回不可变收据，编辑返回既有详情形状；运行执行与计划排空仍未开放。

P01-T05以独立1.0.0版本的`workspace-members.*`发布API-006/007/008：显式授权列表、添加/改角色/重新授权、撤销。工作区管理会话只操作当前Team内已启用用户，不创建Team成员，不开放PAT、模型Token或运行授权。

P01-T06发布工作区运行 Key 授权 API-012/013/014。P01-T07 以独立 1.0.0 的 `workspace-token-grant-governance.*` 增补当前权限摘要、显式续授和带版本的撤销，运行 Key 授权 OpenAPI 更新到 1.1.0。

P01-T08c 以独立 1.0.0 的 `workspace-create-eligibility.*` 发布创建资格读取；仅当前管理会话通过 Team 双重所有者事实时返回 Team ID，其余返回 `false/null`。API-002 OpenAPI 1.1.0 增加可选 `X-Agent-Expected-Team-Id`：仅比较当前已授权 Team，不选择 Team；不匹配在事务内、读取幂等收据或写入前返回 `409 AG_INVALID_STATE`。旧客户端可省略，现有请求体、响应体及幂等哈希保持不变。

P02-T02 以独立 1.0.0 的 `agent-config.*` 冻结纯文本 Agent 的配置值和规范化结果。它是内部校验与后续 API 的输入契约，本批没有注册配置 HTTP 接口，也不开放发布、资金预留或运行。原 P00 文本执行样例和 `core.schema.json` 不变。

P02-T03 的只读切片以独立 1.0.0 的 `agent-definition-reads.*` 发布 API-015/017。只返回当前工作区内的 Agent 元数据；草稿读取、创建、更新、发布与执行未随这两条 GET 开放。

P02-T03 的编辑切片以独立 1.0.0 的 `agent-definition-drafts.*` 发布 API-016/018/019。创建返回 `{id,revision:1,config:null}`；同键同意图在重新授权后返回原收据与原 `Idempotency-Key-Expires-At`，现阶段不复用已到期的键。三条路由均要求活跃 Team 工作区的实时 `agent:write`，不接受查询参数。保存提交完整 `config` 与规范正安全整数 `expected_revision`；发生 `AG_DRAFT_REVISION_CONFLICT` 后重新 GET 草稿再合并。定义的元数据修订号与草稿修订号独立。本切片不创建发布快照或运行。

P02-T04 以独立 1.0.0 的 `agent-publication.*` 发布 API-021。POST 接收 `draft_revision`、可选 `release_note` 和必需 `Idempotency-Key`，返回七字段不可变版本收据。发布事务重新校验当前权限及已存配置政策，一起提交快照、序号、发布指针、幂等结果与脱敏审计。重放原收据不切回旧版本，也不创建新版本；未接入验证报告、版本历史或执行接口。

发布请求示例（在已启用平台的本地开发服务执行；用实际工作区、Agent和已保存的草稿修订号替换示例值，环境变量须为当前管理会话）：

```powershell
$publishWorkspaceId = '101'
$publishAgentId = '201'
$publishIntentKey = [guid]::NewGuid().ToString()
$publishBody = '{"draft_revision":2,"release_note":"首个文本版本"}'
$publishHeaders = @{ Authorization = "Bearer $env:AIVALE_MANAGEMENT_SESSION"; 'Idempotency-Key' = $publishIntentKey }
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3000/api/agent-platform/workspaces/$publishWorkspaceId/agents/$publishAgentId/publish" -Headers $publishHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($publishBody))
```

每个新发布意图只生成一次键。结果未知时保留原请求体和键重试；草稿冲突时先重新读取并合并，确认新意图后再生成键。这是开发调用示例，不是部署或本次执行证据。

P02-T05以独立1.0.0的agent-lifecycle.*发布API-022至026及026A。release历史列表与正文分开授权，正文只向当前编辑者开放。恢复使用草稿revision，切换/停用/启用/归档使用元数据revision；CAS结果未知时先读取当前状态。切换和重新启用已发布版本重新校验政策，不改草稿或旧快照，不创建Run。

版本读取与恢复示例（替换实际工作区、Agent、版本ID及当前草稿revision；使用已启用的本地开发服务和当前管理会话）：

```powershell
$agentHistoryBase = 'http://127.0.0.1:3000/api/agent-platform/workspaces/101/agents/201'
$agentHistoryHeaders = @{ Authorization = "Bearer $env:AIVALE_MANAGEMENT_SESSION" }
Invoke-RestMethod -Method Get -Uri "$agentHistoryBase/versions?page=1&page_size=20" -Headers $agentHistoryHeaders
$restoreDraftBody = '{"version_id":"301","expected_revision":3}'
Invoke-RestMethod -Method Post -Uri "$agentHistoryBase/restore-draft" -Headers $agentHistoryHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($restoreDraftBody))
```

恢复结果未知时，先读取Agent草稿；切换、启停或归档结果未知时，先读取Agent元数据。不要把旧表单作为成功收据，也不要自动换用新revision重发。上述示例只说明开发调用，不是部署或执行证据。

P02-T06以独立1.0.0的agent-editor.*发布API-020和029。配置检查只读取指定修订号的已保存草稿，业务校验失败返回valid=false报告；不保存、发布或运行。模型选项只用于当前编辑权限和服务端可用分组下的配置选择，支持page/page_size/q，不接受资金Key参数。可用性会在保存、发布和后续运行准入时重新判断。

开发调用示例（替换实际ID和已保存的草稿修订号；环境变量为当前管理会话）：

```powershell
$editorHeaders = @{ Authorization = "Bearer $env:AIVALE_MANAGEMENT_SESSION" }
$editorWorkspaceBase = 'http://127.0.0.1:3000/api/agent-platform/workspaces/101'
Invoke-RestMethod -Method Get -Uri "$editorWorkspaceBase/model-options?page=1&page_size=20" -Headers $editorHeaders
Invoke-RestMethod -Method Post -Uri "$editorWorkspaceBase/agents/201/validate" -Headers $editorHeaders -ContentType 'application/json' -Body '{"draft_revision":2}'
```

以上为只读配置辅助调用，不会创建发布版本、Run或资金预留，不表示部署或本次执行证据。

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
| `workspace-create-eligibility.schema.json` | 创建资格和条件 Team ID 的固定响应白名单 |
| `workspace-create-eligibility.openapi.json` | 管理会话、无查询参数、默认关闭及 no-store 约定 |
| `workspace-create-eligibility.examples.json` | 合成的创建资格及安全错误开发示例，不是执行报告 |
| `personal-workspace.md` | 独立个人工作区的读取、显式创建、版本更新及账号隔离 |
| `workspace-members.schema.json` | P01-T05严格PUT输入、成员分页、授权与撤销白名单响应；复用公共固定错误 |
| `workspace-members.openapi.json` | API-006/007/008的会话、参数、最后管理员保护及no-store约定 |
| `workspace-members.examples.json` | 合成的成员列表、授权、重新授权、撤销和固定错误开发示例，不是执行报告 |
| `workspace-token-grants.schema.json` | P01-T06 运行 Key 显式工作区授权的列表、创建、撤销以及固定错误白名单 |
| `workspace-token-grants.openapi.json` | API-012/012A/013/013A/014 的会话、工作区资源范围、持久化幂等与版本约定 |
| `workspace-token-grants.examples.json` | 合成的授权分页、新建、幂等重放、撤销和固定错误开发示例，不是执行报告 |
| `workspace-token-grant-governance.schema.json` | P01-T07 续授、当前工作区权限摘要和带版本的撤销契约 |
| `workspace-token-grant-governance.examples.json` | 合成的续授、重放、权限摘要、撤销及版本冲突开发示例，不是执行报告 |
| `agent-config.schema.json` | P02-T02 可接收配置及 `$defs.normalizedConfig`，含限定的输入/输出结构定义，不是 OpenAPI |
| `agent-config.examples.json` | 合成的结构化文本和自由文本配置；模型仅作示例，不声明实际可用 |
| `agent-definition-reads.schema.json` | 列表/详情的只读字段白名单、分页及固定错误 |
| `agent-definition-reads.openapi.json` | API-015/017 的会话、工作区范围和筛选参数 |
| `agent-definition-reads.examples.json` | 合成的列表、深页、详情和不可见示例 |
| `agent-definition-drafts.schema.json` | 严格编辑请求、待配置与已配置草稿、安全错误 |
| `agent-definition-drafts.openapi.json` | API-016/018/019 的管理会话、幂等和版本约定 |
| `agent-definition-drafts.examples.json` | 合成的创建、待配置、保存与版本冲突示例 |
| `agent-publication.schema.json` | 发布请求、不可变版本收据及安全错误 |
| `agent-publication.openapi.json` | API-021 的会话、工作区、草稿版本与发布重放规则 |
| `agent-publication.examples.json` | 合成的发布、重放与旧草稿冲突示例 |
| agent-lifecycle.schema.json | 版本历史、草稿恢复和生命周期CAS响应 |
| agent-lifecycle.openapi.json | API-022至026及026A权限、作用域与状态规则 |
| agent-lifecycle.examples.json | 合成的版本列表、正文、恢复、切换、停用及归档 |
| agent-editor.schema.json | 已存草稿校验报告与当前编辑模型目录白名单 |
| agent-editor.openapi.json | API-020/029会话、revision、分页与只读边界 |
| agent-editor.examples.json | 合成的有效/待配置/不可用报告及模型列表 |
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

## 文本 Agent 配置 1.0.0

根对象只接受 Schema 列出的字段。`schema_version` 必须为规范整数 `1`。名称修剪首尾空白后须有 1–128 个 Unicode 码点、最多 512 UTF-8 字节；指令非空白、最多 32768 UTF-8 字节，并保留原始正文。两者均不得含 NUL。`model_policy.model` 是非空、无首尾空白或控制字符的精确目录名称，最多 256 UTF-8 字节；可选 `temperature` 为 0–2 的普通十进制数，最多六位小数，不接收指数写法；`max_output_tokens` 为正整数且不超过现有模型网关的 1073741823 上限。不能透传其他模型请求参数。

`input_schema` 为对象；`output_schema` 为对象或 `null`，后者规范化为 `{}`，表示不要求结构化输出。每个 schema 根可为空对象，或使用 `type: "object"`。其他非空节点支持 `object/array/string/integer/number/boolean/null` 中的单一类型；对象属性和数组元素只能用内联节点。对象可用 `properties`、`required`、布尔 `additionalProperties` 及 0–64 的 `minProperties/maxProperties`；数组可用单个 `items` 和 0–256 的 `minItems/maxItems`；字符串可用 0–32768 的 `minLength/maxLength`；整数和数值可用安全范围内的 `minimum/maximum`。节点可加非空白、无控制字符的 `title`（128 码点）和 `description`（512 码点）。属性名最多 128 码点，不得为空白、含控制字符、以 `$` 起头，或等于 `__proto__`、`prototype`、`constructor`。

每个 schema 原文和规范结果各最多 16 KiB，最多 12 层、256 节点；整份配置原文和规范结果各最多 60 KiB。`required` 必须为已声明属性的无重复子集，规范化后排序；最小值不得超过最大值，对象属性数量限制不得与必填属性或关闭额外属性的声明冲突。数值范围为 −9007199254740991 至 9007199254740991；数值边界仅接受不含指数的十进制，最多六位小数且能无损按浮点最短十进制往返，规范化去掉末尾零和负零。结构约束字段整数不得使用小数或指数拼写。不支持 `$ref`、`$schema`、正则、格式、组合类型、默认值或其他未列关键字；不会下载 schema。JSON Schema 只表达可移植的静态形状，UTF-8 字节数、严格解码（重复键、无效 Unicode 和整数拼写）、跨字段、深度、总节点和实时策略另由 Go 校验。

`skill_bindings`、`tool_bindings` 必须是空数组。v1 仅允许 `max_steps` 1–64、`max_model_calls` 为 1、`max_tool_calls` 为 0、`timeout_seconds` 1–300；可信工作区或网关的正超时上限可收紧该范围。`max_cost_quota` 为规范十进制字符串 0–2147483647，可信工作区的正预算上限可以再收紧。配置省略额度且工作区已设置正预算上限时，取该工作区默认值（可以是 `0`）；P01 零值未配置工作区使用 1000 平台默认值。规范结果总含该字符串。`0` 不代表无限额，配置上限也不代表已预扣费用或保证资金可用。

配置对象或字段非法使用 `AG_INVALID_ARGUMENT`；整份配置超过上限使用 `AG_PAYLOAD_TOO_LARGE`。模型必须在当前授权主体的可选分组中具备可用的文本入口和计费配置；文本入口检查 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 或 Gemini 文本端点，不接受仅图片、向量、重排、音频、视频或任务插件入口。不存在、无权限、停用或不兼容的模型统一使用 `AG_DEPENDENCY_UNAVAILABLE`，不暴露渠道、价格详情或其他租户事实。读取模型事实失败使用 `AG_INTERNAL_ERROR`。这些校验不调用收费模型、不执行工具，后续运行仍须校验资金 Key、当前授权、价格和额度。

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

## P01-T05 工作区成员管理

三个成员入口继续受平台总开关与显式Bearer管理会话约束，限定active/suspended工作区的实时`member:manage`。跨Team、无可见授权、不存在或已归档工作区返回固定404；可见工作区角色不足返回403；不存在、停用、软删或不属于当前Team的目标用户统一404。拒绝响应不公开用户或工作区身份事实。

`GET .../members`仅接受单值`page/page_size`，默认1/20、每页最多100，按创建时间和内部成员ID倒序稳定分页。输出`items/total/page/page_size`；每项只含字符串`user_id`、显式`role/status`及安全整数`revision/created_at/updated_at`。列表包含当前Team启用用户的active和blocked显式行，不合成隐式owner行，也不返回姓名、邮箱、凭据或审计信息。blocked保留旧角色及当前revision供重新授权，不能取得任何显式成员权限。

`PUT .../members/:user_id`只接受精确的JSON字段`role/expected_revision`。revision的0只在该授权行不存在时创建；正值必须匹配当前行，已撤销后也不能使用0重新创建。与当前active角色完全相同且revision匹配时成功而不重复写入；修改或重新授权则推进revision。错误响应不包含当前revision，请用已授权列表刷新。角色只能是`admin/developer/operator/viewer`。Team owner目标不可修改或撤销；只有当前有效的隐式owner可授予admin或变更其他admin，显式admin可主动降级或撤销自身，但不得移除最后一个有效管理员。

`DELETE .../members/:user_id`不接受query或body。活动授权改为blocked并递增revision；仍满足当前授权和目标资格时，重复删除或无授权行返回相同的`user_id/revoked:true`，不重复写审计。删除面向执行时的授权状态，无客户端revision；重新授权后发起的删除会作用于该当前授权。所有业务写入及成功审计事实同事务，降权或撤销提交后下一次受控请求读取实时事实。还未接入的在途Run和调度不在此契约内。

## P01-T06 工作区运行 Key 授权管理

`/api/agent-platform/workspaces/:workspace_id/token-grants` 及其 `/:grant_id` 子路径受平台总开关与显式 Bearer 管理会话保护。只操作当前 Team 的模型 Key；有效的隐式 Team owner 可管理团队成员的 Key，显式工作区 admin/developer 只能管理本人持有的同 Team Key。当前支持 `agent:run`、`run:read`、`run:cancel`、`artifact:read` 四种精确 scope；仅接收 `resource_type=workspace` 且 `resource_id` 等于路径工作区。API 不返回原始 Key、Key 摘要、用户资料、幂等原值或审计内容。

GET 必填单值 `token_id`，可带单值 `page/page_size`，禁止其他查询字段；按 `created_at desc,id desc` 固定排序。当前仍有管理权时可以查看或撤销停用、过期 Key 的历史授权；归属变化或软删不再有访问权。分页返回 `items/total/page/page_size`。单项返回 `id/token_id/scope/resource_type/resource_id/status/expires_at/revision/created_at/updated_at/revoked_at`，ID 均为正整数的十进制字符串，毫秒时间和 revision 为安全整数。`active` 是存储状态，已到期的行仍可能是 `active`，不能据此推断可运行。

POST 只接收上述四个绑定字段及可省略的 `expires_at`；显式 null、未知字段、非规范 ID 或时间整数拒绝。创建要求工作区 active、Key 可用及 Key 当前拥有者满足对应权限范围。首次创建 201，同到期配置的有效初次授权可重复获得 200；已撤销、已过期、已续授或不同到期配置的唯一元组不能通过创建接口恢复或覆盖。必须带 `Idempotency-Key`，成功返回 `Idempotency-Key-Expires-At`。同键同请求只在当前权限、授权及收据仍有效时返回原收据和原状态码；异请求 409，已过期的幂等键不可复用。DELETE 要求 JSON `reason`，修剪后 1–1024 个合法 UTF-8 字节且无 NUL，原文不存储；版本参数见 P01-T07。首次撤销保留记录并递增 revision；当前仍有管理权的同代次重复撤销返回相同的 `id/status/revision/revoked_at`。写操作不接收 query。全部响应使用共享固定 envelope 和 no-store。

本阶段不开放 `/v1/agents` 或 `/v1/agent-runs` 业务处理器。工作区授权只提供运行身份解析的一层条件，不决定具体 Run 的所有权、附件权限、模型范围、配额、工具或计费。旧 Key 的模型网关协议、授权及账务行为不变。

## P01-T07 运行 Key 授权续授与权限摘要

`POST /api/agent-platform/workspaces/:workspace_id/token-grants/:grant_id/renew`（API-013A）只接受 `expected_revision`、`expires_at` 和单个 `Idempotency-Key` 请求头；写入不接受 query。两个 JSON 字段均必填，为规范的正安全整数。只有已撤销或已到期的授权可续授；工作区须处于 active，Key 须可用，且其当前拥有者须仍具有对应工作区权限。新的 `expires_at` 必须是未来 UTC 毫秒，且不晚于父 Key 到期。续授保留授权 ID，递增 revision，清空 `revoked_at`，并在 HTTP 200 返回授权和 `Idempotency-Key-Expires-At`。同一幂等键的同一请求只在原续授结果仍是当前有效版本时可重放；旧收据不能恢复、返回或修改后续版本。

API-014 的 DELETE 继续要求 `reason`，可同时提供 `expected_revision`。只传 `reason` 仍可撤销初次创建的版本或重试该次撤销；续授后的版本必须显式提供当前 revision。重试同一次撤销时可以提交撤销前的 revision，或提交已返回的撤销 revision。过时请求不能影响后来续授的授权；客户端遇到版本冲突应重新读取授权。

`GET /api/agent-platform/workspaces/:workspace_id/token-grants/permissions?token_id=...`（API-012A）只接受一个规范 `token_id`，返回 `{token_id, scopes}`。当前可用的工作区授权按 scope 升序，每种 scope 最多一条，单项为 `scope/grant_id/revision/expires_at`；没有当前候选项时 `scopes` 为 `[]`。摘要不返回 Key 值、审计数据或工作区外的授权。摘要只反映当前工作区层的候选授权；不验证来访 IP，也不代替后续运行入口的模型 Key 认证及资源级授权。

新增入口沿用默认关闭的平台总开关、显式 Bearer 管理会话、同 Team 与 Key 管理范围检查、共享响应 envelope 和 `Cache-Control: no-store`。跨 Team 或不可见资源仍返回统一安全错误。没有新增公开 Run 路由。

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


## P02-T08 内部Run元数据基础

[`run-metadata-foundation.schema.json`](run-metadata-foundation.schema.json)、[固定样例](run-metadata-foundation.examples.json)与[边界说明](run-metadata-foundation.md)描述内部Go命令的离线JSON投影，不新增HTTP/OpenAPI或修改core公开Token样例。管理会话caller_token_id为NULL，只生成metadata_only的固定release记录；六字段queued创建收据不是实时状态或正式P03的202受理。当前归档保护及runtime_ready=false保持，执行准入、调试、资金与Worker由后续阶段实现。


## P02-T09 Run预算与模型调用关联

[`run-budget-model-call.schema.json`](run-budget-model-call.schema.json)、[固定样例](run-budget-model-call.examples.json)及[边界说明](run-budget-model-call.md)冻结纯预算准备、可信报价绑定及最小gateway/usage关联投影。内部事实不接受客户JSON；缺生产事实/资金/严格报价适配时关闭，preparation_only不代表原子预留、完整授权、扣费或派发。unknown最终金额为NULL，消费log引用可空，真实来源/事件去重及跨库结算由P03/P06闭合，不改变现有公开core样例或网关公式。

## P03-T01 Run步骤、事件与可靠通知基础

[`run-journal-foundation.md`](run-journal-foundation.md)、[Schema](run-journal-foundation.schema.json)及[正反样例](run-journal-foundation.examples.json)冻结内部事务原语与离线值投影，不是HTTP/OpenAPI。步骤只创建pending/attempt=1，事件type开放、seq/key分别唯一；运行通知只保存引用，SQL持久化及revision/owner/expiry回执fence支持至少一次投递和死信重投。metadata_only不能升级；execution准入、Run claim、后台Worker、真实传输及模型/账务仍未装配。

## P03-T02 预算预留与调用账本

[`run-ledger-foundation.md`](run-ledger-foundation.md)、[Schema](run-ledger-foundation.schema.json)和[正反样例](run-ledger-foundation.examples.json)定义内部事务值投影，不是HTTP或付款凭证。新增三表；reserved/prepared登记、仅未发送释放、结果未知保留原预算和已确认资金事实、同调用完整意图重放均同Run/Step/事件/outbox事务。默认准入端口关闭，真实Worker、身份/资金/价格适配及模型尚未接通；usage仅charge存储引用检查，P06实际核账投影及退款后置。
