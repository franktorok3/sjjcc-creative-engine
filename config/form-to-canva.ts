/**
 * Explicit Google Form question → Canva Brand Template autofill field map.
 *
 * Brand Kit: AI Marketing 2.0 (see config/canva-brand.ts).
 *
 * IMPORTANT:
 * Do not guess Canva field names. First call:
 *   GET /api/test/canva/template-dataset
 * and replace Canva-side values with the real dataset keys.
 *
 * Locked brand structure (brand bar, SJJCC/UJA logos) is template-owned and
 * must NOT appear in this map. QR image content is generated from the
 * destination URL and bound in code — do not map logos or brand-bar fields here.
 *
 * Unmapped Google Form fields are ignored.
 * Mapped Canva fields that are missing from the live dataset cause a clear error.
 */

/** Google Form question title → Canva autofill field name (VARIABLE content only). */
export const FORM_TO_CANVA_FIELD_MAP: Record<string, string> = {
  // Placeholders — replace after inspecting the AI Marketing 2.0 template dataset:
  "What is the name of the promotion?": "HEADLINE",
  "Promotion description": "DESCRIPTION",
  "Event date": "DATE",
  "Event time": "TIME",
  Location: "LOCATION",
  "Registration URL": "URL",
};

/**
 * Google Form fields that must be present (non-empty) for the workflow to proceed.
 * Update to match your real Form question titles.
 */
export const REQUIRED_FORM_FIELDS: string[] = [
  "What is the name of the promotion?",
];

/** Which Form question supplies the promotion/program name for Basecamp subject. */
export const PROMOTION_NAME_FORM_FIELD =
  "What is the name of the promotion?";
