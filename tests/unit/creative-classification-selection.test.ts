import { describe, expect, it } from "vitest";
import type { CreativeTemplate } from "@/config/canva-templates";
import {
  classifyContactTreatment,
  classifyContentDensity,
  classifyCreativeRequest,
} from "@/lib/creative/classify";
import {
  selectCreativeTemplate,
  validateTemplateDataset,
} from "@/lib/creative/select-template";
import type { CreativeRequest } from "@/lib/creative/types";

function baseRequest(
  overrides: Partial<CreativeRequest> = {},
): CreativeRequest {
  return {
    source: "creative_engine_portal",
    submittedAt: "2026-08-13T12:00:00.000Z",
    assetType: "flyer_full",
    programName: "Open House",
    description: "Join us.",
    requiresRegistration: true,
    registrationUrl: "https://example.com/register",
    includeQr: true,
    ctaLabel: "Register",
    showPricing: false,
    imageTreatment: "auto",
    showContactInfo: false,
    includePartner: false,
    ...overrides,
  };
}

function template(
  overrides: Partial<CreativeTemplate> &
    Pick<CreativeTemplate, "id" | "assetType" | "density">,
): CreativeTemplate {
  return {
    title: overrides.title ?? `CE Test ${overrides.id}`,
    width: 8.5,
    height: 11,
    unit: "in",
    backgroundTreatment: "light",
    contactTreatment: "compact",
    partnerTreatment: "sjjcc_uja",
    supportsImage: false,
    supportsQr: true,
    dataset: {
      HEADLINE: "text",
      DESCRIPTION: "text",
      QR_CODE: "image",
    },
    priority: 10,
    approved: true,
    ...overrides,
  };
}

describe("content density classification", () => {
  it("classifies minimal content", () => {
    expect(
      classifyContentDensity(
        baseRequest({
          description: "Hi",
          date: "Sep 1",
        }),
      ),
    ).toBe("minimal");
  });

  it("classifies standard content", () => {
    const density = classifyContentDensity(
      baseRequest({
        description:
          "Join families for an evening open house with campus tours and staff.",
        date: "September 12, 2026",
        startTime: "7:00 PM",
        location: "Main Lobby",
      }),
    );
    expect(density).toBe("standard");
  });

  it("classifies dense content", () => {
    const density = classifyContentDensity(
      baseRequest({
        description:
          "Join families for an evening open house with campus tours, staff meet-and-greets, classroom previews, and registration support for the full academic year. Bring questions about membership, scholarships, and transportation options.",
        date: "September 12, 2026",
        startTime: "7:00 PM",
        endTime: "9:00 PM",
        location: "Main Lobby",
        audience: "All ages",
        registrationDeadline: "Sep 1",
        additionalDetails: "Park in lot B",
        showPricing: true,
        price: "$10",
        memberPrice: "Free",
        showContactInfo: true,
        contactName: "Alex",
        contactEmail: "a@example.com",
      }),
    );
    expect(density).toBe("dense");
  });
});

describe("contact classification", () => {
  it("returns none when contact is hidden", () => {
    expect(
      classifyContactTreatment(baseRequest({ showContactInfo: false })),
    ).toBe("none");
  });

  it("returns compact for one or two methods", () => {
    expect(
      classifyContactTreatment(
        baseRequest({
          showContactInfo: true,
          contactEmail: "a@example.com",
        }),
      ),
    ).toBe("compact");
    expect(
      classifyContactTreatment(
        baseRequest({
          showContactInfo: true,
          contactName: "Alex",
          contactEmail: "a@example.com",
        }),
      ),
    ).toBe("compact");
  });

  it("returns full for name + multiple methods", () => {
    expect(
      classifyContactTreatment(
        baseRequest({
          showContactInfo: true,
          contactName: "Alex",
          contactEmail: "a@example.com",
          contactPhone: "555-0100",
        }),
      ),
    ).toBe("full");
  });
});

describe("image / partner classification signals", () => {
  it("marks supplied image as requiring image support", () => {
    const c = classifyCreativeRequest(
      baseRequest({ imageTreatment: "supplied" }),
    );
    expect(c.requiresImage).toBe(true);
    expect(c.backgroundTreatment).toBe("photo");
  });

  it("marks no image as light background preference", () => {
    const c = classifyCreativeRequest(baseRequest({ imageTreatment: "none" }));
    expect(c.requiresImage).toBe(false);
    expect(c.backgroundTreatment).toBe("light");
  });

  it("marks partner requirement", () => {
    const c = classifyCreativeRequest(
      baseRequest({
        includePartner: true,
        partnerName: "City Arts",
      }),
    );
    expect(c.partnerTreatment).toBe("sjjcc_uja_partner");
  });
});

describe("template selection", () => {
  const registry: CreativeTemplate[] = [
    template({
      id: "flyer-std",
      assetType: "flyer_full",
      density: "standard",
      priority: 1,
    }),
    template({
      id: "handout-std",
      assetType: "handout_half",
      density: "standard",
      width: 5.5,
      height: 8.5,
      priority: 1,
    }),
    template({
      id: "social-std",
      assetType: "social_portrait",
      density: "standard",
      width: 1080,
      height: 1350,
      unit: "px",
      priority: 1,
    }),
    template({
      id: "flyer-dense",
      assetType: "flyer_full",
      density: "dense",
      contactTreatment: "full",
      priority: 2,
    }),
    template({
      id: "flyer-photo",
      assetType: "flyer_full",
      density: "standard",
      backgroundTreatment: "photo",
      supportsImage: true,
      priority: 3,
    }),
    template({
      id: "unapproved",
      assetType: "flyer_full",
      density: "standard",
      approved: false,
      priority: 0,
    }),
  ];

  it("selects full flyer standard", () => {
    const request = baseRequest({
      description:
        "Join families for an evening open house with campus tours and staff.",
      date: "September 12, 2026",
      startTime: "7:00 PM",
      location: "Main Lobby",
    });
    const classification = classifyCreativeRequest(request);
    const result = selectCreativeTemplate(request, classification, registry);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.template.id).toBe("flyer-std");
  });

  it("selects half page and social by asset type", () => {
    for (const [assetType, id] of [
      ["handout_half", "handout-std"],
      ["social_portrait", "social-std"],
    ] as const) {
      const request = baseRequest({
        assetType,
        description:
          "Join families for an evening open house with campus tours and staff.",
        date: "September 12, 2026",
        startTime: "7:00 PM",
        location: "Main Lobby",
      });
      const classification = classifyCreativeRequest(request);
      const result = selectCreativeTemplate(request, classification, registry);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.template.id).toBe(id);
    }
  });

  it("returns NO_APPROVED_TEMPLATE when density has no match", () => {
    const request = baseRequest({
      description: "Hi",
      assetType: "flyer_full",
    });
    const classification = classifyCreativeRequest(request);
    expect(classification.density).toBe("minimal");
    const result = selectCreativeTemplate(request, classification, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NO_APPROVED_TEMPLATE");
  });

  it("rejects unapproved templates", () => {
    const request = baseRequest({
      description:
        "Join families for an evening open house with campus tours and staff.",
      date: "September 12, 2026",
      startTime: "7:00 PM",
      location: "Main Lobby",
    });
    const classification = classifyCreativeRequest(request);
    const result = selectCreativeTemplate(request, classification, [
      template({
        id: "bad",
        assetType: "flyer_full",
        density: "standard",
        approved: false,
      }),
    ]);
    expect(result.ok).toBe(false);
  });

  it("requires partner-capable template when partner present", () => {
    const request = baseRequest({
      description:
        "Join families for an evening open house with campus tours and staff.",
      date: "September 12, 2026",
      startTime: "7:00 PM",
      location: "Main Lobby",
      includePartner: true,
      partnerName: "City Arts",
    });
    const classification = classifyCreativeRequest(request);
    const result = selectCreativeTemplate(request, classification, registry);
    expect(result.ok).toBe(false);
  });

  it("prefers photo-capable template when image supplied", () => {
    const request = baseRequest({
      description:
        "Join families for an evening open house with campus tours and staff.",
      date: "September 12, 2026",
      startTime: "7:00 PM",
      location: "Main Lobby",
      imageTreatment: "supplied",
      imageAssetReference: "asset-1",
    });
    const classification = classifyCreativeRequest(request);
    const result = selectCreativeTemplate(request, classification, registry);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.template.id).toBe("flyer-photo");
  });

  it("validates dataset mismatch", () => {
    const t = template({
      id: "x",
      assetType: "flyer_full",
      density: "standard",
      dataset: { HEADLINE: "text", QR_CODE: "image" },
    });
    const mismatch = validateTemplateDataset(t, { HEADLINE: "text" });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.missing).toContain("QR_CODE");
    }
    expect(
      validateTemplateDataset(t, { HEADLINE: "text", QR_CODE: "image" }).ok,
    ).toBe(true);
  });

  it("empty approved registry yields no match", () => {
    const request = baseRequest({
      description:
        "Join families for an evening open house with campus tours and staff.",
      date: "September 12, 2026",
      startTime: "7:00 PM",
      location: "Main Lobby",
    });
    const classification = classifyCreativeRequest(request);
    const result = selectCreativeTemplate(request, classification, []);
    expect(result.ok).toBe(false);
  });
});
