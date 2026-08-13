import { describe, expect, it } from "vitest";
import { resolveAdminSecret } from "@/lib/creative/admin-auth";

describe("admin secret resolution", () => {
  it("prefers CREATIVE_ENGINE_ADMIN_SECRET when set", () => {
    const prevAdmin = process.env.CREATIVE_ENGINE_ADMIN_SECRET;
    const prevWebhook = process.env.GOOGLE_FORM_WEBHOOK_SECRET;
    process.env.CREATIVE_ENGINE_ADMIN_SECRET = "admin-secret-value";
    process.env.GOOGLE_FORM_WEBHOOK_SECRET = "webhook-secret-value";
    expect(resolveAdminSecret()).toBe("admin-secret-value");
    process.env.CREATIVE_ENGINE_ADMIN_SECRET = prevAdmin;
    process.env.GOOGLE_FORM_WEBHOOK_SECRET = prevWebhook;
  });

  it("falls back to GOOGLE_FORM_WEBHOOK_SECRET", () => {
    const prevAdmin = process.env.CREATIVE_ENGINE_ADMIN_SECRET;
    const prevWebhook = process.env.GOOGLE_FORM_WEBHOOK_SECRET;
    delete process.env.CREATIVE_ENGINE_ADMIN_SECRET;
    process.env.GOOGLE_FORM_WEBHOOK_SECRET = "webhook-secret-value";
    expect(resolveAdminSecret()).toBe("webhook-secret-value");
    process.env.CREATIVE_ENGINE_ADMIN_SECRET = prevAdmin;
    process.env.GOOGLE_FORM_WEBHOOK_SECRET = prevWebhook;
  });
});
