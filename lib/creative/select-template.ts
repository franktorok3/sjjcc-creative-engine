import {
  APPROVED_CREATIVE_TEMPLATES,
  type CreativeTemplate,
} from "@/config/canva-templates";
import type {
  CreativeClassification,
  CreativeRequest,
} from "@/lib/creative/types";

export type TemplateSelectionResult =
  | { ok: true; template: CreativeTemplate }
  | {
      ok: false;
      code: "NO_APPROVED_TEMPLATE";
      reason: string;
      requirements: {
        assetType: CreativeRequest["assetType"];
        density: CreativeClassification["density"];
        backgroundTreatment: CreativeClassification["backgroundTreatment"];
        contactTreatment: CreativeClassification["contactTreatment"];
        partnerTreatment: CreativeClassification["partnerTreatment"];
        requiresImage: boolean;
        requiresQr: boolean;
      };
    };

/**
 * Select an approved Creative Engine template.
 *
 * Priority (documented):
 * 1. assetType must match
 * 2. approved === true
 * 3. partner treatment compatibility
 * 4. QR support when required
 * 5. image support when required
 * 6. exact density match (fail closed if none)
 * 7. contact treatment compatibility + exact match preferred
 * 8. background compatibility
 * 9. lower registry `priority` number wins ties
 *
 * Never selects unapproved templates.
 * Never fuzzy-matches by title.
 */
export function selectCreativeTemplate(
  request: CreativeRequest,
  classification: CreativeClassification,
  registry: readonly CreativeTemplate[] = APPROVED_CREATIVE_TEMPLATES,
): TemplateSelectionResult {
  const requirements = {
    assetType: request.assetType,
    density: classification.density,
    backgroundTreatment: classification.backgroundTreatment,
    contactTreatment: classification.contactTreatment,
    partnerTreatment: classification.partnerTreatment,
    requiresImage: classification.requiresImage,
    requiresQr: classification.requiresQr,
  };

  const candidates = registry.filter((t) => {
    if (!t.approved) return false;
    if (t.assetType !== request.assetType) return false;
    if (classification.requiresQr && !t.supportsQr) return false;
    if (classification.requiresImage && !t.supportsImage) return false;

    if (
      classification.partnerTreatment === "sjjcc_uja_partner" &&
      t.partnerTreatment !== "sjjcc_uja_partner"
    ) {
      return false;
    }
    if (
      classification.partnerTreatment !== "sjjcc_uja_partner" &&
      t.partnerTreatment === "sjjcc_uja_partner"
    ) {
      return false;
    }

    if (!contactCompatible(t.contactTreatment, classification.contactTreatment)) {
      return false;
    }

    return true;
  });

  if (candidates.length === 0) {
    return {
      ok: false,
      code: "NO_APPROVED_TEMPLATE",
      reason: formatNoApprovedReason(requirements),
      requirements,
    };
  }

  // Exact density required — do not silently downgrade/upgrade
  const densityExact = candidates.filter(
    (t) => t.density === classification.density,
  );
  if (densityExact.length === 0) {
    return {
      ok: false,
      code: "NO_APPROVED_TEMPLATE",
      reason: formatNoApprovedReason(requirements),
      requirements,
    };
  }

  const scored = densityExact
    .map((template) => ({
      template,
      score: scoreTemplate(template, classification),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Lower priority number = higher preference
      return a.template.priority - b.template.priority;
    });

  return { ok: true, template: scored[0]!.template };
}

function contactCompatible(
  templateContact: CreativeTemplate["contactTreatment"],
  needed: CreativeClassification["contactTreatment"],
): boolean {
  if (needed === "none") return true;
  if (needed === "compact") {
    return templateContact === "compact" || templateContact === "full";
  }
  return templateContact === "full";
}

function scoreTemplate(
  template: CreativeTemplate,
  classification: CreativeClassification,
): number {
  let score = 0;

  if (template.contactTreatment === classification.contactTreatment) {
    score += 20;
  }

  if (template.backgroundTreatment === classification.backgroundTreatment) {
    score += 15;
  } else if (
    !classification.requiresImage &&
    template.backgroundTreatment === "light"
  ) {
    score += 8;
  }

  if (classification.requiresImage && template.supportsImage) {
    score += 10;
  }

  if (classification.requiresQr && template.supportsQr) {
    score += 5;
  }

  return score;
}

export function formatNoApprovedReason(requirements: {
  assetType: string;
  density: string;
  backgroundTreatment?: string;
  contactTreatment: string;
  partnerTreatment: string;
  requiresImage: boolean;
  requiresQr: boolean;
}): string {
  const imageLabel = requirements.requiresImage ? "Supplied/required" : "None/auto";
  const partnerLabel =
    requirements.partnerTreatment === "sjjcc_uja_partner" ? "Yes" : "SJJCC + UJA";

  return [
    "No approved Creative Engine layout currently matches:",
    "",
    `Asset: ${requirements.assetType}`,
    `Content: ${requirements.density}`,
    `Image: ${imageLabel}`,
    `Contact: ${requirements.contactTreatment}`,
    `Partner: ${partnerLabel}`,
    `QR: ${requirements.requiresQr ? "required" : "not required"}`,
    "",
    "This combination requires an additional approved template.",
  ].join("\n");
}

/**
 * Validate that a template's declared dataset roles exist with expected types
 * against a live Canva autofill dataset map.
 */
export function validateTemplateDataset(
  template: CreativeTemplate,
  liveDataset: Record<string, "text" | "image" | "chart" | string>,
):
  | { ok: true }
  | {
      ok: false;
      code: "DATASET_MISMATCH";
      missing: string[];
      typeMismatches: string[];
    } {
  const missing: string[] = [];
  const typeMismatches: string[] = [];

  for (const [field, expectedType] of Object.entries(template.dataset)) {
    const liveType = liveDataset[field];
    if (!liveType) {
      missing.push(field);
      continue;
    }
    if (liveType !== expectedType) {
      typeMismatches.push(
        `${field}: expected ${expectedType}, got ${liveType}`,
      );
    }
  }

  if (missing.length > 0 || typeMismatches.length > 0) {
    return { ok: false, code: "DATASET_MISMATCH", missing, typeMismatches };
  }
  return { ok: true };
}
