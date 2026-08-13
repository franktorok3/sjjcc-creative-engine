import "server-only";
import { canvaFetch } from "./client";

export type CreatedCanvaDesign = {
  id: string;
  title?: string;
  urls?: { edit_url?: string; view_url?: string };
  thumbnail?: { url?: string; width?: number; height?: number };
  created_at?: number;
  updated_at?: number;
  page_count?: number;
};

/**
 * Create a blank custom-size Canva design (fallback path).
 */
export async function createBlankCustomDesign(input: {
  title: string;
  widthPx: number;
  heightPx: number;
}): Promise<CreatedCanvaDesign> {
  const response = await canvaFetch<{ design: CreatedCanvaDesign }>("/designs", {
    method: "POST",
    body: {
      design_type: {
        type: "custom",
        width: input.widthPx,
        height: input.heightPx,
      },
      title: input.title.slice(0, 255),
    },
  });
  return response.design;
}

/**
 * Attempt to publish a design as a Brand Template (preview API).
 * Requires brandtemplate:content:write — may fail with current scopes.
 */
export async function publishDesignAsBrandTemplate(designId: string): Promise<{
  id: string;
  title: string | null;
  viewUrl: string | null;
  createUrl: string | null;
  thumbnailUrl: string | null;
}> {
  const response = await canvaFetch<{
    brand_template: {
      id: string;
      title?: string;
      view_url?: string;
      create_url?: string;
      thumbnail?: { url?: string };
    };
  }>("/brand-templates", {
    method: "POST",
    body: { design_id: designId },
  });

  const t = response.brand_template;
  return {
    id: t.id,
    title: t.title ?? null,
    viewUrl: t.view_url ?? null,
    createUrl: t.create_url ?? null,
    thumbnailUrl: t.thumbnail?.url ?? null,
  };
}

export async function getDesignDataset(
  designId: string,
): Promise<Record<string, { type: string }>> {
  const response = await canvaFetch<{
    dataset?: Record<string, { type: string }>;
  }>(`/designs/${encodeURIComponent(designId)}/dataset`);
  return response.dataset ?? {};
}
