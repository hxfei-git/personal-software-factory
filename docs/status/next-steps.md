# 下一步

## 推荐下一批工作

1. 下一批实现优先聚焦 `ai-novelist` 的确定性 QA，或谨慎推进受 gate 保护的本地真实 Codex 执行。
2. 暂不扩展外部 provider；在本地 QA/Codex control-plane 行为被证明之前，GitHub、Coolify、Uptime Kuma、Plane 和其他 provider network calls 必须继续禁用。
3. 按 `README.md` 在干净 `.env` 上手动操作 Hub control plane，确认 Mission creation、resource pages、Approval decisions 和 dry-run action preflight 都保持 real-mode gates 清晰可见，且 integration responses 保持 `realNetworkCall: false`。
4. 在收集运行证据期间，继续以 BullMQ-backed queue runtime 和显式 TypeScript Mission state machine 作为基线。

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
