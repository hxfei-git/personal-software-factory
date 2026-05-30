import { INTEGRATION_DEFINITIONS, buildDryRunResult } from "./base.js";
import type { CoolifyDryRunInput, CoolifyDryRunResult } from "./types.js";

const definition = INTEGRATION_DEFINITIONS.coolify;

export function runCoolifyDryRun(input: CoolifyDryRunInput = {}): CoolifyDryRunResult {
  const deployment = input.deployment ?? {};
  const environment = deployment.environment ?? "staging";
  const project = deployment.project ?? "unknown-project";
  const requiresApproval = environment === "production";

  return buildDryRunResult(definition, {
    ...input,
    message: "Coolify dry-run completed locally; no deployment API was called.",
    outputs: {
      deployRequest: {
        project,
        environment,
        targetUrl: environment === "production" ? deployment.productionUrl : deployment.stagingUrl,
        requiresApproval,
        dryRun: true,
      },
      simulatedDeployment: {
        id: `dry-run-coolify-${environment}-${project}`,
        status: requiresApproval ? "pending_approval" : "queued",
        realNetworkCall: false,
      },
      summary: `${environment} deploy request simulated for ${project}; production approval required: ${requiresApproval}.`,
    },
  });
}
