import { NextResponse } from "next/server";
import { CanvaApiError } from "@/lib/canva/client";
import { CanvaAuthError } from "@/lib/canva/oauth";
import {
  getBrandTemplateDataset,
  getConfiguredBrandTemplateId,
} from "@/lib/canva/templates";
import { FORM_TO_CANVA_FIELD_MAP } from "@/config/form-to-canva";

export const runtime = "nodejs";

/**
 * TEST 3 — Retrieve the configured Brand Template dataset field names/types.
 * Use this before editing config/form-to-canva.ts.
 */
export async function GET() {
  try {
    const brandTemplateId = getConfiguredBrandTemplateId();
    const dataset = await getBrandTemplateDataset(brandTemplateId);
    const datasetFields = Object.entries(dataset).map(([name, field]) => ({
      name,
      type: field.type,
    }));

    const mappedCanvaFields = Object.values(FORM_TO_CANVA_FIELD_MAP);
    const missingMappings = mappedCanvaFields.filter(
      (name) => !dataset[name],
    );

    return NextResponse.json({
      success: true,
      brandTemplateId,
      dataset,
      datasetFields,
      currentMapping: FORM_TO_CANVA_FIELD_MAP,
      mappingIssues: missingMappings.map(
        (name) =>
          `FORM_TO_CANVA_FIELD_MAP references "${name}" which is not in the live dataset`,
      ),
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
      { success: false, error: "CANVA_DATASET_FAILED", message },
      { status: 500 },
    );
  }
}
