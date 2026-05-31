import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { createOrchestratorClient, type OrchestratorClient } from "./api/client";
import type {
  Artifact,
  BugReport,
  DashboardResponse,
  ExternalIntegrationName,
  IntegrationStatus,
  Mission,
  MissionDryRunAction,
  MissionSummaryResponse,
  QAReport,
  WorkerRun,
} from "./api/types";

export type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

interface ViewProps<T> {
  state: LoadState<T>;
}

interface ActionState {
  loading: string;
  message: string;
  error: string;
}

interface DashboardActions {
  onRunDemo: (withSampleBug: boolean) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
}

interface MissionActions {
  onRunAction: (action: MissionDryRunAction, payload?: Record<string, unknown>) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
}

const navItems = [
  { id: "dashboard", label: "Dashboard" },
  { id: "projects", label: "Projects" },
  { id: "missions", label: "Missions" },
  { id: "mission-detail", label: "Mission Detail" },
  { id: "bugs", label: "Bugs" },
  { id: "worker-runs", label: "Worker Runs" },
  { id: "artifacts", label: "Artifacts" },
  { id: "approvals", label: "Approvals" },
  { id: "integrations", label: "Integrations" },
] as const;

const defaultMissionId = "mission-0001-ai-novelist-chapter-review";

let defaultOrchestratorClient: OrchestratorClient | undefined;

function getDefaultOrchestratorClient(): OrchestratorClient {
  defaultOrchestratorClient ??= createOrchestratorClient();
  return defaultOrchestratorClient;
}

export default function App({ client: providedClient }: { client?: OrchestratorClient } = {}): ReactElement {
  const client = providedClient ?? getDefaultOrchestratorClient();
  const [route, setRoute] = useState(() => readRoute());
  const [dashboardState, setDashboardState] = useState<LoadState<DashboardResponse>>({ status: "idle" });
  const [missionState, setMissionState] = useState<LoadState<MissionSummaryResponse>>({ status: "idle" });
  const [integrationState, setIntegrationState] = useState<LoadState<IntegrationStatus[]>>({ status: "idle" });
  const [dryRunMessage, setDryRunMessage] = useState<string>("");
  const [actionState, setActionState] = useState<ActionState>({ loading: "", message: "", error: "" });

  const loadDashboard = useCallback(async (): Promise<DashboardResponse> => {
    setDashboardState({ status: "loading" });
    try {
      const data = await client.getDashboard();
      setDashboardState({ status: "success", data });
      return data;
    } catch (error: unknown) {
      const message = errorMessage(error, "GET /dashboard failed");
      setDashboardState({ status: "error", message });
      throw new Error(message);
    }
  }, [client]);

  const loadMissionSummary = useCallback(async (missionId: string): Promise<MissionSummaryResponse> => {
    setMissionState({ status: "loading" });
    try {
      const data = await client.getMissionSummary(missionId);
      setMissionState({ status: "success", data });
      return data;
    } catch (error: unknown) {
      const message = errorMessage(error, "GET /missions/:id/summary failed");
      setMissionState({ status: "error", message });
      throw new Error(message);
    }
  }, [client]);

  const runDashboardDemo = useCallback(async (withSampleBug: boolean): Promise<void> => {
    const loading = withSampleBug ? "ai-novelist-demo-with-sample-bug" : "ai-novelist-demo";
    setActionState({ loading, message: "", error: "" });
    try {
      const result = await client.runAiNovelistDemo(withSampleBug ? { withSampleBug: true } : {});
      await loadDashboard();
      setActionState({ loading: "", message: result.recommendedNextAction || "Dry-run completed through Orchestrator API", error: "" });
    } catch (error: unknown) {
      setActionState({ loading: "", message: "", error: errorMessage(error, "Demo dry-run failed") });
    }
  }, [client, loadDashboard]);

  const refreshDashboard = useCallback(async (): Promise<void> => {
    setActionState({ loading: "dashboard-refresh", message: "", error: "" });
    try {
      await loadDashboard();
      setActionState({ loading: "", message: "Dashboard refreshed", error: "" });
    } catch (error: unknown) {
      setActionState({ loading: "", message: "", error: errorMessage(error, "Dashboard refresh failed") });
    }
  }, [loadDashboard]);

  const runMissionDryRun = useCallback(async (missionId: string, action: MissionDryRunAction, payload: Record<string, unknown> = {}): Promise<void> => {
    setActionState({ loading: action, message: "", error: "" });
    try {
      const result = await client.runMissionAction(missionId, action, payload);
      await loadMissionSummary(missionId);
      setActionState({ loading: "", message: result.recommendedNextAction || "Dry-run completed through Orchestrator API", error: "" });
    } catch (error: unknown) {
      setActionState({ loading: "", message: "", error: errorMessage(error, `${action} failed`) });
    }
  }, [client, loadMissionSummary]);

  const refreshMissionSummary = useCallback(async (missionId: string): Promise<void> => {
    setActionState({ loading: "mission-summary-refresh", message: "", error: "" });
    try {
      await loadMissionSummary(missionId);
      setActionState({ loading: "", message: "Mission summary refreshed", error: "" });
    } catch (error: unknown) {
      setActionState({ loading: "", message: "", error: errorMessage(error, "Mission summary refresh failed") });
    }
  }, [loadMissionSummary]);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (route.page !== "dashboard") {
      return;
    }
    void loadDashboard().catch(() => undefined);
  }, [loadDashboard, route.page]);

  useEffect(() => {
    if (route.page !== "mission-detail") {
      return;
    }
    const missionId = route.params.get("id") || defaultMissionId;
    void loadMissionSummary(missionId).catch(() => undefined);
  }, [loadMissionSummary, route]);

  useEffect(() => {
    if (route.page !== "integrations") {
      return;
    }
    setIntegrationState({ status: "loading" });
    client.listIntegrations()
      .then((data) => setIntegrationState({ status: "success", data }))
      .catch((error: unknown) => setIntegrationState({ status: "error", message: errorMessage(error, "GET /integrations failed") }));
  }, [client, route.page]);

  const view = useMemo(() => {
    switch (route.page) {
      case "dashboard":
        return renderDashboardView({
          state: dashboardState,
          actions: {
            onRunDemo: runDashboardDemo,
            onRefresh: refreshDashboard,
          },
          actionState,
        });
      case "mission-detail": {
        const missionId = route.params.get("id") || defaultMissionId;
        return renderMissionDetailView({
          state: missionState,
          actions: {
            onRunAction: (action, payload = {}) => runMissionDryRun(missionId, action, payload),
            onRefresh: () => refreshMissionSummary(missionId),
          },
          actionState,
        });
      }
      case "integrations":
        return renderIntegrationsView({ state: integrationState, onDryRun: async (name) => {
          setDryRunMessage("Dry-run queued through Orchestrator API");
          try {
            const result = await client.runIntegrationDryRun(name, {});
            setDryRunMessage(result.message || "Dry-run completed through Orchestrator API");
          } catch (error) {
            setDryRunMessage(errorMessage(error, "Dry-run failed"));
          }
        }, dryRunMessage });
      default:
        return renderPlaceholderView(route.page);
    }
  }, [actionState, client, dashboardState, dryRunMessage, integrationState, missionState, refreshDashboard, refreshMissionSummary, route, runDashboardDemo, runMissionDryRun]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-title">PSF Hub</div>
          <div className="brand-subtitle">Orchestrator control surface</div>
        </div>
        <nav className="nav-list" aria-label="Hub sections">
          {navItems.map((item) => (
            <a key={item.id} className={route.page === item.id ? "nav-item active" : "nav-item"} href={"#" + item.id}>
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      {view}
    </div>
  );
}

export function renderDashboardView({
  state,
  actions,
  actionState = emptyActionState,
}: ViewProps<DashboardResponse> & {
  actions?: DashboardActions;
  actionState?: ActionState;
}): ReactElement {
  if (state.status === "loading" || state.status === "idle") {
    return renderStatusPage("Dashboard", "Loading /dashboard from Orchestrator API");
  }
  if (state.status === "error") {
    return renderStatusPage("Dashboard", "API unavailable: " + state.message, "error");
  }

  const data = state.data;
  const latestQa = data.recentQaRuns[0];
  const latestArtifact = data.recentArtifacts[0];
  const latestFailedWorker = data.recentFailedWorkerRuns[0] ?? data.recentWorkerRuns.find((run) => run.status === "failed");

  return (
    <main className="content-surface">
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Factory state from GET /dashboard</p>
        </div>
        <span className="status-pill">Orchestrator API only</span>
      </header>

      {actions ? renderDashboardActions(actions, actionState) : null}

      <section className="metric-grid" aria-label="Dashboard metrics">
        {metricCard("Missions", data.metrics.missionCount + " total", [data.metrics.runningMissionCount + " running", data.metrics.failedMissionCount + " failed", data.metrics.readyForReviewMissionCount + " ready_for_review"])}
        {metricCard("QA", data.metrics.qaRunCount + " total", [data.metrics.qaFailedCount + " failed", latestQa ? "Latest QA " + latestQa.id : "No recent QA"])}
        {metricCard("Bugs", data.metrics.bugCount + " total", [data.metrics.openBugCount + " open", data.metrics.p0p1BugCount + " P0/P1"])}
        {metricCard("WorkerRun", data.metrics.workerRunCount + " total", [latestFailedWorker ? "Recent failure " + latestFailedWorker.id : "No recent failure"])}
        {metricCard("Artifacts", data.metrics.artifactCount + " total", [latestArtifact ? "Latest key artifact " + latestArtifact.id : "No key artifact"])}
        {metricCard("Approvals", data.metrics.pendingApprovalCount + " pending", [data.metrics.projectCount + " project(s)"])}
      </section>

      <section className="panel-grid three-columns">
        {renderHealthSignals(data.healthSignals)}
        {renderIntegrationCards(data.integrationStatuses)}
        {renderActionList("Recommended next actions", data.recommendedNextActions, "No recommended actions")}
      </section>

      <section className="panel-grid three-columns">
        {renderMissionList("Recent Missions", data.recentMissions.slice(0, 5))}
        {renderBugList("Recent Bugs", data.recentBugs.slice(0, 5))}
        {renderWorkerRunList("Recent WorkerRuns", data.recentWorkerRuns.slice(0, 5))}
      </section>

      <section className="panel-grid">
        {renderArtifactList("Recent Artifacts", data.recentArtifacts.slice(0, 5))}
      </section>
    </main>
  );
}

export function renderMissionDetailView({
  state,
  actions,
  actionState = emptyActionState,
}: ViewProps<MissionSummaryResponse> & {
  actions?: MissionActions;
  actionState?: ActionState;
}): ReactElement {
  if (state.status === "loading" || state.status === "idle") {
    return renderStatusPage("Mission Detail", "Loading GET /missions/:id/summary from Orchestrator API");
  }
  if (state.status === "error") {
    return renderStatusPage("Mission Detail", "API unavailable: " + state.message, "error");
  }

  const data = state.data;
  return (
    <main className="content-surface">
      <header className="page-header">
        <div>
          <h1>Mission Detail</h1>
          <p>{data.mission.id}</p>
        </div>
        <span className="status-pill">{data.currentStatus}</span>
      </header>

      {actions ? renderMissionActions(actions, actionState) : null}

      <section className="detail-summary">
        <div>
          <h2>{data.mission.title}</h2>
          <p>{data.project.name} / {data.mission.priority} / {data.mission.risk_level}</p>
        </div>
        <div className="next-action">
          <span>recommendedNextAction</span>
          <strong>{data.recommendedNextAction}</strong>
        </div>
      </section>

      <section className="panel-grid two-columns">
        {renderEvents(data.events)}
        {renderArtifactHighlights(data)}
      </section>

      <section className="panel-grid three-columns">
        {renderWorkerRunList("WorkerRun", data.workerRuns)}
        {renderQaRunList("QARun", data.qaRuns)}
        {renderBugList("BugReport", data.bugs)}
      </section>

      <section className="panel-grid two-columns">
        {renderArtifactList("Artifact", data.artifacts)}
        {renderApprovalList(data.approvals)}
      </section>
    </main>
  );
}

export function renderIntegrationsView({
  state,
  onDryRun,
  dryRunMessage = "",
}: ViewProps<IntegrationStatus[]> & {
  onDryRun?: (name: ExternalIntegrationName) => void | Promise<void>;
  dryRunMessage?: string;
}): ReactElement {
  if (state.status === "loading" || state.status === "idle") {
    return renderStatusPage("Integrations", "Loading GET /integrations from Orchestrator API");
  }
  if (state.status === "error") {
    return renderStatusPage("Integrations", "API unavailable: " + state.message, "error");
  }

  return (
    <main className="content-surface">
      <header className="page-header">
        <div>
          <h1>Integrations</h1>
          <p>Mock and dry-run provider state from Orchestrator API</p>
        </div>
        <span className="status-pill">No real network calls</span>
      </header>
      <section className="integration-grid">
        {state.data.map((integration) => (
          <article className="panel integration-card" key={integration.name}>
            <div className="row-space">
              <h2>{formatProvider(integration)}</h2>
              <span className="status-pill">{integration.mode}</span>
            </div>
            <dl className="definition-grid">
              <dt>configured</dt><dd>{String(integration.configured)}</dd>
              <dt>safeToRun</dt><dd>{String(integration.safeToRun)}</dd>
              <dt>realNetworkCall</dt><dd>{String(integration.realNetworkCall)}</dd>
              <dt>missingEnv</dt><dd>{integration.missingEnv.length === 0 ? "none" : integration.missingEnv.join(", ")}</dd>
            </dl>
            <p className="muted">{integration.message}</p>
            {onDryRun ? <button type="button" onClick={() => void onDryRun(integration.name)}>Dry-run</button> : null}
          </article>
        ))}
      </section>
      {dryRunMessage ? <p className="inline-notice">{dryRunMessage}</p> : null}
    </main>
  );
}

export function renderTokenSafetyProbe(token: string, dashboard: DashboardResponse): ReactElement {
  return (
    <section>
      <span>{token.trim() === "" ? "Token not configured" : "Token configured"}</span>
      {renderDashboardView({ state: { status: "success", data: dashboard } })}
    </section>
  );
}

const emptyActionState: ActionState = { loading: "", message: "", error: "" };

function renderDashboardActions(actions: DashboardActions, actionState: ActionState): ReactElement {
  const busy = actionState.loading !== "";
  return (
    <section className="action-toolbar" aria-label="Dashboard dry-run actions">
      <div className="action-buttons">
        <button type="button" disabled={busy} onClick={() => void actions.onRunDemo(false)}>Generate ai-novelist Demo dry-run</button>
        <button type="button" disabled={busy} onClick={() => void actions.onRunDemo(true)}>Generate ai-novelist Demo with Sample Bug dry-run</button>
        <button type="button" disabled={busy} onClick={() => void actions.onRefresh()}>Refresh Dashboard</button>
      </div>
      {renderActionStatus(actionState)}
    </section>
  );
}

function renderMissionActions(actions: MissionActions, actionState: ActionState): ReactElement {
  const busy = actionState.loading !== "";
  return (
    <section className="action-toolbar" aria-label="Mission dry-run actions">
      <div className="action-buttons">
        <button type="button" disabled={busy} onClick={() => void actions.onRunAction("plan", {})}>Plan Mission dry-run</button>
        <button type="button" disabled={busy} onClick={() => void actions.onRunAction("codex-dry-run", {})}>Generate Codex dry-run</button>
        <button type="button" disabled={busy} onClick={() => void actions.onRunAction("qa-dry-run", {})}>Run QA dry-run</button>
        <button type="button" disabled={busy} onClick={() => void actions.onRunAction("qa-dry-run", { withSampleBug: true })}>Run QA dry-run with Sample Bug</button>
        <button type="button" disabled={busy} onClick={() => void actions.onRunAction("fix-dry-run", {})}>Run Fix dry-run</button>
        <button type="button" disabled={busy} onClick={() => void actions.onRunAction("loop-dry-run", {})}>Run Full Loop dry-run</button>
        <button type="button" disabled={busy} onClick={() => void actions.onRefresh()}>Refresh Summary</button>
      </div>
      {renderActionStatus(actionState)}
    </section>
  );
}

function renderActionStatus(actionState: ActionState): ReactElement | null {
  if (actionState.loading !== "") {
    return <p className="action-status">{`Running ${actionState.loading}`}</p>;
  }
  if (actionState.error !== "") {
    return <p className="action-status error">{actionState.error}</p>;
  }
  if (actionState.message !== "") {
    return <p className="action-status success">{actionState.message}</p>;
  }
  return null;
}

function renderPlaceholderView(page: string): ReactElement {
  const title = navItems.find((item) => item.id === page)?.label ?? page;
  return (
    <main className="content-surface">
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p>Simple list placeholder for this Hub MVP pass</p>
        </div>
        <span className="status-pill">empty state</span>
      </header>
      <section className="panel empty-state">
        <h2>No records loaded</h2>
        <p>This page is reserved for Orchestrator API backed list views. Dashboard, Mission Detail, and Integrations are active in this MVP slice.</p>
      </section>
    </main>
  );
}

function metricCard(title: string, value: string, rows: string[]): ReactElement {
  return (
    <article className="metric-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <div>{rows.map((row) => <small key={row}>{row}</small>)}</div>
    </article>
  );
}

function renderHealthSignals(signals: DashboardResponse["healthSignals"]): ReactElement {
  return (
    <section className="panel">
      <div className="panel-heading"><h2>Health signals</h2></div>
      {signals.length === 0 ? <p className="empty-line">No health signals reported</p> : signals.map((signal) => (
        <div className="list-row" key={signal.key}>
          <div>
            <strong>{signal.message}</strong>
            <span>{signal.key}</span>
          </div>
          <span>{signal.status} / {signal.count}</span>
        </div>
      ))}
    </section>
  );
}

function renderIntegrationCards(integrations: IntegrationStatus[]): ReactElement {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Integration status</h2>
        <span>No real network calls</span>
      </div>
      {integrations.length === 0 ? <p className="empty-line">No integrations reported</p> : integrations.map((integration) => (
        <div className="list-row" key={integration.name}>
          <div>
            <strong>{formatProvider(integration)}</strong>
            <span>{integration.message}</span>
          </div>
          <span>{integration.mode} / safe {String(integration.safeToRun)}</span>
        </div>
      ))}
    </section>
  );
}

function renderActionList(title: string, actions: string[], emptyText: string): ReactElement {
  return (
    <section className="panel">
      <div className="panel-heading"><h2>{title}</h2></div>
      {actions.length === 0 ? <p className="empty-line">{emptyText}</p> : actions.map((action) => <p className="action-line" key={action}>{action}</p>)}
    </section>
  );
}

function renderMissionList(title: string, missions: Mission[]): ReactElement {
  return (
    <section className="panel">
      <div className="panel-heading"><h2>{title}</h2></div>
      {missions.length === 0 ? <p className="empty-line">No missions yet</p> : missions.map((mission) => (
        <div className="list-row" key={mission.id}>
          <div>
            <strong>{mission.title}</strong>
            <span>{mission.id}</span>
          </div>
          <span>{mission.status}</span>
        </div>
      ))}
    </section>
  );
}

function renderBugList(title: string, bugs: BugReport[]): ReactElement {
  return (
    <section className="panel">
      <div className="panel-heading"><h2>{title}</h2></div>
      {bugs.length === 0 ? <p className="empty-line">No bugs reported</p> : bugs.map((bug) => (
        <div className="list-row" key={bug.id}>
          <div>
            <strong>{bug.title}</strong>
            <span>{bug.id}</span>
          </div>
          <span>{bug.severity} / {bug.status}</span>
        </div>
      ))}
    </section>
  );
}

function renderWorkerRunList(title: string, workerRuns: WorkerRun[]): ReactElement {
  return (
    <section className="panel">
      <div className="panel-heading"><h2>{title}</h2></div>
      {workerRuns.length === 0 ? <p className="empty-line">No worker runs yet</p> : workerRuns.map((run) => (
        <div className="list-row" key={run.id}>
          <div>
            <strong>{run.id}</strong>
            <span>{run.worker_type} / {run.mode ?? "unknown"}</span>
          </div>
          <span>{run.status}</span>
        </div>
      ))}
    </section>
  );
}

function renderQaRunList(title: string, qaRuns: QAReport[]): ReactElement {
  return (
    <section className="panel">
      <div className="panel-heading"><h2>{title}</h2></div>
      {qaRuns.length === 0 ? <p className="empty-line">No QA runs yet</p> : qaRuns.map((run) => (
        <div className="list-row" key={run.id}>
          <div>
            <strong>{run.id}</strong>
            <span>{run.summary}</span>
          </div>
          <span>{run.status} / failed {run.failed ?? 0}</span>
        </div>
      ))}
    </section>
  );
}

function renderArtifactList(title: string, artifacts: Artifact[]): ReactElement {
  return (
    <section className="panel">
      <div className="panel-heading"><h2>{title}</h2></div>
      {artifacts.length === 0 ? <p className="empty-line">No artifacts yet</p> : artifacts.map((artifact) => (
        <div className="artifact-block" key={artifact.id}>
          <strong>{artifact.type}</strong>
          <span>{artifact.id}</span>
          <code>{artifact.path}</code>
          {artifact.content ? <pre>{artifact.content}</pre> : null}
        </div>
      ))}
    </section>
  );
}

function renderArtifactHighlights(data: MissionSummaryResponse): ReactElement {
  const highlights = [
    ["QA Report", data.qaReportArtifact],
    ["bugs.json", data.bugsJsonArtifact],
    ["Codex command", data.codexCommandArtifact],
    ["fix-mission", data.fixMissionArtifact],
    ["fix-command", data.fixCodexCommandArtifact],
  ] as const;
  return (
    <section className="panel">
      <div className="panel-heading"><h2>Highlighted artifacts</h2></div>
      {highlights.map(([label, artifact]) => (
        <div className="list-row" key={label}>
          <div>
            <strong>{label}</strong>
            <span>{artifact?.path ?? "missing"}</span>
          </div>
          <span>{artifact?.id ?? "none"}</span>
        </div>
      ))}
    </section>
  );
}

function renderEvents(events: MissionSummaryResponse["events"]): ReactElement {
  return (
    <section className="panel">
      <div className="panel-heading"><h2>Mission events</h2></div>
      {events.length === 0 ? <p className="empty-line">No events yet</p> : events.map((event) => (
        <div className="list-row" key={event.id}>
          <div>
            <strong>{event.type}</strong>
            <span>{event.message}</span>
          </div>
          <span>{event.created_at}</span>
        </div>
      ))}
    </section>
  );
}

function renderApprovalList(approvals: MissionSummaryResponse["approvals"]): ReactElement {
  return (
    <section className="panel">
      <div className="panel-heading"><h2>Approval</h2></div>
      {approvals.length === 0 ? <p className="empty-line">No approvals yet</p> : approvals.map((approval) => (
        <div className="list-row" key={approval.id}>
          <div>
            <strong>{approval.type}</strong>
            <span>{approval.reason}</span>
          </div>
          <span>{approval.status}</span>
        </div>
      ))}
    </section>
  );
}

function renderStatusPage(title: string, message: string, tone: "neutral" | "error" = "neutral"): ReactElement {
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

function formatProvider(integration: IntegrationStatus): string {
  return integration.externalName || integration.name.replace("_", "-");
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function readRoute(): { page: string; params: URLSearchParams } {
  const hash = window.location.hash.replace(/^#/, "") || "dashboard";
  const [page, query = ""] = hash.split("?");
  return { page: page || "dashboard", params: new URLSearchParams(query) };
}
