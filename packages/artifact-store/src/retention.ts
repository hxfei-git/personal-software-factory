import { rm } from "node:fs/promises";
import path from "node:path";
import { assertInsideWorkspace, assertNotForbiddenPath } from "@psf/security";

export type RetentionClass = "short" | "mission" | "release" | "audit";

export interface RetentionCleanupEntry {
  path: string;
  retentionClass: RetentionClass;
  createdAt?: string;
  retainUntil?: string | null;
}

export interface RetentionCleanupInput {
  artifactsRoot: string;
  entries: RetentionCleanupEntry[];
  now?: Date;
  dryRun?: boolean;
}

export interface RetentionCleanupResult {
  dryRun: boolean;
  candidates: string[];
  deleted: string[];
}

const RETENTION_DAYS: Record<Exclude<RetentionClass, "audit">, number> = {
  short: 7,
  mission: 90,
  release: 365,
};

function addDays(date: Date, days: number): Date {
  const output = new Date(date);
  output.setUTCDate(output.getUTCDate() + days);
  return output;
}

export function buildRetentionMetadata(retentionClass: RetentionClass, createdAt: Date = new Date()): Record<string, unknown> {
  if (retentionClass === "audit") {
    return {
      retentionClass,
      retainUntil: null,
    };
  }

  return {
    retentionClass,
    retainUntil: addDays(createdAt, RETENTION_DAYS[retentionClass]).toISOString(),
  };
}

function resolveCandidatePath(artifactsRoot: string, candidatePath: string): string {
  const resolvedRoot = path.resolve(artifactsRoot);
  const resolvedCandidate = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(process.cwd(), candidatePath);

  assertInsideWorkspace(resolvedCandidate, resolvedRoot);
  assertNotForbiddenPath(resolvedCandidate);
  return resolvedCandidate;
}

function expirationDate(entry: RetentionCleanupEntry): Date | undefined {
  if (entry.retentionClass === "audit" || entry.retainUntil === null) {
    return undefined;
  }

  if (entry.retainUntil) {
    return new Date(entry.retainUntil);
  }

  if (!entry.createdAt) {
    return undefined;
  }

  return addDays(new Date(entry.createdAt), RETENTION_DAYS[entry.retentionClass]);
}

function isExpired(entry: RetentionCleanupEntry, now: Date): boolean {
  const expiresAt = expirationDate(entry);
  return expiresAt !== undefined && expiresAt.getTime() <= now.getTime();
}

export async function cleanupExpiredArtifacts(input: RetentionCleanupInput): Promise<RetentionCleanupResult> {
  const now = input.now ?? new Date();
  const dryRun = input.dryRun !== false;
  const candidates: string[] = [];
  const deleted: string[] = [];

  for (const entry of input.entries) {
    const candidatePath = resolveCandidatePath(input.artifactsRoot, entry.path);
    if (!isExpired(entry, now)) {
      continue;
    }

    candidates.push(entry.path);
    if (!dryRun) {
      await rm(candidatePath, { force: true });
      deleted.push(entry.path);
    }
  }

  return {
    dryRun,
    candidates,
    deleted,
  };
}
