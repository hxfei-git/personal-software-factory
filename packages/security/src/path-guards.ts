import os from "node:os";
import path from "node:path";

function splitSegments(candidate: string): string[] {
  return candidate.split(/[\\/]+/).filter(Boolean);
}

function hasTraversal(candidate: string): boolean {
  return splitSegments(candidate).includes("..");
}

export function assertInsideWorkspace(candidatePath: string, workspaceRoot: string): void {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedRoot = path.resolve(workspaceRoot);

  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Path is outside workspace root: ${candidatePath}`);
  }
}

export function assertNotForbiddenPath(candidatePath: string): void {
  const trimmed = candidatePath.trim();
  const normalized = path.normalize(trimmed);
  const lower = normalized.toLowerCase();
  const basename = path.basename(lower);
  const segments = splitSegments(lower);
  const home = os.homedir();

  if (trimmed.length === 0) {
    throw new Error("Path is empty.");
  }

  if (trimmed === "/" || trimmed === path.parse(path.resolve(trimmed)).root) {
    throw new Error("Root filesystem path is forbidden.");
  }

  if (trimmed === "~" || trimmed.startsWith("~/") || (home.length > 0 && path.resolve(trimmed) === home)) {
    throw new Error("Home directory paths are forbidden.");
  }

  if (lower === "/etc/passwd" || lower.startsWith("/etc/")) {
    throw new Error("System configuration paths are forbidden.");
  }

  if (segments.includes(".ssh")) {
    throw new Error("SSH paths are forbidden.");
  }

  if (basename === ".env" || basename.startsWith(".env.")) {
    throw new Error("Environment files are forbidden.");
  }

  if (
    ["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", ".npmrc", ".netrc"].includes(basename) ||
    /(?:credential|credentials|secret|secrets|token|password|cookie|session|jwt|api[_-]?key)/i.test(basename)
  ) {
    throw new Error("Credential-like paths are forbidden.");
  }
}

export function resolveSafeWorkspacePath(workspaceRoot: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error("Workspace path must be relative.");
  }

  if (hasTraversal(relativePath)) {
    throw new Error("Path traversal is forbidden.");
  }

  assertNotForbiddenPath(relativePath);
  const resolved = path.resolve(workspaceRoot, relativePath);
  assertInsideWorkspace(resolved, workspaceRoot);
  assertNotForbiddenPath(resolved);
  return resolved;
}
