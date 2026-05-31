import path from "node:path";
import { resolveSafeWorkspacePath } from "@psf/security";

export type ArtifactCategory =
  | "mission"
  | "codex"
  | "qa"
  | "fix"
  | "deploy"
  | "monitor"
  | "integration"
  | "logs";

export interface ArtifactPathInput {
  artifactsRoot: string;
  missionId: string;
  runId: string;
  category: ArtifactCategory;
  filename: string;
}

const ARTIFACT_CATEGORIES = new Set<ArtifactCategory>([
  "mission",
  "codex",
  "qa",
  "fix",
  "deploy",
  "monitor",
  "integration",
  "logs",
]);

function assertSafeSegment(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty.`);
  }

  if (path.isAbsolute(value) || value.includes("/") || value.includes("\\") || value === "." || value === "..") {
    throw new Error(`${name} must be a safe single path segment.`);
  }
}

export function buildArtifactPath(input: ArtifactPathInput): string {
  assertSafeSegment("missionId", input.missionId);
  assertSafeSegment("runId", input.runId);
  assertSafeSegment("filename", input.filename);

  if (!ARTIFACT_CATEGORIES.has(input.category)) {
    throw new Error(`Unsupported artifact category: ${input.category}`);
  }

  return resolveSafeWorkspacePath(
    input.artifactsRoot,
    path.join("missions", input.missionId, input.runId, input.category, input.filename),
  );
}

export function resolveLegacyMissionArtifact(cwd: string, missionId: string, filename: string): string {
  assertSafeSegment("missionId", missionId);
  assertSafeSegment("filename", filename);
  return resolveSafeWorkspacePath(cwd, path.join("missions", missionId, filename));
}
