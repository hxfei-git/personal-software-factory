import type { IntegrationEnv } from "./types.js";

const SECRET_NAME_PATTERN = /(token|password|secret|key|credential)/i;

export function collectSecretValues(env: IntegrationEnv = {}): string[] {
  return Object.entries(env)
    .filter(([name, value]) => SECRET_NAME_PATTERN.test(name) && typeof value === "string" && value.length > 0)
    .map(([, value]) => value as string);
}

export function redactText(value: string, env: IntegrationEnv = {}): string {
  return collectSecretValues(env).reduce((redacted, secret) => redacted.split(secret).join("[REDACTED]"), value);
}

export function redactValue<T>(value: T, env: IntegrationEnv = {}): T {
  if (typeof value === "string") {
    return redactText(value, env) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, env)) as T;
  }

  if (value && typeof value === "object") {
    const redactedEntries = Object.entries(value).map(([key, entryValue]) => [key, redactValue(entryValue, env)]);
    return Object.fromEntries(redactedEntries) as T;
  }

  return value;
}
