import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { missionDir, missionFile, relativeToCwd, resolveInside } from "./paths.js";

export interface MissionMetadata {
  id: string;
  projectId: string;
  title: string;
  slug: string;
  rawRequest: string;
  status: "received" | "planned";
  priority: "P0" | "P1" | "P2" | "P3";
  riskLevel: "low" | "medium" | "high";
  branchName: string;
  missionDir: string;
  dryRun: true;
  createdAt: string;
  updatedAt: string;
  plannedAt?: string;
  codexDryRunAt?: string;
  qaDryRunAt?: string;
  fixDryRunAt?: string;
}

export async function readMissionMetadataIfExists(cwd: string, missionId: string): Promise<MissionMetadata | null> {
  try {
    return JSON.parse(await readMissionFile(cwd, missionId, "metadata.json")) as MissionMetadata;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeMissionMetadata(cwd: string, metadata: MissionMetadata): Promise<void> {
  await writeJsonAtPath(missionFile(cwd, metadata.id, "metadata.json"), metadata);
}

export async function readMissionFile(cwd: string, missionId: string, name: string): Promise<string> {
  return readFile(missionFile(cwd, missionId, name), "utf8");
}

export async function writeMissionFile(cwd: string, missionId: string, name: string, content: string): Promise<string> {
  const filePath = missionFile(cwd, missionId, name);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return relativeToCwd(cwd, filePath);
}

export async function writeJsonFile(cwd: string, parts: string[], value: unknown): Promise<string> {
  const filePath = resolveInside(cwd, ...parts);
  await writeJsonAtPath(filePath, value);
  return relativeToCwd(cwd, filePath);
}

export async function ensureArtifactDirs(cwd: string, missionId: string): Promise<string[]> {
  const dirs = [
    missionDir(cwd, missionId),
    missionFile(cwd, missionId, "artifacts/screenshots"),
    missionFile(cwd, missionId, "artifacts/traces"),
    missionFile(cwd, missionId, "artifacts/logs"),
  ];
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }
  return dirs.map((dir) => relativeToCwd(cwd, dir));
}

async function writeJsonAtPath(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
