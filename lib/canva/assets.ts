import "server-only";
import { CanvaApiError } from "./client";
import { CanvaAuthError, getValidCanvaAccessToken } from "./oauth";

const CANVA_API_BASE = "https://api.canva.com/rest/v1";

export class CanvaAssetError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanvaAssetError";
    this.code = code;
  }
}

type AssetUploadJob = {
  id: string;
  status: "in_progress" | "success" | "failed";
  asset?: { id: string; type?: string; name?: string };
  error?: { code?: string; message?: string };
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload a binary asset (e.g. QR PNG) to Canva and return its asset id.
 * Uses the Asset Upload Job API (octet-stream + Asset-Upload-Metadata).
 */
export async function uploadCanvaImageAsset(input: {
  bytes: Buffer;
  name: string;
}): Promise<{ assetId: string; jobId: string }> {
  const name = input.name.trim().slice(0, 50) || "Creative Engine QR";
  const nameBase64 = Buffer.from(name, "utf8").toString("base64");

  const accessToken = await getValidCanvaAccessToken();
  const uploadOnce = async (token: string) =>
    fetch(`${CANVA_API_BASE}/asset-uploads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Asset-Upload-Metadata": JSON.stringify({ name_base64: nameBase64 }),
      },
      body: new Uint8Array(input.bytes),
    });

  const response = await uploadOnce(accessToken);
  // PoC: no automatic refresh retry on 401 (single-use refresh tokens).
  if (response.status === 401 || response.status === 403) {
    throw new CanvaAuthError(
      "CANVA_REAUTH_REQUIRED",
      `Canva asset upload rejected auth (${response.status}). Revisit /api/canva/connect and update Vercel env tokens.`,
    );
  }

  const text = await response.text();
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text.slice(0, 200) };
    }
  }

  if (response.status === 401 || response.status === 403) {
    throw new CanvaAuthError(
      "CANVA_AUTH_REQUIRED",
      `Canva asset upload rejected auth (${response.status})`,
    );
  }

  if (!response.ok) {
    const record = (json ?? {}) as Record<string, unknown>;
    throw new CanvaApiError(
      response.status,
      typeof record.code === "string" ? record.code : `HTTP_${response.status}`,
      typeof record.message === "string"
        ? record.message
        : `Canva asset upload failed (${response.status})`,
      record,
    );
  }

  const job = (json as { job?: AssetUploadJob }).job;
  if (!job?.id) {
    throw new CanvaAssetError(
      "CANVA_ASSET_UPLOAD_NO_JOB",
      "Asset upload response missing job id",
    );
  }

  const completed = await waitForAssetUploadJob(job.id);
  const assetId = completed.asset?.id;
  if (!assetId) {
    throw new CanvaAssetError(
      "CANVA_ASSET_UPLOAD_NO_ASSET",
      `Asset upload job ${job.id} succeeded without an asset id`,
    );
  }

  return { assetId, jobId: job.id };
}

async function waitForAssetUploadJob(
  jobId: string,
  options?: { intervalMs?: number; maxAttempts?: number },
): Promise<AssetUploadJob> {
  const intervalMs = options?.intervalMs ?? 1500;
  const maxAttempts = options?.maxAttempts ?? 40;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const accessToken = await getValidCanvaAccessToken();
    const response = await fetch(
      `${CANVA_API_BASE}/asset-uploads/${encodeURIComponent(jobId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const json = (await response.json().catch(() => ({}))) as {
      job?: AssetUploadJob;
    };
    const job = json.job;
    if (!response.ok || !job) {
      throw new CanvaAssetError(
        "CANVA_ASSET_UPLOAD_POLL_FAILED",
        `Failed to poll asset upload job ${jobId} (${response.status})`,
      );
    }
    if (job.status === "success") return job;
    if (job.status === "failed") {
      throw new CanvaAssetError(
        job.error?.code ?? "CANVA_ASSET_UPLOAD_FAILED",
        job.error?.message ?? `Asset upload job ${jobId} failed`,
      );
    }
    if (attempt < maxAttempts) await sleep(intervalMs);
  }

  throw new CanvaAssetError(
    "CANVA_ASSET_UPLOAD_TIMEOUT",
    `Asset upload job ${jobId} did not complete in time`,
  );
}
