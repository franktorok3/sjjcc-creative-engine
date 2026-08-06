import { NextResponse } from "next/server";
import { CanvaApiError, getCanvaCurrentUser, getCanvaUserProfile } from "@/lib/canva/client";
import { CanvaAuthError } from "@/lib/canva/oauth";
import { listBrandTemplates } from "@/lib/canva/templates";

export const runtime = "nodejs";

/**
 * TEST 1 + TEST 2 helper:
 * Confirms Canva auth, then lists accessible brand templates.
 */
export async function GET() {
  try {
    const [me, profile, templates] = await Promise.all([
      getCanvaCurrentUser(),
      getCanvaUserProfile().catch(() => null),
      listBrandTemplates({ limit: 50 }),
    ]);

    return NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        userId: me.team_user?.user_id ?? null,
        teamId: me.team_user?.team_id ?? null,
        displayName: profile?.profile?.display_name ?? me.display_name ?? null,
      },
      templates: templates.items,
      continuation: templates.continuation ?? null,
      configuredTemplateId: process.env.CANVA_BRAND_TEMPLATE_ID ?? null,
    });
  } catch (error) {
    if (error instanceof CanvaAuthError) {
      return NextResponse.json(
        { success: false, error: error.code, message: error.message },
        { status: 401 },
      );
    }
    if (error instanceof CanvaApiError) {
      return NextResponse.json(
        {
          success: false,
          error: error.code,
          message: error.message,
          status: error.status,
        },
        { status: 502 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: "CANVA_TEMPLATES_FAILED", message },
      { status: 500 },
    );
  }
}
