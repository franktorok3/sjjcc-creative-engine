import "server-only";
import {
  getDesignImportJob,
  pollDesignImportJob,
  type CanvaImportJobSnapshot,
} from "@/lib/canva/design-imports";
import { logShellStage } from "@/lib/creative/shells/stage-log";

export type ShellJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "pending_timeout";

export type SanitizedShellJobStatus = {
  jobId: string;
  status: ShellJobStatus;
  designId: string | null;
  designUrl: string | null;
  designEditUrl: string | null;
  designViewUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  code?: string;
};

function mapSnapshot(job: CanvaImportJobSnapshot): SanitizedShellJobStatus {
  if (job.status === "success") {
    const design = job.result?.designs?.[0];
    if (!design?.id) {
      return {
        jobId: job.id,
        status: "failed",
        designId: null,
        designUrl: null,
        designEditUrl: null,
        designViewUrl: null,
        thumbnailUrl: null,
        error: "Import succeeded without a design id",
        code: "CANVA_IMPORT_NO_DESIGN",
      };
    }
    const editUrl = design.urls?.edit_url ?? null;
    const viewUrl = design.urls?.view_url ?? null;
    return {
      jobId: job.id,
      status: "completed",
      designId: design.id,
      designUrl: editUrl ?? viewUrl,
      designEditUrl: editUrl,
      designViewUrl: viewUrl,
      thumbnailUrl: design.thumbnail?.url ?? null,
      error: null,
    };
  }

  if (job.status === "failed") {
    return {
      jobId: job.id,
      status: "failed",
      designId: null,
      designUrl: null,
      designEditUrl: null,
      designViewUrl: null,
      thumbnailUrl: null,
      error: sanitizeErrorMessage(
        job.error?.message ?? `Import job ${job.id} failed`,
      ),
      code: job.error?.code ?? "CANVA_IMPORT_FAILED",
    };
  }

  // Canva reports in_progress for both queued and actively processing.
  return {
    jobId: job.id,
    status: "processing",
    designId: null,
    designUrl: null,
    designEditUrl: null,
    designViewUrl: null,
    thumbnailUrl: null,
    error: null,
  };
}

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/access[_-]?token[=:]\s*\S+/gi, "access_token=[redacted]")
    .replace(/refresh[_-]?token[=:]\s*\S+/gi, "refresh_token=[redacted]");
}

/** Single status snapshot (preferred for UI polling). */
export async function getSanitizedShellJobStatus(
  jobId: string,
): Promise<SanitizedShellJobStatus> {
  logShellStage("canva_import_polling", { importJobId: jobId });
  const job = await getDesignImportJob(jobId);
  const mapped = mapSnapshot(job);

  if (mapped.status === "completed") {
    logShellStage("canva_import_complete", {
      importJobId: jobId,
      designId: mapped.designId,
    });
  } else if (mapped.status === "failed") {
    logShellStage("canva_import_failed", {
      importJobId: jobId,
      code: mapped.code ?? "CANVA_IMPORT_FAILED",
    });
  }

  return mapped;
}

/**
 * Bounded poll (≤60s). On timeout returns pending_timeout + CANVA_IMPORT_PENDING
 * so the client can check later — never hangs indefinitely.
 */
export async function waitForSanitizedShellJobStatus(
  jobId: string,
  options?: { maxMs?: number },
): Promise<SanitizedShellJobStatus> {
  logShellStage("canva_import_polling", { importJobId: jobId, wait: true });
  const polled = await pollDesignImportJob(jobId, options);

  if (polled.status === "completed") {
    logShellStage("canva_import_complete", {
      importJobId: jobId,
      designId: polled.designId,
    });
    return {
      jobId,
      status: "completed",
      designId: polled.designId,
      designUrl: polled.editUrl ?? polled.viewUrl,
      designEditUrl: polled.editUrl,
      designViewUrl: polled.viewUrl,
      thumbnailUrl: polled.thumbnailUrl,
      error: null,
    };
  }

  if (polled.status === "failed") {
    logShellStage("canva_import_failed", {
      importJobId: jobId,
      code: polled.errorCode,
    });
    return {
      jobId,
      status: "failed",
      designId: null,
      designUrl: null,
      designEditUrl: null,
      designViewUrl: null,
      thumbnailUrl: null,
      error: sanitizeErrorMessage(polled.errorMessage),
      code: polled.errorCode,
    };
  }

  return {
    jobId,
    status: "pending_timeout",
    designId: null,
    designUrl: null,
    designEditUrl: null,
    designViewUrl: null,
    thumbnailUrl: null,
    error: sanitizeErrorMessage(polled.message),
    code: "CANVA_IMPORT_PENDING",
  };
}
