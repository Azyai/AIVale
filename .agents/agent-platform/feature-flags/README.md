# P00-T04 平台功能开关

本批提供平台配置、服务端准入、状态字段和后续 worker 的新任务认领检查。五项开关默认关闭，沿用既有 Option 存储和管理员更新接口。

## 配置和生效方式

| Option 键 | 默认值 | 有效条件 |
| --- | --- | --- |
| `agent_setting.enabled` | `false` | 总开关为精确字符串 `true` |
| `agent_setting.worker_enabled` | `false` | 总开关和 worker 均开启 |
| `agent_setting.mcp_enabled` | `false` | 总开关和 MCP 均开启 |
| `agent_setting.skills_enabled` | `false` | 总开关和 Skills 均开启 |
| `agent_setting.scripts_enabled` | `false` | 总开关、Skills 和脚本均开启 |

管理员通过现有、受 `RootAuth` 保护的 `PUT /api/option/` 逐项保存。例如关闭总开关的请求体为：

```json
{"key":"agent_setting.enabled","value":false}
```

HTTP 布尔值或精确字符串 `"true"` / `"false"` 可用；数字、null、其他字符串、未知 `agent_setting.*` 键被拒绝。历史缺失/非法值在读取时按关闭处理。该命名空间的单项更新使用现有事务保存入口，成功后才更新内存；数据库错误返回失败并保留原有效状态。其他配置键维持原更新逻辑。

成功保存后当前实例立即生效；其他实例按现有 `SyncOptions` 轮询传播，默认间隔60秒。多实例紧急关停需要逐实例确认，不将单个成功响应当作全局瞬时关闭。多个键在内存中逐项生效；调整组合策略时按以下顺序操作：

1. 关闭 `agent_setting.enabled`。
2. 确认所有实例已读到关闭状态。
3. 保存需要的子开关，核对每项结果。
4. 具备对应业务能力并完成后续门禁后，再开启总开关并核对各实例。

## 状态和服务端限制

现有 `GET /api/status` 新增 `data.agent_platform`，仅包含应用依赖后的五项布尔值：

```json
{
  "enabled": false,
  "worker_enabled": false,
  "mcp_enabled": false,
  "skills_enabled": false,
  "scripts_enabled": false
}
```

这些是有效配置状态。它们不表示 worker 在线、Agent/MCP/Skills 业务已经实现，也不替代工作区权限探测。前端导航将在 P00-T07 接入；本批不新增菜单或业务处理器。

生产 `SetRouter` 已安装总开关 gate，按路径段匹配 `/api/agent-platform`、`/v1/agents`、`/v1/agent-runs`。关闭时新接入返回 HTTP 503、`AG_RUNTIME_UNAVAILABLE`、现有请求 ID 和 `Cache-Control: no-store`；响应包含冻结契约要求的 `data.field_errors=[]`、`data.retryable=false`。配置关闭需要管理员调整，客户端不应自动重试该拒绝。未注册路由也先经过检查。相似前缀和既有模型、Team、系统任务入口保持原处理链。

为已有工作保留以下控制请求进入其后续认证和处理链：

- GET / HEAD `/v1/agent-runs/:run_id`
- GET / HEAD `/v1/agent-runs/:run_id/events`
- POST `/v1/agent-runs/:run_id/cancel`

放行仅针对功能开关，身份、工作区及 Run 权限仍由后续对应处理链执行。本批未注册这些控制处理器；未实现路由继续返回原有未找到响应。

后续具体 MCP、Skills、脚本路由使用 `middleware.RequireAgentFeature(...)`；新 Agent worker 在每次 claim 前调用 `agent_setting.CanClaimNewWork()`。总开关或 worker 子开关关闭后停止新 claim，已经通过准入的请求继续完成。取消已在运行的工作是独立操作；真实队列、租约和排空流程在 P03 实现。不要把开关挂到既有系统任务 runner 上。

## 验证与复现

`verify.ps1` 和 Go 测试源码仅保留本地，不随 Git 分发。新克隆缺少它们时只能执行已有构建检查，不得宣称真实数据库验收通过。规则见 [测试与验收规范](../../../docs/project/07-acceptance.md)。在具备本地入口和用例的仓库根目录，使用 Windows PowerShell 7 运行：

```powershell
& ./.agents/agent-platform/feature-flags/verify.ps1 `
  -MySqlBin 'C:\Program Files\MySQL\MySQL Server 26.7\bin'
```

需要 PATH 中可用的 Go、Git，以及该目录内的 MySQL 程序；环境要求见 [MySQL 环境说明](../mysql/README.md)。入口复用 P00-T03 的独立实例创建工具，每次使用全新数据目录、回环端口、随机凭据和四个带标记的库。本批只使用其中 fresh 库测试既有 Option/AuditLog，其余三库保持标记状态。不读业务 DSN、不控制已有服务、不删除数据。

入口顺序执行环境启动、临时测试 DSN 设置、集中测试与两项既有回归、摘要检查及正常关闭；临时环境变量最后恢复。失败、SKIP、缺失必需测试/摘要或正常关闭失败均返回非零。直接运行普通 Go 测试而缺少专用 DSN 时，MySQL 用例会跳过，不能算真实数据库验收。

原始输出及不含凭据的 `p00-t04-verification.json` 留在 `.local-tests/agent-platform/mysql/<RunId>/`。该目录已被 Git 忽略并设为私有访问；其中凭据、状态、客户端配置与原始日志保持本机存放。验收报告和机器结果不再入库，提交正文或交付说明仅记录实际验证摘要。每次复现使用新编号，不复用已建库的目录。

构建和静态检查可另行执行：

```powershell
$env:GOWORK = 'off'
go build -p 2 ./...
go vet -p 2 ./...
```

回退时先关闭总开关并确认各实例传播，再按模块逆序回退 Git 提交；保留兼容 Option 数据。停止验证实例使用环境脚本的 `-Action Stop -RunId <真实编号>`，脚本保留其数据与日志。
