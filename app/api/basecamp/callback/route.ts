import { NextResponse } from "next/server";
import {
  BasecampAuthError,
  exchangeBasecampAuthorizationCode,
  fetchBasecampAuthorization,
  resolveBasecampAccountId,
} from "@/lib/basecamp/oauth";
import {
  attachOptionalTokenExport,
  isOauthTokenExportEnabled,
  withOauthCallbackHeaders,
} from "@/lib/creative/oauth-export";

export const runtime = "nodejs";

/**
 * Basecamp OAuth callback. Exchanges authorization code for tokens.
 *
 * Temporary PoC: when OAUTH_EXPORT_TOKENS=1, includes vercelEnv token values
 * once so they can be pasted into Vercel env (filesystem is ephemeral).
 * Disable the flag after copying. Never logs token values.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: "BASECAMP_OAUTH_DENIED",
        message: error,
      },
      { status: 400 },
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      {
        success: false,
        error: "BASECAMP_OAUTH_MISSING_PARAMS",
        message: "Missing code or state query parameter",
      },
      { status: 400 },
    );
  }

  try {
    const tokens = await exchangeBasecampAuthorizationCode(code, state);
    const authorization = await fetchBasecampAuthorization(tokens.accessToken);
    const resolvedAccountId = resolveBasecampAccountId(authorization);
    const exportEnabled = isOauthTokenExportEnabled();

    const body = attachOptionalTokenExport(
      {
        success: true as const,
        message: exportEnabled
          ? "Basecamp OAuth complete. Temporary token export is enabled — copy vercelEnv into Vercel, then set OAUTH_EXPORT_TOKENS off and redeploy."
          : "Basecamp OAuth complete. Token export is disabled (set OAUTH_EXPORT_TOKENS=1 only while copying tokens into Vercel env).",
        identity: authorization.identity ?? null,
        resolvedAccountId,
        accounts: (authorization.accounts ?? []).map((account) => ({
          id: account.id,
          name: account.name,
          product: account.product,
          href: account.href,
          app_href: account.app_href,
        })),
        nextSteps: [
          "If needed, set OAUTH_EXPORT_TOKENS=1, reconnect, copy BASECAMP_ACCESS_TOKEN (+ REFRESH_TOKEN) and BASECAMP_ACCOUNT_ID into Vercel, then disable the flag.",
          "GET /api/test/basecamp/projects to list projects.",
          "GET /api/test/basecamp/project?projectId=... and set BASECAMP_MESSAGE_BOARD_ID from messageBoardId.",
        ],
        expiresAt: new Date(tokens.expiresAt).toISOString(),
      },
      {
        BASECAMP_ACCESS_TOKEN: tokens.accessToken,
        BASECAMP_REFRESH_TOKEN: tokens.refreshToken || null,
        BASECAMP_ACCOUNT_ID: resolvedAccountId,
      },
    );

    return NextResponse.json(body, {
      headers: withOauthCallbackHeaders(exportEnabled),
    });
  } catch (err) {
    if (err instanceof BasecampAuthError) {
      return NextResponse.json(
        {
          success: false,
          error: err.code,
          message: err.message,
          ...(err.diagnostics
            ? { launchpadTokenExchange: err.diagnostics }
            : {}),
        },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: "BASECAMP_CALLBACK_FAILED", message },
      { status: 500 },
    );
  }
}
