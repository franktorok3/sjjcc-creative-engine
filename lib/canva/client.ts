import "server-only";
import { CanvaAuthError, getValidCanvaAccessToken } from "./oauth";

const CANVA_API_BASE = "https://api.canva.com/rest/v1";

export class CanvaApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "CanvaApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type CanvaRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | undefined>;
};

export async function canvaFetch<T>(
  path: string,
  options: CanvaRequestOptions = {},
): Promise<T> {
  const accessToken = await getValidCanvaAccessToken();
  const url = new URL(`${CANVA_API_BASE}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // Prefer CANVA_REAUTH_REQUIRED over silent refresh here — token rotation is
  // owned by getValidCanvaAccessToken (durable KV / local store).
  if (response.status === 401 || response.status === 403) {
    throw new CanvaAuthError(
      "CANVA_REAUTH_REQUIRED",
      `Canva rejected the access token (${response.status}). If auto-renew is configured, retry once; otherwise revisit /api/canva/connect.`,
    );
  }

  const text = await response.text();
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text.slice(0, 200) };
    }
  }

  if (!response.ok) {
    const record = (json ?? {}) as Record<string, unknown>;
    const code =
      typeof record.code === "string" ? record.code : `HTTP_${response.status}`;
    const message =
      typeof record.message === "string"
        ? record.message
        : `Canva API error (${response.status})`;
    throw new CanvaApiError(response.status, code, message, record);
  }

  return json as T;
}

export async function getCanvaCurrentUser() {
  return canvaFetch<{
    team_user?: { user_id?: string; team_id?: string };
    display_name?: string;
  }>("/users/me");
}

export async function getCanvaUserProfile() {
  return canvaFetch<{
    profile?: { display_name?: string };
  }>("/users/me/profile");
}
