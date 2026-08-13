import "server-only";
import { CanvaApiError } from "./client";
import { CanvaAuthError, getValidCanvaAccessToken } from "./oauth";

const CANVA_API_BASE = "https://api.canva.com/rest/v1";

/** Hard ceiling for a single import poll session (PoC). */
export const CANVA_IMPORT_POLL_MAX_MS = 60_000;
const CANVA_IMPORT_POLL_INITIAL_MS = 1_000;
const CANVA_IMPORT_POLL_MAX_INTERVAL_MS = 5_000;

export class CanvaDesignImportError extends Error {
  code: string;
  importJobId?: string;

  constructor(code: string, message: string, importJobId?: string) {
    super(message);
    this.name = "CanvaDesignImportError";
    this.code = code;
    this.importJobId = importJobId;
  }
}

export type CanvaImportJobSnapshot = {
  id: string;
  status: "in_progress" | "success" | "failed";
  result?: {
    designs?: Array<{
      id: string;
      title?: string;
      urls?: { edit_url?: string; view_url?: string };
      thumbnail?: { url?: string; width?: number; height?: number };
      created_at?: number;
      updated_at?: number;
    }>;
  };
  error?: { code?: string; message?: string };
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start a Canva design import job — does NOT wait for completion.
 */
export async function startDesignImport(input: {
  bytes: Buffer;
  title: string;
  mimeType: string;
}): Promise<{ importJobId: string }> {
  const title = input.title.trim().slice(0, 50) || "Creative Engine Shell";
  const titleBase64 = Buffer.from(title, "utf8").toString("base64");
  const accessToken = await getValidCanvaAccessToken();

  const response = await fetch(`${CANVA_API_BASE}/imports`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Import-Metadata": JSON.stringify({
        title_base64: titleBase64,
        mime_type: input.mimeType,
      }),
    },
    body: new Uint8Array(input.bytes),
  });

  if (response.status === 401 || response.status === 403) {
    throw new CanvaAuthError(
      "CANVA_REAUTH_REQUIRED",
      `Canva design import rejected auth (${response.status}). Revisit /api/canva/connect.`,
    );
  }

  const json = (await response.json().catch(() => ({}))) as {
    job?: CanvaImportJobSnapshot;
    code?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new CanvaApiError(
      response.status,
      json.code ?? `HTTP_${response.status}`,
      json.message ?? `Design import failed (${response.status})`,
      json,
    );
  }

  const jobId = json.job?.id;
  if (!jobId) {
    throw new CanvaDesignImportError(
      "CANVA_IMPORT_NO_JOB",
      "Design import response missing job id",
    );
  }

  return { importJobId: jobId };
}

/** Fetch current Canva import job status (single request, no polling). */
export async function getDesignImportJob(
  jobId: string,
): Promise<CanvaImportJobSnapshot> {
  const accessToken = await getValidCanvaAccessToken();
  const response = await fetch(
    `${CANVA_API_BASE}/imports/${encodeURIComponent(jobId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json = (await response.json().catch(() => ({}))) as {
    job?: CanvaImportJobSnapshot;
    code?: string;
    message?: string;
  };

  if (response.status === 401 || response.status === 403) {
    throw new CanvaAuthError(
      "CANVA_REAUTH_REQUIRED",
      `Canva import poll rejected auth (${response.status}).`,
    );
  }

  if (!response.ok || !json.job) {
    throw new CanvaDesignImportError(
      "CANVA_IMPORT_POLL_FAILED",
      json.message ?? `Failed to poll import job ${jobId} (${response.status})`,
      jobId,
    );
  }

  return json.job;
}

export type PollImportResult =
  | {
      status: "completed";
      importJobId: string;
      designId: string;
      title: string | null;
      editUrl: string | null;
      viewUrl: string | null;
      thumbnailUrl: string | null;
    }
  | {
      status: "failed";
      importJobId: string;
      errorCode: string;
      errorMessage: string;
    }
  | {
      status: "pending";
      importJobId: string;
      code: "CANVA_IMPORT_PENDING";
      message: string;
    };

/**
 * Poll a Canva import job with a hard timeout (default 60s).
 * Returns CANVA_IMPORT_PENDING instead of hanging forever.
 */
export async function pollDesignImportJob(
  jobId: string,
  options?: { maxMs?: number },
): Promise<PollImportResult> {
  const maxMs = options?.maxMs ?? CANVA_IMPORT_POLL_MAX_MS;
  const started = Date.now();
  let interval = CANVA_IMPORT_POLL_INITIAL_MS;

  while (Date.now() - started < maxMs) {
    const job = await getDesignImportJob(jobId);

    if (job.status === "success") {
      const design = job.result?.designs?.[0];
      if (!design?.id) {
        return {
          status: "failed",
          importJobId: jobId,
          errorCode: "CANVA_IMPORT_NO_DESIGN",
          errorMessage: `Import job ${jobId} succeeded without a design id`,
        };
      }
      return {
        status: "completed",
        importJobId: jobId,
        designId: design.id,
        title: design.title ?? null,
        editUrl: design.urls?.edit_url ?? null,
        viewUrl: design.urls?.view_url ?? null,
        thumbnailUrl: design.thumbnail?.url ?? null,
      };
    }

    if (job.status === "failed") {
      return {
        status: "failed",
        importJobId: jobId,
        errorCode: job.error?.code ?? "CANVA_IMPORT_FAILED",
        errorMessage: job.error?.message ?? `Import job ${jobId} failed`,
      };
    }

    const remaining = maxMs - (Date.now() - started);
    if (remaining <= 0) break;
    await sleep(Math.min(interval, remaining));
    interval = Math.min(interval * 1.5, CANVA_IMPORT_POLL_MAX_INTERVAL_MS);
  }

  return {
    status: "pending",
    importJobId: jobId,
    code: "CANVA_IMPORT_PENDING",
    message: `Import job ${jobId} still processing after ${maxMs}ms`,
  };
}

/**
 * @deprecated Prefer startDesignImport + pollDesignImportJob for non-blocking flows.
 * Kept for scripts that need a single-call import with a hard timeout.
 */
export async function importDesignFromBytes(input: {
  bytes: Buffer;
  title: string;
  mimeType: string;
}): Promise<{
  jobId: string;
  importJobStatus: "success" | "pending";
  designId?: string;
  title: string;
  editUrl: string | null;
  viewUrl: string | null;
  thumbnailUrl: string | null;
  editableImportConfirmed: boolean;
  pending?: boolean;
  code?: string;
}> {
  const { importJobId } = await startDesignImport(input);
  const polled = await pollDesignImportJob(importJobId);

  if (polled.status === "completed") {
    return {
      jobId: importJobId,
      importJobStatus: "success",
      designId: polled.designId,
      title: polled.title ?? input.title,
      editUrl: polled.editUrl,
      viewUrl: polled.viewUrl,
      thumbnailUrl: polled.thumbnailUrl,
      editableImportConfirmed: Boolean(polled.editUrl || polled.designId),
    };
  }

  if (polled.status === "failed") {
    throw new CanvaDesignImportError(
      polled.errorCode,
      polled.errorMessage,
      importJobId,
    );
  }

  return {
    jobId: importJobId,
    importJobStatus: "pending",
    title: input.title,
    editUrl: null,
    viewUrl: null,
    thumbnailUrl: null,
    editableImportConfirmed: false,
    pending: true,
    code: "CANVA_IMPORT_PENDING",
  };
}
