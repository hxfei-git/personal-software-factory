import type { ChangeEvent, FormEvent, ReactElement } from "react";
import type { CreateMissionRequest, Mission, Project } from "../api/types";
import type { LoadState } from "../App";

interface MissionsViewProps {
  state: LoadState<Mission[]>;
}

export type MissionCreationField = keyof CreateMissionRequest;

export interface MissionCreationSubmitState {
  loading: boolean;
  message: string;
  error: string;
}

interface MissionCreationViewProps {
  projectsState: LoadState<Project[]>;
  values: CreateMissionRequest;
  submitState: MissionCreationSubmitState;
  onChange: (field: MissionCreationField, value: string) => void;
  onSubmit: (values: CreateMissionRequest) => void | Promise<void>;
}

export function renderMissionsView({ state }: MissionsViewProps): ReactElement {
  if (state.status === "loading" || state.status === "idle") {
    return renderListStatus("Missions", "Loading GET /missions from Orchestrator API");
  }
  if (state.status === "error") {
    return renderListStatus("Missions", "API unavailable: " + state.message, "error");
  }

  return (
    <main className="content-surface">
      <header className="page-header">
        <div>
          <h1>Missions</h1>
          <p>Mission list from GET /missions</p>
        </div>
        <div className="record-actions">
          <span className="status-pill">{state.data.length} mission(s)</span>
          <a className="button-link" href="#missions/new">New Mission</a>
        </div>
      </header>
      <section className="panel record-list" aria-label="Missions">
        {state.data.length === 0 ? <p className="empty-line">No missions loaded from Orchestrator API</p> : state.data.map((mission) => (
          <article className="record-row" key={mission.id}>
            <div>
              <h2>{mission.title}</h2>
              <p>{mission.raw_request}</p>
              <div className="record-meta">
                <span>{mission.id}</span>
                <span>{mission.priority}</span>
                <span>{mission.risk_level}</span>
                <span>attempt {mission.current_attempt}/{mission.max_attempts}</span>
              </div>
            </div>
            <div className="record-actions">
              <span className="status-pill">{mission.status}</span>
              <a className="button-link" href={`#mission-detail?id=${encodeURIComponent(mission.id)}`}>Open</a>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

export function renderMissionCreationView({
  projectsState,
  values,
  submitState,
  onChange,
  onSubmit,
}: MissionCreationViewProps): ReactElement {
  if (projectsState.status === "loading" || projectsState.status === "idle") {
    return renderListStatus("Create Mission", "Loading GET /projects from Orchestrator API");
  }
  if (projectsState.status === "error") {
    return renderListStatus("Create Mission", "API unavailable: " + projectsState.message, "error");
  }

  const projects = projectsState.data;
  const busy = submitState.loading;
  const projectChoicesDisabled = busy || projects.length === 0;
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void onSubmit(values);
  };
  const handleFieldChange = (field: MissionCreationField) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
    onChange(field, event.currentTarget.value);
  };

  return (
    <main className="content-surface">
      <header className="page-header">
        <div>
          <h1>Create Mission</h1>
          <p>Create a Mission through POST /missions</p>
        </div>
        <span className="status-pill">Orchestrator API write</span>
      </header>

      <section className="panel" aria-label="Create Mission form">
        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            <span>Project</span>
            <select value={values.projectId} disabled={projectChoicesDisabled} onChange={handleFieldChange("projectId")} required>
              {projects.length === 0 ? <option value="">No registered projects</option> : null}
              {projects.map((project) => (
                <option value={project.id} key={project.id}>{project.name} ({project.slug})</option>
              ))}
            </select>
          </label>
          <label>
            <span>Title</span>
            <input value={values.title} disabled={busy} onChange={handleFieldChange("title")} required />
          </label>
          <label>
            <span>Raw request</span>
            <textarea value={values.rawRequest} disabled={busy} onChange={handleFieldChange("rawRequest")} required />
          </label>
          <label>
            <span>Priority</span>
            <select value={values.priority ?? "P2"} disabled={busy} onChange={handleFieldChange("priority")}>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
            </select>
          </label>
          <label>
            <span>Risk level</span>
            <select value={values.riskLevel ?? "medium"} disabled={busy} onChange={handleFieldChange("riskLevel")}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <button type="submit" disabled={busy || projects.length === 0}>Create Mission</button>
        </form>
        {projects.length === 0 ? <p className="empty-line">Register a project before creating a Mission.</p> : null}
        {submitState.loading ? <p className="action-status">Creating Mission through Orchestrator API</p> : null}
        {submitState.message ? <p className="action-status success">{submitState.message}</p> : null}
        {submitState.error ? <p className="action-status error">{submitState.error}</p> : null}
      </section>
    </main>
  );
}

export function renderMissionSelectionRequiredView(): ReactElement {
  return (
    <main className="content-surface">
      <header className="page-header">
        <div>
          <h1>Mission Detail</h1>
          <p>Select a mission to view details</p>
        </div>
        <span className="status-pill">selection required</span>
      </header>
      <section className="panel empty-state">
        <h2>No mission selected</h2>
        <p>Open a mission from the Missions list, or use a detail URL like #mission-detail?id=mission-0001-ai-novelist-chapter-review.</p>
      </section>
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
