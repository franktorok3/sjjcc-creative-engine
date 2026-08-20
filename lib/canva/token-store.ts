import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { CanvaTokenSet } from "./types";
import {
  CANVA_TOKEN_KV_KEY,
  isCanvaKvStoreConfigured,
  kvGetString,
  kvSetString,
} from "./kv-token-store";

/**
 * Canva OAuth token persistence.
 *
 * Priority (load):
 * 1. Durable KV / Upstash Redis (Vercel-safe, required for auto-refresh)
 * 2. Local encrypted file (dev / non-Vercel)
 * 3. CANVA_ACCESS_TOKEN + CANVA_REFRESH_TOKEN env
 *
 * On Vercel, rotated refresh tokens MUST be written to KV — filesystem is
 * read-only / ephemeral and cannot store single-use refresh rotations.
 */

const STORE_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(STORE_DIR, "canva-tokens.enc");

type StoredPayload = {
  tokens: CanvaTokenSet;
  updatedAt: string;
};

function getEncryptionKey(): Buffer {
  const raw =
    process.env.CREDENTIAL_ENCRYPTION_KEY ||
    process.env.CANVA_CLIENT_SECRET ||
    "local-dev-only-insecure-key";
  return createHash("sha256").update(raw).digest();
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

function parseStoredPayload(raw: string): CanvaTokenSet | null {
  try {
    const decrypted = decrypt(raw.trim());
    const parsed = JSON.parse(decrypted) as StoredPayload;
    if (parsed?.tokens?.accessToken && parsed?.tokens?.refreshToken) {
      return {
        ...parsed.tokens,
        source: parsed.tokens.source ?? "store",
      };
    }
  } catch {
    // Corrupt / wrong key — fall through.
  }
  return null;
}

function encodeStoredPayload(tokens: CanvaTokenSet): string {
  const payload: StoredPayload = {
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      tokenType: tokens.tokenType,
      source: tokens.source ?? "store",
    },
    updatedAt: new Date().toISOString(),
  };
  return encrypt(JSON.stringify(payload));
}

/**
 * Decode a JWT payload without verifying the signature — used only to read `exp`.
 * Never logs or returns the token.
 */
export function readJwtExpiryMs(accessToken: string): number | null {
  const parts = accessToken.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as { exp?: unknown };
    if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build CanvaTokenSet from env. Expiry comes from the access-token JWT `exp`
 * (or CANVA_TOKEN_EXPIRES_IN override). Never marks tokens as already-expired
 * when expiry is unknown — that previously forced an immediate refresh.
 */
export function tokensFromEnv(
  env: Record<string, string | undefined> = process.env,
): CanvaTokenSet | null {
  const accessToken = env.CANVA_ACCESS_TOKEN?.trim();
  const refreshToken = env.CANVA_REFRESH_TOKEN?.trim();
  if (!accessToken || !refreshToken) return null;

  const expiresInSec = Number(env.CANVA_TOKEN_EXPIRES_IN ?? "0");
  const jwtExpMs = readJwtExpiryMs(accessToken);

  let expiresAt: number;
  if (expiresInSec > 0) {
    expiresAt = Date.now() + expiresInSec * 1000;
  } else if (jwtExpMs != null) {
    expiresAt = jwtExpMs;
  } else {
    // Non-JWT or missing exp: assume Canva's ~4h window so we do NOT refresh.
    expiresAt = Date.now() + 4 * 60 * 60 * 1000;
  }

  return {
    accessToken,
    refreshToken,
    expiresAt,
    tokenType: "Bearer",
    source: "env",
  };
}

/**
 * True when a rotated refresh token can be persisted durably.
 * Required before auto-refresh on Vercel (single-use Canva refresh tokens).
 */
export function canPersistCanvaTokenRotation(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (isCanvaKvStoreConfigured(env)) return true;
  // Local / non-Vercel: encrypted filesystem store works.
  return env.VERCEL !== "1";
}

async function loadFromKv(): Promise<CanvaTokenSet | null> {
  if (!isCanvaKvStoreConfigured()) return null;
  try {
    const raw = await kvGetString(CANVA_TOKEN_KV_KEY);
    if (!raw) return null;
    const tokens = parseStoredPayload(raw);
    if (!tokens) return null;
    return { ...tokens, source: "remote" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[canva.token-store] KV load failed: ${message}`);
    return null;
  }
}

async function loadFromFilesystem(): Promise<CanvaTokenSet | null> {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const tokens = parseStoredPayload(raw);
    if (!tokens) return null;
    return { ...tokens, source: tokens.source ?? "store" };
  } catch {
    return null;
  }
}

export async function loadCanvaTokens(): Promise<CanvaTokenSet | null> {
  const remote = await loadFromKv();
  if (remote) return remote;

  const local = await loadFromFilesystem();
  if (local) return local;

  return tokensFromEnv();
}

export async function saveCanvaTokens(tokens: CanvaTokenSet): Promise<void> {
  const toStore: CanvaTokenSet = {
    ...tokens,
    source: tokens.source === "env" ? "store" : (tokens.source ?? "store"),
  };
  const encoded = encodeStoredPayload(toStore);

  let kvSaved = false;
  if (isCanvaKvStoreConfigured()) {
    try {
      kvSaved = await kvSetString(CANVA_TOKEN_KV_KEY, encoded);
      if (kvSaved) {
        toStore.source = "remote";
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[canva.token-store] KV save failed: ${message}`);
    }
  }

  // Vercel serverless: /var/task is read-only — never mkdir/write .data there.
  if (process.env.VERCEL === "1") {
    if (!kvSaved) {
      console.warn(
        "[canva.token-store] VERCEL=1: no durable KV save. Set KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*) so Canva tokens can auto-renew.",
      );
    }
    return;
  }

  try {
    await mkdir(STORE_DIR, { recursive: true });
    await writeFile(STORE_FILE, encoded, { mode: 0o600 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[canva.token-store] filesystem token write skipped: ${message}`,
    );
  }
}

/** Short-lived PKCE session state (local only). */
type OauthSession = {
  codeVerifier: string;
  state: string;
  createdAt: number;
};

const oauthSessions = new Map<string, OauthSession>();
const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;

export function storeOauthSession(session: OauthSession): void {
  const now = Date.now();
  for (const [key, value] of oauthSessions.entries()) {
    if (now - value.createdAt > OAUTH_SESSION_TTL_MS) {
      oauthSessions.delete(key);
    }
  }
  oauthSessions.set(session.state, session);
}

export function consumeOauthSession(state: string): OauthSession | null {
  const session = oauthSessions.get(state) ?? null;
  if (!session) return null;
  oauthSessions.delete(state);
  if (Date.now() - session.createdAt > OAUTH_SESSION_TTL_MS) return null;
  return session;
}
