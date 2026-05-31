import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Artifact } from "@psf/mission-schema";
import { assertInsideWorkspace, assertNotForbiddenPath, redactJson, redactText } from "@psf/security";
import { buildArtifactPath, type ArtifactCategory } from "./paths.js";
import { buildRetentionMetadata, type RetentionClass } from "./retention.js";

export interface SaveArtifactInput {
  missionId: string;
  workerRunId: string;
  type: string;
  name: string;
  content?: string;
  sourcePath?: string;
  metadata?: Record<string, unknown>;
}

const CATEGORY_BY_TYPE: Array<[RegExp, ArtifactCategory]> = [
  [/^(mission|acceptance|technical_notes|risk_notes)$/u, "mission"],
  [/^(codex_|dev_summary$)/u, "codex"],
  [/^(qa_|bugs_json$|playwright_trace$|screenshot$|generated_test$)/u, "qa"],
  [/^fix_/u, "fix"],
  [/^deploy/u, "deploy"],
  [/^monitor/u, "monitor"],
  [/^(integration|github|coolify|uptime_kuma|plane)/u, "integration"],
  [/^(log$|logs?_|.*_log$)/u, "logs"],
];

function categoryForType(type: string): ArtifactCategory {
  for (const [pattern, category] of CATEGORY_BY_TYPE) {
    if (pattern.test(type)) {
      return category;
    }
  }
  return "mission";
}

function retentionForType(type: string, pathOnly: boolean): RetentionClass {
  if (type === "log" || type.endsWith("_log") || type.startsWith("logs") || type === "screenshot" || type === "playwright_trace") {
    return "short";
  }
  if (type.startsWith("deploy") || type === "dev_summary") {
    return "release";
  }
  if (type.startsWith("audit")) {
    return "audit";
  }
  return pathOnly ? "short" : "mission";
}

function artifactRoot(): string {
  return path.resolve(process.cwd(), "artifacts");
}

function relativeToCwd(absolutePath: string): string {
  const relativePath = path.relative(process.cwd(), absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Artifact path is outside the current working directory: ${absolutePath}`);
  }
  return relativePath.split(path.sep).join("/");
}

function artifactPathFor(input: SaveArtifactInput): string {
  return buildArtifactPath({
    artifactsRoot: artifactRoot(),
    missionId: input.missionId,
    runId: input.workerRunId,
    category: categoryForType(input.type),
    filename: input.name,
  });
}

function artifactMetadata(input: SaveArtifactInput, pathOnly: boolean): Record<string, unknown> {
  const retentionClass = retentionForType(input.type, pathOnly);
  return {
    ...redactJson(input.metadata ?? {}),
    ...buildRetentionMetadata(retentionClass),
    pathOnly,
  };
}

function baseArtifact(input: SaveArtifactInput, absolutePath: string, size: number, pathOnly: boolean): Omit<Artifact, "content"> {
  return {
    id: randomUUID(),
    mission_id: input.missionId,
    type: input.type,
    path: relativeToCwd(absolutePath),
    worker_run_id: input.workerRunId,
    size,
    metadata: artifactMetadata(input, pathOnly),
    created_at: new Date().toISOString(),
  };
}

export async function saveTextArtifact(input: SaveArtifactInput): Promise<Artifact> {
  const absolutePath = artifactPathFor(input);
  const redactedContent = redactText(input.content ?? "");

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, redactedContent, "utf8");

  return {
    ...baseArtifact(input, absolutePath, Buffer.byteLength(redactedContent), false),
    content: redactedContent,
    mime_type: "text/plain; charset=utf-8",
  };
}

export async function savePathArtifact(input: SaveArtifactInput): Promise<Artifact> {
  const absolutePath = artifactPathFor(input);
  const sourcePath = input.sourcePath ? path.resolve(input.sourcePath) : absolutePath;

  assertInsideWorkspace(sourcePath, artifactRoot());
  assertNotForbiddenPath(sourcePath);

  if (sourcePath !== absolutePath) {
    throw new Error("Path-only artifacts must already live at the canonical artifact path.");
  }

  let size = 0;
  try {
    const sourceStat = await stat(sourcePath);
    size = sourceStat.size;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }

  return {
    ...baseArtifact(input, absolutePath, size, true),
    mime_type: "application/octet-stream",
  };
}
