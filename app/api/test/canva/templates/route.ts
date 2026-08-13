import { NextResponse } from "next/server";
import {
  CanvaApiError,
  getCanvaCurrentUser,
  getCanvaUserProfile,
} from "@/lib/canva/client";
import { CanvaAuthError } from "@/lib/canva/oauth";
import {
  filterBrandTemplatesByTitle,
  listBrandTemplates,
  sanitizeBrandTemplate,
} from "@/lib/canva/templates";

export const runtime = "nodejs";

/**
 * List ALL accessible Canva Brand Templates (sanitized).
 * Optional ?q=<text> filters by template title only.
 * Does not assume Brand Kit membership from titles or API fields.
 * Does not select CANVA_BRAND_TEMPLATE_ID.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const titleFilter = url.searchParams.get("q") ?? undefined;

    const [me, profile, templates] = await Promise.all([
      getCanvaCurrentUser(),
      getCanvaUserProfile().catch(() => null),
      // No Brand Kit name query — list all accessible templates.
      listBrandTemplates({ limit: 100 }),
    ]);

    const filtered = filterBrandTemplatesByTitle(templates.items, titleFilter);
    const sanitized = filtered.map(sanitizeBrandTemplate);

    return NextResponse.json({
      success: true,
      authenticated: true,
      note: "Brand Kit membership cannot be confirmed through the current Connect API response; select the intended template by its actual title and ID.",
      user: {
        userId: me.team_user?.user_id ?? null,
        teamId: me.team_user?.team_id ?? null,
        displayName: profile?.profile?.display_name ?? me.display_name ?? null,
      },
      titleFilter: titleFilter?.trim() || null,
      templateCount: sanitized.length,
      templates: sanitized,
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
