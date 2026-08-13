import { z } from "zod";
import {
  ASSET_TYPES,
  ASSET_TYPE_META,
  type AssetType,
} from "@/config/canva-templates";
import {
  ASSET_TYPE_LABELS,
  CTA_LABEL_OPTIONS,
  type CreativeRequest,
  type ImageTreatment,
} from "@/lib/creative/types";
import { CreativeValidationError } from "@/lib/creative/errors";
import {
  DESTINATION_URL_FORM_FIELD,
  PROMOTION_NAME_FORM_FIELD,
} from "@/lib/creative/form-field-keys";

export type { AssetType };
export { ASSET_TYPE_LABELS, ASSET_TYPE_META };

/** Intake sources that converge on the same Creative Engine workflow. */
export type CreativeIntakeSource =
  | "google_form"
  | "creative_engine_portal";

const assetTypeEnum = z.enum(ASSET_TYPES);
const imageTreatmentEnum = z.enum(["auto", "template", "supplied", "none"]);
const ctaEnum = z.enum(CTA_LABEL_OPTIONS);

export const portalCreativeRequestSchema = z
  .object({
    source: z.literal("creative_engine_portal"),
    assetType: assetTypeEnum,
    intendedChannel: z.string().trim().optional(),

    department: z.string().trim().optional(),
    programName: z.string().trim().min(1, "Program / Event Name is required"),
    headline: z.string().trim().optional(),
    description: z.string().trim().min(1, "Description is required"),

    date: z.string().trim().optional(),
    startTime: z.string().trim().optional(),
    endTime: z.string().trim().optional(),
    location: z.string().trim().optional(),
    audience: z.string().trim().optional(),
    additionalDetails: z.string().trim().optional(),
    registrationDeadline: z.string().trim().optional(),

    requiresRegistration: z.boolean(),
    registrationUrl: z.string().trim().optional(),
    ctaLabel: z.string().trim().optional(),
    includeQr: z.boolean(),

    showPricing: z.boolean(),
    price: z.string().trim().optional(),
    memberPrice: z.string().trim().optional(),
    nonMemberPrice: z.string().trim().optional(),
    pricingNotes: z.string().trim().optional(),

    imageTreatment: imageTreatmentEnum,
    imageAssetReference: z.string().trim().optional(),

    showContactInfo: z.boolean(),
    contactName: z.string().trim().optional(),
    contactEmail: z.string().trim().optional(),
    contactPhone: z.string().trim().optional(),

    includePartner: z.boolean(),
    partnerName: z.string().trim().optional(),
    partnerLogoAssetReference: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.requiresRegistration) {
      const url = data.registrationUrl?.trim() ?? "";
      if (!url) {
        ctx.addIssue({
          code: "custom",
          path: ["registrationUrl"],
          message: "Registration URL is required when registration is enabled",
        });
      } else {
        try {
          void new URL(url);
        } catch {
          ctx.addIssue({
            code: "custom",
            path: ["registrationUrl"],
            message: "Registration URL must be a valid URL",
          });
        }
      }
    }

    if (data.includeQr) {
      const url = data.registrationUrl?.trim() ?? "";
      if (!data.requiresRegistration || !url) {
        ctx.addIssue({
          code: "custom",
          path: ["includeQr"],
          message: "QR code requires a valid registration URL",
        });
      }
    }

    if (data.showContactInfo) {
      const hasUseful =
        Boolean(data.contactName?.trim()) ||
        Boolean(data.contactEmail?.trim()) ||
        Boolean(data.contactPhone?.trim());
      if (!hasUseful) {
        ctx.addIssue({
          code: "custom",
          path: ["showContactInfo"],
          message: "Provide at least one contact method when contact is shown",
        });
      }
    }

    if (data.includePartner && !data.partnerName?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["partnerName"],
        message: "Partner name is required when a partner is included",
      });
    }

    if (
      data.imageTreatment === "supplied" &&
      !data.imageAssetReference?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["imageAssetReference"],
        message: "Image reference is required when using a supplied image",
      });
    }

    if (data.ctaLabel && !CTA_LABEL_OPTIONS.includes(data.ctaLabel as (typeof CTA_LABEL_OPTIONS)[number])) {
      // Allow custom only if empty — otherwise warn via optional pass-through of allowed list
      if (!ctaEnum.safeParse(data.ctaLabel).success) {
        ctx.addIssue({
          code: "custom",
          path: ["ctaLabel"],
          message: `CTA must be one of: ${CTA_LABEL_OPTIONS.join(", ")}`,
        });
      }
    }
  });

export type PortalCreativeRequestInput = z.infer<
  typeof portalCreativeRequestSchema
>;

/**
 * Canonical workflow payload kept for Google Form field-key compatibility.
 * Prefer CreativeRequest for new logic; adapters produce both.
 */
export type CreativeWorkflowPayload = {
  source: CreativeIntakeSource;
  submittedAt: string;
  fields: Record<string, unknown>;
  /** Normalized request when available (portal + google adapters). */
  request?: CreativeRequest;
};

export function portalToCreativeRequest(
  input: PortalCreativeRequestInput,
  submittedAt: string = new Date().toISOString(),
): CreativeRequest {
  const registrationUrl = input.registrationUrl?.trim() || undefined;
  const includeQr = Boolean(
    input.includeQr && input.requiresRegistration && registrationUrl,
  );

  return {
    source: "creative_engine_portal",
    submittedAt,
    assetType: input.assetType,
    intendedChannel: input.intendedChannel?.trim() || undefined,
    department: input.department?.trim() || undefined,
    programName: input.programName.trim(),
    headline: input.headline?.trim() || undefined,
    description: input.description.trim(),
    date: input.date?.trim() || undefined,
    startTime: input.startTime?.trim() || undefined,
    endTime: input.endTime?.trim() || undefined,
    location: input.location?.trim() || undefined,
    audience: input.audience?.trim() || undefined,
    additionalDetails: input.additionalDetails?.trim() || undefined,
    registrationDeadline: input.registrationDeadline?.trim() || undefined,
    requiresRegistration: input.requiresRegistration,
    registrationUrl,
    ctaLabel: input.ctaLabel?.trim() || (input.requiresRegistration ? "Register" : undefined),
    includeQr,
    showPricing: input.showPricing,
    price: input.price?.trim() || undefined,
    memberPrice: input.memberPrice?.trim() || undefined,
    nonMemberPrice: input.nonMemberPrice?.trim() || undefined,
    pricingNotes: input.pricingNotes?.trim() || undefined,
    imageTreatment: input.imageTreatment,
    imageAssetReference: input.imageAssetReference?.trim() || undefined,
    showContactInfo: input.showContactInfo,
    contactName: input.contactName?.trim() || undefined,
    contactEmail: input.contactEmail?.trim() || undefined,
    contactPhone: input.contactPhone?.trim() || undefined,
    includePartner: input.includePartner,
    partnerName: input.partnerName?.trim() || undefined,
    partnerLogoAssetReference:
      input.partnerLogoAssetReference?.trim() || undefined,
  };
}

/**
 * Normalize portal JSON into CreativeRequest + legacy workflow field map.
 */
export function portalRequestToWorkflowPayload(
  input: PortalCreativeRequestInput,
  submittedAt: string = new Date().toISOString(),
): CreativeWorkflowPayload {
  const request = portalToCreativeRequest(input, submittedAt);
  return {
    source: "creative_engine_portal",
    submittedAt,
    fields: creativeRequestToFormFields(request),
    request,
  };
}

/**
 * Google Form → CreativeRequest with sensible defaults for missing portal fields.
 * Does not require the live Google Form to change.
 */
export function googleFormToCreativeRequest(input: {
  submittedAt: string;
  fields: Record<string, unknown>;
}): CreativeRequest {
  const flat = flattenFields(input.fields);

  const programName =
    flat["Program / Event Name"] ||
    flat[PROMOTION_NAME_FORM_FIELD] ||
    flat["What is the name of the promotion?"] ||
    "";

  if (!programName.trim()) {
    throw new CreativeValidationError(
      "Google Form submission is missing a promotion / program name.",
      { field: PROMOTION_NAME_FORM_FIELD },
    );
  }

  const registrationUrl =
    flat[DESTINATION_URL_FORM_FIELD] || flat["Registration URL"] || undefined;
  const hasRegistration = Boolean(registrationUrl?.trim());

  const assetType = inferAssetTypeFromGoogleForm(flat["Asset Type"]);

  const startTime = flat["Event time"] || flat["Start Time"] || undefined;
  const endTime = flat["End Time"] || undefined;

  return {
    source: "google_form",
    submittedAt: input.submittedAt,
    assetType,
    intendedChannel: undefined,
    department: flat.Department || flat["Department / Center"] || undefined,
    programName: programName.trim(),
    headline: flat.Headline || undefined,
    description:
      flat["Promotion description"] ||
      flat.Description ||
      "(No description provided)",
    date: flat["Event date"] || flat.Date || undefined,
    startTime: startTime || undefined,
    endTime: endTime || undefined,
    location: flat.Location || undefined,
    audience: flat.Audience || flat["Audience / Age Range"] || undefined,
    additionalDetails: flat["Additional Details"] || undefined,
    registrationDeadline: flat["Registration Deadline"] || undefined,
    requiresRegistration: hasRegistration,
    registrationUrl: registrationUrl?.trim() || undefined,
    ctaLabel: hasRegistration ? "Register" : undefined,
    includeQr: hasRegistration,
    showPricing: false,
    imageTreatment: "auto" as ImageTreatment,
    showContactInfo: false,
    includePartner: false,
  };
}

export function googleFormToWorkflowPayload(input: {
  submittedAt: string;
  fields: Record<string, unknown>;
}): CreativeWorkflowPayload {
  const request = googleFormToCreativeRequest(input);
  return {
    source: "google_form",
    submittedAt: input.submittedAt,
    // Preserve original Google Form field keys for legacy mapping
    fields: input.fields,
    request,
  };
}

/** Map CreativeRequest onto Google Form question titles for shared mapping/QR. */
export function creativeRequestToFormFields(
  request: CreativeRequest,
): Record<string, string> {
  const timeParts = [request.startTime, request.endTime].filter(Boolean);
  const time =
    timeParts.length > 0 ? timeParts.join(" – ") : request.startTime || "";

  const headlineOrProgram = request.headline?.trim() || request.programName;

  const fields: Record<string, string> = {
    "Program / Event Name": request.programName,
    [PROMOTION_NAME_FORM_FIELD]: headlineOrProgram,
    "Promotion description": request.description,
    "Event date": request.date ?? "",
    "Event time": time,
    Location: request.location ?? "",
    "Registration URL": request.registrationUrl ?? "",
    "Asset Type": ASSET_TYPE_LABELS[request.assetType],
  };

  if (request.department) fields.Department = request.department;
  if (request.audience) fields.Audience = request.audience;
  if (request.additionalDetails) {
    fields["Additional Details"] = request.additionalDetails;
  }
  if (request.registrationDeadline) {
    fields["Registration Deadline"] = request.registrationDeadline;
  }
  if (request.ctaLabel) fields["CTA Label"] = request.ctaLabel;
  if (request.showPricing) {
    if (request.price) fields.Price = request.price;
    if (request.memberPrice) fields["Member Price"] = request.memberPrice;
    if (request.nonMemberPrice) {
      fields["Non-Member Price"] = request.nonMemberPrice;
    }
    if (request.pricingNotes) fields["Pricing Notes"] = request.pricingNotes;
  }
  if (request.showContactInfo) {
    if (request.contactName) fields["Contact Name"] = request.contactName;
    if (request.contactEmail) fields["Contact Email"] = request.contactEmail;
    if (request.contactPhone) fields["Contact Phone"] = request.contactPhone;
  }
  if (request.includePartner && request.partnerName) {
    fields["Partner Name"] = request.partnerName;
  }

  return fields;
}

function flattenFields(
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

function inferAssetTypeFromGoogleForm(raw: string | undefined): AssetType {
  const value = (raw ?? "").toLowerCase();
  if (value.includes("half") || value.includes("handout")) {
    return "handout_half";
  }
  if (value.includes("social") || value.includes("instagram")) {
    return "social_portrait";
  }
  if (value.includes("flyer") || value.includes("full")) {
    return "flyer_full";
  }
  // Default Google Form path → full-page flyer family
  return "flyer_full";
}

/** @deprecated Use ASSET_TYPE_META / ASSET_TYPES from canva-templates */
export const ASSET_TYPE_OPTIONS = ASSET_TYPES.map((value) => ({
  value,
  label: ASSET_TYPE_LABELS[value],
}));

export type AssetTypeValue = AssetType;

export function assetTypeLabel(value: AssetType): string {
  return ASSET_TYPE_LABELS[value] ?? value;
}
