# Phase 2-4 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Personal Software Factory core foundation: shared schemas, Project Passport parsing, Prisma/PostgreSQL persistence, Mission state machine, and Orchestrator API MVP.

**Architecture:** Shared contracts live in `packages/mission-schema`, Project Passport YAML parsing lives in `packages/project-passport`, persistence lives in `packages/db`, Mission transition rules live in `packages/mission-core`, and Fastify routes live in `apps/orchestrator-api`. API routes call services/storage abstractions instead of raw Prisma calls, and state transitions always produce MissionEvent records.

**Tech Stack:** TypeScript, pnpm workspace, Zod, YAML, Prisma, PostgreSQL, Fastify, Vitest, tsx.

---

## File Structure

Create and modify these files:

- Modify: `package.json` for root scripts: `build`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:seed`, and `dev:api`.
- Modify: `turbo.json` to keep build/test/typecheck tasks cache-safe.
- Modify: `.env.example` to include `DATABASE_URL` and Orchestrator API settings without real secrets.
- Create: `packages/mission-schema/src/status.ts` for Mission status constants and helpers.
- Create: `packages/mission-schema/src/schemas.ts` for Zod schemas and exported TypeScript types.
- Create: `packages/mission-schema/src/examples.ts` for valid example objects.
- Create: `packages/mission-schema/src/index.ts` for public exports.
- Create: `packages/mission-schema/tests/schemas.test.ts` for schema validation tests.
- Modify: `packages/mission-schema/package.json` and `packages/mission-schema/README.md`.
- Create: `packages/project-passport/src/index.ts` for YAML parsing and normalization.
- Create: `packages/project-passport/examples/project.passport.yaml` for the example passport.
- Create: `packages/project-passport/tests/project-passport.test.ts` for parser tests.
- Modify: `packages/project-passport/package.json` and `packages/project-passport/README.md`.
- Create: `packages/db/package.json`.
- Create: `packages/db/prisma/schema.prisma`.
- Create: `packages/db/prisma/migrations/000001_init/migration.sql`.
- Create: `packages/db/src/client.ts`.
- Create: `packages/db/src/index.ts`.
- Create: `packages/db/src/seed.ts`.
- Create: `packages/db/README.md`.
- Create: `packages/mission-core/package.json`.
- Create: `packages/mission-core/src/state-machine.ts`.
- Create: `packages/mission-core/src/index.ts`.
- Create: `packages/mission-core/tests/state-machine.test.ts`.
- Create: `packages/mission-core/README.md`.
- Create: `apps/orchestrator-api/src/errors.ts`.
- Create: `apps/orchestrator-api/src/storage.ts`.
- Create: `apps/orchestrator-api/src/services.ts`.
- Create: `apps/orchestrator-api/src/server.ts`.
- Create: `apps/orchestrator-api/src/index.ts`.
- Create: `apps/orchestrator-api/tests/api.test.ts`.
- Modify: `apps/orchestrator-api/package.json` and `apps/orchestrator-api/README.md`.
- Create: `docs/api.md`.
- Create: `docs/schema.md`.
- Create: `docs/state-machine.md`.
- Create: `docs/storage.md`.
- Create: `docs/progress.md`.
- Modify: `README.md`.

## Task 1: Workspace Tooling And Dependencies

**Files:**
- Modify: `package.json`
- Modify: `turbo.json`
- Modify: `.env.example`

- [ ] **Step 1: Update root scripts**

Replace the root `scripts` block with:

```json
{
  "check": "pnpm typecheck && pnpm test",
  "typecheck": "turbo run typecheck",
  "test": "turbo run test",
  "lint": "turbo run lint",
  "build": "turbo run build",
  "db:generate": "pnpm --filter @psf/db prisma generate --schema prisma/schema.prisma",
  "db:migrate": "pnpm --filter @psf/db prisma migrate deploy --schema prisma/schema.prisma",
  "db:seed": "pnpm --filter @psf/db seed",
  "dev:api": "pnpm --filter @psf/orchestrator-api dev",
  "dev": "pnpm dev:api"
}
```

- [ ] **Step 2: Add root dev dependencies**

Add root `devDependencies`:

```json
{
  "turbo": "^2.5.0",
  "typescript": "^5.8.0",
  "vitest": "^3.2.0",
  "tsx": "^4.19.0"
}
```

- [ ] **Step 3: Update `.env.example`**

Set development defaults:

```dotenv
DATABASE_URL="postgresql://psf:psf_dev_password@localhost:5432/psf?schema=public"
ORCHESTRATOR_HOST="127.0.0.1"
ORCHESTRATOR_PORT="3000"
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
pnpm install
```

Expected: dependencies install and `pnpm-lock.yaml` updates.

- [ ] **Step 5: Commit**

```bash
git add package.json turbo.json .env.example pnpm-lock.yaml
git commit -m "配置二至四阶段工具链" -m "更新根脚本和开发依赖，补充数据库与 Orchestrator API 的本地环境变量示例。"
```

## Task 2: Mission Schema Package

**Files:**
- Modify: `packages/mission-schema/package.json`
- Create: `packages/mission-schema/src/status.ts`
- Create: `packages/mission-schema/src/schemas.ts`
- Create: `packages/mission-schema/src/examples.ts`
- Create: `packages/mission-schema/src/index.ts`
- Create: `packages/mission-schema/tests/schemas.test.ts`
- Modify: `packages/mission-schema/README.md`

- [ ] **Step 1: Update package metadata**

Use this package configuration:

```json
{
  "name": "@psf/mission-schema",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Shared runtime schemas and TypeScript types for Personal Software Factory.",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check": "pnpm typecheck && pnpm test",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "lint": "tsc --noEmit -p tsconfig.json",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Add `tsconfig.json`**

Create `packages/mission-schema/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Write failing schema tests**

Create `packages/mission-schema/tests/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  bugReportExample,
  missionExample,
  projectPassportExample,
  qaReportExample,
} from "../src/examples.js";
import {
  BugReportSchema,
  MissionSchema,
  ProjectPassportSchema,
  QAReportSchema,
} from "../src/schemas.js";
import { MissionStatus } from "../src/status.js";

describe("mission schemas", () => {
  it("validates the MissionStatus list", () => {
    expect(MissionStatus.received).toBe("received");
    expect(Object.values(MissionStatus)).toContain("production_deploying");
  });

  it("accepts valid examples", () => {
    expect(MissionSchema.parse(missionExample).status).toBe("received");
    expect(ProjectPassportSchema.parse(projectPassportExample).id).toBe("ai-novelist");
    expect(BugReportSchema.parse(bugReportExample).severity).toBe("P1");
    expect(QAReportSchema.parse(qaReportExample).status).toBe("passed");
  });

  it("rejects a Mission without a project id", () => {
    const result = MissionSchema.safeParse({ ...missionExample, project_id: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["project_id"]);
    }
  });

  it("rejects an invalid Project Passport missing commands", () => {
    const result = ProjectPassportSchema.safeParse({
      ...projectPassportExample,
      commands: undefined,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests to verify failure**

Run:

```bash
pnpm --filter @psf/mission-schema test
```

Expected: FAIL because source files do not exist yet.

- [ ] **Step 5: Implement Mission status constants**

Create `packages/mission-schema/src/status.ts`:

```ts
export const MissionStatus = {
  received: "received",
  planning: "planning",
  planned: "planned",
  approval_required: "approval_required",
  dev_queued: "dev_queued",
  dev_running: "dev_running",
  build_running: "build_running",
  test_running: "test_running",
  staging_deploying: "staging_deploying",
  staging_ready: "staging_ready",
  qa_running: "qa_running",
  bugs_found: "bugs_found",
  fixing: "fixing",
  regression_running: "regression_running",
  ready_for_review: "ready_for_review",
  release_approval: "release_approval",
  production_deploying: "production_deploying",
  released: "released",
  paused: "paused",
  blocked: "blocked",
  needs_human: "needs_human",
  failed: "failed",
  cancelled: "cancelled",
} as const;

export type MissionStatusValue = (typeof MissionStatus)[keyof typeof MissionStatus];

export const missionStatusValues = Object.values(MissionStatus);
```

- [ ] **Step 6: Implement schemas**

Create `packages/mission-schema/src/schemas.ts` with Zod object schemas for all required entities. Use `z.enum([...missionStatusValues] as [MissionStatusValue, ...MissionStatusValue[]])` for statuses, `z.string().min(1)` for required ids and names, `z.record(z.unknown())` for payload metadata, and command arrays for Project Passport commands.

- [ ] **Step 7: Implement examples and exports**

Create `packages/mission-schema/src/examples.ts` with valid examples for Project, ProjectPassport, Mission, MissionEvent, BugReport, QAReport, Artifact, Approval, WorkerRun, and IntegrationStatus.

Create `packages/mission-schema/src/index.ts`:

```ts
export * from "./status.js";
export * from "./schemas.js";
export * from "./examples.js";
```

- [ ] **Step 8: Run schema tests and typecheck**

Run:

```bash
pnpm --filter @psf/mission-schema test
pnpm --filter @psf/mission-schema typecheck
```

Expected: both pass.

- [ ] **Step 9: Update README**

Document exported schemas, example data, and test commands in `packages/mission-schema/README.md`.

- [ ] **Step 10: Commit**

```bash
git add packages/mission-schema
git commit -m "实现任务共享 Schema" -m "为 Personal Software Factory 增加 Mission、Project、QA、Bug、Artifact、Approval、WorkerRun 等共享 Zod Schema、示例数据和测试。"
```

## Task 3: Project Passport Parser

**Files:**
- Modify: `packages/project-passport/package.json`
- Create: `packages/project-passport/tsconfig.json`
- Create: `packages/project-passport/src/index.ts`
- Create: `packages/project-passport/examples/project.passport.yaml`
- Create: `packages/project-passport/tests/project-passport.test.ts`
- Modify: `packages/project-passport/README.md`

- [ ] **Step 1: Update package metadata**

Use dependencies on YAML and `@psf/mission-schema`:

```json
{
  "name": "@psf/project-passport",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Project Passport parser and validator for Personal Software Factory.",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check": "pnpm typecheck && pnpm test",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "lint": "tsc --noEmit -p tsconfig.json",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@psf/mission-schema": "workspace:*",
    "yaml": "^2.8.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Add tsconfig**

Create `packages/project-passport/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Write parser tests**

Create tests for:

- reading `examples/project.passport.yaml`;
- normalizing string commands into arrays;
- rejecting missing `commands.test`;
- surfacing Zod issues for invalid files.

- [ ] **Step 4: Implement parser**

Create `packages/project-passport/src/index.ts` with:

```ts
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import {
  ProjectPassportSchema,
  type ProjectPassport,
} from "@psf/mission-schema";

export async function readProjectPassport(path: string): Promise<ProjectPassport> {
  const raw = await readFile(path, "utf8");
  return parseProjectPassport(raw);
}

export function parseProjectPassport(raw: string): ProjectPassport {
  const parsed = parse(raw);
  return normalizeProjectPassport(ProjectPassportSchema.parse(parsed));
}

export function normalizeProjectPassport(passport: ProjectPassport): ProjectPassport {
  return {
    ...passport,
    commands: {
      install: normalizeCommands(passport.commands.install),
      test: normalizeCommands(passport.commands.test),
      build: normalizeCommands(passport.commands.build),
      run_staging: normalizeCommands(passport.commands.run_staging),
    },
  };
}

function normalizeCommands(commands: string | string[]): string[] {
  return Array.isArray(commands) ? commands : [commands];
}
```

- [ ] **Step 5: Add example YAML**

Create `packages/project-passport/examples/project.passport.yaml` with the ai-novelist fields from the approved design, including `commands.run_staging`.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @psf/project-passport test
pnpm --filter @psf/project-passport typecheck
```

Expected: both pass.

- [ ] **Step 7: Update README and commit**

```bash
git add packages/project-passport
git commit -m "实现项目护照解析" -m "新增 project.passport.yaml 的 YAML 读取、运行时校验、命令规范化、示例文件和测试。"
```

## Task 4: Prisma Database Package

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/000001_init/migration.sql`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/seed.ts`
- Create: `packages/db/README.md`

- [ ] **Step 1: Add database package metadata**

Use Prisma and TypeScript scripts:

```json
{
  "name": "@psf/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Prisma database package for Personal Software Factory.",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check": "pnpm typecheck",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "pnpm typecheck",
    "lint": "tsc --noEmit -p tsconfig.json",
    "build": "tsc -p tsconfig.json",
    "prisma": "prisma",
    "seed": "tsx src/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.8.0"
  },
  "devDependencies": {
    "prisma": "^6.8.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Add Prisma schema**

Create models for `Project`, `Mission`, `MissionEvent`, `WorkerRun`, `QARun`, `Bug`, `Artifact`, `Deployment`, `Monitor`, and `Approval`. Use string ids, JSON payload fields, status strings, timestamps, and relations from Project to Mission and Mission to child records.

- [ ] **Step 3: Add migration SQL**

Create `packages/db/prisma/migrations/000001_init/migration.sql` matching the Prisma schema. Include indexes on `Mission.projectId`, `Mission.status`, `MissionEvent.missionId`, and `MissionEvent.createdAt`.

- [ ] **Step 4: Add client and seed**

Create `packages/db/src/client.ts`:

```ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
export type { PrismaClient };
```

Create `packages/db/src/index.ts`:

```ts
export * from "./client.js";
```

Create `packages/db/src/seed.ts` to upsert `ai-novelist`, create one sample Mission, and append a `mission.created` event.

- [ ] **Step 5: Generate Prisma client**

Run:

```bash
pnpm db:generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 6: Run migration and seed**

Run:

```bash
sudo docker compose up -d postgres redis
pnpm db:migrate
pnpm db:seed
```

Expected: migration deploys and seed reports the sample project and mission.

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm --filter @psf/db typecheck
git add packages/db package.json pnpm-lock.yaml
git commit -m "建立数据库模型" -m "新增 Prisma PostgreSQL 数据模型、初始化迁移、数据库客户端和 ai-novelist 示例种子数据。"
```

## Task 5: Mission State Machine

**Files:**
- Create: `packages/mission-core/package.json`
- Create: `packages/mission-core/tsconfig.json`
- Create: `packages/mission-core/src/state-machine.ts`
- Create: `packages/mission-core/src/index.ts`
- Create: `packages/mission-core/tests/state-machine.test.ts`
- Create: `packages/mission-core/README.md`

- [ ] **Step 1: Add mission-core metadata**

Use dependency on `@psf/mission-schema`:

```json
{
  "name": "@psf/mission-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Mission state machine and core transition rules for Personal Software Factory.",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check": "pnpm typecheck && pnpm test",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "lint": "tsc --noEmit -p tsconfig.json",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@psf/mission-schema": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Write state machine tests**

Cover:

- normal flow from `received` to `ready_for_review`;
- bug loop from `qa_running` back to `qa_running`;
- release flow to `released`;
- invalid jump `received -> released`;
- final state cannot transition;
- any non-final can pause or cancel;
- running states can fail;
- every transition returns a MissionEvent-shaped object.

- [ ] **Step 3: Implement state machine**

Create `packages/mission-core/src/state-machine.ts` with explicit transition maps, final/running status sets, `canTransition`, `assertTransition`, and `transitionMission`.

Use event type format:

```ts
`mission.transition.${from}.${to}`
```

Use event message format:

```ts
`Mission transitioned from ${from} to ${to}`
```

- [ ] **Step 4: Export and document**

Create `packages/mission-core/src/index.ts`:

```ts
export * from "./state-machine.js";
```

Document valid flows in `packages/mission-core/README.md`.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm --filter @psf/mission-core test
pnpm --filter @psf/mission-core typecheck
git add packages/mission-core
git commit -m "实现任务状态机" -m "新增可复用 Mission 状态机、合法流转校验、事件生成规则和单元测试。"
```

## Task 6: Orchestrator API MVP

**Files:**
- Modify: `apps/orchestrator-api/package.json`
- Create: `apps/orchestrator-api/tsconfig.json`
- Create: `apps/orchestrator-api/src/errors.ts`
- Create: `apps/orchestrator-api/src/storage.ts`
- Create: `apps/orchestrator-api/src/services.ts`
- Create: `apps/orchestrator-api/src/server.ts`
- Create: `apps/orchestrator-api/src/index.ts`
- Create: `apps/orchestrator-api/tests/api.test.ts`
- Modify: `apps/orchestrator-api/README.md`

- [ ] **Step 1: Update API package metadata**

Use Fastify, Prisma DB package, mission schema, and mission core dependencies:

```json
{
  "name": "@psf/orchestrator-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Personal Software Factory Orchestrator API MVP.",
  "scripts": {
    "check": "pnpm typecheck && pnpm test",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "lint": "tsc --noEmit -p tsconfig.json",
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "@psf/db": "workspace:*",
    "@psf/mission-core": "workspace:*",
    "@psf/mission-schema": "workspace:*",
    "fastify": "^5.3.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Write API tests first**

Create tests using Fastify injection for:

- `GET /health`;
- `GET /projects`;
- `GET /projects/:id`;
- `POST /missions` initial status `received`;
- `GET /missions`;
- `GET /missions/:id`;
- successful `POST /missions/:id/transition`;
- illegal transition returns `INVALID_MISSION_TRANSITION`;
- `POST /missions/:id/events`;
- `GET /missions/:id/events`.

- [ ] **Step 3: Implement error helpers**

Create `apps/orchestrator-api/src/errors.ts` with `ApiError`, `notFound`, `badRequest`, and `invalidTransition` helpers. Include stable `code` strings.

- [ ] **Step 4: Implement storage abstraction**

Create `apps/orchestrator-api/src/storage.ts` with a `MissionStorage` interface and `createPrismaMissionStorage(prisma)` implementation. Persist Mission creation and events in transactions.

- [ ] **Step 5: Implement services**

Create `apps/orchestrator-api/src/services.ts` with service methods that validate input with Zod, call storage, and call `transitionMission()` from `@psf/mission-core`.

- [ ] **Step 6: Implement Fastify server**

Create `apps/orchestrator-api/src/server.ts` with `buildServer({ storage })`. Register all MVP routes and map API errors to JSON responses.

- [ ] **Step 7: Implement entrypoint**

Create `apps/orchestrator-api/src/index.ts` to build the server with Prisma storage and listen on `ORCHESTRATOR_HOST`/`ORCHESTRATOR_PORT`.

- [ ] **Step 8: Run API tests and typecheck**

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/orchestrator-api typecheck
```

Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add apps/orchestrator-api
git commit -m "实现编排 API MVP" -m "新增 Fastify Orchestrator API、存储抽象、任务创建与状态流转接口、事件接口和 API 测试。"
```

## Task 7: Documentation And Final Verification

**Files:**
- Create: `docs/api.md`
- Create: `docs/schema.md`
- Create: `docs/state-machine.md`
- Create: `docs/storage.md`
- Create: `docs/progress.md`
- Modify: `README.md`

- [ ] **Step 1: Write API documentation**

Document the MVP endpoints, request bodies, response examples, and error shapes in `docs/api.md`.

- [ ] **Step 2: Write schema documentation**

Document schema ownership, required entities, Mission status values, and Project Passport requirements in `docs/schema.md`.

- [ ] **Step 3: Write state machine documentation**

Document normal flow, bug loop, release flow, failure/pause/cancel rules, and final statuses in `docs/state-machine.md`.

- [ ] **Step 4: Write storage documentation**

Document Prisma/PostgreSQL, migrations, seed data, storage abstraction, and the local-only no-auth MVP assumption in `docs/storage.md`.

- [ ] **Step 5: Write progress documentation**

Create `docs/progress.md` with:

- completed items;
- created/modified files;
- test commands;
- remaining unimplemented items;
- next batch recommendations.

- [ ] **Step 6: Update README commands**

Update `README.md` with:

```bash
pnpm install
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm test
pnpm typecheck
pnpm dev:api
```

- [ ] **Step 7: Run final verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
sudo docker compose ps
git diff --check
```

Expected:

- schema tests pass;
- Project Passport tests pass;
- Mission state machine tests pass;
- Orchestrator API tests pass;
- typecheck passes;
- build passes;
- Postgres and Redis are healthy or clearly reported;
- diff check passes.

- [ ] **Step 8: Commit docs**

```bash
git add README.md docs/api.md docs/schema.md docs/state-machine.md docs/storage.md docs/progress.md
git commit -m "更新二至四阶段文档" -m "补充 API、Schema、状态机、存储和进度文档，记录运行命令、测试方式、剩余工作和下一阶段建议。"
```

## Self-Review Checklist

- Spec coverage:
  - Shared schemas are covered in Task 2.
  - Project Passport parsing is covered in Task 3.
  - Prisma/PostgreSQL persistence is covered in Task 4.
  - Mission state machine is covered in Task 5.
  - Orchestrator API MVP is covered in Task 6.
  - Required documentation and final tests are covered in Task 7.
- Scope control:
  - No Codex Worker implementation.
  - No QA Worker implementation.
  - No Hub UI implementation.
  - No real GitHub, Coolify, Uptime Kuma, or Plane API calls.
  - No API authentication in this batch; this is documented as a scoped exception.
- Type consistency:
  - Mission status values come from `@psf/mission-schema`.
  - Transition rules live in `@psf/mission-core`.
  - API services call storage interfaces and do not embed raw route-level Prisma access.
  - Project Passport parser reuses the shared schema.
