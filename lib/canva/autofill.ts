import "server-only";
import { canvaFetch } from "./client";
import { getBrandTemplateDataset, getConfiguredBrandTemplateId } from "./templates";
import type {
  CanvaAutofillData,
  CanvaAutofillJob,
  CanvaBrandTemplateDataset,
  CanvaDesign,
} from "./types";

const POLL_INTERVAL_MS = Number(process.env.CANVA_AUTOFILL_POLL_MS ?? "2000");
const MAX_POLL_ATTEMPTS = Number(
  process.env.CANVA_AUTOFILL_MAX_ATTEMPTS ?? "30",
);

export class CanvaAutofillError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanvaAutofillError";
    this.code = code;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validate that autofill data only references fields present in the dataset.
 * Fails clearly if a mapped field does not exist.
 */
export function validateAutofillAgainstDataset(
  data: CanvaAutofillData,
  dataset: CanvaBrandTemplateDataset,
): void {
  const datasetKeys = Object.keys(dataset);
  if (datasetKeys.length === 0) {
    throw new CanvaAutofillError(
      "CANVA_DATASET_EMPTY",
      "Brand template dataset has no autofill fields. Confirm the template supports autofill.",
    );
  }

  for (const fieldName of Object.keys(data)) {
    const field = dataset[fieldName];
    if (!field) {
      throw new CanvaAutofillError(
        "CANVA_FIELD_NOT_FOUND",
        `Mapped Canva field "${fieldName}" does not exist in the brand template dataset. Available fields: ${datasetKeys.join(", ") || "(none)"}`,
      );
    }

    const value = data[fieldName];
    if (value.type !== field.type) {
      throw new CanvaAutofillError(
        "CANVA_FIELD_TYPE_MISMATCH",
        `Canva field "${fieldName}" expects type "${field.type}" but received "${value.type}"`,
      );
    }

    // This PoC only fills text fields.
    if (field.type !== "text") {
      throw new CanvaAutofillError(
        "CANVA_FIELD_TYPE_UNSUPPORTED",
        `Canva field "${fieldName}" is type "${field.type}". This PoC only autofills text fields; leave images/charts as template defaults.`,
      );
    }
  }
}

export async function createAutofillJob(input: {
  brandTemplateId?: string;
  title?: string;
  data: CanvaAutofillData;
}): Promise<CanvaAutofillJob> {
  const brandTemplateId =
    input.brandTemplateId ?? getConfiguredBrandTemplateId();

  const dataset = await getBrandTemplateDataset(brandTemplateId);
  validateAutofillAgainstDataset(input.data, dataset);

  const response = await canvaFetch<{ job: CanvaAutofillJob }>("/autofills", {
    method: "POST",
    body: {
      type: "create_from_brand_template",
      brand_template_id: brandTemplateId,
      ...(input.title ? { title: input.title } : {}),
      data: input.data,
    },
  });

  return response.job;
}

export async function getAutofillJob(jobId: string): Promise<CanvaAutofillJob> {
  const response = await canvaFetch<{ job: CanvaAutofillJob }>(
    `/autofills/${encodeURIComponent(jobId)}`,
  );
  return response.job;
}

export async function waitForAutofillJob(
  jobId: string,
  options?: { intervalMs?: number; maxAttempts?: number },
): Promise<CanvaAutofillJob> {
  const intervalMs = options?.intervalMs ?? POLL_INTERVAL_MS;
  const maxAttempts = options?.maxAttempts ?? MAX_POLL_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const job = await getAutofillJob(jobId);

    if (job.status === "success") return job;
    if (job.status === "failed") {
      throw new CanvaAutofillError(
        job.error?.code ?? "CANVA_AUTOFILL_FAILED",
        job.error?.message ?? `Autofill job ${jobId} failed`,
      );
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  throw new CanvaAutofillError(
    "CANVA_AUTOFILL_TIMEOUT",
    `Autofill job ${jobId} did not complete after ${maxAttempts} attempts (~${Math.round((maxAttempts * intervalMs) / 1000)}s)`,
  );
}

export type AutofillResult = {
  jobId: string;
  designId: string;
  designUrl: string;
  editUrl?: string;
  title?: string;
};

export function extractDesignFromJob(job: CanvaAutofillJob): AutofillResult {
  const design: CanvaDesign | undefined = job.result?.design;
  if (!design?.id || !design.url) {
    throw new CanvaAutofillError(
      "CANVA_AUTOFILL_NO_DESIGN",
      `Autofill job ${job.id} succeeded but returned no design metadata`,
    );
  }

  return {
    jobId: job.id,
    designId: design.id,
    designUrl: design.url,
    editUrl: design.urls?.edit_url,
    title: design.title,
  };
}

export async function autofillBrandTemplate(input: {
  brandTemplateId?: string;
  title?: string;
  data: CanvaAutofillData;
  onJobStarted?: (jobId: string) => void;
}): Promise<AutofillResult> {
  const job = await createAutofillJob(input);
  input.onJobStarted?.(job.id);

  if (job.status === "success") {
    return extractDesignFromJob(job);
  }
  if (job.status === "failed") {
    throw new CanvaAutofillError(
      job.error?.code ?? "CANVA_AUTOFILL_FAILED",
      job.error?.message ?? `Autofill job ${job.id} failed immediately`,
    );
  }

  const completed = await waitForAutofillJob(job.id);
  return extractDesignFromJob(completed);
}
