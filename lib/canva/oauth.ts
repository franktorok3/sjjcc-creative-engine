import "server-only";
import { createHash, randomBytes } from "crypto";
import { loadCanvaTokens, saveCanvaTokens } from "./token-store";
import {
  createSignedOauthState,
  parseSignedOauthState,
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
  // Stateless signed state — required on Vercel (no shared in-memory session).
  const state = createSignedOauthState({ codeVerifier });

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
    const payload = parseSignedOauthState(state);
    codeVerifier = payload.v;
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

/**
 * Returns a usable access token, refreshing when expired.
 * Prefer persisted store, then env vars.
 */
export async function getValidCanvaAccessToken(): Promise<string> {
  const tokens = await loadCanvaTokens();
  if (!tokens) {
    throw new CanvaAuthError(
      "CANVA_AUTH_REQUIRED",
      "No Canva tokens found. Set CANVA_ACCESS_TOKEN + CANVA_REFRESH_TOKEN or visit /api/canva/connect.",
    );
  }

  if (tokens.expiresAt > Date.now() + 30_000) {
    return tokens.accessToken;
  }

  try {
    const refreshed = await refreshCanvaAccessToken(tokens.refreshToken);
    return refreshed.accessToken;
  } catch (error) {
    if (tokens.accessToken) {
      return tokens.accessToken;
    }
    throw error;
  }
}
