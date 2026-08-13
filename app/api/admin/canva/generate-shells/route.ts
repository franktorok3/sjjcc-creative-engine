import { NextResponse } from "next/server";
import { CanvaApiError } from "@/lib/canva/client";
import { CanvaAuthError } from "@/lib/canva/oauth";
import { CanvaDesignImportError } from "@/lib/canva/design-imports";
import { assertAdminSecret } from "@/lib/creative/admin-auth";
import { submitCreativeShellImports } from "@/lib/creative/shells/generate";
import { logShellStage } from "@/lib/creative/shells/stage-log";
import { CANVA_SHELL_CAPABILITY_ASSESSMENT } from "@/config/canva-shell-capabilities";

export const runtime = "nodejs";
/** Submit-only: PPTX build + Canva import create. No long polling. */
export const maxDuration = 60;

/**
 * Operator-only: start CE shell imports (PPTX → Canva import job).
 * Returns immediately with import job IDs — poll GET /api/admin/canva/shell-jobs.
 *
 * Header: X-Admin-Secret
 * Resolves CREATIVE_ENGINE_ADMIN_SECRET, else GOOGLE_FORM_WEBHOOK_SECRET.
 *
 * Body (optional JSON):
 *   { "keys": ["flyer_standard_light"] }
 */
export async function POST(request: Request) {
  try {
    assertAdminSecret(request);
    logShellStage("auth_validated");
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: string }).code)
        : "ADMIN_UNAUTHORIZED";
    const status =
      code === "ADMIN_SECRET_MISSING"
        ? 503
        : code === "ADMIN_UNAUTHORIZED"
          ? 401
          : 403;
    return NextResponse.json(
      {
        success: false,
        error: code,
        message: error instanceof Error ? error.message : "Unauthorized",
      },
      { status },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      keys?: string[];
    };

    const report = await submitCreativeShellImports({
      keys: body.keys,
    });

    const payload = {
      success: true as const,
      status: "processing" as const,
      jobs: report.jobs.map((job) => ({
        shellKey: job.shellKey,
        title: job.title,
        importJobId: job.importJobId,
        statusUrl: job.statusUrl,
        dimensions: job.dimensions,
        validation: job.validation,
        missingLogoAssetEnv: job.missingLogoAssetEnv,
        expectedAutofillRoles: job.expectedAutofillRoles,
        registryCandidatePreview: job.registryCandidatePreview,
      })),
      capabilityAssessment: report.capabilityAssessment,
      note: report.note,
      previewPath: "/admin/shells",
      pollPath: "/api/admin/canva/shell-jobs",
    };

    logShellStage("response_returned", {
      status: "processing",
      jobCount: payload.jobs.length,
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof CanvaAuthError) {
      logShellStage("canva_import_failed", { code: error.code });
      return NextResponse.json(
        { success: false, error: error.code, message: error.message },
        { status: 401 },
      );
    }
    if (
      error instanceof CanvaApiError ||
      error instanceof CanvaDesignImportError
    ) {
      logShellStage("canva_import_failed", {
        code: error.code,
        importJobId:
          error instanceof CanvaDesignImportError
            ? error.importJobId
            : undefined,
      });
      return NextResponse.json(
        {
          success: false,
          error: error.code,
          message: error.message,
          ...(error instanceof CanvaDesignImportError && error.importJobId
            ? { importJobId: error.importJobId }
            : {}),
          ...(error instanceof CanvaApiError ? { status: error.status } : {}),
        },
        { status: 502 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: "SHELL_GENERATION_FAILED", message },
      { status: 500 },
    );
  }
}

/** Capability assessment without generating (still requires admin secret). */
export async function GET(request: Request) {
  try {
    assertAdminSecret(request);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: string }).code)
        : "ADMIN_UNAUTHORIZED";
    return NextResponse.json(
      {
        success: false,
        error: code,
        message: error instanceof Error ? error.message : "Unauthorized",
      },
      { status: code === "ADMIN_SECRET_MISSING" ? 503 : 401 },
    );
  }

  return NextResponse.json({
    success: true,
    capabilityAssessment: CANVA_SHELL_CAPABILITY_ASSESSMENT,
    note: "POST this route to create import jobs; poll GET /api/admin/canva/shell-jobs?jobId=…",
  });
}
