CREATE TABLE "projects" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "repo_url" TEXT NOT NULL,
  "default_branch" TEXT NOT NULL,
  "local_path" TEXT,
  "passport_path" TEXT,
  "production_url" TEXT,
  "staging_url" TEXT,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

CREATE TABLE "missions" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "raw_request" TEXT NOT NULL,
  "mission_markdown" TEXT,
  "acceptance_markdown" TEXT,
  "status" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "risk_level" TEXT NOT NULL,
  "branch_name" TEXT,
  "workspace_path" TEXT,
  "pr_url" TEXT,
  "current_attempt" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "missions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "missions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "missions_project_id_idx" ON "missions"("project_id");
CREATE INDEX "missions_status_idx" ON "missions"("status");

CREATE TABLE "mission_events" (
  "id" TEXT NOT NULL,
  "mission_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mission_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mission_events_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "mission_events_mission_id_idx" ON "mission_events"("mission_id");
CREATE INDEX "mission_events_created_at_idx" ON "mission_events"("created_at");

CREATE TABLE "worker_runs" (
  "id" TEXT NOT NULL,
  "mission_id" TEXT NOT NULL,
  "worker_type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "command" TEXT,
  "stdout_path" TEXT,
  "stderr_path" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "exit_code" INTEGER,
  "metadata" JSONB NOT NULL,
  CONSTRAINT "worker_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "worker_runs_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "worker_runs_mission_id_idx" ON "worker_runs"("mission_id");

CREATE TABLE "qa_runs" (
  "id" TEXT NOT NULL,
  "mission_id" TEXT NOT NULL,
  "target_url" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "report_path" TEXT,
  "screenshots_dir" TEXT,
  "trace_path" TEXT,
  "bugs_json_path" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "qa_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "qa_runs_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "qa_runs_mission_id_idx" ON "qa_runs"("mission_id");

CREATE TABLE "bugs" (
  "id" TEXT NOT NULL,
  "mission_id" TEXT NOT NULL,
  "qa_run_id" TEXT,
  "title" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reproduction_steps" TEXT[] NOT NULL,
  "expected_result" TEXT NOT NULL,
  "actual_result" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "suggested_fix" TEXT,
  "regression_test_path" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bugs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bugs_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bugs_qa_run_id_fkey" FOREIGN KEY ("qa_run_id") REFERENCES "qa_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "bugs_mission_id_idx" ON "bugs"("mission_id");
CREATE INDEX "bugs_qa_run_id_idx" ON "bugs"("qa_run_id");

CREATE TABLE "artifacts" (
  "id" TEXT NOT NULL,
  "mission_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "mime_type" TEXT,
  "size" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "artifacts_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "artifacts_mission_id_idx" ON "artifacts"("mission_id");

CREATE TABLE "approvals" (
  "id" TEXT NOT NULL,
  "mission_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  CONSTRAINT "approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approvals_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "approvals_mission_id_idx" ON "approvals"("mission_id");

CREATE TABLE "deployments" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "mission_id" TEXT,
  "environment" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "target_url" TEXT,
  "provider" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deployments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deployments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "deployments_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "deployments_project_id_idx" ON "deployments"("project_id");
CREATE INDEX "deployments_mission_id_idx" ON "deployments"("mission_id");

CREATE TABLE "monitors" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "last_checked_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "monitors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "monitors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "monitors_project_id_idx" ON "monitors"("project_id");
