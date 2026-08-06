/**
 * Explicit Google Form question → Canva Brand Template autofill field map.
 *
 * IMPORTANT:
 * Do not guess Canva field names. First call:
 *   GET /api/test/canva/template-dataset
 * and replace the Canva-side values below with the real dataset keys.
 *
 * Unmapped Google Form fields are ignored.
 * Mapped Canva fields that are missing from the live dataset cause a clear error.
 */

/** Google Form question title → Canva autofill field name */
export const FORM_TO_CANVA_FIELD_MAP: Record<string, string> = {
  // Example placeholders — replace after inspecting the template dataset:
  "What is the name of the promotion?": "HEADLINE",
  "Promotion description": "DESCRIPTION",
  "Event date": "DATE",
  "Event time": "TIME",
  "Location": "LOCATION",
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
