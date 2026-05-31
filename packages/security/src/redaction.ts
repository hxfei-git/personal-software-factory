const REDACTED = "[REDACTED]";
const JWT_PATTERN = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/g;
const URL_USERINFO_PATTERN = /\b([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^@\s/?#]+@)([^\s"'<>),;]+)/g;
const AUTHORIZATION_VALUE_PATTERN = /\b(Authorization\b\s*[:=]\s*)[^\r\n]+/gi;
const JSON_SECRET_FIELD_PATTERN =
  /(["'])([A-Za-z0-9_.-]*(?:token|password|secret|authorization|credential|cookie|session|jwt|api[_-]?key)[A-Za-z0-9_.-]*)\1(\s*:\s*)(?:("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|([^\s,}\]]+))/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b([A-Za-z0-9_.-]*(?:token|password|secret|authorization|credential|cookie|session|jwt|api[_-]?key)[A-Za-z0-9_.-]*)\b(\s*[:=]\s*)(?:Bearer\s+)?(?:("[^"]*")|('[^']*')|([^\s,;\n]+))/gi;

const SECRET_NAME_PARTS = [
  "token",
  "password",
  "secret",
  "authorization",
  "credential",
  "cookie",
  "session",
  "jwt",
  "apikey",
];

function isSecretLikeKey(key: string): boolean {
  const normalized = key.replace(/[\s_.-]/g, "").toLowerCase();
  return SECRET_NAME_PARTS.some((part) => normalized.includes(part));
}

function applyExtraSecrets(input: string, extraSecrets: string[]): string {
  return extraSecrets
    .filter((secret) => secret.length > 0)
    .reduce((output, secret) => output.split(secret).join(REDACTED), input);
}

function redactUrlUserinfo(input: string): string {
  return input.replace(URL_USERINFO_PATTERN, (_match, scheme: string, _userinfo: string, hostAndPath: string) => {
    return `${scheme}${REDACTED}@${hostAndPath}`;
  });
}

function redactStringifiedJson(input: string, extraSecrets: string[]): string | undefined {
  const trimmed = input.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(input);
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    return JSON.stringify(redactJson(parsed, extraSecrets));
  } catch {
    return undefined;
  }
}

export function redactText(input: string, extraSecrets: string[] = []): string {
  const jsonRedacted = redactStringifiedJson(input, extraSecrets);
  if (jsonRedacted !== undefined) {
    return jsonRedacted;
  }

  return redactUrlUserinfo(applyExtraSecrets(input, extraSecrets))
    .replace(AUTHORIZATION_VALUE_PATTERN, (_match, prefix: string) => `${prefix}${REDACTED}`)
    .replace(JWT_PATTERN, REDACTED)
    .replace(
      JSON_SECRET_FIELD_PATTERN,
      (_match, quote: string, key: string, separator: string) => `${quote}${key}${quote}${separator}${REDACTED}`,
    )
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, key: string, separator: string) => `${key}${separator}${REDACTED}`);
}

function redactValue<T>(input: T, extraSecrets: string[], seen: WeakMap<object, unknown>): T {
  if (typeof input === "string") {
    return redactText(input, extraSecrets) as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactValue(item, extraSecrets, seen)) as T;
  }

  if (input && typeof input === "object") {
    const cached = seen.get(input);
    if (cached) {
      return cached as T;
    }

    const output: Record<string, unknown> = {};
    seen.set(input, output);

    for (const [key, value] of Object.entries(input)) {
      output[key] = isSecretLikeKey(key) ? REDACTED : redactValue(value, extraSecrets, seen);
    }

    return output as T;
  }

  return input;
}

export function redactJson<T>(input: T, extraSecrets: string[] = []): T {
  return redactValue(input, extraSecrets, new WeakMap<object, unknown>());
}

export function assertNoSecrets(input: unknown, extraSecrets: string[] = []): void {
  const original = typeof input === "string" ? input : JSON.stringify(input);
  const redacted = typeof input === "string" ? redactText(input, extraSecrets) : JSON.stringify(redactJson(input, extraSecrets));

  if (original !== redacted) {
    throw new Error("Secret-like value detected in unsafe output.");
  }
}
