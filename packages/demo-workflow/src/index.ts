export * from "./constants.js";
export * from "./types.js";
export * from "./paths.js";
export * from "./files.js";
export * from "./db.js";
export * from "./doctor.js";
export * from "./report.js";
export * from "./workflow.js";

import type { DemoBoundary } from "./types.js";

export function getDemoBoundary(): DemoBoundary {
  return {
    dryRun: true,
    realCodexExecuted: false,
    realExternalCall: false,
    realPush: false,
    realDeploy: false,
  };
}
