import { isAbsolute, relative, resolve } from "node:path";

const MISSION_ID_PATTERN = /^mission-[a-z0-9][a-z0-9-]*$/;

export function resolveInside(root: string, ...segments: string[]): string {
  const resolvedRoot = resolve(root);
  const candidate = resolve(resolvedRoot, ...segments);
  const child = relative(resolvedRoot, candidate);
  if (child.startsWith("..") || isAbsolute(child)) {
    throw new Error(`Resolved path escapes root: ${segments.join("/")}`);
  }
  return candidate;
}

export function missionDir(cwd: string, missionId: string): string {
  validateMissionId(missionId);
  return resolveInside(resolve(cwd, "missions"), missionId);
}

export function missionFile(cwd: string, missionId: string, name: string): string {
  return resolveInside(missionDir(cwd, missionId), name);
}

export function relativeToCwd(cwd: string, path: string): string {
  const relativePath = relative(resolve(cwd), resolve(path));
  if (relativePath === "") {
    return ".";
  }
  return relativePath.split("\\").join("/");
}

function validateMissionId(missionId: string): void {
  if (!MISSION_ID_PATTERN.test(missionId)) {
    throw new Error(`Invalid mission id: ${missionId}`);
  }
}
