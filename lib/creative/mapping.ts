import "server-only";
import {
  FORM_TO_CANVA_FIELD_MAP,
  PROMOTION_NAME_FORM_FIELD,
  REQUIRED_FORM_FIELDS,
} from "@/config/form-to-canva";
import { assertMappingRespectsLockedBrandFields } from "@/lib/canva/brand-validation";
import type { CanvaAutofillData, CanvaBrandTemplateDataset } from "@/lib/canva/types";

export class MappingError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MappingError";
    this.code = code;
  }
}

/** Google Sheets onFormSubmit namedValues are string[] per question. */
export function flattenNamedValues(
  namedValues: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(namedValues)) {
    if (Array.isArray(value)) {
      out[key] = value.map(String).filter(Boolean).join(", ").trim();
    } else if (value == null) {
      out[key] = "";
    } else {
      out[key] = String(value).trim();
    }
  }
  return out;
}

export function getPromotionName(fields: Record<string, string>): string {
  const fromConfigured = fields[PROMOTION_NAME_FORM_FIELD]?.trim();
  if (fromConfigured) return fromConfigured;

  // Fallback: first mapped non-empty field, then first field.
  for (const formField of Object.keys(FORM_TO_CANVA_FIELD_MAP)) {
    if (fields[formField]?.trim()) return fields[formField].trim();
  }
  const first = Object.values(fields).find((v) => v.trim());
  return first?.trim() || "Untitled promotion";
}

export function assertRequiredFormFields(fields: Record<string, string>): void {
  const missing = REQUIRED_FORM_FIELDS.filter(
    (name) => !fields[name] || !fields[name].trim(),
  );
  if (missing.length > 0) {
    throw new MappingError(
      "REQUIRED_FORM_FIELDS_MISSING",
      `Missing required Google Form field(s): ${missing.join(", ")}. Update config/form-to-canva.ts REQUIRED_FORM_FIELDS or the Form questions.`,
    );
  }
}

export type FieldMappingLog = {
  googleField: string;
  canvaField: string;
  value: string;
};

/**
 * Map flattened Google Form fields → Canva autofill text data.
 * - Ignores unmapped Google fields
 * - Skips empty values (template defaults remain)
 * - Fails if a mapped Canva field is absent from the live dataset
 */
export function mapFormFieldsToCanvaData(
  fields: Record<string, string>,
  dataset: CanvaBrandTemplateDataset,
  requestId?: string,
): { data: CanvaAutofillData; mappings: FieldMappingLog[] } {
  // Never allow form values to populate locked brand chrome or QR image slots.
  assertMappingRespectsLockedBrandFields(FORM_TO_CANVA_FIELD_MAP);

  const datasetKeys = Object.keys(dataset);
  const data: CanvaAutofillData = {};
  const mappings: FieldMappingLog[] = [];

  for (const [googleField, canvaField] of Object.entries(
    FORM_TO_CANVA_FIELD_MAP,
  )) {
    const value = fields[googleField]?.trim() ?? "";
    if (!value) continue;

    const datasetField = dataset[canvaField];
    if (!datasetField) {
      throw new MappingError(
        "CANVA_FIELD_NOT_FOUND",
        `Mapping references Canva field "${canvaField}" (from Google field "${googleField}") but it does not exist in the brand template dataset. Available: ${datasetKeys.join(", ") || "(none)"}. Update config/form-to-canva.ts after inspecting GET /api/test/canva/template-dataset.`,
      );
    }

    if (datasetField.type !== "text") {
      // Skip non-text for this PoC rather than failing whole request,
      // unless it's explicitly mapped — then fail clearly.
      throw new MappingError(
        "CANVA_FIELD_TYPE_UNSUPPORTED",
        `Mapped Canva field "${canvaField}" is type "${datasetField.type}". This PoC only autofills text; remove it from FORM_TO_CANVA_FIELD_MAP or leave imagery as template defaults.`,
      );
    }

    data[canvaField] = { type: "text", text: value };
    mappings.push({ googleField, canvaField, value });

    if (requestId) {
      console.info(
        `[${requestId}] MAP ${googleField} → ${canvaField} → ${value.slice(0, 120)}`,
      );
    }
  }

  if (Object.keys(data).length === 0) {
    throw new MappingError(
      "NO_MAPPED_VALUES",
      "No Google Form fields produced Canva autofill values. Check FORM_TO_CANVA_FIELD_MAP keys match Form question titles exactly.",
    );
  }

  return { data, mappings };
}
