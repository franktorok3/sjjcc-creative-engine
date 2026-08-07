/**
 * SJJCC Creative Engine — Canva brand production configuration.
 *
 * Brand Kit: "AI Marketing 2.0" (NOT generic "Brand Kit" / "Marketing's Team").
 *
 * IMPORTANT — Canva API limits:
 * - Connect API lists Brand Templates and datasets; it does not expose a
 *   first-class "Brand Kit" object you can select by ID.
 * - Pixel layout (brand bar at bottom, QR bottom-right above bar) is owned by
 *   the Brand Template design in Canva. Autofill cannot reposition locked
 *   template chrome.
 * - Dataset field names below are ROLE PLACEHOLDERS until live discovery via
 *   GET /api/test/canva/template-dataset replaces them with real keys.
 *   Do not guess production field IDs.
 */

/** Required Brand Kit display name for Creative Engine production. */
export const CANVA_BRAND_KIT_NAME = "AI Marketing 2.0";

/**
 * Query used when listing Brand Templates so AI Marketing 2.0 assets are
 * prioritized over generic Brand Kit / Marketing's Team templates.
 */
export const CANVA_BRAND_KIT_QUERY = "AI Marketing 2.0";

/**
 * Disallowed Brand Kit / template title markers (case-insensitive).
 * Templates that only match these (and not AI Marketing 2.0) must not be used.
 */
export const DISALLOWED_BRAND_KIT_MARKERS = [
  "Marketing's Team",
  "Marketings Team",
] as const;

/**
 * LOCKED TEMPLATE STRUCTURE (not Autofill creative content):
 * - bottom brand bar
 * - SJJCC logos
 * - UJA logos
 * - QR placement zone (position/size in the canvas)
 * - margins / structural layout
 *
 * These are owned by the Canva Brand Template design. Autofill cannot
 * reposition them. Pixel layout is enforced in Canva, not via API.
 */
export const BRAND_BAR_LAYOUT = {
  required: true,
  anchor: "bottom" as const,
  spansTemplateWidth: true,
  logoOrder: ["SJJCC", "UJA"] as const,
  /** Logos / bar are template structure — never Autofill creative content. */
  treatAsTemplateOwned: true,
  /** Autofill must not remove, recolor, crop, distort, or cover the bar. */
  immutableUnderAutofill: true,
};

/**
 * LOCKED: QR *placement zone* — bottom-right, immediately above the brand bar.
 * The zone/position is template-owned and never moved by Autofill.
 *
 * CONTROLLED VARIABLE (separate): the QR *image content* and destination URL
 * are Autofill-controlled — see VARIABLE_DATASET_FIELD_ROLES.qrCode.
 */
export const QR_PLACEMENT = {
  region: "bottom_right" as const,
  relativeTo: "above_brand_bar" as const,
  neverInsideBrandBar: true,
  neverOverlapLogos: true,
  quietZoneRequired: true,
  generateFromDestinationUrl: true,
};

/**
 * Dataset field names for locked brand *structure* (logos / brand bar only).
 * If these keys appear in a live dataset, Autofill must NEVER populate them
 * from Google Form values or QR preprocessing (logos stay template-owned).
 *
 * Do NOT put QR_CODE here. QR_CODE is a controlled variable image field:
 * - blocked from arbitrary Google Form mapping
 * - MUST be populated by QR preprocessing with a generated Canva asset_id
 *
 * Replace with real Canva dataset keys only after inspecting the live template.
 * Empty strings mean "not yet bound to a live dataset key".
 */
export const LOCKED_BRAND_DATASET_FIELDS = {
  /** Optional image field for SJJCC logo if exposed in dataset (prefer locked in template). */
  sjjccLogo: "",
  /** Optional image field for UJA logo if exposed in dataset. */
  ujaLogo: "",
  /** Optional combined lockup field if exposed in dataset. */
  brandLockup: "",
  /** Optional brand-bar image/text field if exposed in dataset. */
  brandBar: "",
} as const;

/**
 * CONTROLLED VARIABLE CONTENT — Autofill-populated roles.
 * `canvaField` must be set from the live dataset — leave empty until discovery
 * (placeholder names below are for local tests only; never guess production keys).
 *
 * QR_CODE is intentionally a variable image role (not locked structure):
 * the workflow generates a QR PNG from the registration/destination URL,
 * uploads it to Canva, and writes { type: "image", asset_id } into this field.
 * Form→Canva mapping must not target it; QR preprocessing must.
 */
export const VARIABLE_DATASET_FIELD_ROLES = {
  headline: { canvaField: "HEADLINE", type: "text" as const },
  description: { canvaField: "DESCRIPTION", type: "text" as const },
  date: { canvaField: "DATE", type: "text" as const },
  time: { canvaField: "TIME", type: "text" as const },
  location: { canvaField: "LOCATION", type: "text" as const },
  /** Destination URL text field (optional companion to QR image). */
  destinationUrl: { canvaField: "URL", type: "text" as const },
  /**
   * QR image field (CONTROLLED VARIABLE content).
   * Placement zone is locked in the Brand Template (bottom-right above bar);
   * this field only receives the generated QR asset_id from preprocessing.
   */
  qrCode: { canvaField: "QR_CODE", type: "image" as const },
} as const;

/** Google Form question that supplies the destination URL for QR generation. */
export const DESTINATION_URL_FORM_FIELD = "Registration URL";

/**
 * Structural checklist reported by brand validation / discovery.
 * Layout positions cannot be verified via Autofill dataset alone.
 */
export const REQUIRED_TEMPLATE_STRUCTURE = [
  "bottom_brand_bar",
  "sjjcc_logo",
  "uja_logo",
  "sjjcc_before_uja",
  "qr_zone_bottom_right_above_brand_bar",
] as const;

export type RequiredTemplateStructureItem =
  (typeof REQUIRED_TEMPLATE_STRUCTURE)[number];
