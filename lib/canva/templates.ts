import "server-only";
import { canvaFetch } from "./client";
import type {
  CanvaBrandTemplate,
  CanvaBrandTemplateDataset,
} from "./types";

/** Sanitized Brand Template discovery row — no secrets. */
export type BrandTemplateDiscoveryItem = {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  createdAt: number | null;
  updatedAt: number | null;
};

export function sanitizeBrandTemplate(
  template: CanvaBrandTemplate,
): BrandTemplateDiscoveryItem {
  return {
    id: String(template.id),
    title: template.title?.trim() ? template.title.trim() : null,
    thumbnailUrl: template.thumbnail?.url ?? null,
    createdAt:
      typeof template.created_at === "number" ? template.created_at : null,
    updatedAt:
      typeof template.updated_at === "number" ? template.updated_at : null,
  };
}

/** Optional case-insensitive title filter (template titles only). */
export function filterBrandTemplatesByTitle(
  templates: CanvaBrandTemplate[],
  titleQuery?: string,
): CanvaBrandTemplate[] {
  const q = titleQuery?.trim().toLowerCase();
  if (!q) return templates;
  return templates.filter((template) =>
    (template.title ?? "").toLowerCase().includes(q),
  );
}

/**
 * List Brand Templates from Canva Connect.
 * Does NOT default to any Brand Kit name query — kit membership cannot be
 * confirmed from the Brand Template response.
 * Uses dataset=any so templates without autofill fields are still listed.
 */
export async function listBrandTemplates(params?: {
  /** Optional Canva API search query (caller-supplied only). */
  query?: string;
  continuation?: string;
  limit?: number;
  /** Default "any" — list all templates; "non_empty" for autofill-ready only. */
  dataset?: "any" | "non_empty";
}): Promise<{
  items: CanvaBrandTemplate[];
  continuation?: string;
  queryUsed: string | undefined;
}> {
  const query = params?.query?.trim() || undefined;
  const dataset = params?.dataset ?? "any";

  const response = await canvaFetch<{
    items?: CanvaBrandTemplate[];
    continuation?: string;
  }>("/brand-templates", {
    query: {
      query,
      continuation: params?.continuation,
      limit: params?.limit ? String(params.limit) : undefined,
      dataset,
      ownership: "any",
      sort_by: "title_ascending",
    },
  });

  return {
    items: response.items ?? [],
    continuation: response.continuation,
    queryUsed: query,
  };
}

/**
 * Fetch all Brand Template pages (follows continuation). Cap pages for safety.
 */
export async function listAllBrandTemplates(params?: {
  query?: string;
  limit?: number;
  dataset?: "any" | "non_empty";
  maxPages?: number;
}): Promise<{
  items: CanvaBrandTemplate[];
  queryUsed: string | undefined;
  pagesFetched: number;
}> {
  const maxPages = params?.maxPages ?? 20;
  const items: CanvaBrandTemplate[] = [];
  let continuation: string | undefined;
  let queryUsed: string | undefined;
  let pagesFetched = 0;

  do {
    const page = await listBrandTemplates({
      query: params?.query,
      limit: params?.limit ?? 100,
      dataset: params?.dataset ?? "any",
      continuation,
    });
    pagesFetched += 1;
    queryUsed = page.queryUsed;
    items.push(...page.items);
    continuation = page.continuation;
  } while (continuation && pagesFetched < maxPages);

  return { items, queryUsed, pagesFetched };
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
