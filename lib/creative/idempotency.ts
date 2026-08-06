import "server-only";
import { createHash } from "crypto";

type CachedResult = {
  expiresAt: number;
  payload: unknown;
};

const store = new Map<string, CachedResult>();
const DEFAULT_TTL_MS = 10 * 60 * 1000;

function prune(now = Date.now()) {
  for (const [key, value] of store.entries()) {
    if (value.expiresAt <= now) store.delete(key);
  }
}

export function buildIdempotencyKey(input: {
  submittedAt?: string;
  fields: Record<string, unknown>;
  headerKey?: string | null;
}): string {
  if (input.headerKey?.trim()) {
    return `hdr:${input.headerKey.trim()}`;
  }

  const normalized = JSON.stringify({
    submittedAt: input.submittedAt ?? "",
    fields: input.fields,
  });
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 32);
  return `body:${hash}`;
}

export function getIdempotentResult<T>(key: string): T | null {
  prune();
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.payload as T;
}

export function setIdempotentResult(
  key: string,
  payload: unknown,
  ttlMs = DEFAULT_TTL_MS,
): void {
  prune();
  store.set(key, { payload, expiresAt: Date.now() + ttlMs });
}

/** Test helper */
export function clearIdempotencyStore() {
  store.clear();
}
