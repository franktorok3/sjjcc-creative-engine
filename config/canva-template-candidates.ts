/**
 * Candidate Creative Engine templates from shell generation.
 * These stay approved=false until live dataset verification (Phase 2 ops).
 *
 * After POST /api/admin/canva/generate-shells, prefer IDs from
 * config/canva-template-candidates.generated.json when present.
 */
import type { CreativeTemplate } from "@/config/canva-templates";

/** Structural candidates (IDs filled after generation / operator paste). */
export const CREATIVE_TEMPLATE_CANDIDATES: CreativeTemplate[] = [
  {
    id: "PENDING_CE_FLYER_STANDARD_LIGHT",
    title: "CE - Flyer - Standard - Light",
    assetType: "flyer_full",
    width: 8.5,
    height: 11,
    unit: "in",
    density: "standard",
    backgroundTreatment: "light",
    contactTreatment: "compact",
    partnerTreatment: "sjjcc_uja",
    supportsImage: true,
    supportsQr: true,
    dataset: {
      HEADLINE: "text",
      DESCRIPTION: "text",
      DATE: "text",
      TIME: "text",
      LOCATION: "text",
      AUDIENCE: "text",
      CTA: "text",
      QR_CODE: "image",
      HERO_IMAGE: "image",
    },
    priority: 10,
    approved: false,
  },
  {
    id: "PENDING_CE_HALF_PAGE_STANDARD_LIGHT",
    title: "CE - Half Page - Standard - Light",
    assetType: "handout_half",
    width: 5.5,
    height: 8.5,
    unit: "in",
    density: "standard",
    backgroundTreatment: "light",
    contactTreatment: "compact",
    partnerTreatment: "sjjcc_uja",
    supportsImage: true,
    supportsQr: true,
    dataset: {
      HEADLINE: "text",
      DESCRIPTION: "text",
      DATE: "text",
      TIME: "text",
      LOCATION: "text",
      CTA: "text",
      QR_CODE: "image",
      HERO_IMAGE: "image",
    },
    priority: 10,
    approved: false,
  },
  {
    id: "PENDING_CE_SOCIAL_PORTRAIT_STANDARD_LIGHT",
    title: "CE - Social Portrait - Standard - Light",
    assetType: "social_portrait",
    width: 1080,
    height: 1350,
    unit: "px",
    density: "standard",
    backgroundTreatment: "light",
    contactTreatment: "none",
    partnerTreatment: "sjjcc_uja",
    supportsImage: true,
    supportsQr: true,
    dataset: {
      HEADLINE: "text",
      DESCRIPTION: "text",
      DATE: "text",
      TIME: "text",
      LOCATION: "text",
      CTA: "text",
      QR_CODE: "image",
      HERO_IMAGE: "image",
    },
    priority: 10,
    approved: false,
  },
];
