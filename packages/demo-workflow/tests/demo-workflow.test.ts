import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEMO_API_URL,
  DEFAULT_DEMO_HUB_URL,
  EXAMPLE_MISSION_ID,
  getDemoBoundary,
} from "../src/index.js";

describe("@psf/demo-workflow scaffold", () => {
  it("exports fixed demo constants and dry-run boundary", () => {
    expect(EXAMPLE_MISSION_ID).toBe("mission-0001-ai-novelist-chapter-review");
    expect(DEFAULT_DEMO_API_URL).toBe("http://127.0.0.1:3000");
    expect(DEFAULT_DEMO_HUB_URL).toBe("http://127.0.0.1:5173");
    expect(getDemoBoundary()).toMatchObject({
      dryRun: true,
      realCodexExecuted: false,
      realExternalCall: false,
      realPush: false,
      realDeploy: false,
    });
  });
});
