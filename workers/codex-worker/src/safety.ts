export interface CodexExecutionSafetyInput {
  mode: "dry-run" | "mock" | "real";
  enableRealCodex: boolean;
  currentBranch: string;
  hasApproval: boolean;
}

export function assertSafeCodexExecution(input: CodexExecutionSafetyInput): void {
  if (input.mode !== "real") {
    return;
  }
  if (!input.enableRealCodex) {
    throw new Error("Real Codex execution requires ENABLE_REAL_CODEX=1.");
  }
  if (!input.hasApproval) {
    throw new Error("Real Codex execution requires an approved Approval record.");
  }
  if (input.currentBranch === "main" || input.currentBranch === "master") {
    throw new Error("Real Codex execution is blocked on main/master branches.");
  }
}
