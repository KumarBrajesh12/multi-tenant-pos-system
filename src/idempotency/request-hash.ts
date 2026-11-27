import { createHash } from 'crypto';

// JSON with sorted object keys, so {"a":1,"b":2} and {"b":2,"a":1} hash the same.
// Array order is kept - it's part of the request.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashRequest(body: unknown): string {
  return createHash('sha256').update(canonicalJson(body)).digest('hex');
}
