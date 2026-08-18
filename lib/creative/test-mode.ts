import "server-only";

/**
 * Creative Engine test-only operating mode.
 *
 * Defaults keep the live Google Form from triggering Canva/Basecamp until
 * shells are approved and controlled portal tests pass.
 *
 * Never log or return secret values from these helpers.
 */

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return defaultValue;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
    return true;
  }
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return false;
  }
  return defaultValue;
}

/**
 * When false (default): accept/validate Google Form webhooks but do not
 * run Canva generation or Basecamp posting.
 */
export function isGoogleFormProcessingEnabled(): boolean {
  return envFlag("CREATIVE_ENGINE_GOOGLE_FORM_PROCESSING_ENABLED", false);
}

/**
 * When false: skip Basecamp after a successful Canva design.
 * Default true for native portal tests. Ignored for Google Form while
 * Google Form processing remains disabled (those requests never reach posting).
 */
export function isBasecampPostingEnabled(): boolean {
  return envFlag("CREATIVE_ENGINE_BASECAMP_POSTING_ENABLED", true);
}

/** True while Google Form live processing is disabled (test operating mode). */
export function isCreativeEngineTestMode(): boolean {
  return !isGoogleFormProcessingEnabled();
}

export const GOOGLE_FORM_PROCESSING_DISABLED_RESPONSE = {
  success: true as const,
  source: "google_form" as const,
  processing: "disabled" as const,
  message:
    "Google Form processing is currently disabled while the Creative Engine is in test mode.",
};
