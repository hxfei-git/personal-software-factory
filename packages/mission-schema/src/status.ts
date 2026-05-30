export const missionStatusValues = [
  "received",
  "planning",
  "planned",
  "approval_required",
  "dev_queued",
  "dev_running",
  "build_running",
  "test_running",
  "staging_deploying",
  "staging_ready",
  "qa_running",
  "bugs_found",
  "fixing",
  "regression_running",
  "ready_for_review",
  "release_approval",
  "production_deploying",
  "released",
  "paused",
  "blocked",
  "needs_human",
  "failed",
  "cancelled",
] as const;

export type MissionStatusValue = (typeof missionStatusValues)[number];

export const MissionStatus = Object.freeze(
  Object.fromEntries(missionStatusValues.map((status) => [status, status])) as {
    [Status in MissionStatusValue]: Status;
  },
);
