import { z } from "zod";
import { missionStatusValues } from "./status.js";

const NonEmptyString = z.string().min(1);
const DateTimeString = z.string().datetime({ offset: true });
const JsonObject = z.record(z.unknown());
const EventTypeSchema = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "Event type must be lower-case dotted format");
const CommandValueSchema = z.union([NonEmptyString, z.array(NonEmptyString).min(1)]);
const PassportPathsSchema = z.record(NonEmptyString);
const PassportRiskRulesSchema = z.record(z.unknown());
const WorkerTypeSchema = z.enum(["codex", "qa", "deploy", "monitor", "planner", "integration", "orchestrator", "auto_fix"]);
const WorkerRunStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled", "skipped"]);
const WorkerRunModeSchema = z.enum(["dry-run", "mock", "real"]);
const ArtifactTypeSchema = z.enum([
  "mission",
  "acceptance",
  "technical_notes",
  "risk_notes",
  "codex_prompt",
  "codex_command",
  "dev_summary",
  "qa_report",
  "bugs_json",
  "fix_mission",
  "playwright_trace",
  "screenshot",
  "generated_test",
  "log",
  "other",
]);
const QAReportModeSchema = z.enum([
  "dry-run",
  "mock",
  "playwright",
  "playwright-mcp",
  "deterministic",
  "ai_exploratory",
  "regression",
  "smoke",
]);

export const MissionStatusSchema = z.enum(missionStatusValues);

export const ProjectSchema = z.object({
  id: NonEmptyString,
  slug: NonEmptyString,
  name: NonEmptyString,
  description: z.string().optional(),
  repo_url: NonEmptyString,
  default_branch: NonEmptyString,
  local_path: z.string().optional(),
  passport_path: z.string().optional(),
  production_url: z.string().optional(),
  staging_url: z.string().optional(),
  status: z.enum(["active", "inactive", "archived"]),
  created_at: DateTimeString,
  updated_at: DateTimeString,
});

export const ProjectPassportSchema = z.object({
  id: NonEmptyString,
  name: NonEmptyString,
  description: z.string().optional(),
  repo: z.object({
    url: NonEmptyString,
    default_branch: NonEmptyString,
  }),
  runtime: z.object({
    kind: NonEmptyString,
    backend: z.record(z.unknown()).optional(),
    frontend: z.record(z.unknown()).optional(),
  }).passthrough(),
  paths: PassportPathsSchema.optional(),
  commands: z.object({
    install: CommandValueSchema,
    dev: CommandValueSchema.optional(),
    test: CommandValueSchema,
    build: CommandValueSchema,
    e2e: CommandValueSchema.optional(),
    lint: CommandValueSchema.optional(),
    run_staging: CommandValueSchema,
  }),
  urls: z.object({
    production: z.string(),
    local: z.string().optional(),
    staging: z.string(),
  }),
  quality_gates: z.record(z.boolean()),
  risk_rules: PassportRiskRulesSchema.optional(),
  core_flows: z.array(z.object({
    id: NonEmptyString,
    name: NonEmptyString,
    priority: z.enum(["P0", "P1", "P2", "P3"]),
  })).min(1),
});

export const MissionSchema = z.object({
  id: NonEmptyString,
  project_id: NonEmptyString,
  title: NonEmptyString,
  slug: NonEmptyString,
  raw_request: NonEmptyString,
  mission_markdown: z.string().optional(),
  acceptance_markdown: z.string().optional(),
  status: MissionStatusSchema,
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  risk_level: z.enum(["low", "medium", "high"]),
  branch_name: z.string().optional(),
  workspace_path: z.string().optional(),
  pr_url: z.string().optional(),
  current_attempt: z.number().int().min(0),
  max_attempts: z.number().int().min(1),
  created_at: DateTimeString,
  updated_at: DateTimeString,
});

export const MissionEventSchema = z.object({
  id: NonEmptyString,
  mission_id: NonEmptyString,
  type: EventTypeSchema,
  message: NonEmptyString,
  payload: JsonObject.default({}),
  created_at: DateTimeString,
});

export const BugReportSchema = z.object({
  id: NonEmptyString,
  mission_id: NonEmptyString,
  qa_run_id: z.string().optional(),
  title: NonEmptyString,
  severity: z.enum(["P0", "P1", "P2", "P3"]),
  status: z.enum(["open", "in_progress", "fixed", "accepted", "wont_fix"]),
  reproduction_steps: z.array(NonEmptyString).min(1),
  expected_result: NonEmptyString,
  actual_result: NonEmptyString,
  evidence: JsonObject.default({}),
  suggested_fix: z.string().optional(),
  regression_test_path: z.string().optional(),
  suggested_fix_direction: z.string().optional(),
  source: z.string().optional(),
  created_at: DateTimeString,
  updated_at: DateTimeString,
});

export const QAReportSchema = z.object({
  id: NonEmptyString,
  mission_id: NonEmptyString,
  target_url: z.string().url().or(z.literal("")),
  mode: QAReportModeSchema,
  status: z.enum(["queued", "passed", "failed", "running", "cancelled", "skipped"]),
  summary: NonEmptyString,
  report_path: z.string().optional(),
  screenshots_dir: z.string().optional(),
  trace_path: z.string().optional(),
  bugs_json_path: z.string().optional(),
  staging_url: z.string().optional(),
  passed: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative().optional(),
  started_at: DateTimeString.optional(),
  finished_at: DateTimeString.optional(),
  bugs: z.array(BugReportSchema).default([]),
  created_at: DateTimeString,
  updated_at: DateTimeString,
});

export const ArtifactSchema = z.object({
  id: NonEmptyString,
  mission_id: NonEmptyString,
  type: z.union([ArtifactTypeSchema, NonEmptyString]),
  path: NonEmptyString,
  worker_run_id: z.string().optional(),
  content: z.string().optional(),
  mime_type: z.string().optional(),
  size: z.number().int().nonnegative(),
  metadata: JsonObject.default({}),
  created_at: DateTimeString,
});

export const ApprovalSchema = z.object({
  id: NonEmptyString,
  mission_id: NonEmptyString,
  type: z.enum([
    "PRODUCTION_DEPLOY",
    "DATABASE_MIGRATION",
    "SECRET_CHANGE",
    "DESTRUCTIVE_OPERATION",
    "EXTERNAL_COST_RISK",
    "SECURITY_RISK",
  ]),
  status: z.enum(["pending", "approved", "rejected", "cancelled"]),
  reason: NonEmptyString,
  payload: JsonObject.default({}),
  requested_by: z.string().optional(),
  decided_by: z.string().optional(),
  decision: z.string().optional(),
  decided_at: DateTimeString.optional(),
  created_at: DateTimeString,
  approved_at: DateTimeString.optional(),
  rejected_at: DateTimeString.optional(),
});

export const WorkerRunSchema = z.object({
  id: NonEmptyString,
  mission_id: NonEmptyString,
  worker_type: WorkerTypeSchema,
  status: WorkerRunStatusSchema,
  mode: WorkerRunModeSchema.optional(),
  command: z.string().optional(),
  stdout_path: z.string().optional(),
  stderr_path: z.string().optional(),
  started_at: DateTimeString.optional(),
  finished_at: DateTimeString.optional(),
  exit_code: z.number().int().optional(),
  input: JsonObject.default({}),
  output: JsonObject.default({}),
  error: z.string().optional(),
  logs: z.array(z.string()).default([]),
  metadata: JsonObject.default({}),
  created_at: DateTimeString.optional(),
  updated_at: DateTimeString.optional(),
});

export const IntegrationStatusSchema = z.object({
  provider: z.enum(["github", "coolify", "uptime_kuma", "plane", "redis", "postgres"]),
  status: z.enum(["not_configured", "configured", "healthy", "degraded", "unavailable"]),
  message: z.string().optional(),
  checked_at: DateTimeString,
  metadata: JsonObject.default({}),
});

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectPassport = z.infer<typeof ProjectPassportSchema>;
export type Mission = z.infer<typeof MissionSchema>;
export type MissionEvent = z.infer<typeof MissionEventSchema>;
export type BugReport = z.infer<typeof BugReportSchema>;
export type QAReport = z.infer<typeof QAReportSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type WorkerRun = z.infer<typeof WorkerRunSchema>;
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;
