import "server-only";

/**
 * Temporary PoC helper: optionally export OAuth tokens in callback JSON
 * so they can be pasted into Vercel env vars (filesystem is ephemeral).
 *
 * Enable with OAUTH_EXPORT_TOKENS set to 1/true/yes/on (case-insensitive),
 * then disable after copying.
 */

export const OAUTH_TOKEN_EXPORT_WARNING =
  "TEMPORARY POC TOKEN EXPORT — disable OAUTH_EXPORT_TOKENS after copying values.";

const OAUTH_EXPORT_TRUTHY = new Set(["1", "true", "yes", "on"]);

export function isOauthTokenExportEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.OAUTH_EXPORT_TOKENS;
  if (raw == null) return false;
  return OAUTH_EXPORT_TRUTHY.has(raw.trim().toLowerCase());
}

export function oauthTokenExportHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

export function withOauthCallbackHeaders(
  exportEnabled: boolean,
  headers: HeadersInit = {},
): HeadersInit {
  if (!exportEnabled) return headers;
  return {
    ...headers,
    ...oauthTokenExportHeaders(),
  };
}

/**
 * Attach vercelEnv token fields only when export mode is explicitly enabled.
 * Never logs token values.
 */
export function attachOptionalTokenExport<T extends Record<string, unknown>>(
  body: T,
  tokens: Record<string, string | null | undefined>,
  env: Record<string, string | undefined> = process.env,
): T & {
  tokenExportEnabled: boolean;
  tokenExport?: "disabled" | "enabled";
  warning?: string;
  vercelEnv?: Record<string, string | null>;
} {
  const enabled = isOauthTokenExportEnabled(env);
  if (!enabled) {
    return {
      ...body,
      tokenExportEnabled: false,
      tokenExport: "disabled",
    };
  }

  const vercelEnv: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(tokens)) {
    vercelEnv[key] = value ?? null;
  }

  return {
    ...body,
    tokenExportEnabled: true,
    tokenExport: "enabled",
    warning: OAUTH_TOKEN_EXPORT_WARNING,
    vercelEnv,
  };
}
