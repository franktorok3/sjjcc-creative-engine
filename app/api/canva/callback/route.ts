import { NextResponse } from "next/server";
import {
  CanvaAuthError,
  exchangeAuthorizationCode,
} from "@/lib/canva/oauth";
import {
  attachOptionalTokenExport,
  isOauthTokenExportEnabled,
  withOauthCallbackHeaders,
} from "@/lib/creative/oauth-export";

export const runtime = "nodejs";

/**
 * Canva OAuth callback. Exchanges authorization code for tokens.
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
        error: "CANVA_OAUTH_DENIED",
        message: error,
      },
      { status: 400 },
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      {
        success: false,
        error: "CANVA_OAUTH_MISSING_PARAMS",
        message: "Missing code or state query parameter",
      },
      { status: 400 },
    );
  }

  try {
    const tokens = await exchangeAuthorizationCode(code, state);
    const exportEnabled = isOauthTokenExportEnabled();

    const body = attachOptionalTokenExport(
      {
        success: true as const,
        message: exportEnabled
          ? "Canva OAuth complete. Temporary token export is enabled — copy vercelEnv into Vercel, then set OAUTH_EXPORT_TOKENS off and redeploy."
          : "Canva OAuth complete. Token export is disabled (set OAUTH_EXPORT_TOKENS=1 only while copying tokens into Vercel env).",
        nextSteps: [
          "If needed, set OAUTH_EXPORT_TOKENS=1, reconnect, copy CANVA_ACCESS_TOKEN + CANVA_REFRESH_TOKEN into Vercel, then disable the flag.",
          "GET /api/test/canva/templates and set CANVA_BRAND_TEMPLATE_ID.",
          "GET /api/test/canva/template-dataset and update config/form-to-canva.ts.",
        ],
        expiresAt: new Date(tokens.expiresAt).toISOString(),
      },
      {
        CANVA_ACCESS_TOKEN: tokens.accessToken,
        CANVA_REFRESH_TOKEN: tokens.refreshToken,
      },
    );

    return NextResponse.json(body, {
      headers: withOauthCallbackHeaders(exportEnabled),
    });
  } catch (err) {
    if (err instanceof CanvaAuthError) {
      return NextResponse.json(
        { success: false, error: err.code, message: err.message },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: "CANVA_CALLBACK_FAILED", message },
      { status: 500 },
    );
  }
}
