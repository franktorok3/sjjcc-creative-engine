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
import { workflowErrorResponse } from "@/lib/creative/workflow-http";
import {
  runFormToCanvaToBasecampWorkflow,
  type WorkflowSuccess,
} from "@/lib/creative/workflow";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Native Creative Engine Portal intake.
 * Normalizes into the same workflow payload as Google Form → /api/form-submit.
 * No webhook secret (browser form); Google Form path stays unchanged.
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
