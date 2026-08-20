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

  it("saveCanvaTokens does not throw when VERCEL=1 without KV", async () => {
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

  it("saveCanvaTokens writes encrypted payload to KV on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("KV_REST_API_URL", "https://example-kv.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-token");
    vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", "test-encryption-key");
    vi.resetModules();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: "OK" }), { status: 200 }),
    );

    const { saveCanvaTokens } = await import("@/lib/canva/token-store");
    await saveCanvaTokens({
      accessToken: "test-access",
      refreshToken: "test-refresh",
      expiresAt: Date.now() + 60_000,
      tokenType: "Bearer",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(String(init?.body)) as unknown[];
    expect(body[0]).toBe("SET");
    expect(body[1]).toBe("sjjcc:canva:oauth-tokens");
    expect(typeof body[2]).toBe("string");
    expect(String(body[2])).not.toContain("test-access");
    expect(String(body[2])).not.toContain("test-refresh");
  });
});
