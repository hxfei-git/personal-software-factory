import { isSecretLikeName, redactValue } from "@psf/integrations";

export type ReadinessBlockerCategory = "queue_acceptance" | "approval" | "configuration" | "policy" | "execution" | "safety";
export type ReadinessBlockerSeverity = "blocking" | "manual_action" | "warning" | "info";
export type ReadinessBlockTarget = "queue" | "execute";
export type ReadinessBlockerSource = "orchestrator" | "worker_runner" | "integration" | "worker";

export type ReadinessBlocker = {
  category: ReadinessBlockerCategory;
  key: string;
  message: string;
  recommendedNextAction: string;
  severity: ReadinessBlockerSeverity;
  blocks: ReadinessBlockTarget[];
  source: ReadinessBlockerSource;
  details?: Record<string, unknown>;
};

export type ReadinessState = {
  canQueue: boolean;
  canExecute: boolean;
  blockers: ReadinessBlocker[];
  recommendedNextAction: string;
};

export type ReadinessBlockerInput = Omit<ReadinessBlocker, "blocks" | "details"> & {
  blocks: readonly ReadinessBlockTarget[];
  details?: Record<string, unknown>;
};

const REDACTED = "[REDACTED]";
const blockTargetOrder: ReadinessBlockTarget[] = ["queue", "execute"];
const severityOrder: Record<ReadinessBlockerSeverity, number> = {
  blocking: 0,
  manual_action: 1,
  warning: 2,
  info: 3,
};
const categoryOrder: Record<ReadinessBlockerCategory, number> = {
  queue_acceptance: 0,
  approval: 1,
  configuration: 2,
  policy: 3,
  execution: 4,
  safety: 5,
};

function normalizeBlocks(blocks: readonly ReadinessBlockTarget[]): ReadinessBlockTarget[] {
  const blockSet = new Set(blocks);
  return blockTargetOrder.filter((target) => blockSet.has(target));
}

function sanitizeDetailsValue(value: unknown): unknown {
  const redacted = redactValue(value, process.env);

  if (Array.isArray(redacted)) {
    return redacted.map((entry) => sanitizeDetailsValue(entry));
  }

  if (redacted && typeof redacted === "object") {
    return Object.fromEntries(
      Object.entries(redacted as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [
          key,
          isSecretLikeName(key) ? REDACTED : sanitizeDetailsValue(entry),
        ]),
    );
  }

  return redacted;
}

function sanitizeDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const sanitized = sanitizeDetailsValue(details);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) return undefined;
  return sanitized as Record<string, unknown>;
}

export function buildReadinessBlocker(input: ReadinessBlockerInput): ReadinessBlocker {
  const details = sanitizeDetails(input.details);
  const blocker: ReadinessBlocker = {
    category: input.category,
    key: input.key,
    message: input.message,
    recommendedNextAction: input.recommendedNextAction,
    severity: input.severity,
    blocks: normalizeBlocks(input.blocks),
    source: input.source,
  };

  if (details) {
    blocker.details = details;
  }

  return blocker;
}

function hasQueueBlocker(blocker: ReadinessBlocker): boolean {
  return blocker.blocks.includes("queue");
}

export function sortReadinessBlockers(blockers: readonly ReadinessBlocker[]): ReadinessBlocker[] {
  return [...blockers].sort((left, right) => {
    const severityDelta = severityOrder[left.severity] - severityOrder[right.severity];
    if (severityDelta !== 0) return severityDelta;

    const leftQueueRank = hasQueueBlocker(left) ? 0 : 1;
    const rightQueueRank = hasQueueBlocker(right) ? 0 : 1;
    const queueDelta = leftQueueRank - rightQueueRank;
    if (queueDelta !== 0) return queueDelta;

    const categoryDelta = categoryOrder[left.category] - categoryOrder[right.category];
    if (categoryDelta !== 0) return categoryDelta;

    return left.key.localeCompare(right.key);
  });
}

export function deriveReadinessState(
  blockers: readonly ReadinessBlockerInput[],
  fallbackRecommendedNextAction: string,
): ReadinessState {
  const sortedBlockers = sortReadinessBlockers(blockers.map((blocker) => buildReadinessBlocker(blocker)));
  const canQueue = !sortedBlockers.some((blocker) => blocker.blocks.includes("queue"));
  const canExecute = canQueue && !sortedBlockers.some((blocker) => blocker.blocks.includes("execute"));

  return {
    canQueue,
    canExecute,
    blockers: sortedBlockers,
    recommendedNextAction: sortedBlockers[0]?.recommendedNextAction ?? fallbackRecommendedNextAction,
  };
}
