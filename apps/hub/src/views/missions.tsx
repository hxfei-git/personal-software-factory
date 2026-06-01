import type { ReactElement } from "react";
import type { Mission } from "../api/types";
import type { LoadState } from "../App";

interface MissionsViewProps {
  state: LoadState<Mission[]>;
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
        <span className="status-pill">{state.data.length} mission(s)</span>
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
