import { NextResponse } from "next/server";
import { BasecampApiError, BasecampAuthError } from "@/lib/basecamp/client";
import { CanvaAssetError } from "@/lib/canva/assets";
import { CanvaAutofillError } from "@/lib/canva/autofill";
import { BrandStructureError } from "@/lib/canva/brand-validation";
import { CanvaApiError } from "@/lib/canva/client";
import { CanvaAuthError } from "@/lib/canva/oauth";
import { QrGenerationError } from "@/lib/canva/qr";
import { MappingError } from "@/lib/creative/mapping";

/** Shared sanitized workflow error → HTTP response for intake routes. */
export function workflowErrorResponse(requestId: string, error: unknown) {
  if (error instanceof MappingError || error instanceof BrandStructureError) {
    return NextResponse.json(
      {
        success: false,
        error: error.code,
        message: error.message,
        requestId,
        ...("details" in error && error.details
          ? { details: error.details }
          : {}),
      },
      { status: 400 },
    );
  }
  if (error instanceof QrGenerationError || error instanceof CanvaAssetError) {
    return NextResponse.json(
      { success: false, error: error.code, message: error.message, requestId },
      { status: 502 },
    );
  }
  if (error instanceof CanvaAuthError || error instanceof BasecampAuthError) {
    return NextResponse.json(
      { success: false, error: error.code, message: error.message, requestId },
      { status: 401 },
    );
  }
  if (
    error instanceof CanvaAutofillError ||
    error instanceof CanvaApiError ||
    error instanceof BasecampApiError
  ) {
    return NextResponse.json(
      { success: false, error: error.code, message: error.message, requestId },
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
