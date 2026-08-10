import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { BasecampTokenSet } from "./types";

/**
 * Local encrypted credential store for Basecamp OAuth tokens.
 *
 * WARNING (Vercel / serverless): filesystem is ephemeral and not shared.
 * Prefer BASECAMP_ACCESS_TOKEN + BASECAMP_REFRESH_TOKEN env vars on Vercel.
 */

const STORE_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(STORE_DIR, "basecamp-tokens.enc");

type StoredPayload = {
  tokens: BasecampTokenSet;
  updatedAt: string;
};

function getEncryptionKey(): Buffer {
  const raw =
    process.env.CREDENTIAL_ENCRYPTION_KEY ||
    process.env.BASECAMP_CLIENT_SECRET ||
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

function tokensFromEnv(): BasecampTokenSet | null {
  const accessToken = process.env.BASECAMP_ACCESS_TOKEN?.trim();
  if (!accessToken) return null;

  const refreshToken = process.env.BASECAMP_REFRESH_TOKEN?.trim() ?? "";
  const expiresInSec = Number(process.env.BASECAMP_TOKEN_EXPIRES_IN ?? "0");
  const expiresAt =
    expiresInSec > 0 ? Date.now() + expiresInSec * 1000 : Date.now() - 1;

  return {
    accessToken,
    refreshToken,
    expiresAt,
    tokenType: "Bearer",
  };
}

export async function loadBasecampTokens(): Promise<BasecampTokenSet | null> {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const decrypted = decrypt(raw.trim());
    const parsed = JSON.parse(decrypted) as StoredPayload;
    if (parsed?.tokens?.accessToken) {
      return parsed.tokens;
    }
  } catch {
    // Missing or unreadable store — fall through to env.
  }
  return tokensFromEnv();
}

export async function saveBasecampTokens(tokens: BasecampTokenSet): Promise<void> {
  // Vercel serverless: /var/task is read-only — never mkdir/write .data there.
  // OAuth callback keeps tokens in-memory for this request; persist via
  // OAUTH_EXPORT_TOKENS → Vercel env (BASECAMP_ACCESS_TOKEN / REFRESH_TOKEN).
  if (process.env.VERCEL === "1") {
    console.warn(
      "[basecamp.token-store] VERCEL=1: skipping filesystem token write (read-only). Use OAUTH_EXPORT_TOKENS or BASECAMP_* env tokens.",
    );
    return;
  }

  try {
    await mkdir(STORE_DIR, { recursive: true });
    const payload: StoredPayload = {
      tokens,
      updatedAt: new Date().toISOString(),
    };
    const encrypted = encrypt(JSON.stringify(payload));
    await writeFile(STORE_FILE, encrypted, { mode: 0o600 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[basecamp.token-store] filesystem token write skipped: ${message}`,
    );
  }
}

type OauthSession = {
  state: string;
  createdAt: number;
};

const oauthSessions = new Map<string, OauthSession>();
const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;

export function storeBasecampOauthSession(session: OauthSession): void {
  const now = Date.now();
  for (const [key, value] of oauthSessions.entries()) {
    if (now - value.createdAt > OAUTH_SESSION_TTL_MS) {
      oauthSessions.delete(key);
    }
  }
  oauthSessions.set(session.state, session);
}

export function consumeBasecampOauthSession(state: string): OauthSession | null {
  const session = oauthSessions.get(state) ?? null;
  if (!session) return null;
  oauthSessions.delete(state);
  if (Date.now() - session.createdAt > OAUTH_SESSION_TTL_MS) return null;
  return session;
}
