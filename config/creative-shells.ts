/**
 * Deterministic Creative Engine shell layout specifications.
 * Layout logic lives here — not in API handlers.
 *
 * Units: inches for print shells; pixels for social (converted for PPTX).
 */

import type { AssetType, ContentDensity } from "@/config/canva-templates";
import { SJJCC_BRAND_COLORS } from "@/config/canva-brand-assets";

export type ShellUnit = "px" | "in";

export type ShellContentRole =
  | "HEADLINE"
  | "DESCRIPTION"
  | "DATE"
  | "TIME"
  | "LOCATION"
  | "AUDIENCE"
  | "CTA"
  | "PRICE"
  | "CONTACT_EMAIL"
  | "CONTACT_PHONE"
  | "HERO_IMAGE"
  | "QR_CODE"
  | "BRAND_BAR"
  | "SJJCC_LOGO_ZONE"
  | "UJA_LOGO_ZONE";

export type ShellContentZone = {
  role: ShellContentRole;
  x: number;
  y: number;
  width: number;
  height: number;
  fontRole?: "headline" | "secondary" | "body" | "finePrint";
  maxLines?: number;
  autofill: boolean;
  locked: boolean;
  /** Visible operator marker, e.g. [[HEADLINE]] */
  placeholder: string;
};

/** Operator-visible Autofill / logo markers for Data Autofill binding. */
export function fieldMarker(role: string): string {
  return `[[${role}]]`;
}

export type CreativeShellSpec = {
  key: string;
  title: string;
  assetType: AssetType;
  density: ContentDensity;
  backgroundTreatment: "light";
  width: number;
  height: number;
  unit: ShellUnit;
  /** DPI used when converting inches ↔ pixels for validation. */
  dpi: number;
  margins: { top: number; right: number; bottom: number; left: number };
  brandBarHeight: number;
  qrZone: { x: number; y: number; width: number; height: number };
  contentZones: ShellContentZone[];
  requiredAutofillRoles: string[];
  optionalAutofillRoles: string[];
};

const PRINT_DPI = 96;

function flyerStandardLight(): CreativeShellSpec {
  const width = 8.5;
  const height = 11;
  const margins = { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 };
  const brandBarHeight = 0.85;
  const contentBottom = height - margins.bottom - brandBarHeight;
  const qrSize = 1.0;
  const qrZone = {
    x: width - margins.right - qrSize,
    y: contentBottom - qrSize - 0.15,
    width: qrSize,
    height: qrSize,
  };

  return {
    key: "flyer_standard_light",
    title: "CE - Flyer - Standard - Light",
    assetType: "flyer_full",
    density: "standard",
    backgroundTreatment: "light",
    width,
    height,
    unit: "in",
    dpi: PRINT_DPI,
    margins,
    brandBarHeight,
    qrZone,
    requiredAutofillRoles: [
      "HEADLINE",
      "DESCRIPTION",
      "DATE",
      "TIME",
      "LOCATION",
      "AUDIENCE",
      "CTA",
      "QR_CODE",
    ],
    optionalAutofillRoles: ["PRICE", "CONTACT_EMAIL", "CONTACT_PHONE", "HERO_IMAGE"],
    contentZones: [
      {
        role: "HERO_IMAGE",
        x: margins.left,
        y: margins.top,
        width: width - margins.left - margins.right,
        height: 2.6,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("HERO_IMAGE"),
      },
      {
        role: "HEADLINE",
        x: margins.left,
        y: 3.25,
        width: width - margins.left - margins.right,
        height: 1.1,
        fontRole: "headline",
        maxLines: 3,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("HEADLINE"),
      },
      {
        role: "DESCRIPTION",
        x: margins.left,
        y: 4.45,
        width: width - margins.left - margins.right - qrSize - 0.25,
        height: 1.5,
        fontRole: "body",
        maxLines: 6,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("DESCRIPTION"),
      },
      {
        role: "DATE",
        x: margins.left,
        y: 6.1,
        width: 2.4,
        height: 0.4,
        fontRole: "secondary",
        maxLines: 1,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("DATE"),
      },
      {
        role: "TIME",
        x: margins.left + 2.55,
        y: 6.1,
        width: 2.4,
        height: 0.4,
        fontRole: "secondary",
        maxLines: 1,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("TIME"),
      },
      {
        role: "LOCATION",
        x: margins.left,
        y: 6.55,
        width: 5.0,
        height: 0.4,
        fontRole: "secondary",
        maxLines: 2,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("LOCATION"),
      },
      {
        role: "AUDIENCE",
        x: margins.left,
        y: 7.05,
        width: 5.0,
        height: 0.4,
        fontRole: "finePrint",
        maxLines: 1,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("AUDIENCE"),
      },
      {
        role: "CTA",
        x: margins.left,
        y: 7.7,
        width: 2.8,
        height: 0.55,
        fontRole: "secondary",
        maxLines: 1,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("CTA"),
      },
      {
        role: "CONTACT_EMAIL",
        x: margins.left,
        y: 8.4,
        width: 3.2,
        height: 0.35,
        fontRole: "finePrint",
        maxLines: 1,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("CONTACT_EMAIL"),
      },
      {
        role: "QR_CODE",
        ...qrZone,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("QR_CODE"),
      },
      {
        role: "BRAND_BAR",
        x: 0,
        y: height - brandBarHeight,
        width,
        height: brandBarHeight,
        autofill: false,
        locked: true,
        placeholder: "LOCKED_BRAND_BAR",
      },
      {
        role: "SJJCC_LOGO_ZONE",
        x: margins.left,
        y: height - brandBarHeight + 0.18,
        width: 1.6,
        height: 0.5,
        autofill: false,
        locked: true,
        placeholder: fieldMarker("SJJCC_LOGO_LOCKUP"),
      },
      {
        role: "UJA_LOGO_ZONE",
        x: margins.left + 1.85,
        y: height - brandBarHeight + 0.18,
        width: 1.2,
        height: 0.5,
        autofill: false,
        locked: true,
        placeholder: fieldMarker("UJA_LOGO"),
      },
    ],
  };
}

function halfPageStandardLight(): CreativeShellSpec {
  const width = 5.5;
  const height = 8.5;
  const margins = { top: 0.4, right: 0.4, bottom: 0.4, left: 0.4 };
  const brandBarHeight = 0.7;
  const contentBottom = height - margins.bottom - brandBarHeight;
  const qrSize = 0.85;
  const qrZone = {
    x: width - margins.right - qrSize,
    y: contentBottom - qrSize - 0.12,
    width: qrSize,
    height: qrSize,
  };

  return {
    key: "handout_standard_light",
    title: "CE - Half Page - Standard - Light",
    assetType: "handout_half",
    density: "standard",
    backgroundTreatment: "light",
    width,
    height,
    unit: "in",
    dpi: PRINT_DPI,
    margins,
    brandBarHeight,
    qrZone,
    requiredAutofillRoles: [
      "HEADLINE",
      "DESCRIPTION",
      "DATE",
      "TIME",
      "LOCATION",
      "CTA",
      "QR_CODE",
    ],
    optionalAutofillRoles: ["CONTACT_EMAIL", "HERO_IMAGE"],
    contentZones: [
      {
        role: "HERO_IMAGE",
        x: margins.left,
        y: margins.top,
        width: width - margins.left - margins.right,
        height: 1.8,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("HERO_IMAGE"),
      },
      {
        role: "HEADLINE",
        x: margins.left,
        y: 2.35,
        width: width - margins.left - margins.right,
        height: 0.9,
        fontRole: "headline",
        maxLines: 3,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("HEADLINE"),
      },
      {
        role: "DESCRIPTION",
        x: margins.left,
        y: 3.35,
        width: width - margins.left - margins.right - qrSize - 0.2,
        height: 1.2,
        fontRole: "body",
        maxLines: 5,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("DESCRIPTION"),
      },
      {
        role: "DATE",
        x: margins.left,
        y: 4.7,
        width: 2.2,
        height: 0.35,
        fontRole: "secondary",
        maxLines: 1,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("DATE"),
      },
      {
        role: "TIME",
        x: margins.left + 2.3,
        y: 4.7,
        width: 1.6,
        height: 0.35,
        fontRole: "secondary",
        maxLines: 1,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("TIME"),
      },
      {
        role: "LOCATION",
        x: margins.left,
        y: 5.15,
        width: 3.4,
        height: 0.4,
        fontRole: "secondary",
        maxLines: 2,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("LOCATION"),
      },
      {
        role: "CTA",
        x: margins.left,
        y: 5.75,
        width: 2.2,
        height: 0.45,
        fontRole: "secondary",
        maxLines: 1,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("CTA"),
      },
      {
        role: "CONTACT_EMAIL",
        x: margins.left,
        y: 6.35,
        width: 3.0,
        height: 0.3,
        fontRole: "finePrint",
        maxLines: 1,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("CONTACT_EMAIL"),
      },
      {
        role: "QR_CODE",
        ...qrZone,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("QR_CODE"),
      },
      {
        role: "BRAND_BAR",
        x: 0,
        y: height - brandBarHeight,
        width,
        height: brandBarHeight,
        autofill: false,
        locked: true,
        placeholder: "LOCKED_BRAND_BAR",
      },
      {
        role: "SJJCC_LOGO_ZONE",
        x: margins.left,
        y: height - brandBarHeight + 0.12,
        width: 1.35,
        height: 0.45,
        autofill: false,
        locked: true,
        placeholder: fieldMarker("SJJCC_LOGO_LOCKUP"),
      },
      {
        role: "UJA_LOGO_ZONE",
        x: margins.left + 1.55,
        y: height - brandBarHeight + 0.12,
        width: 1.0,
        height: 0.45,
        autofill: false,
        locked: true,
        placeholder: fieldMarker("UJA_LOGO"),
      },
    ],
  };
}

function socialPortraitStandardLight(): CreativeShellSpec {
  // Spec in pixels; PPTX builder converts via dpi.
  const width = 1080;
  const height = 1350;
  const margins = { top: 64, right: 64, bottom: 64, left: 64 };
  const brandBarHeight = 110;
  const contentBottom = height - margins.bottom - brandBarHeight;
  const qrSize = 140;
  const qrZone = {
    x: width - margins.right - qrSize,
    y: contentBottom - qrSize - 24,
    width: qrSize,
    height: qrSize,
  };

  return {
    key: "social_portrait_standard_light",
    title: "CE - Social Portrait - Standard - Light",
    assetType: "social_portrait",
    density: "standard",
    backgroundTreatment: "light",
    width,
    height,
    unit: "px",
    dpi: PRINT_DPI,
    margins,
    brandBarHeight,
    qrZone,
    requiredAutofillRoles: [
      "HEADLINE",
      "DESCRIPTION",
      "DATE",
      "TIME",
      "LOCATION",
      "CTA",
      "QR_CODE",
    ],
    optionalAutofillRoles: ["HERO_IMAGE"],
    contentZones: [
      {
        role: "HERO_IMAGE",
        x: margins.left,
        y: margins.top,
        width: width - margins.left - margins.right,
        height: 420,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("HERO_IMAGE"),
      },
      {
        role: "HEADLINE",
        x: margins.left,
        y: 520,
        width: width - margins.left - margins.right,
        height: 180,
        fontRole: "headline",
        maxLines: 3,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("HEADLINE"),
      },
      {
        role: "DESCRIPTION",
        x: margins.left,
        y: 720,
        width: width - margins.left - margins.right - qrSize - 24,
        height: 140,
        fontRole: "body",
        maxLines: 4,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("DESCRIPTION"),
      },
      {
        role: "DATE",
        x: margins.left,
        y: 880,
        width: 360,
        height: 48,
        fontRole: "secondary",
        maxLines: 1,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("DATE"),
      },
      {
        role: "TIME",
        x: margins.left + 380,
        y: 880,
        width: 280,
        height: 48,
        fontRole: "secondary",
        maxLines: 1,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("TIME"),
      },
      {
        role: "LOCATION",
        x: margins.left,
        y: 940,
        width: 640,
        height: 48,
        fontRole: "secondary",
        maxLines: 1,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("LOCATION"),
      },
      {
        role: "CTA",
        x: margins.left,
        y: 1020,
        width: 320,
        height: 64,
        fontRole: "secondary",
        maxLines: 1,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("CTA"),
      },
      {
        role: "QR_CODE",
        ...qrZone,
        autofill: true,
        locked: false,
        placeholder: fieldMarker("QR_CODE"),
      },
      {
        role: "BRAND_BAR",
        x: 0,
        y: height - brandBarHeight,
        width,
        height: brandBarHeight,
        autofill: false,
        locked: true,
        placeholder: "LOCKED_BRAND_BAR",
      },
      {
        role: "SJJCC_LOGO_ZONE",
        x: margins.left,
        y: height - brandBarHeight + 24,
        width: 220,
        height: 62,
        autofill: false,
        locked: true,
        placeholder: fieldMarker("SJJCC_LOGO_LOCKUP"),
      },
      {
        role: "UJA_LOGO_ZONE",
        x: margins.left + 250,
        y: height - brandBarHeight + 24,
        width: 160,
        height: 62,
        autofill: false,
        locked: true,
        placeholder: fieldMarker("UJA_LOGO"),
      },
    ],
  };
}

export const CREATIVE_SHELL_SPECS: CreativeShellSpec[] = [
  flyerStandardLight(),
  halfPageStandardLight(),
  socialPortraitStandardLight(),
];

export function getCreativeShellSpec(key: string): CreativeShellSpec | undefined {
  return CREATIVE_SHELL_SPECS.find((s) => s.key === key);
}

export function shellSpecToPixels(spec: CreativeShellSpec): {
  widthPx: number;
  heightPx: number;
} {
  if (spec.unit === "px") {
    return { widthPx: spec.width, heightPx: spec.height };
  }
  return {
    widthPx: Math.round(spec.width * spec.dpi),
    heightPx: Math.round(spec.height * spec.dpi),
  };
}

/** Convert any zone coordinate to inches for PPTX. */
export function toInches(value: number, unit: ShellUnit, dpi: number): number {
  return unit === "in" ? value : value / dpi;
}

export const SHELL_BACKGROUND_COLOR = SJJCC_BRAND_COLORS.lightBg;
export const SHELL_BRAND_BAR_COLOR = SJJCC_BRAND_COLORS.navy;
export const SHELL_ACCENT_COLOR = SJJCC_BRAND_COLORS.cyan;
export const SHELL_INK_COLOR = SJJCC_BRAND_COLORS.ink;
