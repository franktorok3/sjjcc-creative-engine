import { NextResponse } from "next/server";
import {
  CanvaAuthError,
  exchangeAuthorizationCode,
} from "@/lib/canva/oauth";

export const runtime = "nodejs";

/**
 * Canva OAuth callback. Exchanges authorization code for tokens.
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
    return NextResponse.json({
      success: true,
      message:
        "Canva OAuth complete. On Vercel, paste tokens below into Project → Settings → Environment Variables, then redeploy. Local filesystem token storage is ephemeral on serverless.",
      // PoC only — required because Vercel cannot persist .data/ across instances.
      vercelEnv: {
        CANVA_ACCESS_TOKEN: tokens.accessToken,
        CANVA_REFRESH_TOKEN: tokens.refreshToken,
      },
      nextSteps: [
        "Add CANVA_ACCESS_TOKEN + CANVA_REFRESH_TOKEN to Vercel env, then redeploy.",
        "GET /api/test/canva/templates and set CANVA_BRAND_TEMPLATE_ID.",
        "GET /api/test/canva/template-dataset and update config/form-to-canva.ts.",
      ],
      expiresAt: new Date(tokens.expiresAt).toISOString(),
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
