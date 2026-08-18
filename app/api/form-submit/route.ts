import { NextResponse } from "next/server";
import { z } from "zod";
import { googleFormToWorkflowPayload } from "@/lib/creative/creative-request";
import { assertWebhookConfigured } from "@/lib/creative/env";
import {
  buildIdempotencyKey,
  getIdempotentResult,
  setIdempotentResult,
} from "@/lib/creative/idempotency";
import { createRequestId, logFailed } from "@/lib/creative/logging";
import {
  GOOGLE_FORM_PROCESSING_DISABLED_RESPONSE,
  isGoogleFormProcessingEnabled,
} from "@/lib/creative/test-mode";
import { logCreativeStage } from "@/lib/creative/workflow-stage-log";
import { workflowErrorResponse } from "@/lib/creative/workflow-http";
import {
  runFormToCanvaToBasecampWorkflow,
  type WorkflowSuccess,
} from "@/lib/creative/workflow";

export const runtime = "nodejs";
export const maxDuration = 60;

const formSubmitSchema = z.object({
  source: z.literal("google_form"),
  submittedAt: z.string().min(1),
  fields: z.record(z.string(), z.unknown()),
});

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Google Form webhook (Apps Script).
 * Remains compatible: validates secret + payload shape.
 * While CREATIVE_ENGINE_GOOGLE_FORM_PROCESSING_ENABLED is false (default),
 * returns success without Canva/Basecamp work.
 */
export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const expectedSecret = assertWebhookConfigured();
    const provided = request.headers.get("x-webhook-secret") ?? "";
    if (!timingSafeEqual(provided, expectedSecret)) {
      logFailed(requestId, "auth", "Invalid X-Webhook-Secret");
      return NextResponse.json(
        { success: false, error: "UNAUTHORIZED", requestId },
        { status: 401 },
      );
    }

    const json = await request.json();
    const parsed = formSubmitSchema.safeParse(json);
    if (!parsed.success) {
      logFailed(requestId, "validation", "Invalid payload shape");
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_PAYLOAD",
          requestId,
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    logCreativeStage("request_validated", {
      requestId,
      source: "google_form",
    });

    if (!isGoogleFormProcessingEnabled()) {
      logCreativeStage("google_form_processing_disabled", { requestId });
      return NextResponse.json({
        ...GOOGLE_FORM_PROCESSING_DISABLED_RESPONSE,
        requestId,
      });
    }

    const payload = googleFormToWorkflowPayload(parsed.data);
    const idempotencyKey = buildIdempotencyKey({
      submittedAt: payload.submittedAt,
      fields: payload.fields,
      headerKey: request.headers.get("idempotency-key"),
    });

    const cached = getIdempotentResult<WorkflowSuccess>(idempotencyKey);
    if (cached) {
      return NextResponse.json({ ...cached, deduplicated: true });
    }

    const result = await runFormToCanvaToBasecampWorkflow(payload, requestId);
    setIdempotentResult(idempotencyKey, result);
    return NextResponse.json(result);
  } catch (error) {
    return workflowErrorResponse(requestId, error);
  }
}
