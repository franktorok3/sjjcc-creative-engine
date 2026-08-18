/**
 * Sanitized stage logging for the Creative Engine workflow.
 * Never log tokens, secrets, Authorization headers, or full form payloads.
 */

export type CreativeWorkflowStage =
  | "request_validated"
  | "request_classified"
  | "template_selected"
  | "dataset_validated"
  | "qr_generated"
  | "canva_autofill_started"
  | "canva_autofill_complete"
  | "basecamp_post_started"
  | "basecamp_post_complete"
  | "workflow_failed"
  | "google_form_processing_disabled"
  | "basecamp_posting_skipped";

const BLOCKED_KEY_PARTS = [
  "token",
  "secret",
  "authorization",
  "password",
  "bearer",
  "payload",
  "contactemail",
  "contactphone",
  "contactname",
];

export function logCreativeStage(
  stage: CreativeWorkflowStage,
  detail?: Record<string, string | number | boolean | null | undefined>,
): void {
  const safe: Record<string, string | number | boolean | null> = {};
  if (detail) {
    for (const [key, value] of Object.entries(detail)) {
      const compact = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (BLOCKED_KEY_PARTS.some((part) => compact.includes(part))) {
        continue;
      }
      if (value === undefined) continue;
      safe[key] = value;
    }
  }
  console.info(
    JSON.stringify({
      scope: "creative_workflow",
      stage,
      ...safe,
      at: new Date().toISOString(),
    }),
  );
}
