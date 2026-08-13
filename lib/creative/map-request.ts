import "server-only";
import type { CreativeTemplate } from "@/config/canva-templates";
import {
  LOCKED_BRAND_DATASET_FIELDS,
} from "@/config/canva-brand";
import type {
  CanvaAutofillData,
  CanvaBrandTemplateDataset,
} from "@/lib/canva/types";
import { BrandStructureError } from "@/lib/canva/brand-validation";
import type { CreativeClassification, CreativeRequest } from "@/lib/creative/types";
import { MappingError } from "@/lib/creative/mapping";

/** Field names that must never be populated from user form data. */
const FORBIDDEN_USER_FIELDS = new Set(
  [
    ...Object.values(LOCKED_BRAND_DATASET_FIELDS),
    "SJJCC_LOGO",
    "UJA_LOGO",
    "BRAND_BAR",
    "BRAND_LOCKUP",
    "LOGO",
    "SJJCC",
    "UJA",
  ]
    .map((v) => v.trim())
    .filter(Boolean),
);

/**
 * Map a CreativeRequest onto Canva autofill data using ONLY fields declared
 * on the selected approved template. Never guesses keys. Never populates
 * SJJCC/UJA logo or brand-bar fields from user payload. Never writes QR_CODE
 * here — QR preprocessing owns that image slot.
 */
export function mapCreativeRequestToCanvaData(input: {
  request: CreativeRequest;
  classification: CreativeClassification;
  template: CreativeTemplate;
  liveDataset: CanvaBrandTemplateDataset;
  requestId?: string;
}): { data: CanvaAutofillData; mappedRoles: string[] } {
  const { request, classification, template, liveDataset, requestId } = input;

  for (const field of Object.keys(template.dataset)) {
    if (FORBIDDEN_USER_FIELDS.has(field)) {
      throw new BrandStructureError(
        "LOCKED_FIELD_IN_TEMPLATE_DATASET",
        `Approved template "${template.title}" declares locked brand field "${field}" in its Autofill dataset. Logos and brand bar must remain template-owned — remove them from the registry dataset.`,
      );
    }
  }

  const roleValues: Record<string, string | undefined> = {
    HEADLINE: classification.effectiveHeadline,
    DESCRIPTION: request.description,
    DATE: request.date,
    TIME: formatTime(request),
    LOCATION: request.location,
    AUDIENCE: request.audience,
    REGISTRATION_DEADLINE: request.registrationDeadline,
    PRICE: request.showPricing ? request.price : undefined,
    MEMBER_PRICE: request.showPricing ? request.memberPrice : undefined,
    NON_MEMBER_PRICE: request.showPricing ? request.nonMemberPrice : undefined,
    PRICING_NOTES: request.showPricing ? request.pricingNotes : undefined,
    CTA: request.ctaLabel,
    CONTACT_NAME: request.showContactInfo ? request.contactName : undefined,
    CONTACT_EMAIL: request.showContactInfo ? request.contactEmail : undefined,
    CONTACT_PHONE: request.showContactInfo ? request.contactPhone : undefined,
    ADDITIONAL_DETAILS: request.additionalDetails,
    // URL text companion (QR image is separate preprocessing)
    URL: request.registrationUrl,
  };

  const data: CanvaAutofillData = {};
  const mappedRoles: string[] = [];

  for (const [field, expectedType] of Object.entries(template.dataset)) {
    if (field === "QR_CODE" || field === "HERO_IMAGE" || field === "PARTNER_LOGO") {
      // Image slots handled elsewhere (QR preprocessing / future uploads)
      continue;
    }

    if (FORBIDDEN_USER_FIELDS.has(field)) {
      throw new BrandStructureError(
        "LOCKED_BRAND_FIELD_BLOCKED",
        `Refusing to populate locked brand field "${field}" from user payload.`,
      );
    }

    const live = liveDataset[field];
    if (!live) {
      throw new MappingError(
        "CANVA_FIELD_NOT_FOUND",
        `Template registry declares field "${field}" but it is missing from the live Canva dataset.`,
      );
    }
    if (live.type !== expectedType) {
      throw new MappingError(
        "CANVA_FIELD_TYPE_UNSUPPORTED",
        `Field "${field}" expected type "${expectedType}" but live dataset has "${live.type}".`,
      );
    }
    if (expectedType !== "text") {
      continue;
    }

    const value = roleValues[field]?.trim() ?? "";
    if (!value) continue;

    data[field] = { type: "text", text: value };
    mappedRoles.push(field);

    if (requestId) {
      console.info(
        `[${requestId}] MAP role ${field} → ${value.slice(0, 120)}`,
      );
    }
  }

  if (Object.keys(data).length === 0) {
    throw new MappingError(
      "NO_MAPPED_VALUES",
      "No creative roles produced Canva autofill values for the selected template.",
    );
  }

  return { data, mappedRoles };
}

function formatTime(request: CreativeRequest): string | undefined {
  const parts = [request.startTime, request.endTime].filter((v) => v?.trim());
  if (parts.length === 0) return undefined;
  return parts.join(" – ");
}

/** Ensure user payload keys cannot overwrite QR or logo fields. */
export function assertNoBrandOverwriteFromUser(
  data: CanvaAutofillData,
): void {
  for (const field of Object.keys(data)) {
    if (FORBIDDEN_USER_FIELDS.has(field)) {
      throw new BrandStructureError(
        "LOCKED_BRAND_FIELD_BLOCKED",
        `User/mapped data attempted to populate locked brand field "${field}".`,
      );
    }
  }
  if (data.QR_CODE?.type === "text") {
    throw new BrandStructureError(
      "CANVA_QR_FIELD_OVERWRITE_BLOCKED",
      "QR_CODE cannot be populated as text from user content.",
    );
  }
}
