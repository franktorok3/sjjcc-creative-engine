import { NextResponse } from "next/server";
import { CanvaApiError } from "@/lib/canva/client";
import { CanvaAuthError } from "@/lib/canva/oauth";
import { CanvaDesignImportError } from "@/lib/canva/design-imports";
import { assertAdminSecret } from "@/lib/creative/admin-auth";
import {
  getSanitizedShellJobStatus,
  waitForSanitizedShellJobStatus,
} from "@/lib/creative/shells/job-status";
import { logShellStage } from "@/lib/creative/shells/stage-log";

export const runtime = "nodejs";
/** Bounded wait mode may poll up to 60s per job. */
export const maxDuration = 60;

/**
 * Operator-only: sanitized Canva design-import job status.
 *
 * GET /api/admin/canva/shell-jobs?jobId=<ID>
 * GET /api/admin/canva/shell-jobs?jobId=<ID>&wait=1  (poll ≤60s, then CANVA_IMPORT_PENDING)
 *
 * Header: X-Admin-Secret
 */
export async function GET(request: Request) {
  try {
    assertAdminSecret(request);
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

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim();
  const wait = url.searchParams.get("wait") === "1";

  if (!jobId) {
    return NextResponse.json(
      {
        success: false,
        error: "JOB_ID_REQUIRED",
        message:
          "Pass ?jobId=<Canva import job id>. Create jobs via POST /api/admin/canva/generate-shells.",
      },
      { status: 400 },
    );
  }

  try {
    const job = wait
      ? await waitForSanitizedShellJobStatus(jobId)
      : await getSanitizedShellJobStatus(jobId);

    const payload = {
      success: true as const,
      job: {
        jobId: job.jobId,
        status: job.status,
        designId: job.designId,
        designUrl: job.designUrl,
        designEditUrl: job.designEditUrl,
        designViewUrl: job.designViewUrl,
        thumbnailUrl: job.thumbnailUrl,
        error: job.error,
        ...(job.code ? { code: job.code } : {}),
      },
    };

    logShellStage("response_returned", {
      route: "shell-jobs",
      jobId: job.jobId,
      status: job.status,
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof CanvaAuthError) {
      return NextResponse.json(
        { success: false, error: error.code, message: error.message },
        { status: 401 },
      );
    }
    if (
      error instanceof CanvaApiError ||
      error instanceof CanvaDesignImportError
    ) {
      return NextResponse.json(
        {
          success: false,
          error: error.code,
          message: error.message,
          ...(error instanceof CanvaDesignImportError && error.importJobId
            ? { importJobId: error.importJobId }
            : {}),
        },
        { status: 502 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: "SHELL_JOB_STATUS_FAILED", message },
      { status: 500 },
    );
  }
}
