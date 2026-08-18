import { describe, expect, it } from "vitest";
import { selectShellSpecForRequest } from "@/lib/creative/select-live-canva-layout";
import { mapRequestToLiveCanvaDataset } from "@/lib/creative/map-request-to-live-dataset";
import type { CreativeRequest } from "@/lib/creative/types";
import { classifyCreativeRequest } from "@/lib/creative/classify";

function baseRequest(
  overrides: Partial<CreativeRequest> = {},
): CreativeRequest {
  return {
    source: "creative_engine_portal",
    submittedAt: new Date().toISOString(),
    assetType: "handout_half",
    programName: "Mah Jongg",
    headline: "Beginner Mah Jongg Classes Start",
    description: "Learn the fundamentals of Mah Jongg.",
    date: "July 7th",
    startTime: "6:00 PM",
    endTime: "8:00 PM",
    location: "Sid Jacobson JCC",
    requiresRegistration: true,
    registrationUrl: "https://example.com/sjjcc-creative-engine-test/handout",
    ctaLabel: "Register",
    includeQr: true,
    showPricing: true,
    memberPrice: "180",
    nonMemberPrice: "200",
    imageTreatment: "auto",
    showContactInfo: true,
    contactName: "Audrey Kurland",
    contactEmail: "akurland@sjjcc.org",
    contactPhone: "516.484.1545",
    includePartner: false,
    ...overrides,
  };
}

describe("form → shell → Canva layout selection", () => {
  it("maps handout asset to the half-page CE shell", () => {
    const shell = selectShellSpecForRequest(baseRequest());
    expect(shell.key).toBe("handout_standard_light");
    expect(shell.title).toBe("CE - Half Page - Standard - Light");
    expect(shell.assetType).toBe("handout_half");
  });

  it("maps flyer and social assets to their CE shells", () => {
    expect(
      selectShellSpecForRequest(baseRequest({ assetType: "flyer_full" })).key,
    ).toBe("flyer_standard_light");
    expect(
      selectShellSpecForRequest(baseRequest({ assetType: "social_portrait" }))
        .key,
    ).toBe("social_portrait_standard_light");
  });
});

describe("live Canva dataset mapping", () => {
  it("maps roles onto live Canva field names without inventing keys", () => {
    const request = baseRequest();
    const classification = classifyCreativeRequest(request);
    const { data, mappedRoles, qrFieldName } = mapRequestToLiveCanvaDataset({
      request,
      classification,
      dataset: {
        HEADLINE: { type: "text" },
        DESCRIPTION: { type: "text" },
        DATE: { type: "text" },
        TIME: { type: "text" },
        LOCATION: { type: "text" },
        CTA: { type: "text" },
        QR_CODE: { type: "image" },
        SJJCC_LOGO: { type: "image" },
      },
    });

    expect(mappedRoles).toContain("HEADLINE");
    expect(data.HEADLINE).toEqual({
      type: "text",
      text: "Beginner Mah Jongg Classes Start",
    });
    expect(data.SJJCC_LOGO).toBeUndefined();
    expect(qrFieldName).toBe("QR_CODE");
  });
});
