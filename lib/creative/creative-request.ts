import { z } from "zod";
import { PROMOTION_NAME_FORM_FIELD } from "@/config/form-to-canva";
import {
  ASSET_TYPE_OPTIONS,
  assetTypeLabel,
  type AssetTypeValue,
} from "@/config/creative-portal";

export type { AssetTypeValue };
export { ASSET_TYPE_OPTIONS, assetTypeLabel };

/** Intake sources that converge on the same Creative Engine workflow. */
export type CreativeIntakeSource =
  | "google_form"
  | "creative_engine_portal";

export const portalCreativeRequestSchema = z.object({
  source: z.literal("creative_engine_portal"),
  programName: z.string().trim().min(1, "Program / Event Name is required"),
  headline: z.string().trim().min(1, "Headline is required"),
  description: z.string().trim().min(1, "Description is required"),
  date: z.string().trim().min(1, "Date is required"),
  time: z.string().trim().min(1, "Time is required"),
  location: z.string().trim().min(1, "Location is required"),
  registrationUrl: z
    .string()
    .trim()
    .min(1, "Registration URL is required")
    .url("Registration URL must be a valid URL"),
  assetType: z.enum([
    "flyer",
    "social_post",
    "digital_screen",
    "email_graphic",
  ]),
});

export type PortalCreativeRequestInput = z.infer<
  typeof portalCreativeRequestSchema
>;

/**
 * Canonical workflow payload: both Google Form and the portal normalize into
 * this shape. `fields` use Google Form question titles as keys so existing
 * FORM_TO_CANVA_FIELD_MAP / QR destination lookup keep working unchanged.
 */
export type CreativeWorkflowPayload = {
  source: CreativeIntakeSource;
  submittedAt: string;
  fields: Record<string, unknown>;
};

/**
 * Normalize portal JSON into the shared workflow field map.
 * Program name is stored separately for Basecamp subject preference;
 * Headline fills the existing Canva HEADLINE mapping field.
 */
export function portalRequestToWorkflowPayload(
  input: PortalCreativeRequestInput,
  submittedAt: string = new Date().toISOString(),
): CreativeWorkflowPayload {
  return {
    source: "creative_engine_portal",
    submittedAt,
    fields: {
      "Program / Event Name": input.programName,
      [PROMOTION_NAME_FORM_FIELD]: input.headline,
      "Promotion description": input.description,
      "Event date": input.date,
      "Event time": input.time,
      Location: input.location,
      "Registration URL": input.registrationUrl,
      "Asset Type": assetTypeLabel(input.assetType),
    },
  };
}

export function googleFormToWorkflowPayload(input: {
  submittedAt: string;
  fields: Record<string, unknown>;
}): CreativeWorkflowPayload {
  return {
    source: "google_form",
    submittedAt: input.submittedAt,
    fields: input.fields,
  };
}
