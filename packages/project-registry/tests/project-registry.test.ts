import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectRegistryError, findProjectById, scanProjectRegistry } from "../src/index.js";

describe("project registry", () => {
  it("scans and normalizes project passports", async () => {
    const root = await mkdtemp(join(tmpdir(), "psf-registry-"));
    try {
      const projectDir = join(root, "sample");
      await writePassport(projectDir, validPassportYaml("sample", "Sample"));

      const projects = await scanProjectRegistry(root);
      expect(projects).toHaveLength(1);
      expect(projects[0]?.passport.commands.install).toEqual(["pnpm install"]);
      expect(findProjectById(projects, "sample")?.project.id).toBe("sample");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips child directories without project passports", async () => {
    const root = await mkdtemp(join(tmpdir(), "psf-registry-"));
    try {
      await mkdir(join(root, "notes"));
      await writePassport(join(root, "sample"), validPassportYaml("sample", "Sample"));

      const projects = await scanProjectRegistry(root);

      expect(projects.map((entry) => entry.project.id)).toEqual(["sample"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("throws a stable registry error for invalid project passports", async () => {
    const root = await mkdtemp(join(tmpdir(), "psf-registry-"));
    try {
      const projectDir = join(root, "broken");
      await mkdir(projectDir);
      const passportPath = join(projectDir, "project.passport.yaml");
      await writeFile(passportPath, ["id: broken", "name: Broken", ""].join("\n"));

      await expect(scanProjectRegistry(root)).rejects.toBeInstanceOf(ProjectRegistryError);
      await expect(scanProjectRegistry(root)).rejects.toMatchObject({
        code: "INVALID_PROJECT_PASSPORT",
        details: expect.objectContaining({ passportPath }),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns projects in deterministic sorted order", async () => {
    const root = await mkdtemp(join(tmpdir(), "psf-registry-"));
    try {
      await writePassport(join(root, "zeta"), validPassportYaml("zeta", "Zeta"));
      await writePassport(join(root, "alpha"), validPassportYaml("alpha", "Alpha"));

      const projects = await scanProjectRegistry(root);

      expect(projects.map((entry) => entry.project.id)).toEqual(["alpha", "zeta"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function writePassport(projectDir: string, content: string) {
  await mkdir(projectDir);
  await writeFile(join(projectDir, "project.passport.yaml"), content);
}

function validPassportYaml(id: string, name: string): string {
  return [
    `id: ${id}`,
    `name: ${name}`,
    "repo:",
    `  url: https://example.com/${id}.git`,
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
  ].join("\n");
}
