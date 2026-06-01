import type { ReactElement } from "react";
import type { Project } from "../api/types";
import type { LoadState } from "../App";

interface ProjectsViewProps {
  state: LoadState<Project[]>;
  selectedId?: string | undefined;
}

export function renderProjectsView({ state, selectedId }: ProjectsViewProps): ReactElement {
  if (state.status === "loading" || state.status === "idle") {
    return renderListStatus("Projects", "Loading GET /projects from Orchestrator API");
  }
  if (state.status === "error") {
    return renderListStatus("Projects", "API unavailable: " + state.message, "error");
  }

  const selectedProject = selectedId ? state.data.find((project) => project.id === selectedId) : undefined;

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
              <a className="inline-link" href={`#projects?id=${encodeURIComponent(project.id)}`}>Open detail</a>
            </div>
            <span className="status-pill">{project.status}</span>
          </article>
        ))}
      </section>
      {selectedId ? renderProjectDetail(selectedProject, selectedId) : null}
    </main>
  );
}

function renderProjectDetail(project: Project | undefined, selectedId: string): ReactElement {
  if (!project) {
    return (
      <section className="panel detail-panel">
        <h2>Project detail</h2>
        <p className="empty-line">Project not found in GET /projects result: {selectedId}</p>
      </section>
    );
  }
  return (
    <section className="panel detail-panel" aria-label="Project detail">
      <div className="panel-heading"><h2>Project detail</h2><span>{project.id}</span></div>
      <dl className="definition-grid">
        <dt>name</dt><dd>{project.name}</dd>
        <dt>repo</dt><dd>{project.repo_url}</dd>
        <dt>default_branch</dt><dd>{project.default_branch}</dd>
        <dt>production_url</dt><dd>{project.production_url ?? "none"}</dd>
        <dt>staging_url</dt><dd>{project.staging_url ?? "none"}</dd>
        <dt>passport_path</dt><dd>{project.passport_path ?? "none"}</dd>
      </dl>
    </section>
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
