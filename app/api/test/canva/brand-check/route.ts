import { NextResponse } from "next/server";
import {
  CANVA_BRAND_KIT_NAME,
  LOCKED_BRAND_DATASET_FIELDS,
  VARIABLE_DATASET_FIELD_ROLES,
} from "@/config/canva-brand";
import { CanvaApiError } from "@/lib/canva/client";
import { CanvaAuthError } from "@/lib/canva/oauth";
import {
  prioritizeAiMarketingTemplates,
  validateBrandTemplateStructure,
} from "@/lib/canva/brand-validation";
import {
  getBrandTemplateDataset,
  getConfiguredBrandTemplateId,
  listBrandTemplates,
} from "@/lib/canva/templates";
import type { CanvaBrandTemplateDataset } from "@/lib/canva/types";

export const runtime = "nodejs";

/**
 * Read-only brand discovery + structure check for AI Marketing 2.0.
 * Does not guess dataset keys. Reports live fields vs configured roles.
 */
export async function GET() {
  try {
    const listed = await listBrandTemplates({ limit: 50 });
    const prioritized = prioritizeAiMarketingTemplates(listed.items);

    let templateId: string | null = null;
    try {
      templateId = getConfiguredBrandTemplateId();
    } catch {
      templateId = prioritized.preferred[0]?.id
        ? String(prioritized.preferred[0].id)
        : null;
    }

    let dataset: CanvaBrandTemplateDataset = {};
    let structure = null;
    if (templateId) {
      dataset = await getBrandTemplateDataset(templateId);
      structure = validateBrandTemplateStructure(dataset);
    }

    return NextResponse.json({
      success: true,
      brandKitRequired: CANVA_BRAND_KIT_NAME,
      queryUsed: listed.queryUsed ?? null,
      selectedTemplateId: templateId,
      selectedTemplateTitle:
        listed.items.find((t) => String(t.id) === String(templateId))?.title ??
        prioritized.preferred[0]?.title ??
        null,
      templatesPreferred: prioritized.preferred.map((t) => ({
        id: t.id,
        title: t.title,
      })),
      liveDatasetFields: dataset,
      configuredVariableRoles: VARIABLE_DATASET_FIELD_ROLES,
      configuredLockedFields: LOCKED_BRAND_DATASET_FIELDS,
      structure,
      nextSteps: [
        "Confirm an AI Marketing 2.0 Brand Template is selected (CANVA_BRAND_TEMPLATE_ID).",
        "Replace VARIABLE_DATASET_FIELD_ROLES / FORM_TO_CANVA_FIELD_MAP Canva keys with liveDatasetFields names — do not guess.",
        "Ensure the template embeds the bottom brand bar + SJJCC/UJA logos as locked chrome (not Autofill content).",
        "Ensure a QR image autofill slot sits bottom-right above the brand bar.",
      ],
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
      { success: false, error: "CANVA_BRAND_CHECK_FAILED", message },
      { status: 500 },
    );
  }
}
