import "server-only";
import { createHash, randomBytes } from "crypto";
import { loadCanvaTokens, saveCanvaTokens } from "./token-store";
import {
  createEncryptedOauthState,
  parseEncryptedOauthState,
} from "@/lib/creative/oauth-state";
import { CANVA_REQUIRED_SCOPES, type CanvaTokenSet } from "./types";

const CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";

export class CanvaAuthError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanvaAuthError";
    this.code = code;
  }
}

function requireCanvaAppConfig() {
  const clientId = process.env.CANVA_CLIENT_ID?.trim();
  const clientSecret = process.env.CANVA_CLIENT_SECRET?.trim();
  const redirectUri = process.env.CANVA_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new CanvaAuthError(
      "CANVA_AUTH_CONFIG_MISSING",
      "Missing CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, or CANVA_REDIRECT_URI",
    );
  }

  return { clientId, clientSecret, redirectUri };
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function createCodeVerifier(): string {
  return randomBytes(96).toString("base64url");
}

function createCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function getCanvaScopes(): string {
  return (
    process.env.CANVA_SCOPES?.trim() || CANVA_REQUIRED_SCOPES.join(" ")
  );
}

export async function buildCanvaAuthorizeUrl(): Promise<string> {
  const { clientId, redirectUri } = requireCanvaAppConfig();
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);
  // Stateless encrypted state — required on Vercel (no shared in-memory session).
  const state = createEncryptedOauthState({
    provider: "canva",
    codeVerifier,
  });

  const params = new URLSearchParams({
    code_challenge: codeChallenge,
    code_challenge_method: "s256",
    scope: getCanvaScopes(),
    response_type: "code",
    client_id: clientId,
    state,
    redirect_uri: redirectUri,
  });

  return `${CANVA_AUTH_URL}?${params.toString()}`;
}

async function exchangeToken(body: URLSearchParams): Promise<CanvaTokenSet> {
  const { clientId, clientSecret } = requireCanvaAppConfig();

  const response = await fetch(CANVA_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const message =
      typeof json.message === "string"
        ? json.message
        : typeof json.error_description === "string"
          ? json.error_description
          : `Canva token exchange failed (${response.status})`;
    throw new CanvaAuthError("CANVA_TOKEN_EXCHANGE_FAILED", message);
  }

  const accessToken = String(json.access_token ?? "");
  const refreshToken = String(json.refresh_token ?? "");
  const expiresIn = Number(json.expires_in ?? 14400);

  if (!accessToken || !refreshToken) {
    throw new CanvaAuthError(
      "CANVA_TOKEN_EXCHANGE_FAILED",
      "Token response missing access_token or refresh_token",
    );
  }

  const tokens: CanvaTokenSet = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + Math.max(expiresIn - 60, 30) * 1000,
    scope: typeof json.scope === "string" ? json.scope : undefined,
    tokenType:
      typeof json.token_type === "string" ? json.token_type : "Bearer",
  };

  await saveCanvaTokens(tokens);
  return tokens;
}

export async function exchangeAuthorizationCode(
  code: string,
  state: string,
): Promise<CanvaTokenSet> {
  const { redirectUri } = requireCanvaAppConfig();

  let codeVerifier: string | undefined;
  try {
    const payload = parseEncryptedOauthState(state, {
      expectedProvider: "canva",
    });
    codeVerifier = payload.codeVerifier;
  } catch {
    throw new CanvaAuthError(
      "CANVA_OAUTH_STATE_INVALID",
      "Invalid or expired OAuth state. Restart /api/canva/connect.",
    );
  }

  if (!codeVerifier) {
    throw new CanvaAuthError(
      "CANVA_OAUTH_STATE_INVALID",
      "OAuth state missing PKCE verifier. Restart /api/canva/connect.",
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });

  return exchangeToken(body);
}

export async function refreshCanvaAccessToken(
  refreshToken: string,
): Promise<CanvaTokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return exchangeToken(body);
}

/** Single-flight: concurrent callers share one refresh attempt. */
let refreshInFlight: Promise<CanvaTokenSet> | null = null;
let refreshAttemptCount = 0;

/** Test-only counter — never exposes token values. */
export function getCanvaRefreshAttemptCountForTests(): number {
  return refreshAttemptCount;
}

export function resetCanvaRefreshGuardForTests(): void {
  refreshInFlight = null;
  refreshAttemptCount = 0;
}

async function refreshCanvaAccessTokenSingleFlight(
  refreshToken: string,
): Promise<CanvaTokenSet> {
  if (refreshInFlight) return refreshInFlight;
  refreshAttemptCount += 1;
  refreshInFlight = refreshCanvaAccessToken(refreshToken).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

const ACCESS_TOKEN_SKEW_MS = 60_000;

/**
 * Returns a usable access token.
 *
 * Env-sourced tokens: use JWT `exp` from load; never auto-refresh.
 * If still valid (not within 60s of expiry), return as-is.
 * If expired, throw CANVA_REAUTH_REQUIRED (operator must reconnect).
 *
 * Store-sourced tokens (local): may refresh once via single-flight.
 */
export async function getValidCanvaAccessToken(): Promise<string> {
  const tokens = await loadCanvaTokens();
  if (!tokens) {
    throw new CanvaAuthError(
      "CANVA_AUTH_REQUIRED",
      "No Canva tokens found. Set CANVA_ACCESS_TOKEN + CANVA_REFRESH_TOKEN or visit /api/canva/connect.",
    );
  }

  if (tokens.expiresAt > Date.now() + ACCESS_TOKEN_SKEW_MS) {
    return tokens.accessToken;
  }

  // PoC: env tokens must not auto-refresh (refresh tokens are single-use and
  // cannot be persisted durably on Vercel).
  if (tokens.source === "env") {
    throw new CanvaAuthError(
      "CANVA_REAUTH_REQUIRED",
      "Canva access token from env is expired or near expiry. Revisit /api/canva/connect with OAUTH_EXPORT_TOKENS=1, copy the new tokens into Vercel, then disable export.",
    );
  }

  try {
    const refreshed = await refreshCanvaAccessTokenSingleFlight(
      tokens.refreshToken,
    );
    return refreshed.accessToken;
  } catch (error) {
    if (error instanceof CanvaAuthError) throw error;
    throw new CanvaAuthError(
      "CANVA_REAUTH_REQUIRED",
      "Canva token refresh failed. Revisit /api/canva/connect and update Vercel env tokens.",
    );
  }
}
