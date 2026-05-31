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

function containsLineSeparator(command: string): boolean {
  return /[\r\n\u2028\u2029]/.test(command);
}

function containsPathTraversal(command: string): boolean {
  return command.includes("../") || command.includes("..\\");
}

function containsAbsolutePathArgument(command: string): boolean {
  return /(?:^|\s)(?:--[\w.-]+=)?\/[A-Za-z0-9._/-]*(?:\s|$)/.test(command) ||
    /(?:^|\s)(?:--[\w.-]+=)?[A-Za-z]:[\\/][^\s]*(?:\s|$)/.test(command);
}

function containsFileUrl(command: string): boolean {
  return /file:\/\//i.test(command);
}

function containsPassthroughSeparator(command: string): boolean {
  return command.split(/\s+/).includes("--");
}

function containsDangerousToken(command: string): boolean {
  const tokens = command.split(/\s+/);
  const dangerousTokens = new Set(["rm", "sudo", "curl", "wget", "sh", "bash"]);

  if (tokens.some((token) => dangerousTokens.has(token))) {
    return true;
  }

  return tokens.some((token, index) => token === "node" && tokens[index + 1] === "-e");
}

function isAllowedExactCommand(command: string): boolean {
  return new Set([
    "pnpm test",
    "pnpm build",
    "pnpm typecheck",
    "pnpm check",
    "npm run test",
    "npm run build",
    "npm run typecheck",
    "npm run check",
    "pytest",
    "pytest -q",
    "git status",
    "git status --short",
  ]).has(command);
}

export function evaluateCommandPolicy(input: CommandPolicyInput): CommandPolicyResult {
  const normalizedCommand = normalizeCommand(input.command);

  if (containsLineSeparator(input.command)) {
    return deny(normalizedCommand, "Line separators are blocked in commands.");
  }

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

  if (containsPassthroughSeparator(normalizedCommand)) {
    return deny(normalizedCommand, "Passthrough command arguments are blocked.");
  }

  if (containsDangerousToken(normalizedCommand)) {
    return deny(normalizedCommand, "Dangerous command tokens are blocked.");
  }

  if (containsPathTraversal(normalizedCommand)) {
    return deny(normalizedCommand, "Path traversal arguments are blocked.");
  }

  if (containsAbsolutePathArgument(normalizedCommand)) {
    return deny(normalizedCommand, "Absolute path arguments are blocked.");
  }

  if (containsFileUrl(normalizedCommand)) {
    return deny(normalizedCommand, "file URL arguments are blocked.");
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

  if (!input.allowNetwork && /^(?:nc|ncat|ssh|scp|rsync)\b/.test(normalizedCommand)) {
    return deny(normalizedCommand, "Network-capable command requires explicit approval.");
  }

  if (isAllowedExactCommand(normalizedCommand)) {
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
