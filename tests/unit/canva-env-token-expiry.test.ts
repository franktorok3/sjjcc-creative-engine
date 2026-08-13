import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readJwtExpiryMs,
  tokensFromEnv,
} from "@/lib/canva/token-store";

function makeJwt(expSeconds: number): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString(
    "base64url",
  );
  return `${header}.${payload}.sig`;
}

describe("Canva env token expiry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("readJwtExpiryMs reads exp without verifying the signature", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    expect(readJwtExpiryMs(makeJwt(exp))).toBe(exp * 1000);
    expect(readJwtExpiryMs("not-a-jwt")).toBeNull();
  });

  it("tokensFromEnv derives expiresAt from JWT exp (not Date.now()-1)", () => {
    const exp = Math.floor(Date.now() / 1000) + 10_000;
    const tokens = tokensFromEnv({
      CANVA_ACCESS_TOKEN: makeJwt(exp),
      CANVA_REFRESH_TOKEN: "refresh-placeholder",
    });
    expect(tokens).not.toBeNull();
    expect(tokens!.source).toBe("env");
    expect(tokens!.expiresAt).toBe(exp * 1000);
    expect(tokens!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("fresh env JWT does not trigger refresh", async () => {
    const exp = Math.floor(Date.now() / 1000) + 10_000;
    vi.stubEnv("CANVA_ACCESS_TOKEN", makeJwt(exp));
    vi.stubEnv("CANVA_REFRESH_TOKEN", "refresh-placeholder");
    vi.stubEnv("CANVA_CLIENT_ID", "client");
    vi.stubEnv("CANVA_CLIENT_SECRET", "secret");
    vi.stubEnv("CANVA_REDIRECT_URI", "https://example.com/callback");
    vi.resetModules();

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const oauth = await import("@/lib/canva/oauth");
    oauth.resetCanvaRefreshGuardForTests();

    const before = oauth.getCanvaRefreshAttemptCountForTests();
    const access = await oauth.getValidCanvaAccessToken();
    expect(access).toBe(process.env.CANVA_ACCESS_TOKEN);
    expect(oauth.getCanvaRefreshAttemptCountForTests()).toBe(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("expired env JWT returns CANVA_REAUTH_REQUIRED without refresh", async () => {
    const exp = Math.floor(Date.now() / 1000) - 120;
    vi.stubEnv("CANVA_ACCESS_TOKEN", makeJwt(exp));
    vi.stubEnv("CANVA_REFRESH_TOKEN", "refresh-placeholder");
    vi.stubEnv("CANVA_CLIENT_ID", "client");
    vi.stubEnv("CANVA_CLIENT_SECRET", "secret");
    vi.stubEnv("CANVA_REDIRECT_URI", "https://example.com/callback");
    vi.resetModules();

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const oauth = await import("@/lib/canva/oauth");
    oauth.resetCanvaRefreshGuardForTests();

    await expect(oauth.getValidCanvaAccessToken()).rejects.toMatchObject({
      code: "CANVA_REAUTH_REQUIRED",
    });
    expect(oauth.getCanvaRefreshAttemptCountForTests()).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("multiple concurrent store refreshes share a single flight", async () => {
    vi.stubEnv("CANVA_CLIENT_ID", "client");
    vi.stubEnv("CANVA_CLIENT_SECRET", "secret");
    vi.stubEnv("CANVA_REDIRECT_URI", "https://example.com/callback");
    // No env tokens — force store path via mocked loadCanvaTokens
    vi.resetModules();

    vi.doMock("@/lib/canva/token-store", async () => {
      const actual =
        await vi.importActual<typeof import("@/lib/canva/token-store")>(
          "@/lib/canva/token-store",
        );
      return {
        ...actual,
        loadCanvaTokens: vi.fn(async () => ({
          accessToken: "stale-access",
          refreshToken: "store-refresh",
          expiresAt: Date.now() - 1_000,
          source: "store" as const,
          tokenType: "Bearer",
        })),
        saveCanvaTokens: vi.fn(async () => undefined),
      };
    });

    let resolveFetch!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(fetchPromise);

    const oauth = await import("@/lib/canva/oauth");
    oauth.resetCanvaRefreshGuardForTests();

    const p1 = oauth.getValidCanvaAccessToken();
    const p2 = oauth.getValidCanvaAccessToken();
    const p3 = oauth.getValidCanvaAccessToken();

    // Allow microtasks to start the single flight
    await Promise.resolve();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    resolveFetch(
      new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 14400,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const tokens = await Promise.all([p1, p2, p3]);
    expect(tokens).toEqual(["new-access", "new-access", "new-access"]);
    expect(oauth.getCanvaRefreshAttemptCountForTests()).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
