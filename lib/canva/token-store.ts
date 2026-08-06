import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { CanvaTokenSet } from "./types";

/**
 * Local encrypted credential store for Canva OAuth tokens.
 *
 * WARNING (Vercel / serverless): The local filesystem is ephemeral and not shared
 * across instances. Do NOT rely on this store in production on Vercel.
 * Use an external store (database table, Vercel KV, secrets manager, etc.).
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

function tokensFromEnv(): CanvaTokenSet | null {
  const accessToken = process.env.CANVA_ACCESS_TOKEN?.trim();
  const refreshToken = process.env.CANVA_REFRESH_TOKEN?.trim();
  if (!accessToken || !refreshToken) return null;

  // Treat env tokens as "soon to expire" so refresh runs when needed.
  // If only access token is provided without expiry, refresh on first 401.
  const expiresInSec = Number(process.env.CANVA_TOKEN_EXPIRES_IN ?? "0");
  const expiresAt =
    expiresInSec > 0 ? Date.now() + expiresInSec * 1000 : Date.now() - 1;

  return {
    accessToken,
    refreshToken,
    expiresAt,
    tokenType: "Bearer",
  };
}

export async function loadCanvaTokens(): Promise<CanvaTokenSet | null> {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const decrypted = decrypt(raw.trim());
    const parsed = JSON.parse(decrypted) as StoredPayload;
    if (parsed?.tokens?.accessToken && parsed?.tokens?.refreshToken) {
      return parsed.tokens;
    }
  } catch {
    // Missing or unreadable store — fall through to env.
  }
  return tokensFromEnv();
}

export async function saveCanvaTokens(tokens: CanvaTokenSet): Promise<void> {
  if (process.env.VERCEL === "1") {
    console.warn(
      "[canva.token-store] VERCEL=1 detected: filesystem token persistence is ephemeral. Configure an external token store before production use.",
    );
  }

  await mkdir(STORE_DIR, { recursive: true });
  const payload: StoredPayload = {
    tokens,
    updatedAt: new Date().toISOString(),
  };
  const encrypted = encrypt(JSON.stringify(payload));
  await writeFile(STORE_FILE, encrypted, { mode: 0o600 });
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
  // Prune expired sessions.
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
