export interface PlaywrightSmokeSummary {
  missionId: string;
  status: "skipped";
  reason: string;
  browserOpened: false;
  stagingVisited: false;
  createdAt: string;
}

export function createSkippedPlaywrightSummary(input: { missionId: string; now?: string }): PlaywrightSmokeSummary {
  return {
    missionId: input.missionId,
    status: "skipped",
    reason: "No QA_TEST_URL or STAGING_URL was configured.",
    browserOpened: false,
    stagingVisited: false,
    createdAt: input.now ?? new Date().toISOString(),
  };
}
