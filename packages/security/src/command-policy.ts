import path from "node:path";

export interface CommandPolicyInput {
  command: string;
  cwd: string;
  workspaceRoot: string;
  allowNetwork?: boolean;
  allowGitPush?: boolean;
  timeoutMs: number;
}

export interface CommandPolicyResult {
  allowed: boolean;
  reason: string;
  normalizedCommand: string;
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function deny(normalizedCommand: string, reason: string): CommandPolicyResult {
  return {
    allowed: false,
    reason,
    normalizedCommand,
  };
}

function allow(normalizedCommand: string): CommandPolicyResult {
  return {
    allowed: true,
    reason: "Command is allowed by policy.",
    normalizedCommand,
  };
}

function isInsideWorkspace(candidate: string, workspaceRoot: string): boolean {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(workspaceRoot);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

function containsShellOperator(command: string): boolean {
  return /&&|\|\||[|<>;`]|\$\(|\$\{/.test(command);
}

export function evaluateCommandPolicy(input: CommandPolicyInput): CommandPolicyResult {
  const normalizedCommand = normalizeCommand(input.command);

  if (normalizedCommand.length === 0) {
    return deny(normalizedCommand, "Command is empty.");
  }

  if (input.timeoutMs <= 0) {
    return deny(normalizedCommand, "Command timeout must be positive.");
  }

  if (!isInsideWorkspace(input.cwd, input.workspaceRoot)) {
    return deny(normalizedCommand, "Command cwd is outside the workspace root.");
  }

  if (containsShellOperator(normalizedCommand)) {
    return deny(normalizedCommand, "Shell operators, redirection, and command substitution are blocked.");
  }

  if (/\bsudo\b/.test(normalizedCommand)) {
    return deny(normalizedCommand, "sudo is blocked.");
  }

  if (/^rm\s+.*(?:-[^\s]*r[^\s]*f|-[^\s]*f[^\s]*r).*(?:\s\/|\s\*)/.test(normalizedCommand)) {
    return deny(normalizedCommand, "Destructive rm command is blocked.");
  }

  if (/^chmod\s+777\b.*\s\/(?:\s|$)/.test(normalizedCommand) || /^chmod\s+777\s+-R\s+\//.test(normalizedCommand)) {
    return deny(normalizedCommand, "Unsafe chmod command is blocked.");
  }

  if (/^docker\s+system\s+prune\b/.test(normalizedCommand)) {
    return deny(normalizedCommand, "Docker system prune is blocked.");
  }

  if (/^git\s+push\b/.test(normalizedCommand)) {
    if (!input.allowGitPush) {
      return deny(normalizedCommand, "git push requires explicit approval.");
    }

    if (/\b(?:main|master)\b/.test(normalizedCommand)) {
      return deny(normalizedCommand, "git push to protected branches is blocked.");
    }
  }

  if (!input.allowNetwork && /^(?:curl|wget|nc|ncat|ssh|scp|rsync)\b/.test(normalizedCommand)) {
    return deny(normalizedCommand, "Network-capable command requires explicit approval.");
  }

  if (
    /^pnpm\s+(?:test|build|typecheck|check)(?:\s+[\w./:=+-]+)*$/.test(normalizedCommand) ||
    /^npm\s+run\s+(?:test|build|typecheck|check)(?:\s+[\w./:=+-]+)*$/.test(normalizedCommand) ||
    /^pytest(?:\s+-q)?(?:\s+[\w./:=+-]+)*$/.test(normalizedCommand) ||
    /^git\s+status(?:\s+--short)?$/.test(normalizedCommand)
  ) {
    return allow(normalizedCommand);
  }

  return deny(normalizedCommand, "Command is not allowed by policy.");
}

export function assertCommandAllowed(input: CommandPolicyInput): void {
  const result = evaluateCommandPolicy(input);
  if (!result.allowed) {
    throw new Error(`Command blocked: ${result.reason}`);
  }
}
