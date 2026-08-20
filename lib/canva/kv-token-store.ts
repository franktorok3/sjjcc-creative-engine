import "server-only";

/**
 * Durable Canva token persistence for Vercel via Upstash / Vercel KV REST.
 *
 * Env (either pair works):
 * - KV_REST_API_URL + KV_REST_API_TOKEN  (Vercel Marketplace Redis/KV)
 * - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *
 * Never logs token values.
 */

export const CANVA_TOKEN_KV_KEY = "sjjcc:canva:oauth-tokens";
export const CANVA_REFRESH_LOCK_KV_KEY = "sjjcc:canva:oauth-refresh-lock";

export type KvRestConfig = {
  url: string;
  token: string;
};

export function getKvRestConfig(
  env: Record<string, string | undefined> = process.env,
): KvRestConfig | null {
  const url = (
    env.KV_REST_API_URL ||
    env.UPSTASH_REDIS_REST_URL ||
    ""
  ).trim();
  const token = (
    env.KV_REST_API_TOKEN ||
    env.UPSTASH_REDIS_REST_TOKEN ||
    ""
  ).trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export function isCanvaKvStoreConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return getKvRestConfig(env) != null;
}

async function kvCommand<T>(
  config: KvRestConfig,
  command: Array<string | number>,
): Promise<T> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  const json = (await response.json().catch(() => ({}))) as {
    result?: T;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(
      typeof json.error === "string"
        ? json.error
        : `KV command failed (${response.status})`,
    );
  }

  if (typeof json.error === "string") {
    throw new Error(json.error);
  }

  return json.result as T;
}

export async function kvGetString(
  key: string,
  env: Record<string, string | undefined> = process.env,
): Promise<string | null> {
  const config = getKvRestConfig(env);
  if (!config) return null;
  const result = await kvCommand<string | null>(config, ["GET", key]);
  return typeof result === "string" && result.length > 0 ? result : null;
}

export async function kvSetString(
  key: string,
  value: string,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const config = getKvRestConfig(env);
  if (!config) return false;
  await kvCommand(config, ["SET", key, value]);
  return true;
}

/** Acquire a short lock. Returns true if this caller owns the lock. */
export async function kvTryLock(
  key: string,
  ttlSeconds: number,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const config = getKvRestConfig(env);
  if (!config) return true; // no distributed lock available
  const result = await kvCommand<string | null>(config, [
    "SET",
    key,
    "1",
    "EX",
    ttlSeconds,
    "NX",
  ]);
  return result === "OK";
}

export async function kvUnlock(
  key: string,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const config = getKvRestConfig(env);
  if (!config) return;
  try {
    await kvCommand(config, ["DEL", key]);
  } catch {
    // Lock TTL will expire; ignore unlock failures.
  }
}
