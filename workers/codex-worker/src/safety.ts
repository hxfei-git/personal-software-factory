export interface CodexExecutionSafetyInput {
  mode: "dry-run" | "mock" | "real";
  enableRealCodex: boolean;
  currentBranch: string;
  hasApproval: boolean;
}

export function isProtectedExecutionBranch(branchName: string): boolean {
  const normalized = branchName.trim().toLowerCase();
  return normalized === "main" || normalized === "master";
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
  if (isProtectedExecutionBranch(input.currentBranch)) {
    throw new Error("Real Codex execution is blocked on main/master branches.");
  }
}
