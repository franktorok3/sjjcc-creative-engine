import "server-only";

/** Creative PoC env helpers (optional Canva/Basecamp vars are read lazily). */

export function getWebhookSecret(): string {
  return process.env.GOOGLE_FORM_WEBHOOK_SECRET?.trim() ?? "";
}

export function assertWebhookConfigured(): string {
  const secret = getWebhookSecret();
  if (!secret) {
    throw new Error(
      "GOOGLE_FORM_WEBHOOK_SECRET is not configured. Set it in the environment and in Apps Script Script Properties.",
    );
  }
  return secret;
}

export function getAppHost(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_HOST?.trim() ||
    "http://localhost:3000"
  );
}
