import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Project, ProjectPassport } from "@psf/mission-schema";
import { readProjectPassport } from "@psf/project-passport";

export interface RegistryProject {
  project: Project;
  passport: ProjectPassport;
  passportPath: string;
}

export async function scanProjectRegistry(projectsRoot = "projects"): Promise<RegistryProject[]> {
  let entries;
  try {
    entries = await readdir(projectsRoot, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const projects: RegistryProject[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const passportPath = join(projectsRoot, entry.name, "project.passport.yaml");
    const passport = await readProjectPassport(passportPath);
    projects.push({ project: projectFromPassport(passport, passportPath), passport, passportPath });
  }

  return projects.sort((left, right) => left.project.id.localeCompare(right.project.id));
}

export function findProjectById(projects: RegistryProject[], projectId: string): RegistryProject | null {
  return projects.find((entry) => entry.project.id === projectId) ?? null;
}

export function projectFromPassport(passport: ProjectPassport, passportPath: string): Project {
  const now = new Date().toISOString();
  return {
    id: passport.id,
    slug: passport.id,
    name: passport.name,
    description: passport.description ?? "",
    repo_url: passport.repo.url,
    default_branch: passport.repo.default_branch,
    local_path: `./workspaces/${passport.id}`,
    passport_path: passportPath,
    production_url: passport.urls.production,
    staging_url: passport.urls.staging,
    status: "active",
    created_at: now,
    updated_at: now,
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
