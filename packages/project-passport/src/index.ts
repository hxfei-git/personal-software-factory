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
  return {
    ...passport,
    commands: {
      install: normalizeCommands(passport.commands.install),
      test: normalizeCommands(passport.commands.test),
      build: normalizeCommands(passport.commands.build),
      run_staging: normalizeCommands(passport.commands.run_staging),
    },
  };
}

function normalizeCommands(commands: CommandValue): string[] {
  return Array.isArray(commands) ? commands : [commands];
}
