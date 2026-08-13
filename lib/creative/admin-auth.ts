import "server-only";

/**
 * Admin/operator routes (shell generation, etc.).
 * Uses CREATIVE_ENGINE_ADMIN_SECRET — does not alter Google Form webhook secret.
 */
export function assertAdminSecret(request: Request): void {
  const expected = process.env.CREATIVE_ENGINE_ADMIN_SECRET?.trim();
  if (!expected) {
    const error = new Error(
      "CREATIVE_ENGINE_ADMIN_SECRET is not configured. Shell generation is disabled until an operator sets this env var.",
    );
    (error as Error & { code: string }).code = "ADMIN_SECRET_MISSING";
    throw error;
  }

  const provided =
    request.headers.get("x-admin-secret") ??
    request.headers.get("X-Admin-Secret") ??
    "";

  if (!timingSafeEqual(provided, expected)) {
    const error = new Error("Invalid admin secret");
    (error as Error & { code: string }).code = "ADMIN_UNAUTHORIZED";
    throw error;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
