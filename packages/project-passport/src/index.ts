import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import {
  ProjectPassportSchema,
  type ProjectPassport,
} from "@psf/mission-schema";

type CommandValue = string | string[];

export async function readProjectPassport(path: string): Promise<ProjectPassport> {
  const raw = await readFile(path, "utf8");
  return parseProjectPassport(raw);
}

export function parseProjectPassport(raw: string): ProjectPassport {
  const parsed = parse(raw);
  return normalizeProjectPassport(ProjectPassportSchema.parse(parsed));
}

export function normalizeProjectPassport(passport: ProjectPassport): ProjectPassport {
  const commands: ProjectPassport["commands"] = {
    install: normalizeCommands(passport.commands.install),
    test: normalizeCommands(passport.commands.test),
    build: normalizeCommands(passport.commands.build),
    run_staging: normalizeCommands(passport.commands.run_staging),
    ...(passport.commands.dev === undefined ? {} : { dev: normalizeCommands(passport.commands.dev) }),
    ...(passport.commands.e2e === undefined ? {} : { e2e: normalizeCommands(passport.commands.e2e) }),
    ...(passport.commands.lint === undefined ? {} : { lint: normalizeCommands(passport.commands.lint) }),
  };

  return {
    ...passport,
    commands,
  };
}

function normalizeCommands(commands: CommandValue): string[] {
  return Array.isArray(commands) ? commands : [commands];
}
