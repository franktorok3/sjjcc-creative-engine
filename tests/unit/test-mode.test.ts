import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_FORM_PROCESSING_DISABLED_RESPONSE,
  isBasecampPostingEnabled,
  isCreativeEngineTestMode,
  isGoogleFormProcessingEnabled,
} from "@/lib/creative/test-mode";
import { CREATIVE_TEST_FIXTURE_LIST } from "@/config/creative-test-fixtures";
import { portalCreativeRequestSchema } from "@/lib/creative/creative-request";
import { logCreativeStage } from "@/lib/creative/workflow-stage-log";

describe("test-mode flags", () => {
  const prevForm = process.env.CREATIVE_ENGINE_GOOGLE_FORM_PROCESSING_ENABLED;
  const prevBasecamp = process.env.CREATIVE_ENGINE_BASECAMP_POSTING_ENABLED;

  afterEach(() => {
    if (prevForm === undefined) {
      delete process.env.CREATIVE_ENGINE_GOOGLE_FORM_PROCESSING_ENABLED;
    } else {
      process.env.CREATIVE_ENGINE_GOOGLE_FORM_PROCESSING_ENABLED = prevForm;
    }
    if (prevBasecamp === undefined) {
      delete process.env.CREATIVE_ENGINE_BASECAMP_POSTING_ENABLED;
    } else {
      process.env.CREATIVE_ENGINE_BASECAMP_POSTING_ENABLED = prevBasecamp;
    }
  });

  it("defaults Google Form processing to disabled", () => {
    delete process.env.CREATIVE_ENGINE_GOOGLE_FORM_PROCESSING_ENABLED;
    expect(isGoogleFormProcessingEnabled()).toBe(false);
    expect(isCreativeEngineTestMode()).toBe(true);
  });

  it("enables Google Form processing only when explicitly true", () => {
    process.env.CREATIVE_ENGINE_GOOGLE_FORM_PROCESSING_ENABLED = "true";
    expect(isGoogleFormProcessingEnabled()).toBe(true);
    expect(isCreativeEngineTestMode()).toBe(false);
  });

  it("defaults Basecamp posting to enabled for portal tests", () => {
    delete process.env.CREATIVE_ENGINE_BASECAMP_POSTING_ENABLED;
    expect(isBasecampPostingEnabled()).toBe(true);
  });

  it("can disable Basecamp posting", () => {
    process.env.CREATIVE_ENGINE_BASECAMP_POSTING_ENABLED = "false";
    expect(isBasecampPostingEnabled()).toBe(false);
  });

  it("exposes a clear disabled response shape", () => {
    expect(GOOGLE_FORM_PROCESSING_DISABLED_RESPONSE).toMatchObject({
      success: true,
      source: "google_form",
      processing: "disabled",
    });
  });
});

describe("creative test fixtures", () => {
  it("defines flyer, handout, and social fixtures with portal source", () => {
    expect(CREATIVE_TEST_FIXTURE_LIST).toHaveLength(3);
    for (const fixture of CREATIVE_TEST_FIXTURE_LIST) {
      const parsed = portalCreativeRequestSchema.safeParse(fixture.request);
      expect(parsed.success, fixture.id).toBe(true);
      expect(fixture.request.source).toBe("creative_engine_portal");
      expect(fixture.request.registrationUrl).toContain(
        "sjjcc-creative-engine-test",
      );
    }
  });

  it("uses the three required asset families", () => {
    expect(CREATIVE_TEST_FIXTURE_LIST.map((f) => f.request.assetType)).toEqual([
      "flyer_full",
      "handout_half",
      "social_portrait",
    ]);
  });
});

describe("workflow stage logging", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("never logs secret or contact fields", () => {
    logCreativeStage("request_validated", {
      requestId: "req_1",
      accessToken: "SECRET",
      authorization: "Bearer SECRET",
      contactEmail: "person@example.com",
      source: "creative_engine_portal",
    });
    const payload = JSON.parse(String(infoSpy.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >;
    expect(payload.stage).toBe("request_validated");
    expect(payload.source).toBe("creative_engine_portal");
    expect(payload.accessToken).toBeUndefined();
    expect(payload.authorization).toBeUndefined();
    expect(payload.contactEmail).toBeUndefined();
  });
});
