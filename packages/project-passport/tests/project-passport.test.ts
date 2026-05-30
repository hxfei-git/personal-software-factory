import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseProjectPassport, readProjectPassport } from "../src/index.js";

const examplePath = new URL("../examples/project.passport.yaml", import.meta.url).pathname;

const validInlinePassport = [
  "id: sample",
  "name: Sample Project",
  "repo:",
  "  url: git@example.com:sample/repo.git",
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
  "    name: Smoke flow",
  "    priority: P1",
  "",
].join("\n");

const invalidMissingTestCommand = [
  "id: sample",
  "name: Sample Project",
  "repo:",
  "  url: git@example.com:sample/repo.git",
  "  default_branch: main",
  "runtime:",
  "  kind: web",
  "commands:",
  "  install: pnpm install",
  "  build: pnpm build",
  "  run_staging: pnpm dev",
  "urls:",
  "  production: \"\"",
  "  staging: \"\"",
  "quality_gates:",
  "  require_build: true",
  "core_flows:",
  "  - id: smoke",
  "    name: Smoke flow",
  "    priority: P1",
  "",
].join("\n");

describe("project passport parser", () => {
  it("reads and validates a Project Passport YAML file", async () => {
    const passport = await readProjectPassport(examplePath);

    expect(passport.id).toBe("ai-novelist");
    expect(passport.repo.default_branch).toBe("main");
    expect(passport.commands.test).toEqual(["pytest -q"]);
    expect(passport.commands.run_staging).toEqual([
      "ai-novelist web --host 127.0.0.1 --port 8000",
    ]);
  });

  it("normalizes string commands into arrays", () => {
    const passport = parseProjectPassport(validInlinePassport);

    expect(passport.commands.install).toEqual(["pnpm install"]);
    expect(passport.commands.test).toEqual(["pnpm test"]);
  });

  it("rejects a passport missing commands.test", () => {
    expect(() => parseProjectPassport(invalidMissingTestCommand)).toThrow(/commands/);
  });

  it("surfaces validation errors for invalid files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "psf-passport-"));
    const invalidPath = join(dir, "project.passport.yaml");
    await writeFile(invalidPath, "id: ''\nname: ''\n", "utf8");

    await expect(readProjectPassport(invalidPath)).rejects.toThrow();

    await rm(dir, { recursive: true, force: true });
  });
});
