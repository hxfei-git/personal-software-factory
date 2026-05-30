import { describe, expect, it } from "vitest";
import { MissionStatus } from "@psf/mission-schema";
import {
  assertTransition,
  canTransition,
  isFinalStatus,
  isRunningStatus,
  transitionMission,
} from "../src/index.js";

describe("mission state machine", () => {
  it("allows the normal development flow", () => {
    const flow = [
      MissionStatus.received,
      MissionStatus.planning,
      MissionStatus.dev_queued,
      MissionStatus.dev_running,
      MissionStatus.build_running,
      MissionStatus.staging_deploying,
      MissionStatus.qa_running,
      MissionStatus.ready_for_review,
    ];

    for (let index = 0; index < flow.length - 1; index += 1) {
      expect(canTransition(flow[index]!, flow[index + 1]!)).toBe(true);
    }
  });

  it("allows the bug fix loop", () => {
    expect(canTransition(MissionStatus.qa_running, MissionStatus.bugs_found)).toBe(true);
    expect(canTransition(MissionStatus.bugs_found, MissionStatus.fixing)).toBe(true);
    expect(canTransition(MissionStatus.fixing, MissionStatus.regression_running)).toBe(true);
    expect(canTransition(MissionStatus.regression_running, MissionStatus.qa_running)).toBe(true);
  });

  it("allows the release flow", () => {
    expect(canTransition(MissionStatus.ready_for_review, MissionStatus.release_approval)).toBe(true);
    expect(canTransition(MissionStatus.release_approval, MissionStatus.production_deploying)).toBe(true);
    expect(canTransition(MissionStatus.production_deploying, MissionStatus.released)).toBe(true);
  });

  it("rejects invalid jumps", () => {
    expect(canTransition(MissionStatus.received, MissionStatus.released)).toBe(false);
    expect(() => assertTransition(MissionStatus.received, MissionStatus.released)).toThrow(/Invalid Mission transition/);
  });

  it("prevents final states from transitioning", () => {
    expect(isFinalStatus(MissionStatus.released)).toBe(true);
    expect(canTransition(MissionStatus.released, MissionStatus.paused)).toBe(false);
    expect(canTransition(MissionStatus.failed, MissionStatus.dev_queued)).toBe(false);
    expect(canTransition(MissionStatus.cancelled, MissionStatus.received)).toBe(false);
  });

  it("allows pause and cancel from non-final states", () => {
    expect(canTransition(MissionStatus.dev_running, MissionStatus.paused)).toBe(true);
    expect(canTransition(MissionStatus.ready_for_review, MissionStatus.cancelled)).toBe(true);
  });

  it("allows running states to fail", () => {
    expect(isRunningStatus(MissionStatus.dev_running)).toBe(true);
    expect(canTransition(MissionStatus.dev_running, MissionStatus.failed)).toBe(true);
    expect(canTransition(MissionStatus.qa_running, MissionStatus.failed)).toBe(true);
    expect(canTransition(MissionStatus.received, MissionStatus.failed)).toBe(false);
  });

  it("creates a MissionEvent-shaped transition result", () => {
    const result = transitionMission({
      mission_id: "mission-001",
      from: MissionStatus.received,
      to: MissionStatus.planning,
      actor: "orchestrator-api",
      payload: { reason: "start planning" },
    });

    expect(result.status).toBe(MissionStatus.planning);
    expect(result.event.mission_id).toBe("mission-001");
    expect(result.event.type).toBe("mission.transition.received.planning");
    expect(result.event.message).toBe("Mission transitioned from received to planning");
    expect(result.event.payload).toEqual({ actor: "orchestrator-api", reason: "start planning" });
  });
});
