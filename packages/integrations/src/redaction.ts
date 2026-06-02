import type { IntegrationEnv } from "./types.js";

const REDACTED = "[REDACTED]";
const URL_PATTERN = /https?:\/\/[^\s"\x27<>)]+/g;
const AUTHORIZATION_VALUE_PATTERN = /\b(authorization\b\s*[:=]\s*)(?:Bearer\s+)?[^\r\n,;)]+/gi;
const SECRET_ASSIGNMENT_PATTERN = /\b(token|password|secret|cookie|credential|authorization|apiKey|api_key|api-key|privateKey|private_key|accessKey|access_key)\b(\s*[:=]\s*)([^&\s,;]+)/gi;

export function isSecretLikeName(name: string): boolean {
  const normalized = name.replace(/[\s_.-]/g, "").toLowerCase();
  return [
    "token",
    "password",
    "secret",
    "cookie",
    "credential",
    "authorization",
    "apikey",
    "privatekey",
    "secretkey",
    "accesskey",
    "sessionkey",
  ].some((secretName) => normalized.includes(secretName));
}

export function collectSecretValues(env: IntegrationEnv = {}): string[] {
  return Object.entries(env)
    .filter(([name, value]) => isSecretLikeName(name) && typeof value === "string" && value.length > 0)
    .map(([, value]) => value as string);
}

function scrubUrl(candidate: string): string {
  try {
    const url = new URL(candidate);

    if (url.username || url.password) {
      url.username = "";
      url.password = "";
    }

    for (const key of [...url.searchParams.keys()]) {
      if (isSecretLikeName(key)) {
        url.searchParams.set(key, REDACTED);
      }
    }

    return url.toString().replaceAll("%5BREDACTED%5D", REDACTED);
  } catch {
    return candidate;
  }
}

function scrubSecretAssignments(value: string): string {
  return value
    .replace(AUTHORIZATION_VALUE_PATTERN, (_match, prefix: string) => `${prefix}${REDACTED}`)
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, key: string, separator: string) => `${key}${separator}${REDACTED}`);
}

export function redactText(value: string, env: IntegrationEnv = {}): string {
  const withoutEnvSecrets = collectSecretValues(env).reduce(
    (redacted, secret) => redacted.split(secret).join(REDACTED),
    value,
  );
  const withoutUnsafeUrls = withoutEnvSecrets.replace(URL_PATTERN, (candidate) => scrubUrl(candidate));

  return scrubSecretAssignments(withoutUnsafeUrls);
}

export function redactValue<T>(value: T, env: IntegrationEnv = {}): T {
  if (typeof value === "string") {
    return redactText(value, env) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, env)) as T;
  }

  if (value && typeof value === "object") {
    const redactedEntries = Object.entries(value).map(([key, entryValue]) => [
      key,
      isSecretLikeName(key) ? REDACTED : redactValue(entryValue, env),
    ]);
    return Object.fromEntries(redactedEntries) as T;
  }

  return value;
}
