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
 * Fixed brand-bar layout contract (template-owned; not Autofill content).
 * Enforced in Canva by publishing a Brand Template that embeds this chrome.
 * Our API layer refuses to overwrite reserved logo/bar fields and fails if
 * required structural dataset roles are missing once configured.
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
 * QR placement contract: bottom-right content area, ABOVE the brand bar.
 * QR must never sit inside the brand bar or overlap logos.
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
 * Dataset field names reserved for locked brand structure.
 * If these keys appear in a live dataset, Autofill must NEVER populate them
 * from Google Form values (logos stay template-owned).
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
 * Required Autofill roles once the production template is bound.
 * `canvaField` must be set from the live dataset — leave empty until discovery.
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
   * QR image field — MUST be an image autofill slot placed bottom-right
   * above the brand bar in the Brand Template.
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
