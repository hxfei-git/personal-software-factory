# 文档目录

本目录保存 Personal Software Factory 的全局说明文档。普通阅读入口优先看根目录：

- `../README.md`: 项目入口和快速启动。
- `../summary.md`: 当前状态、问题、待改进项和完整文档地图。
- `../AGENTS.md`: Codex/agent 执行规则和文档维护纪律。

主题目录：

- `architecture/`: 当前架构、状态机和结构事实源。
- `status/`: 当前进度和下一步。
- `debug/`: 调试记录、验证记录和排障入口。
- `api/`: Orchestrator API、认证和 schema 合同。
- `security/`: 安全边界、审批策略和 worker 权限。
- `runtime/`: 队列、WorkerRun、存储、artifact 和 worker runtime。
- `operations/`: 本地开发、启动、健康检查、故障排查和开发纪律。
- `integrations/`: GitHub、Coolify、Uptime Kuma、Plane 和共享集成边界。
- `workers/`: Codex、QA、auto-fix loop、Playwright 和真实执行准备。
- `apps/`: Hub Web 等应用说明。
- `projects/`: Project Registry、Project Passport 和 Mission Planner。
- `prompts/`: QA、BugReport 和 prompt 模板。
- `adr/`: 持久架构决策记录，清理时默认保留。
- `archive/`: 只保存确有审计价值的归档入口或未来明确保留材料。
- `superpowers/`: 当前 Superpowers 设计和实施计划。

维护规则：新增、移动、删除 Markdown 时，必须同步更新 `../summary.md` 的文档地图。
