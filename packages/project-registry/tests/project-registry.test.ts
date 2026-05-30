import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findProjectById, scanProjectRegistry } from "../src/index.js";

describe("project registry", () => {
  it("scans and normalizes project passports", async () => {
    const root = await mkdtemp(join(tmpdir(), "psf-registry-"));
    const projectDir = join(root, "sample");
    await mkdir(projectDir);
    await writeFile(join(projectDir, "project.passport.yaml"), [
      "id: sample",
      "name: Sample",
      "repo:",
      "  url: https://example.com/sample.git",
      "  default_branch: main",
      "runtime:",
      "  kind: web",
      "commands:",
      "  install: pnpm install",
      "  test: pnpm test",
      "  build: pnpm build",
      "  run_staging: pnpm dev",
      "urls:",
      "  production: \"\"",
      "  staging: \"\"",
      "quality_gates:",
      "  require_build: true",
      "core_flows:",
      "  - id: smoke",
      "    name: Smoke",
      "    priority: P1",
      "",
    ].join("\n"));

    const projects = await scanProjectRegistry(root);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.passport.commands.install).toEqual(["pnpm install"]);
    expect(findProjectById(projects, "sample")?.project.id).toBe("sample");
    await rm(root, { recursive: true, force: true });
  });
});
