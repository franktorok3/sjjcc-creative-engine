import { afterEach, describe, expect, it, vi } from "vitest";
import { rm } from "fs/promises";
import path from "path";
import {
  canPersistCanvaTokenRotation,
  readJwtExpiryMs,
  tokensFromEnv,
} from "@/lib/canva/token-store";

const LOCAL_TOKEN_FILE = path.join(
  process.cwd(),
  ".data",
  "canva-tokens.enc",
);

async function clearLocalCanvaTokenFile(): Promise<void> {
  try {
    await rm(LOCAL_TOKEN_FILE, { force: true });
  } catch {
    // ignore
  }
}

function makeJwt(expSeconds: number): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" }),
    "utf8",
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString(
    "base64url",
  );
  return `${header}.${payload}.sig`;
}

describe("Canva env token expiry + auto-renew", () => {
  afterEach(async () => {
    await clearLocalCanvaTokenFile();
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

  it("canPersistCanvaTokenRotation is false on Vercel without KV", () => {
    expect(
      canPersistCanvaTokenRotation({
        VERCEL: "1",
      }),
    ).toBe(false);
  });

  it("canPersistCanvaTokenRotation is true when KV env is present", () => {
    expect(
      canPersistCanvaTokenRotation({
        VERCEL: "1",
        KV_REST_API_URL: "https://example-kv.upstash.io",
        KV_REST_API_TOKEN: "test-token",
      }),
    ).toBe(true);
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

  it("expired env JWT on Vercel without KV returns CANVA_REAUTH_REQUIRED", async () => {
    const exp = Math.floor(Date.now() / 1000) - 120;
    vi.stubEnv("VERCEL", "1");
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

  it("expired env JWT auto-refreshes when durable store is available", async () => {
    const exp = Math.floor(Date.now() / 1000) - 120;
    vi.stubEnv("CANVA_ACCESS_TOKEN", makeJwt(exp));
    vi.stubEnv("CANVA_REFRESH_TOKEN", "refresh-placeholder");
    vi.stubEnv("CANVA_CLIENT_ID", "client");
    vi.stubEnv("CANVA_CLIENT_SECRET", "secret");
    vi.stubEnv("CANVA_REDIRECT_URI", "https://example.com/callback");
    // Not on Vercel → local filesystem persistence allowed
    vi.stubEnv("VERCEL", "");
    vi.resetModules();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
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

    const oauth = await import("@/lib/canva/oauth");
    oauth.resetCanvaRefreshGuardForTests();

    const access = await oauth.getValidCanvaAccessToken();
    expect(access).toBe("new-access");
    expect(oauth.getCanvaRefreshAttemptCountForTests()).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("expired tokens auto-refresh via KV on Vercel", async () => {
    const exp = Math.floor(Date.now() / 1000) - 120;
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("KV_REST_API_URL", "https://example-kv.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-token");
    vi.stubEnv("CANVA_ACCESS_TOKEN", makeJwt(exp));
    vi.stubEnv("CANVA_REFRESH_TOKEN", "refresh-placeholder");
    vi.stubEnv("CANVA_CLIENT_ID", "client");
    vi.stubEnv("CANVA_CLIENT_SECRET", "secret");
    vi.stubEnv("CANVA_REDIRECT_URI", "https://example.com/callback");
    vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", "test-encryption-key");
    vi.resetModules();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        const url = String(input);
        if (url.includes("example-kv.upstash.io")) {
          const body = typeof init?.body === "string" ? init.body : "";
          if (body.includes('"GET"')) {
            return new Response(JSON.stringify({ result: null }), {
              status: 200,
            });
          }
          // SET lock / SET tokens / DEL unlock
          return new Response(JSON.stringify({ result: "OK" }), {
            status: 200,
          });
        }
        // Canva token endpoint
        return new Response(
          JSON.stringify({
            access_token: "kv-new-access",
            refresh_token: "kv-new-refresh",
            expires_in: 14400,
            token_type: "Bearer",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );

    const oauth = await import("@/lib/canva/oauth");
    oauth.resetCanvaRefreshGuardForTests();

    const access = await oauth.getValidCanvaAccessToken();
    expect(access).toBe("kv-new-access");
    expect(oauth.getCanvaRefreshAttemptCountForTests()).toBe(1);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("multiple concurrent store refreshes share a single flight", async () => {
    const exp = Math.floor(Date.now() / 1000) - 120;
    vi.stubEnv("CANVA_ACCESS_TOKEN", makeJwt(exp));
    vi.stubEnv("CANVA_REFRESH_TOKEN", "store-refresh");
    vi.stubEnv("CANVA_CLIENT_ID", "client");
    vi.stubEnv("CANVA_CLIENT_SECRET", "secret");
    vi.stubEnv("CANVA_REDIRECT_URI", "https://example.com/callback");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", "test-encryption-key");
    vi.resetModules();

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

    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

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
