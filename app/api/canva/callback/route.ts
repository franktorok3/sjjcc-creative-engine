import { NextResponse } from "next/server";
import {
  CanvaAuthError,
  exchangeAuthorizationCode,
} from "@/lib/canva/oauth";

export const runtime = "nodejs";

/**
 * Canva OAuth callback. Exchanges authorization code for tokens
 * and persists them to the local encrypted credential store.
 *
 * Vercel note: filesystem persistence is ephemeral — use an external store in production.
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
    await exchangeAuthorizationCode(code, state);
    return NextResponse.json({
      success: true,
      message:
        "Canva OAuth complete. Tokens stored in the local encrypted credential store (.data/canva-tokens.enc). On Vercel, configure an external token store — local filesystem is ephemeral.",
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
