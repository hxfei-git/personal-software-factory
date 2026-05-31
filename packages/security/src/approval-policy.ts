export type RiskyAction =
  | "production_deploy"
  | "destructive_operation"
  | "database_migration"
  | "secret_change"
  | "external_cost_risk"
  | "security_risk"
  | "git_push"
  | "github_pr"
  | "external_network_call"
  | "real_codex_execution";

export interface ApprovalPolicyResult {
  allowed: boolean;
  requiredApprovalTypes: string[];
  missingApprovalTypes: string[];
  reason: string;
}

const APPROVAL_REQUIREMENTS: Readonly<Record<RiskyAction, readonly string[]>> = {
  production_deploy: ["production_deploy"],
  destructive_operation: ["destructive_operation"],
  database_migration: ["database_migration"],
  secret_change: ["secret_change"],
  external_cost_risk: ["external_cost_risk"],
  security_risk: ["security_risk"],
  git_push: ["git_push"],
  github_pr: ["github_pr"],
  external_network_call: ["external_network_call"],
  real_codex_execution: ["real_codex_execution"],
};

export function evaluateApprovalPolicy(action: RiskyAction, grantedApprovalTypes: string[] = []): ApprovalPolicyResult {
  const requiredApprovalTypes = [...APPROVAL_REQUIREMENTS[action]];
  const granted = new Set(grantedApprovalTypes);
  const missingApprovalTypes = requiredApprovalTypes.filter((approvalType) => !granted.has(approvalType));
  const allowed = missingApprovalTypes.length === 0;

  return {
    allowed,
    requiredApprovalTypes,
    missingApprovalTypes,
    reason: allowed
      ? `Action ${action} has required approval.`
      : `Action ${action} requires missing approval: ${missingApprovalTypes.join(", ")}.`,
  };
}
