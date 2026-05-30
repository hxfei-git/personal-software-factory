import { randomUUID } from "node:crypto";
import {
  MissionStatus,
  type MissionEvent,
  type MissionStatusValue,
} from "@psf/mission-schema";

const finalStatuses = new Set<MissionStatusValue>([
  MissionStatus.released,
  MissionStatus.failed,
  MissionStatus.cancelled,
]);

const runningStatuses = new Set<MissionStatusValue>([
  MissionStatus.dev_running,
  MissionStatus.build_running,
  MissionStatus.test_running,
  MissionStatus.staging_deploying,
  MissionStatus.qa_running,
  MissionStatus.fixing,
  MissionStatus.regression_running,
  MissionStatus.production_deploying,
]);

const directTransitions = new Map<MissionStatusValue, ReadonlySet<MissionStatusValue>>([
  [MissionStatus.received, new Set([MissionStatus.planning])],
  [MissionStatus.planning, new Set([MissionStatus.planned, MissionStatus.dev_queued, MissionStatus.approval_required])],
  [MissionStatus.planned, new Set([MissionStatus.approval_required, MissionStatus.dev_queued])],
  [MissionStatus.approval_required, new Set([MissionStatus.dev_queued, MissionStatus.needs_human])],
  [MissionStatus.dev_queued, new Set([MissionStatus.dev_running])],
  [MissionStatus.dev_running, new Set([MissionStatus.build_running])],
  [MissionStatus.build_running, new Set([MissionStatus.test_running, MissionStatus.staging_deploying])],
  [MissionStatus.test_running, new Set([MissionStatus.staging_deploying])],
  [MissionStatus.staging_deploying, new Set([MissionStatus.staging_ready, MissionStatus.qa_running])],
  [MissionStatus.staging_ready, new Set([MissionStatus.qa_running])],
  [MissionStatus.qa_running, new Set([MissionStatus.bugs_found, MissionStatus.ready_for_review])],
  [MissionStatus.bugs_found, new Set([MissionStatus.fixing])],
  [MissionStatus.fixing, new Set([MissionStatus.regression_running])],
  [MissionStatus.regression_running, new Set([MissionStatus.qa_running])],
  [MissionStatus.ready_for_review, new Set([MissionStatus.release_approval])],
  [MissionStatus.release_approval, new Set([MissionStatus.production_deploying])],
  [MissionStatus.production_deploying, new Set([MissionStatus.released])],
]);

export interface TransitionMissionInput {
  mission_id: string;
  from: MissionStatusValue;
  to: MissionStatusValue;
  actor?: string;
  payload?: Record<string, unknown>;
}

export interface TransitionMissionResult {
  status: MissionStatusValue;
  event: MissionEvent;
}

export function isFinalStatus(status: MissionStatusValue): boolean {
  return finalStatuses.has(status);
}

export function isRunningStatus(status: MissionStatusValue): boolean {
  return runningStatuses.has(status);
}

export function canTransition(from: MissionStatusValue, to: MissionStatusValue): boolean {
  if (from === to || isFinalStatus(from)) {
    return false;
  }

  if (to === MissionStatus.paused) {
    return true;
  }

  if (to === MissionStatus.cancelled) {
    return true;
  }

  if (to === MissionStatus.failed) {
    return isRunningStatus(from);
  }

  return directTransitions.get(from)?.has(to) ?? false;
}

export function assertTransition(from: MissionStatusValue, to: MissionStatusValue): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid Mission transition from ${from} to ${to}`);
  }
}

export function transitionMission(input: TransitionMissionInput): TransitionMissionResult {
  assertTransition(input.from, input.to);

  return {
    status: input.to,
    event: {
      id: randomUUID(),
      mission_id: input.mission_id,
      type: `mission.transition.${input.from}.${input.to}`,
      message: `Mission transitioned from ${input.from} to ${input.to}`,
      payload: {
        actor: input.actor ?? "system",
        ...(input.payload ?? {}),
      },
      created_at: new Date().toISOString(),
    },
  };
}
