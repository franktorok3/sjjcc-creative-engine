import { describe, expect, it } from "vitest";
import {
  createSignedOauthState,
  parseSignedOauthState,
} from "@/lib/creative/oauth-state";

describe("signed oauth state", () => {
  it("round-trips a PKCE verifier", () => {
    const state = createSignedOauthState({ codeVerifier: "verifier-123" });
    const parsed = parseSignedOauthState(state);
    expect(parsed.v).toBe("verifier-123");
    expect(parsed.n).toBeTruthy();
    expect(parsed.e).toBeGreaterThan(Date.now());
  });

  it("rejects tampered signatures", () => {
    const state = createSignedOauthState();
    const [payload] = state.split(".");
    expect(() => parseSignedOauthState(`${payload}.tampered`)).toThrow(
      /signature invalid/i,
    );
  });

  it("rejects expired state", () => {
    const state = createSignedOauthState({ ttlMs: -1000 });
    expect(() => parseSignedOauthState(state)).toThrow(/expired/i);
  });
});
