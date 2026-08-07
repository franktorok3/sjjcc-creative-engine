import { NextResponse } from "next/server";
import { CanvaApiError, getCanvaCurrentUser, getCanvaUserProfile } from "@/lib/canva/client";
import { CanvaAuthError } from "@/lib/canva/oauth";
import {
  CANVA_BRAND_KIT_NAME,
  CANVA_BRAND_KIT_QUERY,
} from "@/config/canva-brand";
import { prioritizeAiMarketingTemplates } from "@/lib/canva/brand-validation";
import { listBrandTemplates } from "@/lib/canva/templates";

export const runtime = "nodejs";

/**
 * TEST 1 + TEST 2 helper:
 * Confirms Canva auth, then lists Brand Templates with AI Marketing 2.0 prioritized.
 */
export async function GET() {
  try {
    const [me, profile, templates] = await Promise.all([
      getCanvaCurrentUser(),
      getCanvaUserProfile().catch(() => null),
      listBrandTemplates({ limit: 50 }),
    ]);

    const prioritized = prioritizeAiMarketingTemplates(templates.items);

    return NextResponse.json({
      success: true,
      authenticated: true,
      brandKit: {
        requiredName: CANVA_BRAND_KIT_NAME,
        queryUsed: templates.queryUsed ?? null,
        note: "Canva Connect has no Brand Kit selector API — templates are filtered/prioritized by title match to AI Marketing 2.0.",
      },
      user: {
        userId: me.team_user?.user_id ?? null,
        teamId: me.team_user?.team_id ?? null,
        displayName: profile?.profile?.display_name ?? me.display_name ?? null,
      },
      templatesPreferred: prioritized.preferred,
      templatesOther: prioritized.other,
      templatesRejectedGeneric: prioritized.rejectedGeneric,
      templates: [
        ...prioritized.preferred,
        ...prioritized.other,
      ],
      continuation: templates.continuation ?? null,
      configuredTemplateId: process.env.CANVA_BRAND_TEMPLATE_ID ?? null,
      discoveryHint: `Prefer templates under Brand Kit "${CANVA_BRAND_KIT_NAME}" (query: "${CANVA_BRAND_KIT_QUERY}"). Do not use generic Brand Kit / Marketing's Team templates.`,
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
