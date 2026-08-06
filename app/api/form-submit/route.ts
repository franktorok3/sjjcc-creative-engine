import { NextResponse } from "next/server";
import { z } from "zod";
import { BasecampAuthError } from "@/lib/basecamp/client";
import { CanvaAuthError } from "@/lib/canva/oauth";
import { assertWebhookConfigured } from "@/lib/creative/env";
import {
  buildIdempotencyKey,
  getIdempotentResult,
  setIdempotentResult,
} from "@/lib/creative/idempotency";
import { createRequestId, logFailed } from "@/lib/creative/logging";
import {
  runFormToCanvaToBasecampWorkflow,
  type WorkflowSuccess,
} from "@/lib/creative/workflow";
import { MappingError } from "@/lib/creative/mapping";
import { CanvaApiError } from "@/lib/canva/client";
import { CanvaAutofillError } from "@/lib/canva/autofill";
import { BasecampApiError } from "@/lib/basecamp/client";

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

    const idempotencyKey = buildIdempotencyKey({
      submittedAt: parsed.data.submittedAt,
      fields: parsed.data.fields,
      headerKey: request.headers.get("idempotency-key"),
    });

    const cached = getIdempotentResult<WorkflowSuccess>(idempotencyKey);
    if (cached) {
      return NextResponse.json({ ...cached, deduplicated: true });
    }

    const result = await runFormToCanvaToBasecampWorkflow(
      parsed.data,
      requestId,
    );
    setIdempotentResult(idempotencyKey, result);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(requestId, error);
  }
}

function errorResponse(requestId: string, error: unknown) {
  if (error instanceof MappingError) {
    return NextResponse.json(
      { success: false, error: error.code, message: error.message, requestId },
      { status: 400 },
    );
  }
  if (error instanceof CanvaAuthError) {
    return NextResponse.json(
      { success: false, error: error.code, message: error.message, requestId },
      { status: 401 },
    );
  }
  if (error instanceof BasecampAuthError) {
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
      { success: false, error: error.code, message: error.message, requestId },
      { status: 502 },
    );
  }
  if (error instanceof CanvaApiError || error instanceof BasecampApiError) {
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
  if (message.includes("GOOGLE_FORM_WEBHOOK_SECRET")) {
    return NextResponse.json(
      {
        success: false,
        error: "WEBHOOK_SECRET_MISSING",
        message,
        requestId,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { success: false, error: "WORKFLOW_FAILED", message, requestId },
    { status: 500 },
  );
}
