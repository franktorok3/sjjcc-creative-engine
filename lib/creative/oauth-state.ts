import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Stateless signed OAuth state for serverless (Vercel).
 * In-memory session maps do not survive across instances.
 */

type SignedStatePayload = {
  v?: string; // PKCE code_verifier (Canva)
  n: string; // nonce
  e: number; // expiresAt ms
};

function signingSecret(): string {
  return (
    process.env.CREDENTIAL_ENCRYPTION_KEY?.trim() ||
    process.env.CANVA_CLIENT_SECRET?.trim() ||
    process.env.BASECAMP_CLIENT_SECRET?.trim() ||
    "local-dev-only-insecure-oauth-state"
  );
}

function sign(payloadB64: string): string {
  return createHmac("sha256", signingSecret())
    .update(payloadB64)
    .digest("base64url");
}

export function createSignedOauthState(input?: {
  codeVerifier?: string;
  ttlMs?: number;
}): string {
  const payload: SignedStatePayload = {
    ...(input?.codeVerifier ? { v: input.codeVerifier } : {}),
    n: Buffer.from(
      `${Date.now()}-${Math.random()}`,
    ).toString("base64url"),
    e: Date.now() + (input?.ttlMs ?? 10 * 60 * 1000),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function parseSignedOauthState(state: string): SignedStatePayload {
  const [payloadB64, signature] = state.split(".");
  if (!payloadB64 || !signature) {
    throw new Error("OAuth state missing payload or signature");
  }

  const expected = sign(payloadB64);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("OAuth state signature invalid");
  }

  let payload: SignedStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as SignedStatePayload;
  } catch {
    throw new Error("OAuth state payload invalid");
  }

  if (!payload?.n || typeof payload.e !== "number") {
    throw new Error("OAuth state payload incomplete");
  }
  if (Date.now() > payload.e) {
    throw new Error("OAuth state expired");
  }

  return payload;
}
