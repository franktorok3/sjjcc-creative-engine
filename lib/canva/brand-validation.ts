import "server-only";
import {
  BRAND_BAR_LAYOUT,
  CANVA_BRAND_KIT_NAME,
  CANVA_BRAND_KIT_QUERY,
  DISALLOWED_BRAND_KIT_MARKERS,
  LOCKED_BRAND_DATASET_FIELDS,
  QR_PLACEMENT,
  REQUIRED_TEMPLATE_STRUCTURE,
  VARIABLE_DATASET_FIELD_ROLES,
  type RequiredTemplateStructureItem,
} from "@/config/canva-brand";
import type {
  CanvaBrandTemplate,
  CanvaBrandTemplateDataset,
} from "@/lib/canva/types";

export class BrandStructureError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "BrandStructureError";
    this.code = code;
    this.details = details;
  }
}

export function configuredLockedFieldNames(): string[] {
  return Object.values(LOCKED_BRAND_DATASET_FIELDS)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function configuredVariableFieldNames(): string[] {
  return Object.values(VARIABLE_DATASET_FIELD_ROLES)
    .map((role) => role.canvaField.trim())
    .filter(Boolean);
}

export function configuredQrFieldName(): string {
  return VARIABLE_DATASET_FIELD_ROLES.qrCode.canvaField.trim();
}

/** Titles that look like the required AI Marketing 2.0 Brand Kit / templates. */
export function matchesAiMarketingBrandKit(title: string | undefined): boolean {
  if (!title?.trim()) return false;
  const normalized = title.trim().toLowerCase();
  const required = CANVA_BRAND_KIT_NAME.toLowerCase();
  if (normalized.includes(required.toLowerCase())) return true;
  // Also accept query fragment matches.
  return normalized.includes(CANVA_BRAND_KIT_QUERY.toLowerCase());
}

export function looksLikeDisallowedGenericBrandKit(
  title: string | undefined,
): boolean {
  if (!title?.trim()) return false;
  const normalized = title.trim().toLowerCase();
  if (matchesAiMarketingBrandKit(title)) return false;
  return DISALLOWED_BRAND_KIT_MARKERS.some((marker) =>
    normalized.includes(marker.toLowerCase()),
  );
}

/**
 * Prioritize Brand Templates associated with AI Marketing 2.0.
 * Generic "Brand Kit" / "Marketing's Team" titles are deprioritized.
 */
export function prioritizeAiMarketingTemplates(
  templates: CanvaBrandTemplate[],
): {
  preferred: CanvaBrandTemplate[];
  other: CanvaBrandTemplate[];
  rejectedGeneric: CanvaBrandTemplate[];
} {
  const preferred: CanvaBrandTemplate[] = [];
  const other: CanvaBrandTemplate[] = [];
  const rejectedGeneric: CanvaBrandTemplate[] = [];

  for (const template of templates) {
    if (matchesAiMarketingBrandKit(template.title)) {
      preferred.push(template);
    } else if (looksLikeDisallowedGenericBrandKit(template.title)) {
      rejectedGeneric.push(template);
    } else {
      other.push(template);
    }
  }

  return { preferred, other, rejectedGeneric };
}

export type BrandStructureReport = {
  brandKitName: string;
  brandKitQuery: string;
  brandBar: typeof BRAND_BAR_LAYOUT;
  qrPlacement: typeof QR_PLACEMENT;
  requiredStructure: RequiredTemplateStructureItem[];
  lockedFieldsConfigured: string[];
  variableFieldsConfigured: Record<string, { canvaField: string; type: string }>;
  datasetFieldNames: string[];
  missingRequiredVariableFields: string[];
  lockedFieldsPresentInDataset: string[];
  qrField: {
    name: string;
    requiredType: "image";
    present: boolean;
    actualType: string | null;
    placement: typeof QR_PLACEMENT;
  };
  ok: boolean;
  issues: string[];
  /**
   * Layout positions (bottom bar, QR above bar) cannot be proven via Autofill
   * dataset metadata — they must be true in the published Brand Template.
   */
  apiLimitations: string[];
};

/**
 * Validate a live Brand Template dataset against Creative Engine brand rules.
 * Fails clearly when required Autofill roles are missing or mistyped once configured.
 */
export function validateBrandTemplateStructure(
  dataset: CanvaBrandTemplateDataset,
): BrandStructureReport {
  const datasetFieldNames = Object.keys(dataset);
  const issues: string[] = [];
  const lockedConfigured = configuredLockedFieldNames();
  const lockedPresent = lockedConfigured.filter((name) => name in dataset);

  const variableConfigured: Record<
    string,
    { canvaField: string; type: string }
  > = {};
  const missingRequiredVariableFields: string[] = [];

  for (const [role, spec] of Object.entries(VARIABLE_DATASET_FIELD_ROLES)) {
    const fieldName = spec.canvaField.trim();
    if (!fieldName) continue;
    variableConfigured[role] = { canvaField: fieldName, type: spec.type };

    // QR is required as an image slot in the production template.
    // Other variable text fields are expected but empty placeholders may still
    // be validated when present in the role config.
    const field = dataset[fieldName];
    if (!field) {
      missingRequiredVariableFields.push(fieldName);
      issues.push(
        `Required Autofill field "${fieldName}" (role: ${role}) is missing from the Brand Template dataset. Update the AI Marketing 2.0 Brand Template or config/canva-brand.ts after GET /api/test/canva/template-dataset.`,
      );
      continue;
    }
    if (field.type !== spec.type) {
      issues.push(
        `Autofill field "${fieldName}" (role: ${role}) has type "${field.type}" but Creative Engine expects "${spec.type}".`,
      );
    }
  }

  const qrName = configuredQrFieldName();
  const qrField = dataset[qrName];
  if (qrName && qrField && qrField.type !== "image") {
    issues.push(
      `QR field "${qrName}" must be type "image" (bottom-right above brand bar). Found "${qrField.type}".`,
    );
  }

  // Locked logo/bar fields must never be treated as variable content.
  for (const locked of lockedPresent) {
    const lockedRole = Object.entries(VARIABLE_DATASET_FIELD_ROLES).find(
      ([, spec]) => spec.canvaField === locked,
    );
    if (lockedRole) {
      issues.push(
        `Field "${locked}" is both locked brand structure and a variable role — remove it from VARIABLE_DATASET_FIELD_ROLES.`,
      );
    }
  }

  const apiLimitations = [
    "Canva Connect Autofill cannot verify pixel positions (brand bar at bottom, QR bottom-right above bar). Those must be designed into the AI Marketing 2.0 Brand Template.",
    "Canva Connect does not expose a Brand Kit selector API; we prioritize Brand Templates whose titles match \"AI Marketing 2.0\".",
    "Locked logos/brand bar that are not dataset fields remain template chrome and cannot be altered by Autofill — preferred.",
    "If logo/bar elements are exposed as dataset image fields, Creative Engine refuses to populate them from form values.",
  ];

  return {
    brandKitName: CANVA_BRAND_KIT_NAME,
    brandKitQuery: CANVA_BRAND_KIT_QUERY,
    brandBar: BRAND_BAR_LAYOUT,
    qrPlacement: QR_PLACEMENT,
    requiredStructure: [...REQUIRED_TEMPLATE_STRUCTURE],
    lockedFieldsConfigured: lockedConfigured,
    variableFieldsConfigured: variableConfigured,
    datasetFieldNames,
    missingRequiredVariableFields,
    lockedFieldsPresentInDataset: lockedPresent,
    qrField: {
      name: qrName,
      requiredType: "image",
      present: Boolean(qrField),
      actualType: qrField?.type ?? null,
      placement: QR_PLACEMENT,
    },
    ok: issues.length === 0,
    issues,
    apiLimitations,
  };
}

export function assertBrandTemplateStructure(
  dataset: CanvaBrandTemplateDataset,
): BrandStructureReport {
  const report = validateBrandTemplateStructure(dataset);
  if (!report.ok) {
    throw new BrandStructureError(
      "CANVA_BRAND_STRUCTURE_INVALID",
      `Brand template failed AI Marketing 2.0 structure checks: ${report.issues.join(" | ")}`,
      report,
    );
  }
  return report;
}

/**
 * Ensure a Form→Canva mapping never targets locked brand-structure fields
 * or the QR image slot (QR is generated in code from the destination URL).
 */
export function assertMappingRespectsLockedBrandFields(
  formToCanvaMap: Record<string, string>,
  options?: { additionalLockedFields?: string[] },
): void {
  const locked = new Set([
    ...configuredLockedFieldNames(),
    ...(options?.additionalLockedFields ?? []),
  ]);
  const qrField = configuredQrFieldName();
  if (qrField) locked.add(qrField);

  for (const [googleField, canvaField] of Object.entries(formToCanvaMap)) {
    if (locked.has(canvaField)) {
      throw new BrandStructureError(
        "CANVA_LOCKED_FIELD_MAPPED",
        `Google Form field "${googleField}" maps to locked/reserved Canva field "${canvaField}". Brand bar, logos, and QR image slots must not be populated from arbitrary form values.`,
      );
    }
  }
}
