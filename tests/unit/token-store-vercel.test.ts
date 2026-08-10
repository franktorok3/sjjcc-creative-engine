import { afterEach, describe, expect, it, vi } from "vitest";

describe("token stores on Vercel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("saveBasecampTokens does not throw when VERCEL=1", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.resetModules();
    const { saveBasecampTokens } = await import("@/lib/basecamp/token-store");
    await expect(
      saveBasecampTokens({
        accessToken: "test-access",
        refreshToken: "test-refresh",
        expiresAt: Date.now() + 60_000,
        tokenType: "Bearer",
      }),
    ).resolves.toBeUndefined();
  });

  it("saveCanvaTokens does not throw when VERCEL=1", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.resetModules();
    const { saveCanvaTokens } = await import("@/lib/canva/token-store");
    await expect(
      saveCanvaTokens({
        accessToken: "test-access",
        refreshToken: "test-refresh",
        expiresAt: Date.now() + 60_000,
        tokenType: "Bearer",
      }),
    ).resolves.toBeUndefined();
  });
});
