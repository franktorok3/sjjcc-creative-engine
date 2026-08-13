import { describe, expect, it } from "vitest";
import { PROMOTION_NAME_FORM_FIELD } from "@/config/form-to-canva";
import {
  portalCreativeRequestSchema,
  portalRequestToWorkflowPayload,
  googleFormToWorkflowPayload,
} from "@/lib/creative/creative-request";
import { getPromotionName } from "@/lib/creative/mapping";

describe("portal creative request", () => {
  const valid = {
    source: "creative_engine_portal" as const,
    programName: "Fall Open House",
    headline: "Join Us This Fall",
    description: "Tour campus and meet staff.",
    date: "September 12, 2026",
    time: "7:00 PM",
    location: "Main Lobby",
    registrationUrl: "https://example.com/register",
    assetType: "flyer" as const,
  };

  it("accepts a valid portal payload", () => {
    expect(portalCreativeRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(
      portalCreativeRequestSchema.safeParse({
        ...valid,
        programName: "",
      }).success,
    ).toBe(false);
    expect(
      portalCreativeRequestSchema.safeParse({
        ...valid,
        registrationUrl: "not-a-url",
      }).success,
    ).toBe(false);
  });

  it("normalizes portal input onto Google Form field keys for shared workflow", () => {
    const payload = portalRequestToWorkflowPayload(valid, "2026-08-13T12:00:00.000Z");
    expect(payload.source).toBe("creative_engine_portal");
    expect(payload.fields).toMatchObject({
      "Program / Event Name": "Fall Open House",
      [PROMOTION_NAME_FORM_FIELD]: "Join Us This Fall",
      "Promotion description": "Tour campus and meet staff.",
      "Event date": "September 12, 2026",
      "Event time": "7:00 PM",
      Location: "Main Lobby",
      "Registration URL": "https://example.com/register",
      "Asset Type": "Flyer",
    });
  });

  it("prefers Program / Event Name for Basecamp promotion subject", () => {
    const payload = portalRequestToWorkflowPayload(valid);
    const fields = Object.fromEntries(
      Object.entries(payload.fields).map(([k, v]) => [k, String(v)]),
    );
    expect(getPromotionName(fields)).toBe("Fall Open House");
  });
});

describe("google form creative request", () => {
  it("preserves google_form source and fields", () => {
    const payload = googleFormToWorkflowPayload({
      submittedAt: "2026-08-13T12:00:00.000Z",
      fields: { "What is the name of the promotion?": ["Summer Camp"] },
    });
    expect(payload.source).toBe("google_form");
    expect(payload.fields["What is the name of the promotion?"]).toEqual([
      "Summer Camp",
    ]);
  });
});
