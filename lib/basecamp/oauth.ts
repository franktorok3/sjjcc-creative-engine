import "server-only";
import { loadBasecampTokens, saveBasecampTokens } from "./token-store";
import {
  createEncryptedOauthState,
  parseEncryptedOauthState,
} from "@/lib/creative/oauth-state";
import type { BasecampAuthorization, BasecampTokenSet } from "./types";

const BASECAMP_AUTH_URL = "https://launchpad.37signals.com/authorization/new";
const BASECAMP_TOKEN_URL = "https://launchpad.37signals.com/authorization/token";
const BASECAMP_AUTHORIZATION_URL =
  "https://launchpad.37signals.com/authorization.json";

export class BasecampAuthError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BasecampAuthError";
    this.code = code;
  }
}

function requireBasecampAppConfig() {
  const clientId = process.env.BASECAMP_CLIENT_ID?.trim();
  const clientSecret = process.env.BASECAMP_CLIENT_SECRET?.trim();
  const redirectUri = process.env.BASECAMP_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new BasecampAuthError(
      "BASECAMP_AUTH_CONFIG_MISSING",
      "Missing BASECAMP_CLIENT_ID, BASECAMP_CLIENT_SECRET, or BASECAMP_REDIRECT_URI",
    );
  }

  return { clientId, clientSecret, redirectUri };
}

export function buildBasecampAuthorizeUrl(): string {
  const { clientId, redirectUri } = requireBasecampAppConfig();
  // Stateless encrypted state — required on Vercel (no shared in-memory session).
  const state = createEncryptedOauthState({ provider: "basecamp" });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  return `${BASECAMP_AUTH_URL}?${params.toString()}`;
}

async function exchangeToken(body: URLSearchParams): Promise<BasecampTokenSet> {
  const response = await fetch(BASECAMP_TOKEN_URL, {
    method: "POST",
    headers: {
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
      typeof json.error_description === "string"
        ? json.error_description
        : typeof json.error === "string"
          ? json.error
          : `Basecamp token exchange failed (${response.status})`;
    throw new BasecampAuthError("BASECAMP_TOKEN_EXCHANGE_FAILED", message);
  }

  const accessToken = String(json.access_token ?? "");
  const refreshToken = String(json.refresh_token ?? "");
  const expiresIn = Number(json.expires_in ?? 1_209_600);

  if (!accessToken) {
    throw new BasecampAuthError(
      "BASECAMP_TOKEN_EXCHANGE_FAILED",
      "Token response missing access_token",
    );
  }

  const tokens: BasecampTokenSet = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + Math.max(expiresIn - 60, 30) * 1000,
    tokenType:
      typeof json.token_type === "string" ? json.token_type : "Bearer",
  };

  await saveBasecampTokens(tokens);
  return tokens;
}

export async function exchangeBasecampAuthorizationCode(
  code: string,
  state: string,
): Promise<BasecampTokenSet> {
  const { clientId, clientSecret, redirectUri } = requireBasecampAppConfig();

  try {
    parseEncryptedOauthState(state, { expectedProvider: "basecamp" });
  } catch {
    throw new BasecampAuthError(
      "BASECAMP_OAUTH_STATE_INVALID",
      "Invalid or expired OAuth state. Restart /api/basecamp/connect.",
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  return exchangeToken(body);
}

export async function refreshBasecampAccessToken(
  refreshToken: string,
): Promise<BasecampTokenSet> {
  const { clientId, clientSecret } = requireBasecampAppConfig();
  if (!refreshToken) {
    throw new BasecampAuthError(
      "BASECAMP_REFRESH_MISSING",
      "No Basecamp refresh token available. Revisit /api/basecamp/connect.",
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  return exchangeToken(body);
}

export async function getValidBasecampAccessToken(): Promise<string> {
  const tokens = await loadBasecampTokens();
  if (!tokens?.accessToken) {
    throw new BasecampAuthError(
      "BASECAMP_AUTH_REQUIRED",
      "No Basecamp tokens found. Set BASECAMP_ACCESS_TOKEN or visit /api/basecamp/connect.",
    );
  }

  if (tokens.expiresAt > Date.now() + 30_000) {
    return tokens.accessToken;
  }

  if (tokens.refreshToken) {
    try {
      const refreshed = await refreshBasecampAccessToken(tokens.refreshToken);
      return refreshed.accessToken;
    } catch {
      // Fall through and try the existing access token once.
    }
  }

  return tokens.accessToken;
}

export async function fetchBasecampAuthorization(
  accessToken?: string,
): Promise<BasecampAuthorization> {
  const token = accessToken ?? (await getValidBasecampAccessToken());
  const userAgent =
    process.env.BASECAMP_USER_AGENT?.trim() ||
    "SJJCC-Creative-PoC (franktorok3@gmail.com)";

  const response = await fetch(BASECAMP_AUTHORIZATION_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": userAgent,
    },
  });

  const json = (await response.json().catch(() => ({}))) as BasecampAuthorization &
    Record<string, unknown>;

  if (!response.ok) {
    throw new BasecampAuthError(
      "BASECAMP_AUTHORIZATION_FAILED",
      typeof json.error === "string"
        ? json.error
        : `authorization.json failed (${response.status})`,
    );
  }

  return json;
}

/** Prefer env account id; otherwise first Basecamp 3 account from authorization.json. */
export function resolveBasecampAccountId(
  authorization: BasecampAuthorization,
): string {
  const fromEnv = process.env.BASECAMP_ACCOUNT_ID?.trim();
  if (fromEnv) return fromEnv;

  const bc3 = authorization.accounts?.find(
    (account) => account.product === "bc3" || account.product === "basecamp",
  );
  const fallback = authorization.accounts?.[0];
  const id = bc3?.id ?? fallback?.id;
  if (!id) {
    throw new BasecampAuthError(
      "BASECAMP_ACCOUNT_MISSING",
      "No Basecamp account found in authorization.json and BASECAMP_ACCOUNT_ID is unset.",
    );
  }
  return String(id);
}
