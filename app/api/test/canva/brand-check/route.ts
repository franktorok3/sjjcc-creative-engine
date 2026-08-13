import { NextResponse } from "next/server";
import {
  CANVA_BRAND_KIT_NAME,
  LOCKED_BRAND_DATASET_FIELDS,
  VARIABLE_DATASET_FIELD_ROLES,
} from "@/config/canva-brand";
import { CanvaApiError } from "@/lib/canva/client";
import { CanvaAuthError } from "@/lib/canva/oauth";
import { validateBrandTemplateStructure } from "@/lib/canva/brand-validation";
import {
  getBrandTemplateDataset,
  getConfiguredBrandTemplateId,
  listAllBrandTemplates,
  sanitizeBrandTemplate,
} from "@/lib/canva/templates";
import type { CanvaBrandTemplateDataset } from "@/lib/canva/types";

export const runtime = "nodejs";

/**
 * Read-only brand discovery + structure check.
 * Does not guess dataset keys or auto-select a Brand Template ID.
 */
export async function GET() {
  try {
    const listed = await listAllBrandTemplates({ limit: 100, dataset: "any" });

    let templateId: string | null = null;
    try {
      templateId = getConfiguredBrandTemplateId();
    } catch {
      templateId = null;
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
      note: "Brand Kit membership cannot be confirmed through the current Connect API response; select the intended template by its actual title and ID.",
      queryUsed: listed.queryUsed ?? null,
      selectedTemplateId: templateId,
      selectedTemplateTitle:
        listed.items.find((t) => String(t.id) === String(templateId))?.title ??
        null,
      templates: listed.items.map(sanitizeBrandTemplate),
      liveDatasetFields: dataset,
      configuredVariableRoles: VARIABLE_DATASET_FIELD_ROLES,
      configuredLockedFields: LOCKED_BRAND_DATASET_FIELDS,
      classification: {
        lockedTemplateStructure: [
          "bottom_brand_bar",
          "sjjcc_logos",
          "uja_logos",
          "qr_placement_zone",
          "margins_structural_layout",
        ],
        controlledVariableContent: ["qr_image_asset", "qr_destination_url"],
        qrCodeField: {
          role: "controlled_variable_image",
          formMapping: "forbidden",
          workflowQrPreprocessing: "required_when_destination_url_present",
          populatesWith: "generated_canva_asset_id",
          position: "locked_by_brand_template_bottom_right_above_brand_bar",
        },
      },
      structure,
      nextSteps: [
        "Set CANVA_BRAND_TEMPLATE_ID to the exact Brand Template id from GET /api/test/canva/templates — do not guess.",
        "Replace VARIABLE_DATASET_FIELD_ROLES / FORM_TO_CANVA_FIELD_MAP Canva keys with liveDatasetFields names — do not guess.",
        "Ensure the template embeds the bottom brand bar + SJJCC/UJA logos as locked chrome (not Autofill content).",
        "Ensure a QR image autofill slot sits bottom-right above the brand bar (position locked; image content variable via preprocessing).",
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
