import { NextResponse } from "next/server";
import {
  BasecampAuthError,
  buildBasecampAuthorizeUrl,
} from "@/lib/basecamp/oauth";

export const runtime = "nodejs";

/**
 * Start Basecamp / 37signals Launchpad OAuth.
 * Visit this URL in a browser when tokens are not yet stored.
 */
export async function GET() {
  try {
    const url = buildBasecampAuthorizeUrl();
    return NextResponse.redirect(url);
  } catch (error) {
    if (error instanceof BasecampAuthError) {
      return NextResponse.json(
        { success: false, error: error.code, message: error.message },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: "BASECAMP_CONNECT_FAILED", message },
      { status: 500 },
    );
  }
}
