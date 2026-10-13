<div align="center">

![AIVale](/web/public/logo.png)

# AIVale

**京西智谷 · 大模型 API 中转平台**

</div>

## 简介

AIVale 是面向公司内部的统一大模型 API 网关：多模型统一接入、Token 计费与订阅套餐、团队多租户（Token 级隔离 + 团队钱包）、飞书登录、用量排行榜，兼容 OpenAI / Anthropic / Gemini 等主流接口协议。

基于开源项目 **[QuantumNous/new-api](https://github.com/QuantumNous/new-api)** 深度定制开发，上游文档与版本更新请访问其仓库。

## 本地部署

```bash
docker build -t local/new-api:dev .
docker compose -f docker-compose.local.yml up -d
```

启动后访问 <http://localhost:3000>（依赖 MySQL 8.2 与 Redis 7.2，连接参数见 `docker-compose.local.yml`）。首次启动进入 Web 初始化向导设置管理员账号。

## 说明

- 管理后台：`/system-settings`（站点信息、订阅套餐、渠道、模型广场精选等配置）
- 模型广场：`/pricing`（千问风格改版，支持后台配置精选模型与模型对比）
- 用量大屏：`/rankings`

## License

继承上游 [AGPL-3.0](./LICENSE) 协议，源码保留上游版权声明。
