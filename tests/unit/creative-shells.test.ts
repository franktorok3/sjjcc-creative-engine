import { describe, expect, it } from "vitest";
import { CREATIVE_SHELL_SPECS } from "@/config/creative-shells";
import { CANVA_SHELL_CAPABILITY_ASSESSMENT } from "@/config/canva-shell-capabilities";
import { CREATIVE_TEMPLATE_CANDIDATES } from "@/config/canva-template-candidates";
import { listApprovedCreativeTemplates } from "@/config/canva-templates";
import { missingApprovedLogoAssetIds } from "@/config/canva-brand-assets";
import { buildShellPptx } from "@/lib/creative/shells/pptx-builder";
import { validateShellSpec } from "@/lib/creative/shells/validate";

describe("Canva shell capability assessment", () => {
  it("documents that Autofill datasets cannot be created via Connect", () => {
    expect(
      CANVA_SHELL_CAPABILITY_ASSESSMENT.capabilities
        .G_defineAutofillDatasetProgrammatically.supported,
    ).toBe(false);
  });

  it("documents PPTX import as the chosen creation path", () => {
    expect(
      CANVA_SHELL_CAPABILITY_ASSESSMENT.chosenCreationPath.id,
    ).toBe("pptx_import_then_manual_autofill_publish");
  });

  it("documents element injection is unsupported on Connect", () => {
    expect(
      CANVA_SHELL_CAPABILITY_ASSESSMENT.capabilities
        .E_injectEditableElementsViaConnect.supported,
    ).toBe(false);
  });
});

describe("creative shell specs", () => {
  it("defines the three initial standard-light shells", () => {
    expect(CREATIVE_SHELL_SPECS.map((s) => s.title)).toEqual([
      "CE - Flyer - Standard - Light",
      "CE - Half Page - Standard - Light",
      "CE - Social Portrait - Standard - Light",
    ]);
  });

  it("uses canonical dimensions", () => {
    const flyer = CREATIVE_SHELL_SPECS[0]!;
    const half = CREATIVE_SHELL_SPECS[1]!;
    const social = CREATIVE_SHELL_SPECS[2]!;
    expect(flyer).toMatchObject({ width: 8.5, height: 11, unit: "in" });
    expect(half).toMatchObject({ width: 5.5, height: 8.5, unit: "in" });
    expect(social).toMatchObject({ width: 1080, height: 1350, unit: "px" });
  });

  it("passes implementation validation for hierarchy, QR, brand bar, logos", () => {
    for (const spec of CREATIVE_SHELL_SPECS) {
      const report = validateShellSpec(spec);
      expect(report.ok, spec.key).toBe(true);
      expect(report.checks.brandBarPresent).toBe(true);
      expect(report.checks.brandBarLocked).toBe(true);
      expect(report.checks.sjjccLeftOfUja).toBe(true);
      expect(report.checks.qrAboveBrandBar).toBe(true);
      expect(report.checks.qrNotOverlappingLogos).toBe(true);
      expect(report.checks.requiredTextZones).toBe(true);
      expect(report.checks.noTagline).toBe(true);
      expect(report.checks.logosNotAutofill).toBe(true);
      expect(report.checks.brandBarNotAutofill).toBe(true);
      expect(report.validationKind).toBe("implementation");
    }
  });

  it("keeps QR above the brand bar with quiet spacing", () => {
    for (const spec of CREATIVE_SHELL_SPECS) {
      const brandBarY = spec.height - spec.brandBarHeight;
      expect(spec.qrZone.y + spec.qrZone.height).toBeLessThanOrEqual(brandBarY);
    }
  });
  it("uses visible [[FIELD]] operator markers including logos", () => {
    for (const spec of CREATIVE_SHELL_SPECS) {
      const placeholders = spec.contentZones.map((z) => z.placeholder);
      expect(placeholders).toContain("[[HEADLINE]]");
      expect(placeholders).toContain("[[DESCRIPTION]]");
      expect(placeholders).toContain("[[DATE]]");
      expect(placeholders).toContain("[[TIME]]");
      expect(placeholders).toContain("[[LOCATION]]");
      expect(placeholders).toContain("[[CTA]]");
      expect(placeholders).toContain("[[QR_CODE]]");
      expect(placeholders).toContain("[[SJJCC_LOGO_LOCKUP]]");
      expect(placeholders).toContain("[[UJA_LOGO]]");
    }
  });
});

describe("shell pptx builder", () => {
  it("emits a non-empty PPTX buffer for each shell", async () => {
    for (const spec of CREATIVE_SHELL_SPECS) {
      const file = await buildShellPptx(spec);
      expect(file.mimeType).toContain("presentationml");
      expect(file.buffer.byteLength).toBeGreaterThan(1000);
      // PPTX is a ZIP
      expect(file.buffer.subarray(0, 2).toString("utf8")).toBe("PK");
    }
  });
});

describe("registry candidates", () => {
  it("registers three candidates with approved=false", () => {
    expect(CREATIVE_TEMPLATE_CANDIDATES).toHaveLength(3);
    expect(CREATIVE_TEMPLATE_CANDIDATES.every((c) => c.approved === false)).toBe(
      true,
    );
    expect(listApprovedCreativeTemplates()).toHaveLength(0);
  });

  it("candidates declare QR image and no logo autofill roles", () => {
    for (const c of CREATIVE_TEMPLATE_CANDIDATES) {
      expect(c.dataset.QR_CODE).toBe("image");
      expect(c.dataset.SJJCC_LOGO).toBeUndefined();
      expect(c.dataset.UJA_LOGO).toBeUndefined();
      expect(c.dataset.BRAND_BAR).toBeUndefined();
      expect(c.supportsQr).toBe(true);
    }
  });
});

describe("approved logo assets", () => {
  it("reports missing logo asset env vars clearly", () => {
    expect(
      missingApprovedLogoAssetIds({
        sjjccLogoAssetId: null,
        ujaLogoAssetId: null,
        sjjccLogoReversedAssetId: null,
        ujaLogoReversedAssetId: null,
      }),
    ).toEqual(["CANVA_SJJCC_LOGO_ASSET_ID", "CANVA_UJA_LOGO_ASSET_ID"]);
  });
});
