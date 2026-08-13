import type {
  AssetType,
  BackgroundTreatment,
  ContactTreatment,
  ContentDensity,
  PartnerTreatment,
} from "@/config/canva-templates";

export type CreativeRequestSource =
  | "creative_engine_portal"
  | "google_form";

export type ImageTreatment = "auto" | "template" | "supplied" | "none";

export type IntendedChannel =
  | "print"
  | "email_attachment"
  | "website_download"
  | "front_desk"
  | "event_distribution"
  | "instagram"
  | "facebook"
  | "general_social"
  | string;

/**
 * Normalized Creative Engine request.
 * Portal and Google Form adapters both produce this shape.
 */
export interface CreativeRequest {
  source: CreativeRequestSource;
  submittedAt: string;

  assetType: AssetType;
  intendedChannel?: IntendedChannel;

  department?: string;

  programName: string;
  headline?: string;
  description: string;

  date?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  audience?: string;
  additionalDetails?: string;
  registrationDeadline?: string;

  requiresRegistration: boolean;
  registrationUrl?: string;
  ctaLabel?: string;
  includeQr: boolean;

  showPricing: boolean;
  price?: string;
  memberPrice?: string;
  nonMemberPrice?: string;
  pricingNotes?: string;

  imageTreatment: ImageTreatment;
  imageAssetReference?: string;

  showContactInfo: boolean;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;

  includePartner: boolean;
  partnerName?: string;
  partnerLogoAssetReference?: string;
}

export interface CreativeClassification {
  density: ContentDensity;
  contactTreatment: ContactTreatment;
  backgroundTreatment: BackgroundTreatment;
  partnerTreatment: PartnerTreatment;
  requiresImage: boolean;
  requiresQr: boolean;
  effectiveHeadline: string;
}

export type CreativeEngineErrorCode =
  | "NO_APPROVED_TEMPLATE"
  | "DATASET_MISMATCH"
  | "VALIDATION_ERROR"
  | "CANVA_REAUTH_REQUIRED";

export interface NoApprovedTemplateDetails {
  assetType: AssetType;
  density: ContentDensity;
  image: ImageTreatment | "required" | "none";
  contact: ContactTreatment;
  partner: PartnerTreatment;
  requiresQr: boolean;
}

export { ASSET_TYPE_META as ASSET_TYPE_DIMENSIONS } from "@/config/canva-templates";

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  flyer_full: "Full-Page Flyer",
  handout_half: "Half-Page Handout",
  social_portrait: "Social Post",
};

export const CTA_LABEL_OPTIONS = [
  "Register",
  "Learn More",
  "RSVP",
  "Buy Tickets",
  "Join Us",
  "Donate",
  "Contact Us",
] as const;

export const CHANNELS_BY_ASSET: Record<AssetType, string[]> = {
  flyer_full: ["Print", "Email attachment", "Website download"],
  handout_half: ["Print", "Front desk", "Event distribution"],
  social_portrait: ["Instagram", "Facebook", "General social"],
};
