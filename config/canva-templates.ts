/**
 * Creative Engine — approved Brand Template registry.
 *
 * Discovery (/api/test/canva/templates) is inventory.
 * This registry is the ONLY subset the engine may use for generation.
 *
 * Do not invent template IDs. Add entries only after live dataset inspection
 * and operator approval (Phase 2+).
 */

export const ASSET_TYPES = [
  "flyer_full",
  "handout_half",
  "social_portrait",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const CONTENT_DENSITIES = ["minimal", "standard", "dense"] as const;
export type ContentDensity = (typeof CONTENT_DENSITIES)[number];

export const BACKGROUND_TREATMENTS = ["light", "dark", "photo"] as const;
export type BackgroundTreatment = (typeof BACKGROUND_TREATMENTS)[number];

export const CONTACT_TREATMENTS = ["none", "compact", "full"] as const;
export type ContactTreatment = (typeof CONTACT_TREATMENTS)[number];

export const PARTNER_TREATMENTS = [
  "sjjcc",
  "sjjcc_uja",
  "sjjcc_uja_partner",
] as const;
export type PartnerTreatment = (typeof PARTNER_TREATMENTS)[number];

export type CreativeDatasetFieldType = "text" | "image";

/** Desired creative roles (not every template supports every role). */
export const CREATIVE_FIELD_ROLES = [
  "HEADLINE",
  "DESCRIPTION",
  "DATE",
  "TIME",
  "LOCATION",
  "AUDIENCE",
  "REGISTRATION_DEADLINE",
  "PRICE",
  "MEMBER_PRICE",
  "NON_MEMBER_PRICE",
  "PRICING_NOTES",
  "CTA",
  "CONTACT_NAME",
  "CONTACT_EMAIL",
  "CONTACT_PHONE",
  "ADDITIONAL_DETAILS",
  "QR_CODE",
  "HERO_IMAGE",
  "PARTNER_LOGO",
] as const;

export type CreativeFieldRole = (typeof CREATIVE_FIELD_ROLES)[number];

export type CreativeTemplate = {
  id: string;
  title: string;
  assetType: AssetType;
  width: number;
  height: number;
  unit: "px" | "in";
  density: ContentDensity;
  backgroundTreatment: BackgroundTreatment;
  contactTreatment: ContactTreatment;
  partnerTreatment: PartnerTreatment;
  supportsImage: boolean;
  supportsQr: boolean;
  /** Exact Canva dataset field name → type (from live inspection — never guessed). */
  dataset: Record<string, CreativeDatasetFieldType>;
  /** Lower number = higher priority when multiple templates match. */
  priority: number;
  approved: boolean;
};

export const ASSET_TYPE_META: Record<
  AssetType,
  {
    label: string;
    dimensionsLabel: string;
    width: number;
    height: number;
    unit: "px" | "in";
    channels: string[];
  }
> = {
  flyer_full: {
    label: "Full-Page Flyer",
    dimensionsLabel: "8.5 × 11 in",
    width: 8.5,
    height: 11,
    unit: "in",
    channels: ["Print", "Email attachment", "Website download"],
  },
  handout_half: {
    label: "Half-Page Handout",
    dimensionsLabel: "5.5 × 8.5 in",
    width: 5.5,
    height: 8.5,
    unit: "in",
    channels: ["Print", "Front desk", "Event distribution"],
  },
  social_portrait: {
    label: "Social Post",
    dimensionsLabel: "1080 × 1350 px",
    width: 1080,
    height: 1350,
    unit: "px",
    channels: ["Instagram", "Facebook", "General social"],
  },
};

/**
 * Approved Creative Engine templates.
 * Empty until Phase 2 registers verified Autofill Brand Templates.
 *
 * Structural candidates (approved=false) live in:
 *   config/canva-template-candidates.ts
 * Live generation writes IDs into the API response (and optionally
 * config/canva-template-candidates.generated.json in local/dev).
 */
export const APPROVED_CREATIVE_TEMPLATES: CreativeTemplate[] = [];

export function listApprovedCreativeTemplates(): CreativeTemplate[] {
  return APPROVED_CREATIVE_TEMPLATES.filter((t) => t.approved);
}

export function getCreativeTemplateById(
  id: string,
): CreativeTemplate | undefined {
  return APPROVED_CREATIVE_TEMPLATES.find((t) => t.id === id);
}
