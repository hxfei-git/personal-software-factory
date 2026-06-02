import type { ReactElement } from "react";
import type { Approval, Artifact, BugReport, WorkerRun } from "../api/types";
import type { LoadState } from "../App";
import { isSensitiveKey, redactDisplayValue, redactJsonForDisplay } from "../displaySafety";

export function renderBugsView({ state, selectedId }: { state: LoadState<BugReport[]>; selectedId?: string | undefined }): ReactElement {
  return renderResourceView({
    title: "Bugs",
    description: "QA bug reports from GET /bugs",
    loadingText: "Loading GET /bugs from Orchestrator API",
    emptyText: "No bugs loaded from Orchestrator API",
    state,
    selectedId,
    renderDetail: renderBugDetail,
    renderItem: (bug) => (
      <article className="record-row" key={bug.id}>
        <div>
          <h2>{bug.title}</h2>
          <p>{bug.actual_result}</p>
          <div className="record-meta">
            <span>{bug.id}</span>
            <span>{bug.mission_id}</span>
            <span>{bug.severity}</span>
          </div>
          <a className="inline-link" href={`#bugs?id=${encodeURIComponent(bug.id)}`}>Open detail</a>
        </div>
        <span className="status-pill">{bug.status}</span>
      </article>
    ),
  });
}

export function renderWorkerRunsView({ state, selectedId }: { state: LoadState<WorkerRun[]>; selectedId?: string | undefined }): ReactElement {
  return renderResourceView({
    title: "Worker Runs",
    description: "Worker execution records from GET /worker-runs",
    loadingText: "Loading GET /worker-runs from Orchestrator API",
    emptyText: "No worker runs loaded from Orchestrator API",
    state,
    selectedId,
    renderDetail: renderWorkerRunDetail,
    renderItem: (run) => (
      <article className="record-row" key={run.id}>
        <div>
          <h2>{run.id}</h2>
          <p>{run.error ? redactDisplayValue(run.error) : run.command ? redactDisplayValue(run.command) : run.worker_type}</p>
          <div className="record-meta">
            <span>{run.mission_id}</span>
            <span>{run.worker_type}</span>
            <span>{run.mode ?? "unknown mode"}</span>
            {typeof run.exit_code === "number" ? <span>exit {run.exit_code}</span> : null}
          </div>
          <a className="inline-link" href={`#worker-runs?id=${encodeURIComponent(run.id)}`}>Open detail</a>
        </div>
        <span className="status-pill">{run.status}</span>
      </article>
    ),
  });
}

export function renderArtifactsView({ state, selectedId }: { state: LoadState<Artifact[]>; selectedId?: string | undefined }): ReactElement {
  return renderResourceView({
    title: "Artifacts",
    description: "Generated artifacts from GET /artifacts",
    loadingText: "Loading GET /artifacts from Orchestrator API",
    emptyText: "No artifacts loaded from Orchestrator API",
    state,
    selectedId,
    renderDetail: renderArtifactDetail,
    renderItem: (artifact) => {
      const metadata = jsonRecordOrEmpty(artifact.metadata);
      const artifactName = readString(metadata, "name") ?? artifact.id;
      return (
        <article className="record-row" key={artifact.id}>
          <div>
            <h2>{artifact.type}</h2>
            <p>name {artifactName}</p>
            <code className="resource-code">{redactDisplayValue(artifact.path)}</code>
            <div className="record-meta">
              <span>{artifact.mission_id}</span>
              <span>{artifact.size} bytes</span>
              {artifact.mime_type ? <span>{artifact.mime_type}</span> : null}
            </div>
            {renderMetadata(metadata)}
            <a className="inline-link" href={`#artifacts?id=${encodeURIComponent(artifact.id)}`}>Open detail</a>
          </div>
          <span className="status-pill">artifact</span>
        </article>
      );
    },
  });
}

interface ApprovalDecisionActions {
  onDecision: (approvalId: string, status: "approved" | "rejected") => void | Promise<void>;
}

interface ApprovalDecisionState {
  loading: string;
  message: string;
  error: string;
}

const emptyApprovalDecisionState: ApprovalDecisionState = { loading: "", message: "", error: "" };

export function renderApprovalsView({
  state,
  actions,
  actionState = emptyApprovalDecisionState,
  selectedId,
}: {
  state: LoadState<Approval[]>;
  selectedId?: string | undefined;
  actions?: ApprovalDecisionActions;
  actionState?: ApprovalDecisionState;
}): ReactElement {
  const busy = actionState.loading !== "";
  return renderResourceView({
    title: "Approvals",
    description: "Manual approval records from GET /approvals. Approval decisions only update approval records; they do not automatically execute real Codex, PR creation, deploy, monitor sync, or provider sync in this phase.",
    loadingText: "Loading GET /approvals from Orchestrator API",
    emptyText: "No approvals loaded from Orchestrator API",
    state,
    selectedId,
    renderDetail: renderApprovalDetail,
    renderItem: (approval) => (
      <article className="record-row" key={approval.id}>
        <div>
          <h2>{approval.type}</h2>
          <p>{approval.reason}</p>
          <div className="record-meta">
            <span>{approval.id}</span>
            <span>{approval.mission_id}</span>
            {approval.requested_by ? <span>requested by {approval.requested_by}</span> : null}
          </div>
          <a className="inline-link" href={`#approvals?id=${encodeURIComponent(approval.id)}`}>Open detail</a>
          {approval.status === "pending" && actions ? (
            <div className="action-buttons">
              <button type="button" disabled={busy} onClick={() => void actions.onDecision(approval.id, "approved")}>Approve</button>
              <button type="button" disabled={busy} onClick={() => void actions.onDecision(approval.id, "rejected")}>Reject</button>
            </div>
          ) : null}
        </div>
        <span className="status-pill">{approval.status}</span>
      </article>
    ),
    footer: renderApprovalDecisionStatus(actionState),
  });
}

function renderApprovalDecisionStatus(actionState: ApprovalDecisionState): ReactElement | null {
  if (actionState.loading !== "") {
    return <p className="action-status">Recording approval decision</p>;
  }
  if (actionState.error !== "") {
    return <p className="action-status error">{actionState.error}</p>;
  }
  if (actionState.message !== "") {
    return <p className="action-status success">{actionState.message}</p>;
  }
  return null;
}

function renderResourceView<T>({
  title,
  description,
  loadingText,
  emptyText,
  state,
  renderItem,
  renderDetail,
  selectedId,
  footer,
}: {
  title: string;
  description: string;
  loadingText: string;
  emptyText: string;
  state: LoadState<T[]>;
  renderItem: (item: T) => ReactElement;
  renderDetail?: (item: T | undefined, selectedId: string) => ReactElement;
  selectedId?: string | undefined;
  footer?: ReactElement | null;
}): ReactElement {
  if (state.status === "loading" || state.status === "idle") {
    return renderListStatus(title, loadingText);
  }
  if (state.status === "error") {
    return renderListStatus(title, "API unavailable: " + state.message, "error");
  }

  return (
    <main className="content-surface">
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span className="status-pill">{state.data.length} record(s)</span>
      </header>
      <section className="panel record-list" aria-label={title}>
        {state.data.length === 0 ? <p className="empty-line">{emptyText}</p> : state.data.map(renderItem)}
      </section>
      {selectedId && renderDetail ? renderDetail(state.data.find((item) => itemId(item) === selectedId), selectedId) : null}
      {footer}
    </main>
  );
}


function renderBugDetail(bug: BugReport | undefined, selectedId: string): ReactElement {
  if (!bug) return renderMissingDetail("Bug detail", selectedId);
  return (
    <section className="panel detail-panel" aria-label="Bug detail">
      <div className="panel-heading"><h2>Bug detail</h2><span>{bug.status}</span></div>
      <dl className="definition-grid">
        <dt>id</dt><dd>{bug.id}</dd>
        <dt>mission</dt><dd>{bug.mission_id}</dd>
        <dt>severity</dt><dd>{bug.severity}</dd>
        <dt>expected</dt><dd>{bug.expected_result}</dd>
        <dt>actual</dt><dd>{bug.actual_result}</dd>
        <dt>suggested_fix_direction</dt><dd>{bug.suggested_fix_direction ?? bug.suggested_fix ?? "none"}</dd>
      </dl>
      <pre>{bug.reproduction_steps.join("\n")}</pre>
    </section>
  );
}

function renderWorkerRunDetail(run: WorkerRun | undefined, selectedId: string): ReactElement {
  if (!run) return renderMissingDetail("WorkerRun detail", selectedId);
  return (
    <section className="panel detail-panel" aria-label="WorkerRun detail">
      <div className="panel-heading"><h2>WorkerRun detail</h2><span>{run.status}</span></div>
      <dl className="definition-grid">
        <dt>id</dt><dd>{run.id}</dd>
        <dt>mission</dt><dd>{run.mission_id}</dd>
        <dt>worker_type</dt><dd>{run.worker_type}</dd>
        <dt>mode</dt><dd>{run.mode ?? "unknown"}</dd>
        <dt>jobId</dt><dd>{readString(run.metadata, "jobId") ?? readString(run.output, "jobId") ?? "none"}</dd>
        <dt>jobType</dt><dd>{readString(run.metadata, "jobType") ?? readString(run.output, "jobType") ?? "none"}</dd>
        <dt>error</dt><dd>{run.error ? redactDisplayValue(run.error) : "none"}</dd>
      </dl>
      <pre>{JSON.stringify(redactJsonForDisplay(run.output), null, 2)}</pre>
    </section>
  );
}

function renderArtifactDetail(artifact: Artifact | undefined, selectedId: string): ReactElement {
  if (!artifact) return renderMissingDetail("Artifact detail", selectedId);
  const metadata = jsonRecordOrEmpty(artifact.metadata);
  const artifactName = readString(metadata, "name") ?? artifact.id;
  return (
    <section className="panel detail-panel" aria-label="Artifact detail">
      <div className="panel-heading"><h2>Artifact detail</h2><span>{artifact.type}</span></div>
      <dl className="definition-grid">
        <dt>id</dt><dd>{artifact.id}</dd>
        <dt>mission</dt><dd>{artifact.mission_id}</dd>
        <dt>type</dt><dd>{artifact.type}</dd>
        <dt>name</dt><dd>{artifactName}</dd>
        <dt>path</dt><dd>{redactDisplayValue(artifact.path)}</dd>
        <dt>mime_type</dt><dd>{artifact.mime_type ?? "none"}</dd>
        <dt>size</dt><dd>{artifact.size} bytes</dd>
      </dl>
      {renderMetadata(metadata)}
    </section>
  );
}

function renderApprovalDetail(approval: Approval | undefined, selectedId: string): ReactElement {
  if (!approval) return renderMissingDetail("Approval detail", selectedId);
  return (
    <section className="panel detail-panel" aria-label="Approval detail">
      <div className="panel-heading"><h2>Approval detail</h2><span>{approval.status}</span></div>
      <dl className="definition-grid">
        <dt>id</dt><dd>{approval.id}</dd>
        <dt>mission</dt><dd>{approval.mission_id}</dd>
        <dt>type</dt><dd>{approval.type}</dd>
        <dt>reason</dt><dd>{approval.reason}</dd>
        <dt>decision</dt><dd>{approval.decision ?? "none"}</dd>
      </dl>
    </section>
  );
}

function renderMissingDetail(title: string, selectedId: string): ReactElement {
  return (
    <section className="panel detail-panel">
      <h2>{title}</h2>
      <p className="empty-line">Record not found in list result: {selectedId}</p>
    </section>
  );
}

function itemId(item: unknown): string | undefined {
  return typeof item === "object" && item !== null && "id" in item && typeof (item as { id?: unknown }).id === "string"
    ? (item as { id: string }).id
    : undefined;
}

function jsonRecordOrEmpty(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  if (isSensitiveKey(key)) return undefined;
  const value = record[key];
  return typeof value === "string" ? redactDisplayValue(value) : undefined;
}

function renderMetadata(metadata: Record<string, unknown>): ReactElement | null {
  const rows = Object.entries(metadata)
    .filter(([key]) => !isSensitiveKey(key))
    .flatMap(([key, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return ["metadata " + key + " " + redactDisplayValue(String(value))];
      }
      if (Array.isArray(value)) {
        const values = value.filter((item): item is string => typeof item === "string");
        return values.length > 0 ? ["metadata " + key + " " + values.map(redactDisplayValue).join(", ")] : [];
      }
      return [];
    });
  return rows.length > 0 ? <>{rows.map((row) => <span key={row}>{row}</span>)}</> : null;
}

function renderListStatus(title: string, message: string, tone: "neutral" | "error" = "neutral"): ReactElement {
  return (
    <main className="content-surface">
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p>{message}</p>
        </div>
        <span className={tone === "error" ? "status-pill danger" : "status-pill"}>{tone === "error" ? "API unavailable" : "loading"}</span>
      </header>
    </main>
  );
}
