import type { ReactElement } from "react";
import type { Project } from "../api/types";
import type { LoadState } from "../App";

interface ProjectsViewProps {
  state: LoadState<Project[]>;
}

export function renderProjectsView({ state }: ProjectsViewProps): ReactElement {
  if (state.status === "loading" || state.status === "idle") {
    return renderListStatus("Projects", "Loading GET /projects from Orchestrator API");
  }
  if (state.status === "error") {
    return renderListStatus("Projects", "API unavailable: " + state.message, "error");
  }

  return (
    <main className="content-surface">
      <header className="page-header">
        <div>
          <h1>Projects</h1>
          <p>Project registry from GET /projects</p>
        </div>
        <span className="status-pill">{state.data.length} project(s)</span>
      </header>
      <section className="panel record-list" aria-label="Projects">
        {state.data.length === 0 ? <p className="empty-line">No projects loaded from Orchestrator API</p> : state.data.map((project) => (
          <article className="record-row" key={project.id}>
            <div>
              <h2>{project.name}</h2>
              <p>{project.description ?? project.slug}</p>
              <div className="record-meta">
                <span>{project.id}</span>
                <span>{project.default_branch}</span>
                <span>{project.repo_url}</span>
              </div>
            </div>
            <span className="status-pill">{project.status}</span>
          </article>
        ))}
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
