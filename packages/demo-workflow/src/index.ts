export * from "./constants.js";
export * from "./types.js";

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
