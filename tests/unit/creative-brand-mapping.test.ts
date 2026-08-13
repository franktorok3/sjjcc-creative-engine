import { describe, expect, it } from "vitest";
import type { CreativeTemplate } from "@/config/canva-templates";
import { BrandStructureError } from "@/lib/canva/brand-validation";
import { classifyCreativeRequest } from "@/lib/creative/classify";
import {
  assertNoBrandOverwriteFromUser,
  mapCreativeRequestToCanvaData,
} from "@/lib/creative/map-request";
import type { CreativeRequest } from "@/lib/creative/types";

const template: CreativeTemplate = {
  id: "t1",
  title: "CE - Flyer - Standard - Light",
  assetType: "flyer_full",
  width: 8.5,
  height: 11,
  unit: "in",
  density: "standard",
  backgroundTreatment: "light",
  contactTreatment: "compact",
  partnerTreatment: "sjjcc_uja",
  supportsImage: false,
  supportsQr: true,
  dataset: {
    HEADLINE: "text",
    DESCRIPTION: "text",
    DATE: "text",
    CTA: "text",
    CONTACT_EMAIL: "text",
    QR_CODE: "image",
  },
  priority: 1,
  approved: true,
};

function request(overrides: Partial<CreativeRequest> = {}): CreativeRequest {
  return {
    source: "creative_engine_portal",
    submittedAt: "2026-08-13T12:00:00.000Z",
    assetType: "flyer_full",
    programName: "Open House",
    headline: "Join Us",
    description: "Tour campus tonight.",
    date: "Sep 12",
    requiresRegistration: true,
    registrationUrl: "https://example.com/r",
    includeQr: true,
    ctaLabel: "Register",
    showPricing: false,
    imageTreatment: "none",
    showContactInfo: true,
    contactEmail: "hello@sjjcc.org",
    includePartner: false,
    ...overrides,
  };
}

describe("brand ownership in mapping", () => {
  it("maps approved text roles and skips QR_CODE for later preprocessing", () => {
    const req = request();
    const classification = classifyCreativeRequest(req);
    const { data, mappedRoles } = mapCreativeRequestToCanvaData({
      request: req,
      classification,
      template,
      liveDataset: {
        HEADLINE: { type: "text" },
        DESCRIPTION: { type: "text" },
        DATE: { type: "text" },
        CTA: { type: "text" },
        CONTACT_EMAIL: { type: "text" },
        QR_CODE: { type: "image" },
      },
    });

    expect(mappedRoles).toContain("HEADLINE");
    expect(mappedRoles).toContain("DESCRIPTION");
    expect(data.QR_CODE).toBeUndefined();
    expect(data.HEADLINE).toEqual({ type: "text", text: "Join Us" });
    expect(data.CONTACT_EMAIL).toEqual({
      type: "text",
      text: "hello@sjjcc.org",
    });
  });

  it("does not render labels for absent contact/pricing fields", () => {
    const req = request({
      showContactInfo: false,
      showPricing: true,
      price: undefined,
      memberPrice: undefined,
    });
    const classification = classifyCreativeRequest(req);
    const { data } = mapCreativeRequestToCanvaData({
      request: req,
      classification,
      template,
      liveDataset: {
        HEADLINE: { type: "text" },
        DESCRIPTION: { type: "text" },
        DATE: { type: "text" },
        CTA: { type: "text" },
        CONTACT_EMAIL: { type: "text" },
        QR_CODE: { type: "image" },
      },
    });
    expect(data.CONTACT_EMAIL).toBeUndefined();
  });

  it("blocks locked brand fields from being declared on template dataset for user mapping", () => {
    const bad: CreativeTemplate = {
      ...template,
      dataset: { ...template.dataset, SJJCC_LOGO: "image" },
    };
    const req = request();
    expect(() =>
      mapCreativeRequestToCanvaData({
        request: req,
        classification: classifyCreativeRequest(req),
        template: bad,
        liveDataset: {
          HEADLINE: { type: "text" },
          DESCRIPTION: { type: "text" },
          DATE: { type: "text" },
          CTA: { type: "text" },
          CONTACT_EMAIL: { type: "text" },
          QR_CODE: { type: "image" },
          SJJCC_LOGO: { type: "image" },
        },
      }),
    ).toThrow(BrandStructureError);
  });

  it("blocks QR text overwrite and locked field overwrite from user data", () => {
    expect(() =>
      assertNoBrandOverwriteFromUser({
        QR_CODE: { type: "text", text: "https://evil.example" },
      }),
    ).toThrow(/QR_CODE/);

    expect(() =>
      assertNoBrandOverwriteFromUser({
        SJJCC_LOGO: { type: "image", asset_id: "x" },
      }),
    ).toThrow(BrandStructureError);
  });

  it("partner logo role is not used to replace SJJCC/UJA branding", () => {
    const withPartner: CreativeTemplate = {
      ...template,
      partnerTreatment: "sjjcc_uja_partner",
      dataset: {
        ...template.dataset,
        PARTNER_LOGO: "image",
      },
    };
    const req = request({
      includePartner: true,
      partnerName: "City Arts",
      partnerLogoAssetReference: "partner-asset",
    });
    const { data } = mapCreativeRequestToCanvaData({
      request: req,
      classification: classifyCreativeRequest(req),
      template: withPartner,
      liveDataset: {
        HEADLINE: { type: "text" },
        DESCRIPTION: { type: "text" },
        DATE: { type: "text" },
        CTA: { type: "text" },
        CONTACT_EMAIL: { type: "text" },
        QR_CODE: { type: "image" },
        PARTNER_LOGO: { type: "image" },
      },
    });
    // Partner logo deferred (like HERO_IMAGE) — never written as SJJCC/UJA
    expect(data.PARTNER_LOGO).toBeUndefined();
    expect(data.SJJCC_LOGO).toBeUndefined();
    expect(data.UJA_LOGO).toBeUndefined();
  });
});
