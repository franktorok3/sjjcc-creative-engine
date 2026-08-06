import { NextResponse } from "next/server";
import {
  BasecampAuthError,
  exchangeBasecampAuthorizationCode,
  fetchBasecampAuthorization,
  resolveBasecampAccountId,
} from "@/lib/basecamp/oauth";

export const runtime = "nodejs";

/**
 * Basecamp OAuth callback. Exchanges authorization code for tokens
 * and returns available accounts so BASECAMP_ACCOUNT_ID can be set.
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
        "Basecamp OAuth complete. Tokens stored locally (.data/basecamp-tokens.enc). On Vercel, copy access/refresh tokens into env — filesystem is ephemeral.",
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
        "Set BASECAMP_ACCOUNT_ID to resolvedAccountId (or another account id below).",
        "Set BASECAMP_MESSAGE_BOARD_ID to the Pulse (or target) message board id.",
        "Optionally set BASECAMP_ACCESS_TOKEN + BASECAMP_REFRESH_TOKEN from the encrypted store for Vercel.",
        "Then GET /api/test/basecamp to verify.",
      ],
      tokenHint: {
        accessTokenSet: Boolean(tokens.accessToken),
        refreshTokenSet: Boolean(tokens.refreshToken),
        expiresAt: new Date(tokens.expiresAt).toISOString(),
      },
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
