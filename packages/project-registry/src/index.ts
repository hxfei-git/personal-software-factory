import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import type { Project, ProjectPassport } from "@psf/mission-schema";
import { readProjectPassport } from "@psf/project-passport";

export interface RegistryProject {
  project: Project;
  passport: ProjectPassport;
  passportPath: string;
}

export interface ProjectRegistryErrorDetails {
  projectsRoot?: string;
  projectDir?: string;
  passportPath?: string;
  cause?: string;
}

export class ProjectRegistryError extends Error {
  constructor(
    public readonly code: "INVALID_PROJECT_PASSPORT" | "PROJECT_REGISTRY_READ_ERROR",
    message: string,
    public readonly details: ProjectRegistryErrorDetails = {},
  ) {
    super(message);
    this.name = "ProjectRegistryError";
  }
}

export async function scanProjectRegistry(projectsRoot = "projects"): Promise<RegistryProject[]> {
  let entries;
  try {
    entries = await readdir(projectsRoot, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw new ProjectRegistryError("PROJECT_REGISTRY_READ_ERROR", "Unable to read project registry root", {
      projectsRoot,
      cause: errorMessage(error),
    });
  }

  const projects: RegistryProject[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const projectDir = join(projectsRoot, entry.name);
    const passportPath = join(projectDir, "project.passport.yaml");
    if (!(await fileExists(passportPath))) {
      continue;
    }

    try {
      const passport = await readProjectPassport(passportPath);
      projects.push({ project: projectFromPassport(passport, passportPath), passport, passportPath });
    } catch (error) {
      throw new ProjectRegistryError("INVALID_PROJECT_PASSPORT", "Invalid project passport: " + passportPath, {
        projectDir,
        passportPath,
        cause: errorMessage(error),
      });
    }
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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw new ProjectRegistryError("PROJECT_REGISTRY_READ_ERROR", "Unable to access project passport: " + path, {
      passportPath: path,
      cause: errorMessage(error),
    });
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
