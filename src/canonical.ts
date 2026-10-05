/**
 * Canonical JSON as Predge signs it: keys sorted lexicographically at every level,
 * no insignificant whitespace (a subset of RFC 8785 / JCS). Values in signed
 * payloads are strings, booleans, null, arrays and objects; integers are fine too.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}
