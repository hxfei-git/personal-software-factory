export function isSensitiveKey(key: string): boolean {
  return /token|password|secret|api[_-]?key|authorization/i.test(key);
}

export function redactDisplayValue(value: string): string {
  return value
    .replace(/\b(Bearer\s+)[^\s,;)]+/gi, "$1[redacted]")
    .replace(/\b(token|password|api[_-]?key|apikey|secret|authorization)=([^&\s,;)]+)/gi, (_match, key: string) => key + "=[redacted]")
    .replace(/([?&](?:token|password|api[_-]?key|secret)=)[^&#\s]+/gi, "$1[redacted]");
}

export function redactJsonForDisplay(value: unknown): unknown {
  if (typeof value === "string") {
    return redactDisplayValue(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactJsonForDisplay);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        isSensitiveKey(key) ? "[redacted]" : redactJsonForDisplay(entry),
      ]),
    );
  }
  return value;
}
