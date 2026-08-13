import { describe, expect, it } from "vitest";
import { PROMOTION_NAME_FORM_FIELD } from "@/config/form-to-canva";
import {
  googleFormToCreativeRequest,
  googleFormToWorkflowPayload,
  portalCreativeRequestSchema,
  portalRequestToWorkflowPayload,
  portalToCreativeRequest,
} from "@/lib/creative/creative-request";
import { getPromotionName } from "@/lib/creative/mapping";

const validPortal = {
  source: "creative_engine_portal" as const,
  assetType: "flyer_full" as const,
  programName: "Fall Open House",
  headline: "Join Us This Fall",
  description: "Tour campus and meet staff.",
  date: "September 12, 2026",
  startTime: "7:00 PM",
  location: "Main Lobby",
  requiresRegistration: true,
  registrationUrl: "https://example.com/register",
  includeQr: true,
  ctaLabel: "Register",
  showPricing: false,
  imageTreatment: "auto" as const,
  showContactInfo: false,
  includePartner: false,
};

describe("portal creative request", () => {
  it("accepts a valid portal payload", () => {
    expect(portalCreativeRequestSchema.safeParse(validPortal).success).toBe(
      true,
    );
  });

  it("rejects missing required fields", () => {
    expect(
      portalCreativeRequestSchema.safeParse({
        ...validPortal,
        programName: "",
      }).success,
    ).toBe(false);
    expect(
      portalCreativeRequestSchema.safeParse({
        ...validPortal,
        registrationUrl: "not-a-url",
      }).success,
    ).toBe(false);
  });

  it("requires registration URL when registration is enabled", () => {
    expect(
      portalCreativeRequestSchema.safeParse({
        ...validPortal,
        registrationUrl: "",
      }).success,
    ).toBe(false);
  });

  it("rejects QR without registration URL", () => {
    expect(
      portalCreativeRequestSchema.safeParse({
        ...validPortal,
        requiresRegistration: false,
        includeQr: true,
        registrationUrl: undefined,
      }).success,
    ).toBe(false);
  });

  it("requires at least one contact method when contact is shown", () => {
    expect(
      portalCreativeRequestSchema.safeParse({
        ...validPortal,
        showContactInfo: true,
      }).success,
    ).toBe(false);
    expect(
      portalCreativeRequestSchema.safeParse({
        ...validPortal,
        showContactInfo: true,
        contactEmail: "a@example.com",
      }).success,
    ).toBe(true);
  });

  it("normalizes portal input onto Google Form field keys for shared workflow", () => {
    const payload = portalRequestToWorkflowPayload(
      validPortal,
      "2026-08-13T12:00:00.000Z",
    );
    expect(payload.source).toBe("creative_engine_portal");
    expect(payload.request?.assetType).toBe("flyer_full");
    expect(payload.fields).toMatchObject({
      "Program / Event Name": "Fall Open House",
      [PROMOTION_NAME_FORM_FIELD]: "Join Us This Fall",
      "Promotion description": "Tour campus and meet staff.",
      "Event date": "September 12, 2026",
      "Event time": "7:00 PM",
      Location: "Main Lobby",
      "Registration URL": "https://example.com/register",
      "Asset Type": "Full-Page Flyer",
    });
  });

  it("uses program name as headline when headline is empty", () => {
    const request = portalToCreativeRequest({
      ...validPortal,
      headline: undefined,
    });
    const payload = portalRequestToWorkflowPayload({
      ...validPortal,
      headline: undefined,
    });
    expect(request.headline).toBeUndefined();
    expect(payload.fields[PROMOTION_NAME_FORM_FIELD]).toBe("Fall Open House");
  });

  it("prefers Program / Event Name for Basecamp promotion subject", () => {
    const payload = portalRequestToWorkflowPayload(validPortal);
    const fields = Object.fromEntries(
      Object.entries(payload.fields).map(([k, v]) => [k, String(v)]),
    );
    expect(getPromotionName(fields)).toBe("Fall Open House");
  });
});

describe("google form creative request backwards compatibility", () => {
  it("preserves google_form source and fields", () => {
    const payload = googleFormToWorkflowPayload({
      submittedAt: "2026-08-13T12:00:00.000Z",
      fields: { "What is the name of the promotion?": ["Summer Camp"] },
    });
    expect(payload.source).toBe("google_form");
    expect(payload.fields["What is the name of the promotion?"]).toEqual([
      "Summer Camp",
    ]);
    expect(payload.request?.assetType).toBe("flyer_full");
    expect(payload.request?.programName).toBe("Summer Camp");
    expect(payload.request?.imageTreatment).toBe("auto");
    expect(payload.request?.includePartner).toBe(false);
    expect(payload.request?.showContactInfo).toBe(false);
  });

  it("defaults registration + QR when Registration URL is present", () => {
    const request = googleFormToCreativeRequest({
      submittedAt: "2026-08-13T12:00:00.000Z",
      fields: {
        "What is the name of the promotion?": "Camp",
        "Registration URL": "https://example.com/r",
        "Promotion description": "Fun",
      },
    });
    expect(request.requiresRegistration).toBe(true);
    expect(request.includeQr).toBe(true);
    expect(request.registrationUrl).toBe("https://example.com/r");
    expect(request.description).toBe("Fun");
  });

  it("applies description default when Google Form omits it", () => {
    const request = googleFormToCreativeRequest({
      submittedAt: "2026-08-13T12:00:00.000Z",
      fields: { "What is the name of the promotion?": "Camp" },
    });
    expect(request.description).toBe("(No description provided)");
  });
});
