import { z } from "zod";

export const CodexExecutionModeSchema = z.enum(["dry-run", "mock", "real"]);

export const CodexMissionFilesSchema = z.object({
  "mission.md": z.string(),
  "acceptance.md": z.string(),
  "technical-notes.md": z.string(),
  "risk-notes.md": z.string(),
}).catchall(z.string());

export const CodexExecutionRequestSchema = z.object({
  missionId: z.string().min(1),
  projectId: z.string().min(1),
  repoUrl: z.string().min(1),
  defaultBranch: z.string().min(1),
  missionFiles: CodexMissionFilesSchema,
  approvalIds: z.array(z.string().min(1)).default([]),
  commands: z.array(z.string().min(1)).default([]),
  branchName: z.string().min(1).optional(),
  workspaceRoot: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().default(300_000),
  mode: CodexExecutionModeSchema.default("dry-run"),
});

export type CodexExecutionMode = z.infer<typeof CodexExecutionModeSchema>;
export type CodexExecutionRequest = z.infer<typeof CodexExecutionRequestSchema>;
export type CodexMissionFiles = z.infer<typeof CodexMissionFilesSchema>;
