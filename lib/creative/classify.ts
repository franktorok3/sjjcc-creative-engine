import {
  DENSITY_THRESHOLDS,
  DENSITY_WEIGHTS,
} from "@/config/creative-classification";
import type {
  BackgroundTreatment,
  ContactTreatment,
  ContentDensity,
  PartnerTreatment,
} from "@/config/canva-templates";
import type {
  CreativeClassification,
  CreativeRequest,
} from "@/lib/creative/types";

function nonempty(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Deterministic content-density classification (no LLM).
 *
 * Thresholds live in config/creative-classification.ts — easy to tune.
 * Does NOT truncate user copy. Callers must select a matching template
 * or return NO_APPROVED_TEMPLATE.
 */
export function classifyContentDensity(
  request: CreativeRequest,
): ContentDensity {
  const description = request.description?.trim() ?? "";
  const headline = (request.headline || request.programName || "").trim();
  const descChars = description.length;
  const descWords = wordCount(description);

  let score = 0;

  if (descChars >= DENSITY_THRESHOLDS.descriptionCharsDense) {
    score += DENSITY_WEIGHTS.descriptionDense;
  } else if (descChars >= DENSITY_THRESHOLDS.descriptionCharsStandard) {
    score += DENSITY_WEIGHTS.descriptionStandard;
  }

  if (descWords >= DENSITY_THRESHOLDS.descriptionWordsDense) {
    score += DENSITY_WEIGHTS.descriptionWordsDense;
  }

  if (headline.length >= DENSITY_THRESHOLDS.headlineCharsLong) {
    score += DENSITY_WEIGHTS.longHeadline;
  }

  const detailKeys: Array<keyof CreativeRequest> = [
    "date",
    "startTime",
    "endTime",
    "location",
  ];
  for (const key of detailKeys) {
    if (nonempty(request[key] as string | undefined)) {
      score += DENSITY_WEIGHTS.detailField;
    }
  }

  if (nonempty(request.audience)) {
    score += DENSITY_WEIGHTS.audience;
  }
  if (nonempty(request.registrationDeadline)) {
    score += DENSITY_WEIGHTS.registrationDeadline;
  }
  if (nonempty(request.additionalDetails)) {
    score += DENSITY_WEIGHTS.additionalDetails;
  }

  if (
    request.showPricing &&
    (nonempty(request.price) ||
      nonempty(request.memberPrice) ||
      nonempty(request.nonMemberPrice) ||
      nonempty(request.pricingNotes))
  ) {
    score += DENSITY_WEIGHTS.pricing;
  }

  if (
    request.showContactInfo &&
    (nonempty(request.contactName) ||
      nonempty(request.contactEmail) ||
      nonempty(request.contactPhone))
  ) {
    score += DENSITY_WEIGHTS.contact;
  }

  if (score <= DENSITY_THRESHOLDS.scoreMinimalMax) {
    return "minimal";
  }
  if (score <= DENSITY_THRESHOLDS.scoreStandardMax) {
    return "standard";
  }
  return "dense";
}

/**
 * Contact treatment from structured request flags.
 * - none: showContactInfo=false or no usable methods
 * - compact: one or two contact signals
 * - full: name + multiple methods, or three+ signals
 */
export function classifyContactTreatment(
  request: CreativeRequest,
): ContactTreatment {
  if (!request.showContactInfo) {
    return "none";
  }

  const hasName = nonempty(request.contactName);
  const methods = [request.contactEmail, request.contactPhone].filter((v) =>
    nonempty(v),
  ).length;
  const totalSignals = (hasName ? 1 : 0) + methods;

  if (totalSignals === 0) {
    return "none";
  }
  if (hasName && methods >= 2) {
    return "full";
  }
  if (totalSignals >= 3) {
    return "full";
  }
  return "compact";
}

/**
 * Background preference for template selection.
 * Logo contrast is template-owned — we only pick compatible approved layouts.
 */
export function classifyBackgroundTreatment(
  request: CreativeRequest,
): BackgroundTreatment {
  switch (request.imageTreatment) {
    case "none":
      return "light";
    case "supplied":
    case "template":
      return "photo";
    case "auto":
    default:
      // MVP: auto resolves to template imagery or light/graphic — prefer light
      return "light";
  }
}

export function classifyPartnerTreatment(
  request: CreativeRequest,
): PartnerTreatment {
  if (request.includePartner && nonempty(request.partnerName)) {
    return "sjjcc_uja_partner";
  }
  return "sjjcc_uja";
}

export function classifyCreativeRequest(
  request: CreativeRequest,
): CreativeClassification {
  const density = classifyContentDensity(request);
  const contactTreatment = classifyContactTreatment(request);
  const backgroundTreatment = classifyBackgroundTreatment(request);
  const partnerTreatment = classifyPartnerTreatment(request);

  const requiresImage =
    request.imageTreatment === "supplied" ||
    request.imageTreatment === "template";

  const requiresQr = Boolean(
    request.includeQr &&
      request.requiresRegistration &&
      nonempty(request.registrationUrl),
  );

  const effectiveHeadline = (
    request.headline?.trim() ||
    request.programName.trim() ||
    ""
  ).trim();

  return {
    density,
    contactTreatment,
    backgroundTreatment,
    partnerTreatment,
    requiresImage,
    requiresQr,
    effectiveHeadline,
  };
}
