# 个人工作区 HTTP 契约 v1

`GET /api/agent-platform/personal-workspace` 和 `PUT /api/agent-platform/personal-workspace` 受平台总开关控制，需要通过 `Authorization: Bearer …` 提交当前有效的管理会话。Cookie、PAT 和模型 Key 不能用来访问本接口。服务端从当前会话确定所有者；请求没有可替换的路径标识、查询参数或所有者字段。团队归属及角色不影响个人工作区，平台管理员也仅能通过此接口访问自己的空间。

GET 不创建记录。首次读取成功返回 HTTP 200，公共响应信封中的 `data` 为 `{ "workspace": null }`。

PUT 使用 `application/json`，准确接收三个必填字段：

```json
{
  "name": "我的研究空间",
  "description": "保存本人的研究工作区信息",
  "expected_revision": 0
}
```

- `name` 去除前后空白，必须为 1–128 个 Unicode 字符；`description` 最多 4096 UTF-8 字节，可为空字符串。两者均不接收 NUL 字符或 `null`。
- `expected_revision` 是规范拼写的非负 JSON 安全整数。`0` 仅能首次创建，初始 `revision` 为 `1`。正数必须与现有版本相同，成功后版本加一。记录不存在而使用正版本，或记录已存在而再次用 `0`，均返回 `409 AG_DRAFT_REVISION_CONFLICT`，不覆盖数据。
- GET 和 PUT 成功时，公共响应信封中的 `data.workspace` 仅含 `name`、`description`、`revision`、`updated_at`。`updated_at` 是 UTC Unix 毫秒时间戳；不返回所有者、团队、策略或运行数据。
- 失败使用固定公共错误信封。总开关关闭返回 `503 AG_RUNTIME_UNAVAILABLE`，会话缺失或失效返回 `401 AG_AUTH_REQUIRED`，请求格式或字段不符合契约返回 `400 AG_INVALID_ARGUMENT`。响应设置 `Cache-Control: no-store`。

每个账号最多一条记录。这里仅保存个人工作区名称和描述，不接受成员、共享、运行 Key 或 Agent 执行操作。
