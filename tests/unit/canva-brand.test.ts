import { describe, expect, it } from "vitest";
import {
  CANVA_BRAND_KIT_NAME,
  DESTINATION_URL_FORM_FIELD,
  LOCKED_BRAND_DATASET_FIELDS,
  QR_PLACEMENT,
  VARIABLE_DATASET_FIELD_ROLES,
} from "@/config/canva-brand";
import { FORM_TO_CANVA_FIELD_MAP } from "@/config/form-to-canva";
import {
  assertMappingRespectsLockedBrandFields,
  BrandStructureError,
  looksLikeDisallowedGenericBrandKit,
  matchesAiMarketingBrandKit,
  prioritizeAiMarketingTemplates,
  validateBrandTemplateStructure,
} from "@/lib/canva/brand-validation";
import { generateQrPngBuffer, QrGenerationError } from "@/lib/canva/qr";
import { mapFormFieldsToCanvaData, MappingError } from "@/lib/creative/mapping";
import type { CanvaBrandTemplateDataset } from "@/lib/canva/types";

const completeDataset: CanvaBrandTemplateDataset = {
  HEADLINE: { type: "text" },
  DESCRIPTION: { type: "text" },
  DATE: { type: "text" },
  TIME: { type: "text" },
  LOCATION: { type: "text" },
  URL: { type: "text" },
  QR_CODE: { type: "image" },
};

describe("AI Marketing 2.0 brand kit identity", () => {
  it("requires AI Marketing 2.0 as the Brand Kit configuration", () => {
    expect(CANVA_BRAND_KIT_NAME).toBe("AI Marketing 2.0");
    expect(matchesAiMarketingBrandKit("AI Marketing 2.0 — Summer Promo")).toBe(
      true,
    );
    expect(matchesAiMarketingBrandKit("Generic Brand Kit")).toBe(false);
  });

  it("rejects generic Marketing's Team / Brand Kit titles when not AI Marketing 2.0", () => {
    expect(looksLikeDisallowedGenericBrandKit("Marketing's Team Flyer")).toBe(
      true,
    );
    expect(looksLikeDisallowedGenericBrandKit("AI Marketing 2.0 Flyer")).toBe(
      false,
    );
  });

  it("prioritizes AI Marketing 2.0 templates over generic ones", () => {
    const result = prioritizeAiMarketingTemplates([
      { id: "1", title: "Marketing's Team Old" },
      { id: "2", title: "AI Marketing 2.0 Event" },
      { id: "3", title: "Unrelated Template" },
    ]);
    expect(result.preferred.map((t) => t.id)).toEqual(["2"]);
    expect(result.rejectedGeneric.map((t) => t.id)).toEqual(["1"]);
    expect(result.other.map((t) => t.id)).toEqual(["3"]);
  });
});

describe("required template structural configuration", () => {
  it("configures QR as bottom-right above brand bar", () => {
    expect(QR_PLACEMENT.region).toBe("bottom_right");
    expect(QR_PLACEMENT.relativeTo).toBe("above_brand_bar");
    expect(QR_PLACEMENT.neverInsideBrandBar).toBe(true);
    expect(VARIABLE_DATASET_FIELD_ROLES.qrCode.type).toBe("image");
  });

  it("passes when required Autofill roles exist with correct types", () => {
    const report = validateBrandTemplateStructure(completeDataset);
    expect(report.ok).toBe(true);
    expect(report.brandKitName).toBe("AI Marketing 2.0");
    expect(report.qrField.present).toBe(true);
    expect(report.qrField.actualType).toBe("image");
  });

  it("fails clearly when required brand-template fields are missing", () => {
    const report = validateBrandTemplateStructure({
      HEADLINE: { type: "text" },
    });
    expect(report.ok).toBe(false);
    expect(report.missingRequiredVariableFields).toContain("QR_CODE");
    expect(report.issues.some((issue) => /QR_CODE/i.test(issue))).toBe(true);
  });

  it("fails when QR field is not an image type", () => {
    const report = validateBrandTemplateStructure({
      ...completeDataset,
      QR_CODE: { type: "text" },
    });
    expect(report.ok).toBe(false);
    expect(report.issues.join(" ")).toMatch(/QR_CODE.*image/i);
  });
});

describe("locked brand fields vs form mapping", () => {
  it("does not map brand bar / logo fields from form values in FORM_TO_CANVA_FIELD_MAP", () => {
    const mappedTargets = new Set(Object.values(FORM_TO_CANVA_FIELD_MAP));
    for (const locked of Object.values(LOCKED_BRAND_DATASET_FIELDS)) {
      if (!locked) continue;
      expect(mappedTargets.has(locked)).toBe(false);
    }
    expect(mappedTargets.has(VARIABLE_DATASET_FIELD_ROLES.qrCode.canvaField)).toBe(
      false,
    );
  });

  it("rejects mappings that target locked logo/brand-bar fields", () => {
    expect(() =>
      assertMappingRespectsLockedBrandFields(
        {
          "Promo name": "HEADLINE",
          Logo: "SJJCC_LOGO",
        },
        { additionalLockedFields: ["SJJCC_LOGO", "UJA_LOGO", "BRAND_BAR"] },
      ),
    ).toThrow(BrandStructureError);
    expect(() =>
      assertMappingRespectsLockedBrandFields(
        { Logo: "SJJCC_LOGO" },
        { additionalLockedFields: ["SJJCC_LOGO"] },
      ),
    ).toThrow(/locked\/reserved/i);
  });

  it("rejects mapping the QR image field from arbitrary form values", () => {
    expect(() =>
      assertMappingRespectsLockedBrandFields({
        "QR text": "QR_CODE",
      }),
    ).toThrow(/QR/i);
  });

  it("never guesses unknown Canva dataset fields", () => {
    expect(() =>
      mapFormFieldsToCanvaData(
        { "What is the name of the promotion?": "X" },
        { TOTALLY_MADE_UP: { type: "text" } },
      ),
    ).toThrow(MappingError);
    expect(() =>
      mapFormFieldsToCanvaData(
        { "What is the name of the promotion?": "X" },
        { TOTALLY_MADE_UP: { type: "text" } },
      ),
    ).toThrow(/does not exist/i);
  });
});

describe("destination URL → QR generation", () => {
  it("maps Registration URL as the destination URL form field", () => {
    expect(DESTINATION_URL_FORM_FIELD).toBe("Registration URL");
    expect(FORM_TO_CANVA_FIELD_MAP[DESTINATION_URL_FORM_FIELD]).toBe("URL");
  });

  it("generates a PNG buffer for a valid destination URL", async () => {
    const png = await generateQrPngBuffer("https://example.com/register");
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("fails clearly without a destination URL", async () => {
    await expect(generateQrPngBuffer("")).rejects.toBeInstanceOf(
      QrGenerationError,
    );
  });

  it("fails clearly for invalid destination URLs", async () => {
    await expect(generateQrPngBuffer("not-a-url")).rejects.toThrow(
      /valid absolute URL/i,
    );
  });
});
