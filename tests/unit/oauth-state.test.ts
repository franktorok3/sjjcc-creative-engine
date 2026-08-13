import { afterEach, describe, expect, it } from "vitest";
import {
  createEncryptedOauthState,
  OauthStateError,
  parseEncryptedOauthState,
} from "@/lib/creative/oauth-state";
import {
  attachOptionalTokenExport,
  isOauthTokenExportEnabled,
  OAUTH_TOKEN_EXPORT_WARNING,
  oauthTokenExportHeaders,
  withOauthCallbackHeaders,
} from "@/lib/creative/oauth-export";

const canvaEnv = {
  CANVA_CLIENT_SECRET: "test-canva-client-secret-for-unit-tests-only",
};

const basecampEnv = {
  BASECAMP_CLIENT_SECRET: "test-basecamp-client-secret-for-unit-tests-only",
};

const originalExportFlag = process.env.OAUTH_EXPORT_TOKENS;

afterEach(() => {
  if (originalExportFlag === undefined) {
    delete process.env.OAUTH_EXPORT_TOKENS;
  } else {
    process.env.OAUTH_EXPORT_TOKENS = originalExportFlag;
  }
});

describe("encrypted Canva OAuth state", () => {
  it("round-trips provider, nonce, expiry, and PKCE codeVerifier", () => {
    const verifier = "canva-pkce-verifier-value-abc123";
    const state = createEncryptedOauthState({
      provider: "canva",
      codeVerifier: verifier,
      env: canvaEnv,
    });
    const parsed = parseEncryptedOauthState(state, {
      expectedProvider: "canva",
      env: canvaEnv,
    });

    expect(parsed.provider).toBe("canva");
    expect(parsed.codeVerifier).toBe(verifier);
    expect(parsed.nonce).toBeTruthy();
    expect(parsed.expiresAt).toBeGreaterThan(Date.now());
  });

  it("does not visibly contain the PKCE codeVerifier in the state string", () => {
    const verifier = "VISIBLE_VERIFIER_SHOULD_NOT_APPEAR_IN_STATE";
    const state = createEncryptedOauthState({
      provider: "canva",
      codeVerifier: verifier,
      env: canvaEnv,
    });

    expect(state.startsWith("v1.")).toBe(true);
    expect(state).not.toContain(verifier);
    expect(state.toLowerCase()).not.toContain("codeverifier");
    // Readable JSON field names must not appear in the opaque blob.
    expect(state).not.toContain('"provider"');
    expect(state).not.toContain('"codeVerifier"');
  });
});

describe("encrypted Basecamp OAuth state", () => {
  it("round-trips provider, nonce, and expiry without a codeVerifier", () => {
    const state = createEncryptedOauthState({
      provider: "basecamp",
      env: basecampEnv,
    });
    const parsed = parseEncryptedOauthState(state, {
      expectedProvider: "basecamp",
      env: basecampEnv,
    });

    expect(parsed.provider).toBe("basecamp");
    expect(parsed.codeVerifier).toBeUndefined();
    expect(parsed.nonce).toBeTruthy();
    expect(parsed.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe("encrypted OAuth state validation", () => {
  it("rejects tampered ciphertext / auth tag", () => {
    const state = createEncryptedOauthState({
      provider: "canva",
      codeVerifier: "verifier",
      env: canvaEnv,
    });
    const [version, blob] = state.split(".");
    const buf = Buffer.from(blob, "base64url");
    buf[buf.length - 1] ^= 0xff;
    const tampered = `${version}.${buf.toString("base64url")}`;

    expect(() =>
      parseEncryptedOauthState(tampered, {
        expectedProvider: "canva",
        env: canvaEnv,
      }),
    ).toThrow(OauthStateError);
    expect(() =>
      parseEncryptedOauthState(tampered, {
        expectedProvider: "canva",
        env: canvaEnv,
      }),
    ).toThrow(/tampered|not decryptable/i);
  });

  it("rejects expired state", () => {
    const state = createEncryptedOauthState({
      provider: "basecamp",
      ttlMs: -1_000,
      env: basecampEnv,
    });
    expect(() =>
      parseEncryptedOauthState(state, {
        expectedProvider: "basecamp",
        env: basecampEnv,
      }),
    ).toThrow(/expired/i);
  });

  it("rejects provider mismatch (wrong decryption key / expected provider)", () => {
    const state = createEncryptedOauthState({
      provider: "canva",
      codeVerifier: "verifier",
      env: canvaEnv,
    });
    expect(() =>
      parseEncryptedOauthState(state, {
        expectedProvider: "basecamp",
        env: { ...canvaEnv, ...basecampEnv },
      }),
    ).toThrow(/tampered|not decryptable|mismatch/i);
  });

  it("requires the provider client secret to create state", () => {
    expect(() =>
      createEncryptedOauthState({
        provider: "canva",
        codeVerifier: "x",
        env: {},
      }),
    ).toThrow(/CANVA_CLIENT_SECRET/);
  });
});

describe("OAUTH_EXPORT_TOKENS temporary token export", () => {
  it("treats trimmed lowercase 1/true/yes/on as enabled", () => {
    for (const value of ["1", "true", "yes", "on", " TRUE ", "Yes", "On"]) {
      expect(isOauthTokenExportEnabled({ OAUTH_EXPORT_TOKENS: value })).toBe(
        true,
      );
    }
  });

  it("treats missing and non-accepted values as disabled", () => {
    expect(isOauthTokenExportEnabled({})).toBe(false);
    expect(isOauthTokenExportEnabled({ OAUTH_EXPORT_TOKENS: undefined })).toBe(
      false,
    );
    expect(isOauthTokenExportEnabled({ OAUTH_EXPORT_TOKENS: "" })).toBe(false);
    expect(isOauthTokenExportEnabled({ OAUTH_EXPORT_TOKENS: "0" })).toBe(false);
    expect(isOauthTokenExportEnabled({ OAUTH_EXPORT_TOKENS: "false" })).toBe(
      false,
    );
    expect(isOauthTokenExportEnabled({ OAUTH_EXPORT_TOKENS: "off" })).toBe(
      false,
    );
    expect(isOauthTokenExportEnabled({ OAUTH_EXPORT_TOKENS: "enabled" })).toBe(
      false,
    );
  });

  it("omits vercelEnv tokens when export is disabled", () => {
    const body = attachOptionalTokenExport(
      { success: true },
      {
        CANVA_ACCESS_TOKEN: "access-secret",
        CANVA_REFRESH_TOKEN: "refresh-secret",
      },
      { OAUTH_EXPORT_TOKENS: "0" },
    );

    expect(body.tokenExportEnabled).toBe(false);
    expect(body.tokenExport).toBe("disabled");
    expect(body.vercelEnv).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("access-secret");
    expect(JSON.stringify(body)).not.toContain("refresh-secret");
  });

  it("includes vercelEnv tokens when OAUTH_EXPORT_TOKENS is accepted", () => {
    for (const flag of ["1", "true", "yes", "on"]) {
      const body = attachOptionalTokenExport(
        { success: true },
        {
          BASECAMP_ACCESS_TOKEN: "bc-access",
          BASECAMP_REFRESH_TOKEN: "bc-refresh",
          BASECAMP_ACCOUNT_ID: "123",
        },
        { OAUTH_EXPORT_TOKENS: flag },
      );

      expect(body.tokenExportEnabled).toBe(true);
      expect(body.tokenExport).toBe("enabled");
      expect(body.warning).toBe(OAUTH_TOKEN_EXPORT_WARNING);
      expect(body.vercelEnv).toEqual({
        BASECAMP_ACCESS_TOKEN: "bc-access",
        BASECAMP_REFRESH_TOKEN: "bc-refresh",
        BASECAMP_ACCOUNT_ID: "123",
      });
    }
  });

  it("adds no-store headers when tokens are exported", () => {
    const headers = withOauthCallbackHeaders(true);
    expect(headers).toMatchObject(oauthTokenExportHeaders());
    expect(headers).toMatchObject({
      "Cache-Control": "no-store, private",
      Pragma: "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
  });

  it("does not add no-store export headers when export is off", () => {
    expect(withOauthCallbackHeaders(false)).toEqual({});
  });
});
