import "server-only";

/**
 * Admin/operator routes (shell generation, etc.).
 *
 * Resolution order for X-Admin-Secret:
 * 1. CREATIVE_ENGINE_ADMIN_SECRET (if configured)
 * 2. otherwise GOOGLE_FORM_WEBHOOK_SECRET
 *
 * Does not change Google Form webhook behavior or expose secret values.
 */
export function resolveAdminSecret(): string | null {
  return (
    process.env.CREATIVE_ENGINE_ADMIN_SECRET?.trim() ||
    process.env.GOOGLE_FORM_WEBHOOK_SECRET?.trim() ||
    null
  );
}

export function assertAdminSecret(request: Request): void {
  const expected = resolveAdminSecret();
  if (!expected) {
    const error = new Error(
      "Admin secret is not configured. Set CREATIVE_ENGINE_ADMIN_SECRET or GOOGLE_FORM_WEBHOOK_SECRET.",
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
