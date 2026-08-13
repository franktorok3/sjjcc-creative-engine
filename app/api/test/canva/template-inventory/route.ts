import { NextResponse } from "next/server";
import { CanvaApiError } from "@/lib/canva/client";
import { CanvaAuthError } from "@/lib/canva/oauth";
import { buildTemplateInventoryReport } from "@/lib/canva/template-inventory";
import { listApprovedCreativeTemplates } from "@/config/canva-templates";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Operator report: Brand Template inventory + dataset inspection.
 * Does not approve templates or expose OAuth tokens.
 *
 * Query:
 *   ?q=<title filter>
 *   ?max=<n> limit dataset lookups (default: all)
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const titleFilter = url.searchParams.get("q") ?? undefined;
    const maxRaw = url.searchParams.get("max");
    const maxDatasetLookups = maxRaw ? Number(maxRaw) : undefined;

    const report = await buildTemplateInventoryReport({
      titleFilter,
      maxDatasetLookups:
        maxDatasetLookups && Number.isFinite(maxDatasetLookups)
          ? maxDatasetLookups
          : undefined,
    });

    return NextResponse.json({
      success: true,
      ...report,
      approvedRegistryCount: listApprovedCreativeTemplates().length,
      approvedRegistry: listApprovedCreativeTemplates().map((t) => ({
        id: t.id,
        title: t.title,
        assetType: t.assetType,
        density: t.density,
        approved: t.approved,
      })),
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
      { success: false, error: "TEMPLATE_INVENTORY_FAILED", message },
      { status: 500 },
    );
  }
}
