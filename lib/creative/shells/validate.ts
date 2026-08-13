import type { CreativeShellSpec } from "@/config/creative-shells";

export type ShellValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type ShellValidationReport = {
  ok: boolean;
  /** Spec/payload validation only — not visual proof from Canva pixels. */
  validationKind: "implementation";
  issues: ShellValidationIssue[];
  checks: {
    dimensions: boolean;
    brandBarPresent: boolean;
    brandBarLocked: boolean;
    sjjccLogoZone: boolean;
    ujaLogoZone: boolean;
    sjjccLeftOfUja: boolean;
    qrAboveBrandBar: boolean;
    qrNotOverlappingLogos: boolean;
    requiredTextZones: boolean;
    noTagline: boolean;
    logosNotAutofill: boolean;
    brandBarNotAutofill: boolean;
    safeMargins: boolean;
  };
};

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Validate a shell spec against Creative Engine brand/layout contracts.
 * Labels results as implementation validation (not Canva visual proof).
 */
export function validateShellSpec(spec: CreativeShellSpec): ShellValidationReport {
  const issues: ShellValidationIssue[] = [];
  const byRole = (role: string) =>
    spec.contentZones.filter((z) => z.role === role);

  const brandBar = byRole("BRAND_BAR")[0];
  const sjjcc = byRole("SJJCC_LOGO_ZONE")[0];
  const uja = byRole("UJA_LOGO_ZONE")[0];
  const qr = byRole("QR_CODE")[0] ?? {
    x: spec.qrZone.x,
    y: spec.qrZone.y,
    width: spec.qrZone.width,
    height: spec.qrZone.height,
  };

  const expectedDims =
    (spec.assetType === "flyer_full" &&
      spec.unit === "in" &&
      spec.width === 8.5 &&
      spec.height === 11) ||
    (spec.assetType === "handout_half" &&
      spec.unit === "in" &&
      spec.width === 5.5 &&
      spec.height === 8.5) ||
    (spec.assetType === "social_portrait" &&
      spec.unit === "px" &&
      spec.width === 1080 &&
      spec.height === 1350);

  if (!expectedDims) {
    issues.push({
      code: "DIMENSIONS_MISMATCH",
      message: `Unexpected dimensions ${spec.width}×${spec.height} ${spec.unit}`,
      severity: "error",
    });
  }

  if (!brandBar) {
    issues.push({
      code: "BRAND_BAR_MISSING",
      message: "Brand bar zone missing",
      severity: "error",
    });
  } else {
    if (!brandBar.locked || brandBar.autofill) {
      issues.push({
        code: "BRAND_BAR_NOT_LOCKED",
        message: "Brand bar must be locked and not Autofill",
        severity: "error",
      });
    }
    const expectedY = spec.height - spec.brandBarHeight;
    if (Math.abs(brandBar.y - expectedY) > 0.01) {
      issues.push({
        code: "BRAND_BAR_NOT_ANCHORED",
        message: "Brand bar must be anchored to bottom edge",
        severity: "error",
      });
    }
  }

  if (!sjjcc || !uja) {
    issues.push({
      code: "LOGO_ZONES_MISSING",
      message: "SJJCC and UJA logo zones required",
      severity: "error",
    });
  } else {
    if (sjjcc.autofill || uja.autofill) {
      issues.push({
        code: "LOGO_AUTOFILL_FORBIDDEN",
        message: "Logo zones must not be Autofill fields",
        severity: "error",
      });
    }
    if (sjjcc.x >= uja.x) {
      issues.push({
        code: "LOGO_ORDER",
        message: "SJJCC must be left of UJA",
        severity: "error",
      });
    }
  }

  const brandBarTop = brandBar?.y ?? spec.height - spec.brandBarHeight;
  if (qr.y + qr.height > brandBarTop + 0.001) {
    issues.push({
      code: "QR_OVERLAPS_BRAND_BAR",
      message: "QR zone must sit entirely above the brand bar",
      severity: "error",
    });
  }

  if (sjjcc && uja && overlaps(qr, sjjcc)) {
    issues.push({
      code: "QR_OVERLAPS_SJJCC",
      message: "QR must not overlap SJJCC logo zone",
      severity: "error",
    });
  }
  if (sjjcc && uja && overlaps(qr, uja)) {
    issues.push({
      code: "QR_OVERLAPS_UJA",
      message: "QR must not overlap UJA logo zone",
      severity: "error",
    });
  }

  for (const role of spec.requiredAutofillRoles) {
    if (role === "QR_CODE") continue;
    const zone = byRole(role)[0];
    if (!zone) {
      issues.push({
        code: "REQUIRED_ZONE_MISSING",
        message: `Missing required zone ${role}`,
        severity: "error",
      });
    }
  }

  const taglineHit = spec.contentZones.some((z) =>
    /tagline/i.test(z.placeholder),
  );
  if (taglineHit) {
    issues.push({
      code: "TAGLINE_PRESENT",
      message: "Retired tagline must not appear",
      severity: "error",
    });
  }

  // Margins: content (except brand bar) should respect side/top margins
  for (const zone of spec.contentZones) {
    if (zone.role === "BRAND_BAR") continue;
    if (zone.x < spec.margins.left - 0.001 || zone.y < spec.margins.top - 0.001) {
      issues.push({
        code: "MARGIN_VIOLATION",
        message: `Zone ${zone.role} violates safe margins`,
        severity: "error",
      });
      break;
    }
  }

  const checks = {
    dimensions: expectedDims,
    brandBarPresent: Boolean(brandBar),
    brandBarLocked: Boolean(brandBar?.locked && !brandBar.autofill),
    sjjccLogoZone: Boolean(sjjcc),
    ujaLogoZone: Boolean(uja),
    sjjccLeftOfUja: Boolean(sjjcc && uja && sjjcc.x < uja.x),
    qrAboveBrandBar: qr.y + qr.height <= brandBarTop + 0.001,
    qrNotOverlappingLogos: Boolean(
      sjjcc && uja && !overlaps(qr, sjjcc) && !overlaps(qr, uja),
    ),
    requiredTextZones: spec.requiredAutofillRoles
      .filter((r) => r !== "QR_CODE")
      .every((r) => byRole(r).length > 0),
    noTagline: !taglineHit,
    logosNotAutofill: Boolean(sjjcc && uja && !sjjcc.autofill && !uja.autofill),
    brandBarNotAutofill: Boolean(brandBar && !brandBar.autofill),
    safeMargins: !issues.some((i) => i.code === "MARGIN_VIOLATION"),
  };

  const ok = issues.filter((i) => i.severity === "error").length === 0;

  return {
    ok,
    validationKind: "implementation",
    issues,
    checks,
  };
}
