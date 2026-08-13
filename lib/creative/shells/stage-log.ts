/**
 * Sanitized stage logging for Creative Engine shell generation.
 * Never log tokens, secrets, or Authorization headers.
 */

export type ShellGenStage =
  | "auth_validated"
  | "pptx_generation_started"
  | "pptx_generation_complete"
  | "canva_import_started"
  | "canva_import_job_created"
  | "canva_import_polling"
  | "canva_import_complete"
  | "canva_import_failed"
  | "response_returned";

export function logShellStage(
  stage: ShellGenStage,
  detail?: Record<string, string | number | boolean | null | undefined>,
): void {
  const safe: Record<string, string | number | boolean | null> = {};
  if (detail) {
    for (const [key, value] of Object.entries(detail)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("token") ||
        lower.includes("secret") ||
        lower.includes("authorization") ||
        lower.includes("password") ||
        lower.includes("bearer")
      ) {
        continue;
      }
      if (value === undefined) continue;
      safe[key] = value;
    }
  }
  console.info(
    JSON.stringify({
      scope: "shell_generation",
      stage,
      ...safe,
      at: new Date().toISOString(),
    }),
  );
}
