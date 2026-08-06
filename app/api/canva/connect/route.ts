import { NextResponse } from "next/server";
import { buildCanvaAuthorizeUrl, CanvaAuthError } from "@/lib/canva/oauth";

export const runtime = "nodejs";

/**
 * Start Canva OAuth (authorization-code + PKCE).
 * Visit this URL in a browser when tokens are not yet stored.
 */
export async function GET() {
  try {
    const url = await buildCanvaAuthorizeUrl();
    return NextResponse.redirect(url);
  } catch (error) {
    if (error instanceof CanvaAuthError) {
      return NextResponse.json(
        { success: false, error: error.code, message: error.message },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: "CANVA_CONNECT_FAILED", message },
      { status: 500 },
    );
  }
}
