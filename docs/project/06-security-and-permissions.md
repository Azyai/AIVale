# 06 安全认证与权限规范

## 1. 信任边界与实施状态

本文落实开发计划第 4、8、9 章的认证、租户权限、凭据、网络与审计要求。涉及安全的代码变更必须先阅读仓库 `AGENTS.md` 及适用领域规则，再核对其要求的当前稳定 OWASP ASVS 和对应 Cheat Sheets；记录实际适用版本、要求及验证，不以本文宣称系统已经合规。

浏览器、路径 ID、请求字段、文件、模型输出、技能文本和工具响应均不可信。认证和资源归属由服务端建立；菜单、功能开关、对象 ID 和模型判断均不构成授权。

| 现有边界 | 已核对的代码入口 | 新 Agent 能力的使用约束 |
| --- | --- | --- |
| 管理端身份 | `middleware/auth.go` 的 `UserAuth`、`AdminAuth`、`RootAuth` | 复用既有会话，不另造绕过原安全链的登录体系 |
| 管理 PAT | `model/user_access_token.go`、`middleware/access_token_routes.go`、`service/access_token_scope.go` | 与模型 Token 分开，不能自动取得 Agent grant |
| Team | `model/team.go` | 现有角色为 owner/member，属于账务与成员边界，不等同 Workspace 角色 |
| 平台资源权限 | `service/authz/` | Casbin 资源动作校验不代替 Workspace 对象归属过滤 |
| Agent 基础值对象 | `model/agent_scope.go`、`service/agent/context.go` | 只承载内部 ID，不创建表，也不证明已鉴权 |
| 工作区持久化 | `model/agent_workspace.go` | P01-T01仅有带Team范围的仓储和创建引用校验；不包含角色动作授权，后续服务不得把读取成功当许可 |
| 管理工作区访问 | `service/agent/workspace_access.go`、`model/agent_workspace_access.go`、`middleware/agent_workspace.go` | P01-T02每次从主库校验会话/用户/当前关系，角色矩阵限定工作区层动作；guard复用UserAuth且拒PAT/模型Token |
| 工作区元数据API | `middleware/agent_workspace_read.go`、`controller/agent_workspace.go`、`service/agent/workspace_read.go` | P01-T03列表/详情只读GET限定现有管理会话；每次实时查询身份及对象范围，响应使用白名单和no-store |
| 功能准入 | `middleware/agent_platform.go`、`setting/agent_setting/config.go` | 开关控制入口可用性，不能替代认证与授权 |

当前Agent路由包括全局只读`GET /api/agent-platform/capabilities`及工作区列表/详情两个GET：`/api/agent-platform/workspaces`、`/api/agent-platform/workspaces/:workspace_id`。工作区入口受默认关闭的总开关及管理会话认证控制，PAT/模型Token不得进入；全局探测仍只返回配置且`runtime_ready:false`。工作区创建/编辑/归档另由P01-T04实现；Agent grant、Worker身份和凭据管理按后续任务实施，不能将计划中的权限矩阵描述为当前全部生效。

## 2. 认证复用与入口区分

- 浏览器管理沿用已验证的管理会话。身份从中间件上下文取得，不从 `user_id`、`team_id`、角色字段或自定义内部头推断。
- 工作台顶栏入口可由访客看见，仅依据不含租户数据的全局能力；独立页面沿用现有会话检查和安全站内回跳。不能用公共布局、客户端缓存、入口可见或工作区 URL 推导授权。直接地址、刷新与登录回跳都不能绕过相同的会话和服务端资源判定。
- 公开 Agent 运行使用模型 Token，并额外验证明确 Agent grant；旧 Key 对现有模型调用的行为不变，没有 grant 时不得调用 Agent。
- PAT 管理 scope 与模型 Token 权限是不同机制。本期不自动开放管理 PAT 的 Agent 权限；后续扩展需新增路由/scope 映射和负向验证。
- 内部 Worker 使用服务身份与短期 Run 能力凭据，不冒充浏览器会话，不把自定义 HTTP 头当作服务认证。
- 登录、刷新、注销、密码、MFA、Passkey、OAuth/OIDC 和账户恢复改动必须复用相应认证服务；不通过第二个入口绕过限流、防枚举、验证次数或安全审计。
- Cookie、Bearer 与模型转发路由分别明确凭据来源和 CSRF/Origin 策略，不把管理 Cookie 自动用于公开模型入口。
- `middleware/auth_origin.go` 的 `SessionCookieOriginGuard` 保护安全 Cookie 模式下的刷新/注销来源，非安全本地模式会跳过；不能将该函数视为所有写 API 都已具备统一 CSRF 防护。
- 新管理写接口须明确其凭据、来源、CSRF 与权限防线。修改部署来源/Cookie/代理配置时同时验证真实请求链，不能只检查前端是否发送某个头。

密码保持不可逆哈希；可恢复的外部凭据采用加密，两者不能混用。本文不要求更换现有密码算法、JWT 参数或会话协议；实际变更必须另按认证任务验证存量兼容、失效和恢复路径。

## 3. Workspace 与 Token 权限求交

有效权限按以下各层共同限制，缺少任意必需授权即拒绝：

```text
平台策略 ∩ Team 成员状态 ∩ Workspace 角色 ∩ 资源可见性
∩ API Key grant ∩ Agent 发布配置 ∩ 工具与凭据策略
```

- Team 是租户与账务主体，Workspace 是资源和权限边界。现有 Team owner/member 不直接照搬成 Workspace 的四种角色。
- 按计划实施 Workspace admin/developer/operator/viewer；Team owner 继承工作区 admin，其他成员依据显式授权，不因属于同一 Team 自动可读全部资源。
- 分离读取元数据、编辑配置、发布、运行、查看运行内容、取消、审批、凭据管理和费用读取。可见 Run 列表不自动可读 Prompt、工具结果、附件或费用。
- 浏览器运行显式选择当前 Team 内有权使用的资金 Token；公开运行 caller Token 必须等于 funding Token。不能通过 Workspace ID 将个人 Token 切换为团队付款。
- Agent 发布绑定固定版本和资源快照，但不冻结永久权限；复制模板、Agent 或 Skill 不复制源 Workspace 凭据。
- 列表、详情、导出、SSE、下载、异步消费者和 Worker 都执行资源范围校验；数据库查询先带 Workspace 条件再分页，不能先取全量后交给前端过滤。
- 跨租户资源默认返回 404，同租户角色不足可返回 403；拒绝响应不泄漏资源名称、拥有者、密钥状态或文件地址。

`service/authz/resolver.go` 当前对 superuser 角色有直接允许逻辑，普通用户再经过显式覆盖与角色基线。新增 Agent 资源必须在业务服务执行 Workspace 归属校验，不能把 `Can` 返回 true 作为跨租户数据读取许可。平台运营访问使用独立授权、明确范围、原因及审计，不在普通客户页面默认跨租户浏览。

P01-T02的`AuthorizeWorkspace`只接受已有认证链的管理会话身份，不接受有效Team或角色参数；guard还必须取得typed认证身份，拒绝仅`c.id/session_id`等通用上下文拼装身份。每次重新读取主库中的会话版本/状态/到期、User状态/AuthVersion、Team成员及工作区事实，旧Session、Scope、角色缓存或请求中的Team不能跳过校验。

Team owner只有在`Team.OwnerUserId`及当前`TeamMember.role=owner`两事实一致时继承admin；普通成员必须有显式active且已知角色的Workspace行，default_member_role不授予访问。平台管理员无自动跨租户豁免。跨租户、不存在、未授权成员、归档或未知工作区状态统一404；当前身份/会话失效401，同域动作权限不足403，错误使用既有固定catalog且不泄漏SQL/资源名称。

P01-T03的列表COUNT、筛选和分页在SQL可见范围内完成，详情同样直接限定范围；会话SID、状态和角色在SQLite/MySQL/PostgreSQL均精确比较，拒绝大小写或尾空格放宽。名称`q`只作区分大小写的字面子串，不改变授权范围。公开DTO隐藏Team ID、策略、预算和审计主体，ID保持字符串，时间/revision等数字为JavaScript安全整数。响应全部`no-store`；认证桥接只转换这两个入口的旧认证错误，不改全站认证协议。

响应的`current_role`与`effective_permissions`由当次有效角色/工作区状态生成，只列当前不需附加资源条件的工作区动作；它们不能替代后续请求、私密内容或运行执行的服务端授权，也不应缓存成永久许可。

P01-T08b 以用户、管理会话 SID 与规范工作区 ID 隔离详情请求。待复查、会话切换、离线或拒绝时不展示旧详情；失败结果不携带原元数据。焦点恢复、重连和前台定期复查负责发现远端退组、归档或撤权，不能将客户端轮询描述为即时推送。切换列表使用当前服务端可见范围；网址和列表均不授予详情权限。

P01-T08c 的资格读取复用 Agent 管理会话与实时 Team 双事实，仅符合创建条件时返回自身 Team ID，不返回成员、邀请码或资金信息。创建时可提供规范 `X-Agent-Expected-Team-Id`；这是前置条件，不能选择写入的 Team，服务端在原事务内先核对实时所有权，再拒绝与当前 Team 不匹配的请求，最后才读取幂等收据或写入。浏览器始终带该条件，不自动跨会话重放 POST；后端仍兼容未发送该请求头的既有调用方。

P01-T08d 的编辑与归档入口只使用本次详情的 `workspace:manage`，不把缓存或角色标签当作写授权。写请求绑定当前用户、会话、工作区及预期 revision，不自动重放。归档未知结果只允许同一表单、会话、目标和幂等意图重试，期间隐藏旧详情；已归档对象的同键重放仍要通过原服务端管理权校验。权限或会话失效后撤下表单，不使用旧回调更新新页面。

个人工作区读写要求启用平台、有效管理会话及显式 Bearer。所有者从当前会话推导，不接受用户或团队参数；读查询同时校验会话和所有者，写事务锁定用户及会话后按所有者和版本更新。个人元数据不进入 Team 工作区的成员、Key、运行或账务授权范围。浏览器查询按用户及会话隔离；失效后登录只回跳安全站内地址，并按新会话重新授权。

P02-T02 校验 Agent 配置时重新判定当前会话的 `agent:write` 和 Team/Workspace 关系。模型、渠道与分组使用服务端的实时事实，不接收客户端分组、渠道或资金凭据。非法配置只返回固定错误和字段位置，Schema 不解析外部引用或执行表达式；模型不可用不区分其他租户、停用或缺价。校验不提供运行许可，后续发布和运行重新检查各自依赖与权限。

API-015/017复用既有管理会话认证和实时`agent:read`；PAT与模型Token不获得读取权限。查询前后复查会话和工作区权限，COUNT、分页及详情SQL本身仍约束有效会话、当前Team和显式工作区授权。列表/详情只投影允许的元数据，禁止草稿、提示词、哈希、主体ID和内部异常流出；不可见资源使用同一404，所有响应使用no-store。此切片参考[OWASP逐请求鉴权](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)和[输入白名单](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)，不改变登录或刷新流程。

API-016/018/019进一步要求活跃工作区和当前`agent:write`。读取草稿、创建收据重放和保存都在工作区事务内重新检查会话、Team、成员与工作区状态；仓储按Team、Workspace、Agent约束草稿行。保存对照当前草稿修订号和服务端实时模型政策。成功创建/编辑仅记录固定操作、主体和对象ID、请求ID、修订号和时间；耐久审计与业务同事务，投影失败保留待处理事件。拒绝审计为独立的尽力记录。两类审计及草稿仓储SQL日志均不记录提示词、配置、描述或原始幂等键。草稿的规范化配置只对当前获授权的编辑者返回，响应使用no-store。

API-021使用同一管理会话边界，但显式要求`agent:publish`，不以编辑权限或幂等收据代替当前授权。新发布只允许活跃工作区的active Agent，并重新检查模型与工作区限额；保存后的草稿不因发布而被自动改写。收据不含正文、说明、凭据或内部主体，重放不改变指针。成功事实以独立`agent_publication_audit` v6耐久保存Agent、版本、草稿与元数据修订号；失败沿用固定拒绝审计。会话撤销、退组、降权、工作区暂停/归档与跨Agent/Workspace替换均须负向验证。此入口不调用模型或产生费用。实现参考[OWASP逐请求权限校验](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)与[服务端事务授权](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html)，不声明通过整站安全认证。

API-022只提供release元数据。API-023把当前`agent:write`明确作为内容权，SQL与用例授权均限制owner双事实或当前显式active admin/developer；operator/viewer不能读取历史提示词。详情的验证摘要只说明读取时结构与摘要检查，不代表当前模型或运行许可；已下架模型及已撤销版本可读历史内容，恢复或激活已撤销版本则拒绝。归档Agent历史仍按当前工作区权限可查，归档工作区保持不可见。

API-024恢复草稿、026归档及026A启停要求实时`agent:write`；025版本切换要求`agent:publish`。切换及从disabled启用有发布版本的Agent时复核精确版本的当前模型/工作区政策，不能靠启用绕过检查。恢复只复制配置，不授予运行权限。所有写均要求active工作区、规范JSON和相应revision，理由摘要与变更通过v7审计原子提交；旧revision不冒充成功重试，未知结果先读当前状态。归档后禁止新写但不删除历史，尚无Run引擎时不宣称已验证在途运行处置。

API-020/029只接受当前管理会话的实时编辑权限；校验报告不含草稿正文，模型目录只暴露当前授权候选名称和通用可用状态，不接收资金Key，也不授予执行资格。客户端严格检查白名单响应、ID和revision对应关系，不保留服务器未知字段路径或原始失败对象。

编辑页面及查询按当前用户、会话SID、工作区和Agent隔离；身份丢失、权限拒绝或平台显式关闭后撤下正文并清理表单。临时网络/公共能力探测失败只隐藏且禁用同会话表单，恢复后保留未保存修改；不把提示词持久化到localStorage或sessionStorage。创建未知结果锁定原输入与幂等键，包含HTTP500窗口；保存未知结果先人工读取服务器草稿。手动采用或合并更高修订号后，滞后的父查询不能再阻挡该已确认版本；后续更高修订号及服务端CAS仍阻止覆盖。校验报告仅在与当前base修订号一致且表单未改动时显示，不能据其发布或运行。

四角色的24动作候选范围见计划6.2，候选不等于最终许可：元数据读取不包含私密正文，run:create/内容/取消/审批、credential:use、Token grant、费用与Artifact父资源等还缺真实资源条件的动作，本入口一律拒绝；后续领域服务必须实现相应持久化授权和策略交集，不接受body中的sharing/binding/approval布尔值直接放行。暂停工作区仅允许已有读取及必要workspace/member管理；新写配置、发布和执行拒绝。常规读/写授权对归档资源拒绝，T04仅为当前管理者提供特定同Key归档收据重放；未来历史资源读取例外单独设计。

P01-T04三写只接受已有显式Bearer管理会话，拒Cookie降级、PAT和模型Token；JSON内容类型和严格单对象边界避免表单/simple content-type替代。创建为当前Team双事实owner，编辑/归档为当前owner或显式active admin，权限和业务写入在同一短事务校验并持锁；请求Team/role/旧Scope不参与授权。

幂等收据不是授权缓存。同Key重放也须当前会话和团队/对象管理权有效，归档结果的特殊重放不能令已退组、降权或停用者取得旧响应。业务、适用幂等结果及审计事实原子提交；日志投影失败保留耐久pending，不把已提交写入伪装成未发生。审计payload采用固定白名单，不保存原始JSON/名称/描述/归档原因、会话SID或Key；不可变收据与审计事件内容分开。

三写失败另有security拒绝审计，身份仅来自受信typed认证事实，未认证主体保留未知；仅记录静态动作、HTTP状态、服务端request_id及规范化尝试对象ID，不复制原请求的URL、body、query、IP、User-Agent或认证材料。复用现有审计写入但使用独立短Context；GET和成功变更不重复生成拒绝事件，平台gate关闭先行拒绝。拒绝日志为现有best-effort诊断路径，不能冒充已提交业务的耐久审计事实。

P01-T05 的成员读写同样只接受现有管理会话。所有端点实时要求 `member:manage`；跨租户、归档或不可见工作区统一 404，当前可见但没有管理许可为 403。只允许管理同 Team 的当前启用目标。Team owner 行不可改；只有当前隐式 owner 能给他人授予 admin 或修改其他 admin 授权，显式 admin 可自降权/撤销，但事务必须保留有效管理员。移除和降权立即约束同一 Bearer 的下一次请求，不依赖缓存失效通知。新成员写审计遵循同一脱敏规则，可记录规范目标用户 ID、版本与前后角色。

P01-T06 的 Key 授权管理同样只接受管理会话。当前 Team owner 可管理同 Team 的 Key，显式 admin/developer 只管理自己的 Team Key；无全局管理员豁免。授予要求操作者和 Key 持有人都具备 scope 的当前工作区候选权限。旧 Key、个人 Key、无授权或撤销的 Key 不能用于 Agent；类型化 TokenAuth 身份仍需实时核对主库凭据、用户和资源。密钥及请求原文不进入授权记录、收据或审计。运行解析结果不能绕过后续具体资源、模型、工具和资金校验。

P01-T07 续发是新权限意图：重新检查 Key 控制权、持有人、角色、有效期与 revision，必须带独立幂等请求。旧收据不能授权新代次；已续发授权的撤销必须携带 revision。权限摘要只含当前工作区 scope 候选，不证明请求 IP、模型或具体运行资源准入。运行侧重新查询并比较原代次；有副作用的流程接线仍由后续任务闭合。

## 4. 撤销、缓存与运行身份

1. 发布、领取 Run、恢复检查点、每次模型/工具调用及产物读取前，验证当前用户/成员、grant、凭据、技能安全状态及有效策略。
2. 撤销、成员退出、禁用或权限版本变化必须阻断下一受控动作；历史版本、批准记录、缓存和已签发内部凭据不能覆盖撤销事实。
3. `service/authz/enforcer.go` 使用内存策略与周期同步，现有 Option 也存在多实例传播窗口；不能据此承诺即时全局撤销。新关键动作须读取当前事实或验证可证明最新的授权版本。
4. 列表缓存包含 Workspace 和权限版本；MCP 发现缓存还包含连接和认证主体。禁止跨主体复用带权限内容的缓存。
5. Run 能力凭据绑定 audience、Run、step、logical call、父 Token、模型范围、租约代次和过期时间，并防重放；服务端验证后才解析资金身份。
6. 接管后旧 `lease_epoch` 不得提交状态或获取新的调用许可。租约失效不撤回已发送网络请求，未知外部结果按 [运行规范](02-agent-runtime.md) 进入核查。
7. 关闭平台开关停止新准入/新领取，已准入请求不会被当前 gate 自动取消。查询与取消路径的开关豁免仍须经过普通身份和对象授权。

## 5. 凭据加密与生命周期

| 凭据 | 持有与解析范围 | 不得出现的位置 |
| --- | --- | --- |
| 模型父 Token/上游 Key | 既有 Token 体系与受保护 broker/网关 | Run 配置、Prompt、Skill、SSE、产物、Worker 日志 |
| Run 能力凭据 | 可信服务签发、Worker 短期持有 | 浏览器持久存储、下载 URL、通用队列日志 |
| MCP OAuth/API 凭据 | 服务端按 Workspace/主体授权后解析 | 工具 Schema、列表响应、普通错误、模型上下文 |
| Git 来源凭据 | 导入服务按最小读取权限使用 | 来源 URL 回显、manifest、归档副本 |
| Webhook secret | 服务端与获准发送方，版本化轮换 | 通用 API Key 字段、Run 输入 |
| 沙箱临时凭据 | 单次运行所需的最小代理权限 | 主数据库、宿主路径、全局云账户权限 |

- 新增可恢复 secret 使用带认证的加密，保存密文和 `key_version`；主 Key 由受控部署环境或密钥管理提供，禁止与密文一起硬编码或写入仓库。
- 解密只发生于授权调用边界，明文保留时间尽量短；异常、追踪、SQL 参数日志和结构体序列化都不得输出秘密。
- 对外仅返回掩码、指纹、状态和更新时间，不提供取回完整 secret 的通用按钮。已保存 secret 不回填前端持久 store。
- 轮换保留凭据引用及版本关系，不覆盖历史审计；并发 OAuth refresh 使用锁或版本比较，避免互相覆盖刷新令牌。
- OAuth 连接绑定发起用户、Workspace、state 和重定向 URI，按协议需要使用 PKCE；不向第三方透传平台 Token。
- 撤销优先于版本快照，删除密文按引用和留存策略执行；备份恢复须具备相应密钥版本的受控恢复流程。

## 6. 出站网络与 SSRF

MCP 测试/调用、OAuth 元数据、Git 拉取、URL 下载及重定向共用明确出站策略。`common/ssrf_protection.go` 提供目标、解析 IP 与 URL 校验能力，集成时核查真实拨号和重定向路径，不能只调用一次字符串校验。

- 首期域名/端口由管理员维护允许列表；拒绝云元数据、环回、链路本地及未经授权的内网地址。
- 每次 DNS 解析及实际连接都核对地址，覆盖 IPv4/IPv6、重绑定和重定向；跨源重定向不得自动携带 Authorization。
- 限制连接/读取时间、响应体大小、重定向次数与并发；压缩传输的展开大小也受限制。
- 允许访问 MCP 服务不代表允许继续抓取它返回的任意 URL；工具输出不能修改允许列表或代理配置。
- 内网 MCP 需要明确的私有连接器/代理与目标清单，不能全局关闭 SSRF 检查。
- HTTPS 证书校验保持开启；拒绝带凭据的展示 URL，不在日志中回显查询 secret。

## 7. 文件、压缩包与脚本

技能导入与产物处理遵循 [适配器规范](03-adapters-and-jobs.md)，入口同时限制压缩大小、展开总量、文件数、单文件大小和目录深度，不能只依赖请求体限制。

- 规范化包内路径，拒绝绝对路径、盘符、`..` 穿越、符号链接/链接逃逸及规范化后冲突的文件名；校验实际写入落点位于受管根目录。
- 不信任客户端 MIME、扩展名和压缩包目录声明；按允许的内容类型处理，不在导入时执行脚本、安装依赖或加载动态代码。
- 存储对象 key 服务端生成，展示文件名只作展示；读写、下载和清理均校验 Workspace、对象引用和留存保护。
- P05 收录脚本不意味着执行授权；P08 隔离门禁之前保持不可执行，`scripts_enabled` 为 true 也不能替代实际安全准入。
- 沙箱禁止 root/特权、宿主 socket、平台配置与主数据库；资源限制、默认网络限制、跨任务隔离与终止清理都需要真实验证。
- 临时目录清理先解析绝对路径并验证位于受管根目录，不跟随逃逸链接递归删除。产物发布前验证 digest 与授权用途。
- Agent 短期下载需独立到期与授权策略；既有任务产物签名不能直接证明 Workspace 权限、实时撤销或短期过期已实现。

## 8. 审批、账务与高风险操作

审批绑定固定 Run、step、AgentVersion、工具/输入摘要、费用估算及有效期；参数、版本或凭据变化后旧批准失效。批准后仍重新校验权限与预算，不能把批准当成长期授权。

发布、权限授予、凭据轮换、批量删除、团队停止与财务更正均需要明确操作权限和范围；按风险接入既有 `middleware/secure_verification.go` 的窄操作证明机制，不能用通用“已验证”标志跨动作复用。

- 模型费用由既有网关结算，Run 预算预留是并发执行约束，不再次扣 Team 钱包；费用投影不能反向驱动扣费。
- 参数数量、持续时间、Token 上限与用量必须有界；使用既有 `common/quota_math.go` 安全转换，防溢出产生负费用或错误授信。
- 涉及价格、预算、预扣、结算、退款与调用账本时先完整阅读 `.agents/rules/billing.md`；不绕过现有计费约束。
- 未知结果保留原调用、资金/Token 状态和必要预留；管理员核查后追加更正事实，不通过重新执行完整结算或通用补扣按钮修复。
- 取消、失败、SSE 断线不等于外部未执行，也不自动退还已发生费用；父子 Run 汇总不能与子明细重复收费。

## 9. 审计、脱敏与验证

审计最少关联操作者或服务身份、Team/Workspace、对象及动作、request/Run ID、策略或凭据版本、结果和必要理由；记录授权拒绝、撤销、敏感读取、审批、财务更正与批量清理。

- 密码、验证码、恢复码、有效 Token、认证头、私钥和完整 secret 永不入审计；Prompt、工具原文、个人资料与文件正文默认不写操作日志。
- 内容与元数据权限分离，调试视图同样受授权；错误返回脱敏业务原因，详细内部诊断只进入受限位置。
- 业务事务中的关键事实先持久化，再异步投影日志；`model/audit_log.go` 与 `middleware/audit.go` 是现有审计复用入口，不能仅有新增页面按钮而无服务端记录。
- 留存分开配置内容、产物、检查点、账务和审计；删除内容不级联抹去核账关联，也不以财务留存为由保存不必要的原文。

验证至少覆盖跨租户 ID 替换、角色/Token 降权、撤销后的下一次调用、旧审批重放、SSRF 重定向、压缩包逃逸和审计秘密泄露。按 [测试与验收规范](07-acceptance.md) 执行本地验证；测试、报告和日志遵循 [Git 提交规范](08-git-commit.md) 与 [内容管理规范](09-repository-hygiene.md)，不将未实现能力写成已通过。


## Agent 发布与版本界面的授权及未知结果

P02-T07复用当前工作区实时权限：版本元数据需要agent:read，正文与对比需要启用工作区的agent:write，发布和切换当前版本另需agent:publish。Agent元数据响应里的读取权限不能代替工作区写入授权。查询缓存绑定用户、管理会话、工作区及Agent；重新验证时撤下私有正文并锁定操作，保留内存中的草稿和操作原因。明确失权、会话变化或功能关闭时卸载私有内容，不写浏览器持久存储。

新发布只接受已保存、无本地修改且修订号已核对的草稿。写入结果未知时保留原请求体和幂等键，以同一请求找回原版本收据；普通代理5xx或丢失响应不等于服务端未提交。收据只证明那次发布，当前版本指针必须重新查询，不能由旧收据覆盖。明确的运行功能不可用与普通代理503分开处理。

恢复为草稿使用最新草稿修订号，切换版本、停用/启用和归档使用最新元数据修订号。各操作先只读准备，再独立确认；冲突保留原因，未知结果只允许重新读取并核对当前状态后发起新操作，不自动重放CAS写入。恢复不发布，切换不覆盖草稿，停用保留版本指针，归档不删除历史。服务端继续执行实时授权、政策与不可变快照检查；页面对比不证明旧模型当前仍可发布。


## Run 元数据基础的受控身份

P02-T08的内部管理会话基础函数在主库事务内重新检查User/Session版本与状态、当前Team成员、owner双事实、工作区及候选admin/developer/operator角色。它只允许持久化metadata_only记录，保持通用RunCreate的RequiresResourceCheck=true；不授予模型、工具或资金执行许可。资金引用限定同Team且本人持有、启用未删除未到期的Token，版本限定同Agent/Workspace的active release且未撤销；重放同样重新核对。

输入、metadata与能力摘要不出现在创建收据或日志；数据库语句日志在整条敏感事务路径关闭。保留键不能从metadata覆盖主体或预算，输入Schema不解析URL/$ref，精确数字与结构深度/节点/字节上限先校验。审计只记录run/Agent/version、主体、工作区、时间和固定动作；v8新增run_id，不让旧v1–v7载荷接受此字段。

本批按2026-11-09核对的[OWASP ASVS 5.0.0](https://asvs.owasp.org/)及[逐请求授权](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)、[会话管理](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)约束，重点验证默认拒绝、服务端实时对象归属、撤销后重放失败、最小化凭据读取和脱敏失败。此范围不改变登录协议，也不声称全站ASVS认证。


## Run预算准备与可信计量

P02-T09内部身份和全部预算事实均标记json:"-"，不把用户提交的known_price/has_funding、金额或scope当作实时许可。真实事实reader将来必须绑定当前服务/用户身份，检查Run/Step/固定版本、lease owner/epoch、成员与资金控制权；本批只定义该端口，未装配授权或报价实现。quoted upper bound必须针对完全匹配的身份、Run revision、模型/配置、输出/时长及请求摘要，报价过期、指针意图改变、未知结果和metadata_only均拒绝。

公开Token的caller=funding，管理会话caller为NULL；同一逻辑调用不能因未知结果换attempt/request_id重做。未来可信producer才可写gateway和usage；最小关联DTO的结构校验不证明付款、来源事件真实性或对象存在。未知金额NULL与确认零值分开；可空消费log引用不会使未知成本变成成功。错误仅保留固定分类，不输出余额、价格内部详情、输入或依赖原文。本批不改变登录、旧Key、Token grant或资金选择规则。

## P03-T01 内部持久化与投递边界

Journal scope/fence及通知receipt不是用户认证、可复用授权或Run执行租约。仓储入口仅接受完整持久化execution快照并核对Run引用，当前管理metadata创建不能获得该标记；代码不提供升级函数。将来Worker host必须另验可信服务身份、实时成员/资源/资金控制权，不能以收到run_ready或通过快照结构校验代替。当前没有新HTTP路由或正式execution准入。

步骤及事件引用始终同Team/Workspace/Run；写操作还校验当前owner/epoch、lease、deadline和取消状态。通知回执与Run租约独立，旧owner、旧revision或过期回执不能确认。MySQL涉及owner/kind/status的条件采用精确比较；错误只有固定分类，SQL日志关闭。引用producer和通知不复制输入、metadata、Key、模型正文或隐藏推理；原始Step/Event JSON的结构校验不是自动脱敏保证，新增正文producer必须自行履行该责任。死信保留并以显式CAS重投，不自动重发外部调用或释放资金。

## P03-T02 账本准入与可信资金事实

内部reservation命令、Run快照、BudgetPreparation、ledger结果和outbox唤醒均不是身份凭证、付款收据或可复用执行许可。application必须经`ModelCallLedgerAdmission`检查可信调用方、实时资源/资金控制权、适用政策及匹配完整调用的费用上界，重放也不能绕过；生产适配器尚未提供，nil拒绝全部命令，metadata_only不升级。内部repository/model只负责持久化约束，后续host不得将其直接公开为跳过准入的HTTP或Worker入口。

转换核对同域Run/Step/固定版本和当前owner/epoch/lease；新预留与发送要求deadline、取消、报价及执行窗有效。记录未知结果是收尾事实，当前live lease在deadline/取消后仍可登记，随后failed待核账并保留预留和已确认资金/Token观察，不能以过期或终态触发退款/重发。完整意图与全局唯一调用/请求键防止重复登记或跨租户复用，不宣称供应商调用恰好执行一次。

事件/通知只保存账本和作用域引用及固定状态，不复制输入、凭据、价格正文或隐藏推理；存储JSON结构校验不能自动脱敏。consume_log_id可空且只有可信真实持久化ID有引用意义，普通请求ID不证明付款；usage目前的model/charge引用检查不证明来源鉴权，P06可信投影与退款尚待实现。所有错误保持固定分类、敏感SQL日志关闭；当前无真实模型调用、钱包/Token额度修改或收费路径装配。
