import "server-only";
import { CANVA_BRAND_KIT_QUERY } from "@/config/canva-brand";
import { canvaFetch } from "./client";
import type {
  CanvaBrandTemplate,
  CanvaBrandTemplateDataset,
} from "./types";

export async function listBrandTemplates(params?: {
  query?: string;
  continuation?: string;
  limit?: number;
  /** When true (default), prefer AI Marketing 2.0 search query if none provided. */
  preferAiMarketingKit?: boolean;
}): Promise<{
  items: CanvaBrandTemplate[];
  continuation?: string;
  queryUsed: string | undefined;
}> {
  const preferAiMarketingKit = params?.preferAiMarketingKit !== false;
  const query =
    params?.query?.trim() ||
    (preferAiMarketingKit ? CANVA_BRAND_KIT_QUERY : undefined);

  const response = await canvaFetch<{
    items?: CanvaBrandTemplate[];
    continuation?: string;
  }>("/brand-templates", {
    query: {
      query,
      continuation: params?.continuation,
      limit: params?.limit ? String(params.limit) : undefined,
      dataset: "non_empty",
    },
  });

  return {
    items: response.items ?? [],
    continuation: response.continuation,
    queryUsed: query,
  };
}

export async function getBrandTemplateDataset(
  brandTemplateId: string,
): Promise<CanvaBrandTemplateDataset> {
  const response = await canvaFetch<{
    dataset?: CanvaBrandTemplateDataset;
  }>(`/brand-templates/${encodeURIComponent(brandTemplateId)}/dataset`);

  return response.dataset ?? {};
}

export function getConfiguredBrandTemplateId(): string {
  const id = process.env.CANVA_BRAND_TEMPLATE_ID?.trim();
  if (!id) {
    throw new Error(
      "CANVA_BRAND_TEMPLATE_ID is not configured. Set it to a Brand Template ID from GET /api/test/canva/templates.",
    );
  }
  return id;
}
