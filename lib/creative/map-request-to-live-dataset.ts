import "server-only";
import type {
  CanvaAutofillData,
  CanvaBrandTemplateDataset,
} from "@/lib/canva/types";
import type {
  CreativeClassification,
  CreativeRequest,
} from "@/lib/creative/types";
import { MappingError } from "@/lib/creative/mapping";

/**
 * Map a CreativeRequest onto a *live* Canva Brand Template dataset.
 * Matches by role aliases against real field names — does not invent keys.
 * Never populates logo / brand-bar fields.
 */

const LOCKED_FIELD_HINTS = [
  "sjjcc",
  "uja",
  "logo",
  "brand_bar",
  "brandbar",
  "lockup",
];

const ROLE_ALIASES: Record<string, string[]> = {
  HEADLINE: ["headline", "title", "promotion name", "program name", "name"],
  DESCRIPTION: ["description", "body", "details", "copy", "summary"],
  DATE: ["date", "event date", "when"],
  TIME: ["time", "event time", "start time"],
  LOCATION: ["location", "venue", "place", "where"],
  AUDIENCE: ["audience", "age", "who"],
  CTA: ["cta", "button", "call to action", "register"],
  PRICE: ["price", "cost", "fee"],
  MEMBER_PRICE: ["member price", "member_price", "members"],
  NON_MEMBER_PRICE: ["non-member", "nonmember", "non_member", "guest price"],
  CONTACT_NAME: ["contact name", "contact_name", "coordinator"],
  CONTACT_EMAIL: ["contact email", "email", "contact_email"],
  CONTACT_PHONE: ["contact phone", "phone", "contact_phone"],
  ADDITIONAL_DETAILS: ["additional", "notes", "more info"],
};

export function mapRequestToLiveCanvaDataset(input: {
  request: CreativeRequest;
  classification: CreativeClassification;
  dataset: CanvaBrandTemplateDataset;
  requestId?: string;
}): { data: CanvaAutofillData; mappedRoles: string[]; qrFieldName: string | null } {
  const { request, classification, dataset, requestId } = input;

  const roleValues: Record<string, string | undefined> = {
    HEADLINE: classification.effectiveHeadline,
    DESCRIPTION: request.description,
    DATE: request.date,
    TIME: formatTime(request),
    LOCATION: request.location,
    AUDIENCE: request.audience,
    CTA: request.ctaLabel,
    PRICE: request.showPricing ? request.price : undefined,
    MEMBER_PRICE: request.showPricing ? request.memberPrice : undefined,
    NON_MEMBER_PRICE: request.showPricing ? request.nonMemberPrice : undefined,
    CONTACT_NAME: request.showContactInfo ? request.contactName : undefined,
    CONTACT_EMAIL: request.showContactInfo ? request.contactEmail : undefined,
    CONTACT_PHONE: request.showContactInfo ? request.contactPhone : undefined,
    ADDITIONAL_DETAILS: request.additionalDetails,
  };

  const data: CanvaAutofillData = {};
  const mappedRoles: string[] = [];
  const usedFields = new Set<string>();

  for (const [role, value] of Object.entries(roleValues)) {
    const text = value?.trim();
    if (!text) continue;
    const field = findTextField(dataset, ROLE_ALIASES[role] ?? [role], usedFields);
    if (!field) continue;
    data[field] = { type: "text", text };
    mappedRoles.push(role);
    usedFields.add(field);
    if (requestId) {
      console.info(`[${requestId}] LIVE_MAP ${role} → ${field}`);
    }
  }

  const qrFieldName = findImageField(dataset, [
    "qr_code",
    "qr",
    "qrcode",
    "qr code",
  ]);

  if (Object.keys(data).length === 0) {
    throw new MappingError(
      "NO_MAPPED_VALUES",
      `No live Canva dataset fields matched creative content. Available: ${Object.keys(dataset).join(", ") || "(none)"}`,
    );
  }

  return { data, mappedRoles, qrFieldName };
}

function findTextField(
  dataset: CanvaBrandTemplateDataset,
  aliases: string[],
  used: Set<string>,
): string | null {
  const entries = Object.entries(dataset);
  for (const alias of aliases) {
    const aliasNorm = normalize(alias);
    for (const [name, field] of entries) {
      if (used.has(name)) continue;
      if (field.type !== "text") continue;
      if (isLockedField(name)) continue;
      const nameNorm = normalize(name);
      if (nameNorm === aliasNorm || nameNorm.includes(aliasNorm)) {
        return name;
      }
    }
  }
  return null;
}

function findImageField(
  dataset: CanvaBrandTemplateDataset,
  aliases: string[],
): string | null {
  for (const alias of aliases) {
    const aliasNorm = normalize(alias);
    for (const [name, field] of Object.entries(dataset)) {
      if (field.type !== "image") continue;
      if (isLockedField(name)) continue;
      const nameNorm = normalize(name);
      if (nameNorm === aliasNorm || nameNorm.includes(aliasNorm)) {
        return name;
      }
    }
  }
  return null;
}

function isLockedField(name: string): boolean {
  const n = normalize(name);
  return LOCKED_FIELD_HINTS.some((hint) => n.includes(hint.replace(/_/g, "")));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function formatTime(request: CreativeRequest): string | undefined {
  const parts = [request.startTime, request.endTime].filter((v) => v?.trim());
  if (parts.length === 0) return undefined;
  return parts.join(" – ");
}
