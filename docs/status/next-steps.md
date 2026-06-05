# 下一步

## 推荐下一批工作

1. B1 文档差异审计与最小必要清理已完成；继续维护 `summary.md` 文档地图，任何 Markdown 新增、删除、移动或改名都必须同步更新。
2. B2 readiness/blocker 合同收敛已完成；`safeToRun` 只保留为 legacy route-level queue readiness，新判断优先使用 `canQueue`、`canExecute`、`blockers[]` 和 `recommendedNextAction`。
3. B3 合同安全测试精补已完成；API 400 preflight、Hub `canQueue` 优先和 blocker 顺序、Worker Runner execute-only blockers、GitHub PR preview/manual-action no-network 边界、repo URL trim 分类和 unsafe branch redaction 已由 focused tests 锁定。
4. 下一步执行 A1：只在 operator-prepared `ai-novelist` local mirror 上证明 gated-runner path。Passport 中 `manual-verification-required` 的 commands、local URL 和 selectors 必须先人工验证。
5. 暂不扩展外部 provider；在本地 mirror gated-runner path 被证明之前，GitHub、Coolify、Uptime Kuma、Plane 和其他 provider network calls 必须继续禁用。


## 真实 Codex 前

- 增加经过审查的 command allowlists 和 workspace path guards。
- 为 worker prompts、stdout、stderr 和 artifacts 中的 secret redaction 增加测试。
- 为每一次 Mission state change 增加 event auditing。
- 为 destructive、costly、external 和 production actions 增加 approval gates。
- 在 disposable fixture repository 上证明 branch/worktree isolation。

## 真实集成前

- 定义带 idempotency keys 和 retry/backoff behavior 的 provider client contracts。
- 对每个 response 审计 `realNetworkCall`。
- 增加 provider-specific redaction tests。
- 增加 rollback 或 manual recovery guidance。
- 启用 GitHub、Coolify、Uptime Kuma 或 Plane network calls 前必须获得明确用户 approval。

## Temporal/LangGraph 前

在 recovery failures、compensation needs、durable timers、branching graph complexity 或 multi-project pressure 方面出现 ADR 0005 所需证据之前，继续使用 BullMQ 加显式 TypeScript state machine。

如果这些证据出现，从 ADR 0005 出发编写新的 migration design，并保留 Orchestrator、WorkerRun 和 MissionEvent contracts。
