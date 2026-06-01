import type { ReactElement } from "react";
import type { Approval, Artifact, BugReport, WorkerRun } from "../api/types";
import type { LoadState } from "../App";

export function renderBugsView({ state }: { state: LoadState<BugReport[]> }): ReactElement {
  return renderResourceView({
    title: "Bugs",
    description: "QA bug reports from GET /bugs",
    loadingText: "Loading GET /bugs from Orchestrator API",
    emptyText: "No bugs loaded from Orchestrator API",
    state,
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
        </div>
        <span className="status-pill">{bug.status}</span>
      </article>
    ),
  });
}

export function renderWorkerRunsView({ state }: { state: LoadState<WorkerRun[]> }): ReactElement {
  return renderResourceView({
    title: "Worker Runs",
    description: "Worker execution records from GET /worker-runs",
    loadingText: "Loading GET /worker-runs from Orchestrator API",
    emptyText: "No worker runs loaded from Orchestrator API",
    state,
    renderItem: (run) => (
      <article className="record-row" key={run.id}>
        <div>
          <h2>{run.id}</h2>
          <p>{run.error ?? run.command ?? run.worker_type}</p>
          <div className="record-meta">
            <span>{run.mission_id}</span>
            <span>{run.worker_type}</span>
            <span>{run.mode ?? "unknown mode"}</span>
            {typeof run.exit_code === "number" ? <span>exit {run.exit_code}</span> : null}
          </div>
        </div>
        <span className="status-pill">{run.status}</span>
      </article>
    ),
  });
}

export function renderArtifactsView({ state }: { state: LoadState<Artifact[]> }): ReactElement {
  return renderResourceView({
    title: "Artifacts",
    description: "Generated artifacts from GET /artifacts",
    loadingText: "Loading GET /artifacts from Orchestrator API",
    emptyText: "No artifacts loaded from Orchestrator API",
    state,
    renderItem: (artifact) => (
      <article className="record-row" key={artifact.id}>
        <div>
          <h2>{artifact.type}</h2>
          <p>{artifact.id}</p>
          <code className="resource-code">{artifact.path}</code>
          <div className="record-meta">
            <span>{artifact.mission_id}</span>
            <span>{artifact.size} bytes</span>
            {artifact.mime_type ? <span>{artifact.mime_type}</span> : null}
          </div>
        </div>
        <span className="status-pill">artifact</span>
      </article>
    ),
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
}: {
  state: LoadState<Approval[]>;
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
  footer,
}: {
  title: string;
  description: string;
  loadingText: string;
  emptyText: string;
  state: LoadState<T[]>;
  renderItem: (item: T) => ReactElement;
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
      {footer}
    </main>
  );
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
