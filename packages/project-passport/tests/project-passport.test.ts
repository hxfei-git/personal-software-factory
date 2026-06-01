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

const passportWithoutOptionalUrls = [
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
  "  production: https://example.com",
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

const extendedInlinePassport = [
  "id: sample",
  "name: Sample Project",
  "repo:",
  "  url: git@example.com:sample/repo.git",
  "  default_branch: main",
  "runtime:",
  "  kind: web",
  "paths:",
  "  workspace: .",
  "  app: web/frontend",
  "  artifacts: artifacts/ai-novelist",
  "commands:",
  "  install: pnpm install",
  "  dev: pnpm dev",
  "  test: pnpm test",
  "  build: pnpm build",
  "  e2e:",
  "    - pnpm playwright test",
  "  lint: pnpm lint",
  "  run_staging: pnpm dev -- --host 127.0.0.1 --port 5173",
  "urls:",
  "  production: \"\"",
  "  local: http://127.0.0.1:5173",
  "  staging: http://127.0.0.1:5173",
  "quality_gates:",
  "  require_build: true",
  "risk_rules:",
  "  protected_branches:",
  "    - main",
  "  manual_approval_required:",
  "    - destructive-data-change",
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
    expect(passport.commands.dev).toBeUndefined();
    expect(passport.commands.e2e).toBeUndefined();
    expect(passport.commands.lint).toBeUndefined();
    expect(passport.paths).toBeUndefined();
    expect(passport.risk_rules).toBeUndefined();
    expect(passport.urls.local).toBeUndefined();
  });

  it("accepts passports without optional local or staging urls", () => {
    const passport = parseProjectPassport(passportWithoutOptionalUrls);

    expect(passport.urls.production).toBe("https://example.com");
    expect(passport.urls.local).toBeUndefined();
    expect(passport.urls.staging).toBeUndefined();
  });

  it("accepts and normalizes optional real-loop readiness fields", () => {
    const passport = parseProjectPassport(extendedInlinePassport);

    expect(passport.paths).toEqual({
      workspace: ".",
      app: "web/frontend",
      artifacts: "artifacts/ai-novelist",
    });
    expect(passport.commands.dev).toEqual(["pnpm dev"]);
    expect(passport.commands.e2e).toEqual(["pnpm playwright test"]);
    expect(passport.commands.lint).toEqual(["pnpm lint"]);
    expect(passport.urls.local).toBe("http://127.0.0.1:5173");
    expect(passport.urls.staging).toBe("http://127.0.0.1:5173");
    expect(passport.risk_rules).toEqual({
      protected_branches: ["main"],
      manual_approval_required: ["destructive-data-change"],
    });
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
