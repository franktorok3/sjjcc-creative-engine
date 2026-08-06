import { NextResponse } from "next/server";
import {
  BasecampAuthError,
  exchangeBasecampAuthorizationCode,
  fetchBasecampAuthorization,
  resolveBasecampAccountId,
} from "@/lib/basecamp/oauth";

export const runtime = "nodejs";

/**
 * Basecamp OAuth callback. Exchanges authorization code for tokens.
 * On Vercel, returns tokens once so they can be pasted into env vars
 * (filesystem token store is ephemeral across serverless instances).
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

    return NextResponse.json({
      success: true,
      message:
        "Basecamp OAuth complete. On Vercel, paste tokens below into Project → Settings → Environment Variables, then redeploy. Local filesystem token storage is ephemeral on serverless.",
      identity: authorization.identity ?? null,
      resolvedAccountId,
      accounts: (authorization.accounts ?? []).map((account) => ({
        id: account.id,
        name: account.name,
        product: account.product,
        href: account.href,
        app_href: account.app_href,
      })),
      // PoC only — required because Vercel cannot persist .data/ across instances.
      vercelEnv: {
        BASECAMP_ACCESS_TOKEN: tokens.accessToken,
        BASECAMP_REFRESH_TOKEN: tokens.refreshToken || null,
        BASECAMP_ACCOUNT_ID: resolvedAccountId,
      },
      nextSteps: [
        "Add BASECAMP_ACCESS_TOKEN (+ REFRESH_TOKEN) and BASECAMP_ACCOUNT_ID to Vercel env, then redeploy.",
        "GET /api/test/basecamp/projects to list projects.",
        "GET /api/test/basecamp/project?projectId=... and set BASECAMP_MESSAGE_BOARD_ID from messageBoardId.",
      ],
      expiresAt: new Date(tokens.expiresAt).toISOString(),
    });
  } catch (err) {
    if (err instanceof BasecampAuthError) {
      return NextResponse.json(
        { success: false, error: err.code, message: err.message },
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
