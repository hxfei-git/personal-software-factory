import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildArtifactPath,
  buildRetentionMetadata,
  cleanupExpiredArtifacts,
  resolveLegacyMissionArtifact,
  savePathArtifact,
  saveTextArtifact,
} from "../src/index.js";

let originalCwd: string;
let tempRoot: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempRoot = mkdtempSync(path.join(tmpdir(), "psf-artifacts-"));
  process.chdir(tempRoot);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tempRoot, { force: true, recursive: true });
});

describe("artifact path policy", () => {
  it("builds canonical real-mode paths under artifacts/missions", () => {
    const artifactsRoot = path.resolve("/repo/personal-software-factory/artifacts");

    const result = buildArtifactPath({
      artifactsRoot,
      missionId: "mission-123",
      runId: "run-456",
      category: "qa",
      filename: "qa-report.md",
    });

    expect(result).toBe(path.join(artifactsRoot, "missions", "mission-123", "run-456", "qa", "qa-report.md"));
  });

  it("resolves legacy demo mission files without changing the canonical write path", () => {
    const cwd = path.resolve("/repo/personal-software-factory");

    expect(resolveLegacyMissionArtifact(cwd, "mission-123", "mission.md")).toBe(
      path.join(cwd, "missions", "mission-123", "mission.md"),
    );
    expect(buildArtifactPath({
      artifactsRoot: path.join(cwd, "artifacts"),
      missionId: "mission-123",
      runId: "run-456",
      category: "mission",
      filename: "mission.md",
    })).toBe(path.join(cwd, "artifacts", "missions", "mission-123", "run-456", "mission", "mission.md"));
  });

  it("rejects unsafe path segments", () => {
    const artifactsRoot = path.resolve("/repo/personal-software-factory/artifacts");

    expect(() => buildArtifactPath({
      artifactsRoot,
      missionId: "../mission-123",
      runId: "run-456",
      category: "qa",
      filename: "qa-report.md",
    })).toThrow(/path|traversal|outside|forbidden/i);

    expect(() => buildArtifactPath({
      artifactsRoot,
      missionId: "mission-123",
      runId: "run-456",
      category: "qa",
      filename: "../qa-report.md",
    })).toThrow(/path|traversal|outside|forbidden/i);

    expect(() => resolveLegacyMissionArtifact("/repo/personal-software-factory", "mission-123", "/tmp/report.md"))
      .toThrow(/relative|path|outside|forbidden/i);
  });
});

describe("artifact store", () => {
  it("writes small text artifacts with redacted content and metadata", async () => {
    const artifact = await saveTextArtifact({
      missionId: "mission-123",
      workerRunId: "run-456",
      type: "qa_report",
      name: "qa-report.md",
      content: "QA passed\nGITHUB_TOKEN=ghp_example",
      metadata: {
        source: "playwright",
        token: "ghp_metadata",
      },
    });

    const artifactPath = path.join(tempRoot, artifact.path);
    const written = readFileSync(artifactPath, "utf8");

    expect(artifact.path).toBe("artifacts/missions/mission-123/run-456/qa/qa-report.md");
    expect(artifact.worker_run_id).toBe("run-456");
    expect(artifact.type).toBe("qa_report");
    expect(artifact.content).toBe(written);
    expect(written).toContain("[REDACTED]");
    expect(written).not.toContain("ghp_example");
    expect(JSON.stringify(artifact.metadata)).not.toContain("ghp_metadata");
    expect(artifact.metadata).toMatchObject({
      source: "playwright",
      token: "[REDACTED]",
      retentionClass: "mission",
    });
    expect(artifact.size).toBe(Buffer.byteLength(written));
  });

  it("records large binary-like artifacts as path-only without reading source content", async () => {
    const binaryPath = path.join(tempRoot, "artifacts", "missions", "mission-123", "run-456", "qa", "screenshot.png");
    mkdirSync(path.dirname(binaryPath), { recursive: true });
    writeFileSync(binaryPath, Buffer.from([0, 1, 2, 3, 4, 5]));

    const artifact = await savePathArtifact({
      missionId: "mission-123",
      workerRunId: "run-456",
      type: "screenshot",
      name: "screenshot.png",
      sourcePath: binaryPath,
      metadata: {
        viewport: "desktop",
        apiToken: "secret-token",
      },
    });

    expect(artifact.path).toBe("artifacts/missions/mission-123/run-456/qa/screenshot.png");
    expect(artifact.content).toBeUndefined();
    expect(artifact.size).toBe(6);
    expect(artifact.metadata).toMatchObject({
      viewport: "desktop",
      apiToken: "[REDACTED]",
      retentionClass: "short",
      pathOnly: true,
    });
  });

  it("rejects unsafe artifact names before writing", async () => {
    await expect(saveTextArtifact({
      missionId: "mission-123",
      workerRunId: "run-456",
      type: "qa_report",
      name: "../qa-report.md",
      content: "unsafe",
    })).rejects.toThrow(/path|segment|traversal|outside|forbidden/i);

    expect(existsSync(path.join(tempRoot, "artifacts"))).toBe(false);
  });
});

describe("artifact retention", () => {
  it("builds retention metadata for supported retention classes", () => {
    expect(buildRetentionMetadata("short", new Date("2026-01-01T00:00:00.000Z"))).toMatchObject({
      retentionClass: "short",
      retainUntil: "2026-01-08T00:00:00.000Z",
    });
    expect(buildRetentionMetadata("audit", new Date("2026-01-01T00:00:00.000Z"))).toEqual({
      retentionClass: "audit",
      retainUntil: null,
    });
  });

  it("previews expired artifact cleanup as a dry run by default", async () => {
    const artifactsRoot = path.join(tempRoot, "artifacts");
    const expiredPath = path.join(artifactsRoot, "missions", "mission-123", "run-456", "logs", "old.log");
    mkdirSync(path.dirname(expiredPath), { recursive: true });
    writeFileSync(expiredPath, "old log");

    const result = await cleanupExpiredArtifacts({
      artifactsRoot,
      entries: [{
        path: expiredPath,
        retentionClass: "short",
        createdAt: "2026-01-01T00:00:00.000Z",
      }],
      now: new Date("2026-01-10T00:00:00.000Z"),
    });

    expect(result).toEqual({
      dryRun: true,
      candidates: [expiredPath],
      deleted: [],
    });
    expect(existsSync(expiredPath)).toBe(true);
  });

  it("deletes expired artifacts only when dryRun is explicitly false", async () => {
    const artifactsRoot = path.join(tempRoot, "artifacts");
    const expiredPath = path.join(artifactsRoot, "missions", "mission-123", "run-456", "logs", "old.log");
    mkdirSync(path.dirname(expiredPath), { recursive: true });
    writeFileSync(expiredPath, "old log");

    const result = await cleanupExpiredArtifacts({
      artifactsRoot,
      dryRun: false,
      entries: [{
        path: expiredPath,
        retentionClass: "short",
        createdAt: "2026-01-01T00:00:00.000Z",
      }],
      now: new Date("2026-01-10T00:00:00.000Z"),
    });

    expect(result.deleted).toEqual([expiredPath]);
    expect(existsSync(expiredPath)).toBe(false);
  });

  it("refuses cleanup candidates outside the artifact root", async () => {
    await expect(cleanupExpiredArtifacts({
      artifactsRoot: path.join(tempRoot, "artifacts"),
      dryRun: false,
      entries: [{
        path: path.join(tempRoot, "outside.log"),
        retentionClass: "short",
        createdAt: "2026-01-01T00:00:00.000Z",
      }],
      now: new Date("2026-01-10T00:00:00.000Z"),
    })).rejects.toThrow(/outside|workspace|root/i);
  });
});
