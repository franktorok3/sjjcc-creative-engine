import { NextResponse } from "next/server";
import { z } from "zod";
import {
  autofillBrandTemplate,
  CanvaAutofillError,
} from "@/lib/canva/autofill";
import { CanvaApiError } from "@/lib/canva/client";
import { CanvaAuthError } from "@/lib/canva/oauth";
import {
  getBrandTemplateDataset,
  getConfiguredBrandTemplateId,
} from "@/lib/canva/templates";
import { createRequestId, logMilestone } from "@/lib/creative/logging";
import type { CanvaAutofillData } from "@/lib/canva/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  title: z.string().optional(),
  /** Explicit Canva field → text value. Prefer this after inspecting the dataset. */
  data: z.record(z.string(), z.string()).optional(),
});

/**
 * TEST 4 — Create one Canva design via Brand Template Autofill.
 *
 * Body (optional):
 * {
 *   "title": "TEST Creative Draft",
 *   "data": { "ACTUAL_FIELD_NAME": "test value" }
 * }
 *
 * If data is omitted, fills every *text* dataset field with a TEST placeholder.
 */
export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const brandTemplateId = getConfiguredBrandTemplateId();
    const dataset = await getBrandTemplateDataset(brandTemplateId);
    logMilestone(
      requestId,
      "CANVA_TEMPLATE_VALIDATED",
      `templateId=${brandTemplateId}`,
    );

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_PAYLOAD",
          details: parsed.error.flatten(),
          requestId,
        },
        { status: 400 },
      );
    }

    const autofillData: CanvaAutofillData = {};

    if (parsed.data.data && Object.keys(parsed.data.data).length > 0) {
      for (const [field, text] of Object.entries(parsed.data.data)) {
        const meta = dataset[field];
        if (!meta) {
          return NextResponse.json(
            {
              success: false,
              error: "CANVA_FIELD_NOT_FOUND",
              message: `Field "${field}" is not in the template dataset. Available: ${Object.keys(dataset).join(", ")}`,
              requestId,
              brandTemplateId,
              availableFields: Object.keys(dataset),
            },
            { status: 400 },
          );
        }
        if (meta.type !== "text") {
          return NextResponse.json(
            {
              success: false,
              error: "CANVA_FIELD_TYPE_UNSUPPORTED",
              message: `Field "${field}" is type "${meta.type}"; this PoC only fills text.`,
              requestId,
            },
            { status: 400 },
          );
        }
        autofillData[field] = { type: "text", text };
      }
    } else {
      for (const [field, meta] of Object.entries(dataset)) {
        if (meta.type === "text") {
          autofillData[field] = {
            type: "text",
            text: `TEST ${field}`,
          };
        }
      }
    }

    if (Object.keys(autofillData).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "CANVA_DATASET_NO_TEXT_FIELDS",
          message:
            "Template dataset has no text fields to autofill. Inspect GET /api/test/canva/template-dataset.",
          requestId,
          brandTemplateId,
          dataset,
        },
        { status: 400 },
      );
    }

    let startedJobId: string | undefined;
    const result = await autofillBrandTemplate({
      brandTemplateId,
      title: parsed.data.title ?? "TEST Creative Draft",
      data: autofillData,
      onJobStarted: (jobId) => {
        startedJobId = jobId;
        logMilestone(requestId, "CANVA_AUTOFILL_STARTED", `jobId=${jobId}`);
      },
    });

    logMilestone(
      requestId,
      "CANVA_AUTOFILL_COMPLETE",
      `designId=${result.designId}`,
    );

    return NextResponse.json({
      success: true,
      requestId,
      brandTemplateId,
      availableFields: Object.entries(dataset).map(([name, field]) => ({
        name,
        type: field.type,
      })),
      autofillDataSent: autofillData,
      autofillJobId: result.jobId || startedJobId,
      canvaDesignId: result.designId,
      canvaDesignUrl: result.designUrl,
      canvaEditUrl: result.editUrl ?? null,
      title: result.title ?? null,
    });
  } catch (error) {
    if (error instanceof CanvaAuthError) {
      return NextResponse.json(
        {
          success: false,
          error: error.code,
          message: error.message,
          requestId,
        },
        { status: 401 },
      );
    }
    if (error instanceof CanvaAutofillError) {
      return NextResponse.json(
        {
          success: false,
          error: error.code,
          message: error.message,
          requestId,
        },
        { status: 502 },
      );
    }
    if (error instanceof CanvaApiError) {
      return NextResponse.json(
        {
          success: false,
          error: error.code,
          message: error.message,
          requestId,
        },
        { status: 502 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        error: "CANVA_AUTOFILL_TEST_FAILED",
        message,
        requestId,
      },
      { status: 500 },
    );
  }
}
