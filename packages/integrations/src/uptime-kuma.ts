import { INTEGRATION_DEFINITIONS, buildDryRunResult } from "./base.js";
import type { UptimeKumaDryRunInput, UptimeKumaDryRunResult } from "./types.js";

const definition = INTEGRATION_DEFINITIONS.uptime_kuma;

export function runUptimeKumaDryRun(input: UptimeKumaDryRunInput = {}): UptimeKumaDryRunResult {
  const monitor = input.monitor ?? {};
  const project = monitor.project ?? "unknown-project";
  const targetUrl = monitor.stagingUrl || monitor.productionUrl || "https://example.invalid";
  const targetEnvironment = monitor.stagingUrl ? "staging" : monitor.productionUrl ? "production" : "placeholder";

  return buildDryRunResult(definition, {
    ...input,
    message: "Uptime Kuma dry-run completed locally; no monitor API was called.",
    outputs: {
      monitorConfig: {
        name: `${project}-${targetEnvironment}`,
        type: "http",
        url: targetUrl,
        intervalSeconds: 60,
        retryIntervalSeconds: 30,
        dryRun: true,
      },
      simulatedMonitor: {
        id: `dry-run-uptime-kuma-${project}-${targetEnvironment}`,
        status: "active_simulated",
        realNetworkCall: false,
      },
      uptimeSummary: `Monitor simulated for ${targetEnvironment} URL ${targetUrl}.`,
    },
  });
}
