import { MissionStatus } from "./status.js";
import type {
  Approval,
  Artifact,
  BugReport,
  IntegrationStatus,
  Mission,
  MissionEvent,
  Project,
  ProjectPassport,
  QAReport,
  WorkerRun,
} from "./schemas.js";

const now = "2026-05-30T10:00:00.000Z";

export const projectExample: Project = {
  id: "ai-novelist",
  slug: "ai-novelist",
  name: "AI Novel Assistant",
  description: "Web AI writing assistant for novels.",
  repo_url: "git@github.com:hxfei-git/ai-novelist.git",
  default_branch: "main",
  local_path: "./workspaces/ai-novelist",
  passport_path: "projects/ai-novelist/project.passport.yaml",
  production_url: "",
  staging_url: "",
  status: "active",
  created_at: now,
  updated_at: now,
};

export const projectPassportExample: ProjectPassport = {
  id: "ai-novelist",
  name: "AI Novel Assistant",
  description: "Web AI writing assistant for creating, reviewing, repairing and exporting novels.",
  repo: {
    url: "git@github.com:hxfei-git/ai-novelist.git",
    default_branch: "main",
  },
  runtime: {
    kind: "web",
    backend: {
      language: "python",
      framework: "unknown",
    },
    frontend: {
      language: "typescript",
      framework: "unknown",
    },
  },
  commands: {
    install: ["python -m venv .venv", "npm --prefix web/frontend install"],
    test: ["pytest -q"],
    build: ["npm --prefix web/frontend run build"],
    run_staging: ["ai-novelist web --host 127.0.0.1 --port 8000"],
  },
  urls: {
    production: "",
    staging: "",
  },
  quality_gates: {
    require_build: true,
    require_unit_tests: true,
    require_e2e_tests: true,
    require_ai_qa: true,
    require_pr_review: true,
    require_human_production_approval: true,
  },
  core_flows: [
    { id: "create_novel_project", name: "Create novel project", priority: "P0" },
    { id: "generate_chapter", name: "Generate chapter", priority: "P0" },
  ],
};

export const missionExample: Mission = {
  id: "mission-sample-001",
  project_id: "ai-novelist",
  title: "Standardize startup and test commands",
  slug: "standardize-startup-and-test-commands",
  raw_request: "Make ai-novelist runnable by workers.",
  mission_markdown: `# Mission\nStandardize commands.`,
  acceptance_markdown: `# Acceptance\nCommands are documented and pass.`,
  status: MissionStatus.received,
  priority: "P1",
  risk_level: "medium",
  branch_name: "agent/standardize-startup-mission-sample-001",
  workspace_path: "./workspaces/ai-novelist",
  pr_url: "",
  current_attempt: 0,
  max_attempts: 3,
  created_at: now,
  updated_at: now,
};

export const missionEventExample: MissionEvent = {
  id: "event-sample-001",
  mission_id: missionExample.id,
  type: "mission.created",
  message: "Mission created",
  payload: { status: MissionStatus.received },
  created_at: now,
};

export const bugReportExample: BugReport = {
  id: "bug-sample-001",
  mission_id: missionExample.id,
  qa_run_id: "qa-run-sample-001",
  title: "Generate button allows duplicate submissions",
  severity: "P1",
  status: "open",
  reproduction_steps: ["Open the app", "Click Generate Chapter repeatedly"],
  expected_result: "Only one request is submitted.",
  actual_result: "Multiple requests are submitted.",
  evidence: { screenshots: ["screenshots/bug-sample-001.png"] },
  suggested_fix: "Disable the button while generation is pending.",
  regression_test_path: "tests/e2e/generated/bug-sample-001.spec.ts",
  created_at: now,
  updated_at: now,
};

export const qaReportExample: QAReport = {
  id: "qa-run-sample-001",
  mission_id: missionExample.id,
  target_url: "http://127.0.0.1:8000",
  mode: "smoke",
  status: "passed",
  summary: "Smoke flow passed.",
  report_path: "artifacts/missions/mission-sample-001/qa-report.md",
  screenshots_dir: "artifacts/missions/mission-sample-001/screenshots",
  trace_path: "artifacts/missions/mission-sample-001/traces/trace.zip",
  bugs_json_path: "artifacts/missions/mission-sample-001/bugs.json",
  bugs: [],
  created_at: now,
  updated_at: now,
};

export const artifactExample: Artifact = {
  id: "artifact-sample-001",
  mission_id: missionExample.id,
  type: "qa-report",
  path: "artifacts/missions/mission-sample-001/qa-report.md",
  mime_type: "text/markdown",
  size: 1200,
  created_at: now,
};

export const approvalExample: Approval = {
  id: "approval-sample-001",
  mission_id: missionExample.id,
  type: "PRODUCTION_DEPLOY",
  status: "pending",
  reason: "Production deployment requires human approval.",
  payload: { target: "production" },
  created_at: now,
};

export const workerRunExample: WorkerRun = {
  id: "worker-run-sample-001",
  mission_id: missionExample.id,
  worker_type: "orchestrator",
  status: "succeeded",
  command: "pnpm test",
  stdout_path: "artifacts/missions/mission-sample-001/worker-runs/stdout.log",
  stderr_path: "artifacts/missions/mission-sample-001/worker-runs/stderr.log",
  started_at: now,
  finished_at: now,
  exit_code: 0,
  metadata: { phase: "schema" },
};

export const integrationStatusExample: IntegrationStatus = {
  provider: "github",
  status: "not_configured",
  message: "GitHub integration is deferred for this batch.",
  checked_at: now,
  metadata: {},
};
