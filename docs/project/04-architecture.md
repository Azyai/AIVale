# 04 总体架构与前后端开发规范

## 1. 适用范围与事实边界

本规范落实已确认开发计划第 2、3、6、8 章，不修改计划的业务范围、任务依赖或阶段出口。产品边界见 [产品范围](01-product-scope.md)，执行语义见 [Agent 运行规范](02-agent-runtime.md)，集成与调度见 [适配器与任务规范](03-adapters-and-jobs.md)。

下文代码路径均相对于实际 Git 仓库 `new-api/`。目录存在、配置开启、类型可编译均不能单独证明业务功能已经实现。

| 领域 | 当前工程依据 | 开发约束 |
| --- | --- | --- |
| 后端 | 根 `go.mod` 声明 Go 1.26，使用 Gin、GORM | 复用现有启动、身份、网关与管理接口 |
| 独立模块 | `relaykit/go.mod` 为 Go 1.25.1；`tokenkit/go.mod` 为 Go 1.26 | 分别保持独立构建，不能依赖根模块启动注入才能编译 |
| 前端 | React 19、TypeScript、Rsbuild 2、Bun | 安装版本由 `web/bun.lock` 固定，脚本以 `web/package.json` 为准 |
| 前端基础 | TanStack Router/Query/Table、Zustand、Base UI、Tailwind CSS 4 | 扩展已有工程，不另建一套路由、组件或状态框架 |
| Agent 最小基础 | `setting/agent_setting/`、`service/agent/`、`types/agent/`、能力探测接口 | 当前是开关、内部上下文及只读探测，不是运行引擎 |
| 运行适配基础 | 根`go.mod`固定Eino `v0.9.22`与官方MCP Go SDK `v1.8.0` | 仅内部单步骤适配及本地协议PoC；完整Run引擎与真实连接仍按后续阶段实现 |

当前`service/agent/capabilities.go`仍固定返回`runtime_ready:false`。前端`features/agent-platform/`已有受动态开关控制的工作台导航壳；`service/agentexecution/`仅提供显式构造的Eino单步骤适配器与内部窄接口，不接入API或Worker启动。P01已具工作区持久化及管理访问判定基础，工作区业务API、Run队列、租约/检查点、远程MCP、技能存储及沙箱仍需按计划实现，不能由依赖存在或本地PoC推断已可供客户使用。

## 2. 模块化单体与进程边界

保留一个模块化单体代码基线，按负载与信任边界拆分运行角色；首期不先拆全部微服务，不整体重写 relay、认证或旧数据库模型。

| 角色 | 应承担的工作 | 必须隔离的工作 |
| --- | --- | --- |
| API / 控制面 | 认证授权、资源管理、发布、Run 受理、查询、事件读取、既有模型网关 | 不在 HTTP handler 内等待整个 Agent 完成 |
| Agent Worker | 领取 Run、执行步骤、保存事件与检查点、调用受控适配器 | 不把客户脚本加载到 Go 宿主，不接收完整父 Token |
| Sandbox | 执行获准脚本，读写分配的临时目录，返回受限产物 | 不访问主数据库、宿主 Docker socket、平台配置或任意网络 |
| 调度扫描器 | 计算到期触发，通过事务创建 fire、Run 和 outbox | 不直接执行 Agent，不把每次扫描当作一次新触发 |

API 与 Worker 按计划复用同版本代码和镜像；运行角色参数尚需对应任务冻结，不能把既有 master/slave 节点选项解释为 Agent 角色。
开发组合角色只能用于明确受限的本地调试；生产 Worker 单独配置资源，客户脚本必须进入合格沙箱。
各角色退出时先停止新准入或新领取，再处理可安全完成的步骤，保存恢复信息；停止新任务与取消已运行任务是两个不同动作。

业务数据库保存资源、状态、租约、事件及事务事实；Redis 负责唤醒、限流和短期缓存，丢失后可由数据库扫描恢复。
对象存储负责技能文件和大体积产物；独立分析日志库不能承担 Run 抢占、业务事务或唯一性约束。
计划中的受控迁移入口与 Worker 只读结构校验属于待实现部署边界；不能把当前已有 `AutoMigrate` 路径描述为已经完成迁移角色分离。
持久化细则见 [数据库规范](05-database.md)，身份、凭据与沙箱约束见 [安全与权限](06-security-and-permissions.md)。

## 3. 目录职责与依赖方向

新业务依赖方向为 `router → controller → service/<domain> → model`；跨领域用 application service 编排，避免 service 相互导入形成循环。
旧代码存在直接调用不代表新代码应继续扩散该模式，也不授权顺带进行全仓分层重构。

| 位置 | 职责与边界 | 当前状态 |
| --- | --- | --- |
| `router/`、`middleware/` | 注册路径、接入鉴权与功能 gate；不实现领域事务 | Agent gate已接入；P01-T02另有严格管理身份的工作区guard，业务路由尚未注册 |
| `controller/agent*.go` | 请求解析、调用 service、HTTP 状态和响应封装 | 当前有能力探测，其他按任务扩展 |
| `dto/`、`types/agent/` | 边界 DTO、Agent 错误 wire 类型 | 已有；Agent 类型保持根模块叶子依赖 |
| `model/agent*.go` | 持久化实体及带归属条件的数据库操作 | `AgentScope`仍仅值对象；P01-T01新增Workspace/成员ORM和带Team范围的基础仓储，不代表动作授权 |
| `service/agent/` | 草稿、验证、发布与授权编排 | 当前有RequestContext/Probe及管理会话工作区层AuthorizeWorkspace；草稿和发布仍规划 |
| `service/agentexecution/` | 单步骤适配及未来Run、状态机、租约与恢复 | 当前仅P00-T08的单步接口/Eino适配；持久化执行及恢复仍规划 |
| `service/skill/`、`service/mcp/` | 技能包与工具连接适配 | 规划，不把供应商任务插件当客户 Skills |
| `service/agentartifact/` | 产物存储、授权读取、清理 | 规划，不把既有禁用存储实现称为可用 |
| `service/authz/` | 扩展资源动作及现有权限框架 | 已有，工作区归属仍需显式实现 |
| `web/src/features/agent-platform/` | 平台 API、类型、后续工作区壳 | 当前仅 API / types |
| `web/src/features/agents/`、`skills/`、`mcp/`、`agent-runs/` | 各业务页面、表单、查询和交互 | 规划，避免提前创建空壳 |

独立 Worker 入口与单二进制角色只能按冻结方案选择，不能同时维护两套无必要的启动装配。
`relaykit/` 只承担协议 DTO 与转换；传输、认证、数据库、结算留在宿主。`tokenkit/` 只承担 token 计数及估算，不依赖根模块或 `relaykit/`。
Agent 的 Run、事件、错误和检查点契约归平台所有，不直接暴露 Eino、MCP SDK 或供应商内部类型。

## 4. 后端实现规则

- controller 只处理边界解析、身份上下文、服务调用与响应，不持有长事务，不启动脱离生命周期的 goroutine。
- service 定义业务操作及事务边界；model 负责可复用的持久化操作，不从 model 反向调用 controller 或 HTTP 层。
- 请求 DTO、响应 DTO 与 ORM 模型分开；返回字段显式选择，禁止直接序列化包含凭据或内部上下文的模型。
- `model.AgentScope` 的 TeamID / WorkspaceID 不是授权证明；只能在真实身份和资源校验后绑定到请求上下文。
- `service/agent.RequestContext` 的内部字段保持 `json:"-"`；禁止从客户端 body 反序列化授权作用域。
- 根模块 JSON 编解码使用 `common.Marshal`、`Unmarshal`、`UnmarshalJsonStr`、`DecodeJson` 等现有包装。
- 业务代码不得直接用 `encoding/json` 编解码；`json.RawMessage` 等类型可以引用，codec 实现保持集中。
- `relaykit/` 使用其 `kitutil` JSON 包装，不能为了复用导入宿主 `common`。
- 优先提前返回和清晰分支；避免深层嵌套、只有单个调用且没有稳定业务含义的机械包装函数。
- 新代码使用 `any`；适合时采用 `strings.Cut`、`slices.Contains`、`maps.Copy` 等标准能力，不能改变空值、顺序或复制语义。
- 按所在模块声明的 Go 版本选择语言和标准库能力；不能因根模块支持更高版本而破坏独立模块。
- 修改后执行 `gofmt`，移除未使用导入；并发辅助 API 的替换必须保持原有退出、错误和 panic 处理语义。
- 对须区分“未提供”和 `0` / `false` 的可选字段使用指针及合适的 JSON tag，特别是需转发上游的请求参数。
- 不通过返回空数组、固定成功或假 Repository 证明模块完成；尚未实现的能力明确关闭或返回相应错误。

数据库兼容、条件更新和事务规范以 [数据库规范](05-database.md) 为准；涉及现有账务实现时先读 `.agents/rules/billing.md`，不能因 Agent 接入另建绕过网关的结算路径。

## 5. 新 Agent API 的冻结契约

新增资源遵守开发计划第 6 章与 `.agents/agent-platform/contracts/v1/`；现有模型协议和旧管理接口继续保持兼容，不实施全站响应格式迁移。

| 类别 | 前缀与身份 | 实现约束 |
| --- | --- | --- |
| 浏览器管理 | `/api/agent-platform/workspaces` 及工作区子路径；现有会话 | 每次检查工作区与具体资源归属 |
| 客户运行 | `/v1/agents/:agent_id/runs`、`/v1/agent-runs/:run_id`；模型 Token | 新 grant 默认拒绝，不能将 PAT 或旧 Key 自动升级为 Agent 权限 |
| 全局探测 | GET `/api/agent-platform/capabilities` | 只返回全局有效开关及就绪，不返回工作区权限 |
| 内部调用 | 受保护内部入口；服务身份及短期 Run 凭据 | 不信任客户端指定租户或伪造内部请求头 |

JSON 响应保留 `success/message/data`，新接口增加稳定的 `code/request_id`；不能照搬其他项目仅 `code/message/data` 的 `Result<T>`。
成功 `code` 按具体冻结接口使用：当前能力探测为 `OK`，计划中的异步 Run 受理为 `ACCEPTED`；错误使用冻结的 `AG_*` 等业务码。HTTP 状态按创建 201、异步受理 202、校验 400、认证 401、权限 403、不可见 404、冲突 409 等语义返回，不把所有成功响应统一重写为 `OK`。
错误 `data` 按契约包含 `field_errors` 和 `retryable`，空字段错误为 `[]`；内部异常、SQL、密钥和绝对文件路径不得透出。
客户端分支按 `code` 判断，不能匹配中文 message；错误信息说明可采取的动作，不能把暂时不可用显示为执行成功。

- ID 在 Go 内部使用有边界的整数，在 JSON、URL、前端状态和事件中使用十进制字符串；先验格式，再验范围。
- 新 Agent API 时间使用 UTC Unix 毫秒；大额计量字段使用十进制字符串，小范围页码、限制和 revision 使用数字。
- 新列表参数为 `page/page_size`，默认 1/20，每页 1–100；返回 `items/total/page/page_size`，空列表必须为 `items:[]`。
- 旧 `common.GetPageQuery` 使用 `p`，不得直接复用后宣称支持新参数；新命名空间提供明确解析或局部适配。
- 排序字段使用白名单，默认 `created_at desc,id desc`；事件使用有界 `after_seq/limit` 游标，不用深页轮询追尾。
- 修改草稿和配置携带 `expected_revision`；条件更新冲突返回 409，不静默覆盖其他操作者的修改。
- 有副作用的创建、发布、导入和审批等按计划要求 `Idempotency-Key`，摘要包含实际资源目标和有效主体；同键不同请求拒绝。
- 首个冻结的纯文本 Run body 只接受 `input`、可选 `version_id`、`limits`、非秘密 `metadata`；会话等字段按后续阶段另行启用，不接受客户端覆盖工作区、发起人或 caller/funding Token。
- 预算字段只有 `limits`，不增加 `budget` 兼容别名；不将示例 `context` 作为公开请求字段。
- 未知 Run 状态不得视为成功；未知事件类型及未来可选响应字段可按兼容规则忽略，不能据此改变状态。
- JSON、字段、序列化 TEXT 和文件各自执行服务端大小限制；超限明确拒绝或按已实现产物能力处理，不静默截断业务内容。

当前只读探测及 `AG_RUNTIME_UNAVAILABLE` wire 类型不等于通用分页、ID 解析、错误映射或全部资源 API 已完成；后续批次必须在真实边界落实这些契约。

## 6. Context、并发与失败传播

- HTTP 进入 service 的短操作传递 `c.Request.Context()`；数据库、HTTP、工具调用和流读取继续传递取消与截止时间。
- Run 受理完成后由持久化任务驱动执行，不把浏览器请求 Context 留给后台长任务；Worker 使用受 Run 截止、进程退出和租约约束的独立生命周期。
- 并发按进程、团队、工作区和会话限额约束；使用有界队列或信号量，禁止按输入长度无上限创建 goroutine。
- 不在持有数据库事务或全局锁时等待模型、MCP、用户审批或网络重试；把外部调用与可恢复状态转换分开。
- 所有外部调用设置连接、读取或整体截止；重试有次数上限、退避和明确适用错误，不无限循环。
- HTTP 超时或取消不证明外部操作未生效；结果未知的写操作进入查询、对账或人工恢复，不直接重放。
- fan-out 操作必须聚合错误、取消剩余无效工作、回收资源；后台 goroutine 的退出路径必须可验证。
- SSE 断线只终止当前订阅，不默认取消 Run；恢复从已持久化事件游标继续，状态与事件顺序按运行规范校验。

现有系统维护任务与客户 Run 保持独立队列和状态；具体租约、fencing、恢复及幂等规则见 [Agent 运行规范](02-agent-runtime.md) 和 [适配器与任务规范](03-adapters-and-jobs.md)。

## 7. 前端模块、路由与组件复用

- 业务代码放 `web/src/features/<feature>/`，按需组织 `components/`、`hooks/`、`lib/`、`api.ts`、`types.ts`；不为目录形式创建空文件。
- 路由放 `web/src/routes/`，使用 TanStack Router 的路由声明、搜索参数校验、导航与错误边界；保持构建生成的路由信息一致。
- 页面权限和导航能力探测用于交互控制，服务端授权始终执行；全局 capabilities 不能替代工作区权限查询。
- 服务端数据交给 TanStack Query；临时组件状态放本地，跨页面客户端状态才放 Zustand，不在多个 store 复制同一查询结果。
- Workspace 相关 Query key 包含 workspace、资源及必要权限版本；切换工作区或退出时取消过期请求并清理不再可见的数据。
- 表单优先 React Hook Form + Zod，类型检查边界值和可选字段；服务端校验仍是最终约束。
- TypeScript 优先明确类型和 `unknown`，类型导入使用 `import type`；避免 `any`、多层三元表达式与不必要的 props 解构。
- 修改 UI 前按项目要求读取 `shadcn-ui` 技能，并检索现有组件、hooks 与实际调用例，确认可复用能力。

| 场景 | 必须先检查的公共入口 |
| --- | --- |
| 表格、搜索、分页、移动端列表 | `@/components/data-table` 的 README 和公开导出 |
| 通用弹窗布局 | `@/components/dialog` |
| 删除和危险确认 | `@/components/confirm-dialog`，复用 loading / disabled 行为 |
| 复制 | `@/components/copy-button`、`@/hooks/use-copy-to-clipboard` |
| 加载、空、错误 | `@/components/loading-state`、`empty-state`、`error-state` |
| 基础控件 | `@/components/ui/`，基于现有 Base UI 封装组合 |

复用顺序为业务封装、兼容扩展或组合、已有基础控件、确有缺口的新实现。只用了 Button 不代表已经复用确认、复制或表格行为；新实现需说明具体能力缺口。

## 8. 请求、错误与交互状态

- 复用 `@/lib/api` 导出的统一 `api`，不要在业务模块另建 axios 实例或重复实现会话刷新。
- API 函数先处理 `success:false`，使用 `requireServerSuccess` 或保留 cause 的 `createServerError`，再解析所需 DTO。
- `requireServerSuccess` 只检查业务失败，不替代响应 Schema 验证；公开能力探测已使用 Zod，新增严格契约边界同样验证必需字段。
- Query / Mutation 使用共享 `createAppQueryClient`；普通请求拦截器不重复弹业务错误，最终失败统一交给 `handleServerError`。
- 自定义 Mutation `onError` 接管字段和提示；自行展示时使用既有去重机制，必要时设 `meta.errorToast:false`，避免同一错误多次 Toast。
- 认证异常保持现有安全消息和一次性授权不重放约束；不要解开 `AuthOperationError` 暴露被屏蔽的细节。
- 查询可重试，写操作仅在幂等及结果证据允许时重试；不能因为全局 Query 有默认 retry 就让领域错误无限尝试。
- 传递 `AbortSignal`，页面切换时取消过期查询；现有 GET 去重不区分 signal，需要独立取消语义时使用 `disableDuplicate` 并验证调用者互不干扰。
- 请求等待、首次加载、后台刷新、空列表、无权限、失败和成功分别呈现；后台刷新失败时可保留已有数据并说明陈旧状态。
- 提交期间禁止重复操作，失败保留用户输入；revision 冲突提供刷新和合并入口，不自动覆盖草稿。
- 流式 Run 视图分开显示连接状态和业务状态；不能把 SSE 断开当失败，也不能只因文本输出结束就标记成功。
- 不记录完整 Axios 错误对象、请求头或敏感请求体；仅输出必要的脱敏诊断和 request_id。

## 9. 国际化、格式化与可访问性

前端当前语言资源为 `web/src/i18n/locales/{en,zh,zh-TW,fr,ru,ja,vi}.json`，在 `translation` 下使用英文原文扁平键，例如 `t('Create agent')`。不按旧层级键示例新增另一套 `dashboard.overview.title` 命名体系。
当前 `web/src/i18n/config.ts` 的实际 fallback 为 `en`；界面语言码为 `zhCN` / `zhTW`，资源文件名和合法 Intl 标签与它们不同。

- React 组件用 `useTranslation()` 订阅语言变化；常量保存翻译键，展示时调用 `t()`，不能在模块初始化时固定翻译结果。
- 动态标签使用统一 `labelKey` 约定；扫描不到的键登记到 `static-keys.ts`，运行 `bun run i18n:sync` 并检查资源变更。
- 普通数值使用 `formatNumber` / `formatCompactNumber`；界面语言必须经 `toIntlLocale` 后进入 Intl 或 locale 格式化参数。
- 金额沿用现有货币显示工具；新 Agent 的大整数计量字符串不能先强转 Number 丢精度，适配能力不足时先补明确边界。
- `formatTimestampToDate` 和相对时间函数默认按秒处理；显示新 Agent 毫秒时间时显式传 `milliseconds`，禁止重复乘除 1000。
- 样式以 Tailwind 与 `cn()` 为主，颜色复用语义 token 和主题变量；采用移动优先布局，长文本、窄屏和大列表有明确溢出策略。
- 生产路由沿用 Rsbuild 的按路由分包；重型画布和图表按需加载，避免把整个编辑器引入公共首屏包。
- 输入关联 label，图标按钮具备可访问名称，错误与字段关联；所有操作支持键盘，弹窗管理焦点及关闭后恢复。
- 加载、选中、展开和禁用状态同步语义属性；提示不只依赖颜色，正文对比度满足 WCAG 2.1 AA 要求。
- 功能未实现、能力关闭、无权限和数据为空使用不同文案，告诉用户下一步可执行动作；不暴露内部实现细节冒充业务解释。

## 10. 配置、构建与最小交付闭包

平台五项开关沿用 `agent_setting.enabled/worker_enabled/mcp_enabled/skills_enabled/scripts_enabled`，默认关闭；有效快照计算子功能依赖。开关不是授权，也不证明 Worker 在线。
配置变更按现有 Option 持久化及同步链路执行，多实例传播不保证瞬时完成；新参数先冻结名称、默认值、范围、重载与失败行为，再接入配置读取。
前端 Rsbuild 读取 `VITE_` 前缀环境变量，开发代理由 `VITE_REACT_APP_SERVER_URL` 控制；公开变量会进入前端产物，不能放密钥。
运行配置、依赖清单和锁文件一起评审，不在功能提交中无理由升级整套依赖；本地实际配置和生成产物按 [仓库内容管理](09-repository-hygiene.md) 处理。

| 工作目录 | 适用检查 |
| --- | --- |
| `web/` | `bun install --frozen-lockfile`、`bun run typecheck`、受影响文件 lint、`bun run build` |
| 仓库根目录 | 在真实前端构建完成后执行 `go vet ./...`、`go build ./...` |
| `relaykit/`、`tokenkit/` | 分别设置 `GOWORK=off`，执行 `go vet ./...`、`go build ./...` |
| 具备本地测试的工作区 | 按 [测试与验收](07-acceptance.md) 执行相关 Go / Vitest、契约、数据库与负向验证 |

根程序通过 `go:embed` 嵌入 `web/dist`；首次构建和 CI 均应先构建真实前端，不创建空 index.html 来替代交付资源。
当前公共 CI 只检查构建和静态分析；计划中的历史 CI 测试描述不能替代 [测试与验收](07-acceptance.md) 的本地门禁，零测试不等于通过。
每批交付包含完成该行为必要的契约、服务端实现、前端类型与状态、路由装配、配置、迁移及长期规范；互相依赖的文件不拆成不可构建的中间状态。
验证用例和夹具保留本地，执行摘要写交付说明或授权提交正文；不将报告、日志和截图塞入规范或源码目录。
提交前复核权限、兼容、取消、错误恢复与未实现部分，说明实际运行的检查和限制；提交组织及授权遵守 [Git 提交规范](08-git-commit.md)。
