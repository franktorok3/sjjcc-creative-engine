/**
 * AI Marketing 2.0 / SJJCC brand tokens for Creative Engine shells.
 *
 * Logo asset IDs must be approved Canva Project assets from the Brand Kit
 * environment — never invent or generate substitute logos.
 *
 * Set via env or fill after operator discovery:
 *   CANVA_SJJCC_LOGO_ASSET_ID
 *   CANVA_UJA_LOGO_ASSET_ID
 */

export const SJJCC_BRAND_COLORS = {
  cyan: "#15B0E5",
  blue: "#007DC3",
  navy: "#00457E",
  gray: "#707073",
  white: "#FFFFFF",
  lightBg: "#F7FBFD",
  ink: "#14242B",
} as const;

/** Typography roles — Canva will substitute closest available fonts on import. */
export const SJJCC_TYPOGRAPHY = {
  headline: {
    role: "ITC Demi Compressed",
    canvaFallback: "Arial",
    weight: 700,
  },
  secondary: {
    role: "ITC Book Compressed",
    canvaFallback: "Arial",
    weight: 400,
  },
  body: {
    role: "Franklin Gothic ATF Regular",
    canvaFallback: "Arial",
    weight: 400,
  },
  finePrint: {
    role: "ITC Book Compressed Italic",
    canvaFallback: "Arial",
    weight: 400,
    italic: true,
  },
} as const;

export type ApprovedLogoAssetConfig = {
  /** Canva asset id for full-color SJJCC logo (light backgrounds). */
  sjjccLogoAssetId: string | null;
  /** Canva asset id for full-color UJA logo (light backgrounds). */
  ujaLogoAssetId: string | null;
  /** Optional reversed/white treatments for dark/photo shells (Phase 4). */
  sjjccLogoReversedAssetId: string | null;
  ujaLogoReversedAssetId: string | null;
};

/**
 * Controlled approved logo asset registry.
 * Empty until operator supplies real Brand Kit asset IDs.
 */
export function getApprovedLogoAssets(
  env: NodeJS.ProcessEnv = process.env,
): ApprovedLogoAssetConfig {
  return {
    sjjccLogoAssetId: env.CANVA_SJJCC_LOGO_ASSET_ID?.trim() || null,
    ujaLogoAssetId: env.CANVA_UJA_LOGO_ASSET_ID?.trim() || null,
    sjjccLogoReversedAssetId:
      env.CANVA_SJJCC_LOGO_REVERSED_ASSET_ID?.trim() || null,
    ujaLogoReversedAssetId: env.CANVA_UJA_LOGO_REVERSED_ASSET_ID?.trim() || null,
  };
}

export function missingApprovedLogoAssetIds(
  assets: ApprovedLogoAssetConfig = getApprovedLogoAssets(),
): string[] {
  const missing: string[] = [];
  if (!assets.sjjccLogoAssetId) missing.push("CANVA_SJJCC_LOGO_ASSET_ID");
  if (!assets.ujaLogoAssetId) missing.push("CANVA_UJA_LOGO_ASSET_ID");
  return missing;
}
