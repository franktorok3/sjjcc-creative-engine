import "server-only";
import {
  ASSET_TYPES,
  type AssetType,
  CREATIVE_FIELD_ROLES,
} from "@/config/canva-templates";
import type { CanvaBrandTemplate } from "@/lib/canva/types";
import {
  getBrandTemplateDataset,
  listAllBrandTemplates,
  sanitizeBrandTemplate,
} from "@/lib/canva/templates";

export type TemplateInventoryRow = {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  datasetEmpty: boolean;
  datasetFieldCount: number;
  datasetFields: Array<{ name: string; type: string }>;
  hasUsableAutofill: boolean;
  category: "usable_autofill" | "visual_only" | "partial_dataset";
  missingDesiredRoles: string[];
  presentDesiredRoles: string[];
  candidateAssetFamily: AssetType | "unknown";
  note: string;
};

/**
 * Operator-oriented inventory: discover Brand Templates + datasets.
 * Does NOT approve templates. Does NOT invent registry entries.
 */
export async function buildTemplateInventoryReport(options?: {
  /** Cap how many datasets to fetch (rate-limit friendly). */
  maxDatasetLookups?: number;
  titleFilter?: string;
}): Promise<{
  templateCount: number;
  inspectedCount: number;
  usableAutofill: TemplateInventoryRow[];
  visualOnly: TemplateInventoryRow[];
  partialDataset: TemplateInventoryRow[];
  templates: TemplateInventoryRow[];
  requiredForMvp: string[];
  note: string;
}> {
  const listed = await listAllBrandTemplates({ limit: 100, dataset: "any" });
  let items = listed.items;
  const q = options?.titleFilter?.trim().toLowerCase();
  if (q) {
    items = items.filter((t) => (t.title ?? "").toLowerCase().includes(q));
  }

  const maxLookups = options?.maxDatasetLookups ?? items.length;
  const rows: TemplateInventoryRow[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const template = items[i]!;
    if (i >= maxLookups) {
      rows.push(rowWithoutDataset(template));
      continue;
    }
    try {
      const dataset = await getBrandTemplateDataset(template.id);
      rows.push(inspectTemplate(template, dataset));
    } catch {
      rows.push({
        ...rowWithoutDataset(template),
        note: "Dataset lookup failed — re-auth or retry.",
      });
    }
  }

  const usableAutofill = rows.filter((r) => r.category === "usable_autofill");
  const visualOnly = rows.filter((r) => r.category === "visual_only");
  const partialDataset = rows.filter((r) => r.category === "partial_dataset");

  return {
    templateCount: items.length,
    inspectedCount: Math.min(items.length, maxLookups),
    usableAutofill,
    visualOnly,
    partialDataset,
    templates: rows,
    requiredForMvp: [
      "CE - Flyer - Standard - Light",
      "CE - Half Page - Standard - Light",
      "CE - Social Portrait - Standard - Light",
    ],
    note: "Inventory only. Do not auto-approve. Register exact IDs in config/canva-templates.ts after live verification (Phase 2).",
  };
}

function rowWithoutDataset(template: CanvaBrandTemplate): TemplateInventoryRow {
  const sanitized = sanitizeBrandTemplate(template);
  return {
    id: sanitized.id,
    title: sanitized.title,
    thumbnailUrl: sanitized.thumbnailUrl,
    datasetEmpty: true,
    datasetFieldCount: 0,
    datasetFields: [],
    hasUsableAutofill: false,
    category: "visual_only",
    missingDesiredRoles: [...CREATIVE_FIELD_ROLES],
    presentDesiredRoles: [],
    candidateAssetFamily: guessAssetFamily(sanitized.title),
    note: "Dataset not inspected.",
  };
}

function inspectTemplate(
  template: CanvaBrandTemplate,
  dataset: Record<string, { type: string }>,
): TemplateInventoryRow {
  const sanitized = sanitizeBrandTemplate(template);
  const datasetFields = Object.entries(dataset).map(([name, field]) => ({
    name,
    type: field.type,
  }));
  const names = new Set(Object.keys(dataset));
  const presentDesiredRoles = CREATIVE_FIELD_ROLES.filter((role) =>
    names.has(role),
  );
  const missingDesiredRoles = CREATIVE_FIELD_ROLES.filter(
    (role) => !names.has(role),
  );

  const datasetEmpty = datasetFields.length === 0;
  const hasCoreText =
    names.has("HEADLINE") || names.has("DESCRIPTION") || names.has("DATE");
  const hasUsableAutofill = !datasetEmpty && hasCoreText;

  let category: TemplateInventoryRow["category"];
  if (datasetEmpty) {
    category = "visual_only";
  } else if (hasUsableAutofill) {
    category = "usable_autofill";
  } else {
    category = "partial_dataset";
  }

  return {
    id: sanitized.id,
    title: sanitized.title,
    thumbnailUrl: sanitized.thumbnailUrl,
    datasetEmpty,
    datasetFieldCount: datasetFields.length,
    datasetFields,
    hasUsableAutofill,
    category,
    missingDesiredRoles: [...missingDesiredRoles],
    presentDesiredRoles: [...presentDesiredRoles],
    candidateAssetFamily: guessAssetFamily(sanitized.title),
    note:
      category === "visual_only"
        ? "No Autofill dataset — cannot drive Creative Engine generation."
        : category === "usable_autofill"
          ? "Has Autofill fields — candidate for operator review only."
          : "Dataset present but missing core creative roles.",
  };
}

/** Heuristic for operators only — never used for production selection. */
function guessAssetFamily(title: string | null): AssetType | "unknown" {
  const t = (title ?? "").toLowerCase();
  if (t.includes("half") || t.includes("handout")) return "handout_half";
  if (
    t.includes("social") ||
    t.includes("instagram") ||
    t.includes("1080") ||
    t.includes("story")
  ) {
    return "social_portrait";
  }
  if (t.includes("flyer") || t.includes("letter") || t.includes("8.5")) {
    return "flyer_full";
  }
  // Silence unused ASSET_TYPES import warning by referencing
  void ASSET_TYPES;
  return "unknown";
}
