import "server-only";
import { FORM_TO_CANVA_FIELD_MAP } from "@/config/form-to-canva";
import {
  DESTINATION_URL_FORM_FIELD,
  VARIABLE_DATASET_FIELD_ROLES,
} from "@/config/canva-brand";
import {
  assertMappingRespectsLockedBrandFields,
  BrandStructureError,
  configuredQrFieldName,
} from "@/lib/canva/brand-validation";
import { generateQrPngBuffer } from "@/lib/canva/qr";
import { uploadCanvaImageAsset } from "@/lib/canva/assets";
import type {
  CanvaAutofillData,
  CanvaBrandTemplateDataset,
} from "@/lib/canva/types";
import {
  assertRequiredFormFields,
  flattenNamedValues,
  getPromotionName,
  mapFormFieldsToCanvaData,
  MappingError,
  type FieldMappingLog,
} from "@/lib/creative/mapping";

export {
  assertRequiredFormFields,
  flattenNamedValues,
  getPromotionName,
  mapFormFieldsToCanvaData,
  MappingError,
};
export type { FieldMappingLog };

/**
 * Guard Form→Canva map against locked brand fields, then map text values.
 * Never guesses unknown dataset keys.
 */
export function mapFormFieldsToCanvaDataSafe(
  fields: Record<string, string>,
  dataset: CanvaBrandTemplateDataset,
  requestId?: string,
): { data: CanvaAutofillData; mappings: FieldMappingLog[] } {
  assertMappingRespectsLockedBrandFields(FORM_TO_CANVA_FIELD_MAP);
  return mapFormFieldsToCanvaData(fields, dataset, requestId);
}

export function getDestinationUrl(fields: Record<string, string>): string {
  return fields[DESTINATION_URL_FORM_FIELD]?.trim() ?? "";
}

/**
 * When a destination URL is present, generate a QR PNG, upload to Canva,
 * and bind the resulting asset_id to the configured QR image dataset field.
 *
 * Placement (bottom-right above brand bar) is owned by the Brand Template;
 * this only supplies the scannable image content.
 */
export async function attachQrAutofillFromDestinationUrl(input: {
  fields: Record<string, string>;
  dataset: CanvaBrandTemplateDataset;
  data: CanvaAutofillData;
  requestId?: string;
}): Promise<{ data: CanvaAutofillData; qrAssetId?: string; skipped: boolean }> {
  const destinationUrl = getDestinationUrl(input.fields);
  const qrField = configuredQrFieldName();

  if (!destinationUrl) {
    return { data: input.data, skipped: true };
  }

  if (!qrField) {
    throw new BrandStructureError(
      "CANVA_QR_FIELD_UNCONFIGURED",
      "Destination URL is present but VARIABLE_DATASET_FIELD_ROLES.qrCode.canvaField is empty. Set it from the live AI Marketing 2.0 template dataset.",
    );
  }

  const datasetField = input.dataset[qrField];
  if (!datasetField) {
    throw new BrandStructureError(
      "CANVA_QR_FIELD_MISSING",
      `Destination URL requires QR image field "${qrField}" in the Brand Template dataset (bottom-right above brand bar). Available: ${Object.keys(input.dataset).join(", ") || "(none)"}.`,
    );
  }
  if (datasetField.type !== "image") {
    throw new BrandStructureError(
      "CANVA_QR_FIELD_TYPE_INVALID",
      `QR field "${qrField}" must be type "image", found "${datasetField.type}".`,
    );
  }

  // Never allow form text mapping to overwrite the QR image slot.
  if (input.data[qrField]?.type === "text") {
    throw new BrandStructureError(
      "CANVA_QR_FIELD_OVERWRITE_BLOCKED",
      `QR field "${qrField}" was populated as text from form mapping. Remove it from FORM_TO_CANVA_FIELD_MAP — QR is generated from the destination URL.`,
    );
  }

  const png = await generateQrPngBuffer(destinationUrl);
  const uploaded = await uploadCanvaImageAsset({
    bytes: png,
    name: "SJJCC Creative QR",
  });

  if (input.requestId) {
    console.info(
      `[${input.requestId}] QR uploaded assetId=${uploaded.assetId} field=${qrField}`,
    );
  }

  return {
    data: {
      ...input.data,
      [qrField]: { type: "image", asset_id: uploaded.assetId },
    },
    qrAssetId: uploaded.assetId,
    skipped: false,
  };
}

/** Expose configured destination role for tests/docs. */
export function destinationUrlRoleField(): string {
  return VARIABLE_DATASET_FIELD_ROLES.destinationUrl.canvaField;
}
