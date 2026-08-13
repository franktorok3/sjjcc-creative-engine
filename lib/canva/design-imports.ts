import "server-only";
import { CanvaApiError } from "./client";
import { CanvaAuthError, getValidCanvaAccessToken } from "./oauth";

const CANVA_API_BASE = "https://api.canva.com/rest/v1";

export class CanvaDesignImportError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanvaDesignImportError";
    this.code = code;
  }
}

type ImportJob = {
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
 * Import a binary file (e.g. PPTX) as an editable Canva design.
 */
export async function importDesignFromBytes(input: {
  bytes: Buffer;
  title: string;
  mimeType: string;
}): Promise<{
  jobId: string;
  designId: string;
  title: string;
  editUrl: string | null;
  viewUrl: string | null;
  thumbnailUrl: string | null;
}> {
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
    job?: ImportJob;
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

  const completed = await waitForImportJob(jobId);
  const design = completed.result?.designs?.[0];
  if (!design?.id) {
    throw new CanvaDesignImportError(
      "CANVA_IMPORT_NO_DESIGN",
      `Import job ${jobId} succeeded without a design id`,
    );
  }

  return {
    jobId,
    designId: design.id,
    title: design.title ?? title,
    editUrl: design.urls?.edit_url ?? null,
    viewUrl: design.urls?.view_url ?? null,
    thumbnailUrl: design.thumbnail?.url ?? null,
  };
}

async function waitForImportJob(
  jobId: string,
  options?: { intervalMs?: number; maxAttempts?: number },
): Promise<ImportJob> {
  const intervalMs = options?.intervalMs ?? 2000;
  const maxAttempts = options?.maxAttempts ?? 60;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const accessToken = await getValidCanvaAccessToken();
    const response = await fetch(
      `${CANVA_API_BASE}/imports/${encodeURIComponent(jobId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const json = (await response.json().catch(() => ({}))) as {
      job?: ImportJob;
    };
    const job = json.job;
    if (!response.ok || !job) {
      throw new CanvaDesignImportError(
        "CANVA_IMPORT_POLL_FAILED",
        `Failed to poll import job ${jobId} (${response.status})`,
      );
    }
    if (job.status === "success") return job;
    if (job.status === "failed") {
      throw new CanvaDesignImportError(
        job.error?.code ?? "CANVA_IMPORT_FAILED",
        job.error?.message ?? `Import job ${jobId} failed`,
      );
    }
    if (attempt < maxAttempts) await sleep(intervalMs);
  }

  throw new CanvaDesignImportError(
    "CANVA_IMPORT_TIMEOUT",
    `Import job ${jobId} did not complete in time`,
  );
}
