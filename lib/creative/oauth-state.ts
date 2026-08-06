import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

/**
 * Stateless AES-256-GCM encrypted OAuth state for serverless (Vercel).
 *
 * Keys are derived from existing provider client secrets (SHA-256):
 * - canva    → CANVA_CLIENT_SECRET
 * - basecamp → BASECAMP_CLIENT_SECRET
 *
 * No additional secrets are introduced. The Canva PKCE code_verifier is only
 * recoverable after authenticated decrypt — never readable from the state string.
 */

export type OauthStateProvider = "canva" | "basecamp";

export type OauthStatePayload = {
  provider: OauthStateProvider;
  nonce: string;
  expiresAt: number;
  codeVerifier?: string;
};

export class OauthStateError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OauthStateError";
    this.code = code;
  }
}

function assertProvider(value: unknown): OauthStateProvider {
  if (value === "canva" || value === "basecamp") return value;
  throw new OauthStateError(
    "OAUTH_STATE_INVALID",
    "OAuth state provider is invalid",
  );
}

/**
 * Derive a 32-byte AES key from the provider's existing client secret.
 */
export function resolveOauthStateEncryptionKey(
  provider: OauthStateProvider,
  env: Record<string, string | undefined> = process.env,
): Buffer {
  const envName =
    provider === "canva" ? "CANVA_CLIENT_SECRET" : "BASECAMP_CLIENT_SECRET";
  const raw = env[envName]?.trim();
  if (!raw) {
    throw new OauthStateError(
      "OAUTH_STATE_KEY_MISSING",
      `${envName} is required to encrypt/decrypt ${provider} OAuth state`,
    );
  }
  return createHash("sha256").update(raw).digest();
}

export function createEncryptedOauthState(input: {
  provider: OauthStateProvider;
  codeVerifier?: string;
  ttlMs?: number;
  /** test-only clock override */
  nowMs?: number;
  /** test-only env override */
  env?: Record<string, string | undefined>;
}): string {
  if (input.provider === "canva" && !input.codeVerifier) {
    throw new OauthStateError(
      "OAUTH_STATE_INVALID",
      "Canva OAuth state requires a PKCE codeVerifier",
    );
  }
  if (input.provider === "basecamp" && input.codeVerifier) {
    throw new OauthStateError(
      "OAUTH_STATE_INVALID",
      "Basecamp OAuth state must not include a codeVerifier",
    );
  }

  const now = input.nowMs ?? Date.now();
  const payload: OauthStatePayload = {
    provider: input.provider,
    nonce: randomBytes(16).toString("base64url"),
    expiresAt: now + (input.ttlMs ?? 10 * 60 * 1000),
    ...(input.codeVerifier ? { codeVerifier: input.codeVerifier } : {}),
  };

  const key = resolveOauthStateEncryptionKey(input.provider, input.env);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Opaque: version + base64url(iv || tag || ciphertext). No readable JSON.
  return `v1.${Buffer.concat([iv, tag, encrypted]).toString("base64url")}`;
}

export function parseEncryptedOauthState(
  state: string,
  options?: {
    nowMs?: number;
    expectedProvider?: OauthStateProvider;
    env?: Record<string, string | undefined>;
  },
): OauthStatePayload {
  if (!state || typeof state !== "string") {
    throw new OauthStateError("OAUTH_STATE_INVALID", "OAuth state is missing");
  }

  const [version, blob] = state.split(".");
  if (version !== "v1" || !blob) {
    throw new OauthStateError(
      "OAUTH_STATE_INVALID",
      "OAuth state format is invalid",
    );
  }

  let packed: Buffer;
  try {
    packed = Buffer.from(blob, "base64url");
  } catch {
    throw new OauthStateError(
      "OAUTH_STATE_INVALID",
      "OAuth state encoding is invalid",
    );
  }

  // 12 iv + 16 tag + >=1 ciphertext
  if (packed.length < 29) {
    throw new OauthStateError(
      "OAUTH_STATE_INVALID",
      "OAuth state payload is too short",
    );
  }

  const expectedProvider = options?.expectedProvider;
  if (!expectedProvider) {
    throw new OauthStateError(
      "OAUTH_STATE_INVALID",
      "expectedProvider is required to select the decryption key",
    );
  }

  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const key = resolveOauthStateEncryptionKey(expectedProvider, options?.env);

  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
  } catch {
    throw new OauthStateError(
      "OAUTH_STATE_TAMPERED",
      "OAuth state is tampered or not decryptable",
    );
  }

  let payload: OauthStatePayload;
  try {
    const parsed = JSON.parse(plaintext.toString("utf8")) as Record<
      string,
      unknown
    >;
    payload = {
      provider: assertProvider(parsed.provider),
      nonce: String(parsed.nonce ?? ""),
      expiresAt: Number(parsed.expiresAt),
      ...(typeof parsed.codeVerifier === "string"
        ? { codeVerifier: parsed.codeVerifier }
        : {}),
    };
  } catch (error) {
    if (error instanceof OauthStateError) throw error;
    throw new OauthStateError(
      "OAUTH_STATE_INVALID",
      "OAuth state payload is invalid",
    );
  }

  if (!payload.nonce || !Number.isFinite(payload.expiresAt)) {
    throw new OauthStateError(
      "OAUTH_STATE_INVALID",
      "OAuth state payload is incomplete",
    );
  }

  const now = options?.nowMs ?? Date.now();
  if (now > payload.expiresAt) {
    throw new OauthStateError("OAUTH_STATE_EXPIRED", "OAuth state expired");
  }

  if (payload.provider !== expectedProvider) {
    throw new OauthStateError(
      "OAUTH_STATE_PROVIDER_MISMATCH",
      `OAuth state provider mismatch (expected ${expectedProvider})`,
    );
  }

  if (payload.provider === "canva" && !payload.codeVerifier) {
    throw new OauthStateError(
      "OAUTH_STATE_INVALID",
      "Canva OAuth state missing codeVerifier after decrypt",
    );
  }

  return payload;
}
