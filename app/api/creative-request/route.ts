import { NextResponse } from "next/server";
import {
  portalCreativeRequestSchema,
  portalRequestToWorkflowPayload,
} from "@/lib/creative/creative-request";
import {
  buildIdempotencyKey,
  getIdempotentResult,
  setIdempotentResult,
} from "@/lib/creative/idempotency";
import { createRequestId, logFailed } from "@/lib/creative/logging";
import { isCreativeEngineTestMode } from "@/lib/creative/test-mode";
import { logCreativeStage } from "@/lib/creative/workflow-stage-log";
import { workflowErrorResponse } from "@/lib/creative/workflow-http";
import {
  runFormToCanvaToBasecampWorkflow,
  type WorkflowSuccess,
} from "@/lib/creative/workflow";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Native Creative Engine Portal intake.
 * During test mode this is the only path that may run Canva/Basecamp.
 * Google Form path stays at /api/form-submit (processing disabled by default).
 */
export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const json = await request.json().catch(() => null);
    const parsed = portalCreativeRequestSchema.safeParse(json);
    if (!parsed.success) {
      logFailed(requestId, "validation", "Invalid portal payload");
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

    if (parsed.data.source !== "creative_engine_portal") {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_SOURCE",
          message: "Only creative_engine_portal is accepted on this route.",
          requestId,
        },
        { status: 400 },
      );
    }

    logCreativeStage("request_validated", {
      requestId,
      source: "creative_engine_portal",
      testMode: isCreativeEngineTestMode(),
    });

    const payload = portalRequestToWorkflowPayload(parsed.data);
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
