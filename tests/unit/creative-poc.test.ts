import { afterEach, describe, expect, it } from "vitest";
import {
  assertRequiredFormFields,
  flattenNamedValues,
  getPromotionName,
  mapFormFieldsToCanvaData,
  MappingError,
} from "@/lib/creative/mapping";
import {
  buildIdempotencyKey,
  clearIdempotencyStore,
  getIdempotentResult,
  setIdempotentResult,
} from "@/lib/creative/idempotency";
import { validateAutofillAgainstDataset } from "@/lib/canva/autofill";
import { buildCreativeDraftHtml } from "@/lib/basecamp/client";
import type { CanvaBrandTemplateDataset } from "@/lib/canva/types";

afterEach(() => {
  clearIdempotencyStore();
});

describe("flattenNamedValues", () => {
  it("flattens Google Sheets namedValues arrays", () => {
    expect(
      flattenNamedValues({
        "What is the name of the promotion?": ["Summer Splash"],
        Location: ["A", "B"],
        Empty: [],
      }),
    ).toEqual({
      "What is the name of the promotion?": "Summer Splash",
      Location: "A, B",
      Empty: "",
    });
  });
});

describe("required form fields", () => {
  it("fails when required fields are missing", () => {
    expect(() => assertRequiredFormFields({ Location: "Lobby" })).toThrow(
      MappingError,
    );
  });

  it("passes when required fields are present", () => {
    expect(() =>
      assertRequiredFormFields({
        "What is the name of the promotion?": "Promo",
      }),
    ).not.toThrow();
  });
});

describe("mapFormFieldsToCanvaData", () => {
  const dataset: CanvaBrandTemplateDataset = {
    HEADLINE: { type: "text" },
    DESCRIPTION: { type: "text" },
    HERO: { type: "image" },
  };

  it("maps known text fields and ignores unmapped Google fields", () => {
    const { data, mappings } = mapFormFieldsToCanvaData(
      {
        "What is the name of the promotion?": "Summer Splash",
        "Promotion description": "Fun day",
        "Unmapped question": "ignored",
      },
      dataset,
    );

    expect(data).toEqual({
      HEADLINE: { type: "text", text: "Summer Splash" },
      DESCRIPTION: { type: "text", text: "Fun day" },
    });
    expect(mappings).toHaveLength(2);
  });

  it("fails clearly when mapped Canva field is absent from dataset", () => {
    expect(() =>
      mapFormFieldsToCanvaData(
        {
          "What is the name of the promotion?": "X",
          Location: "Lobby",
        },
        { HEADLINE: { type: "text" } },
      ),
    ).toThrow(/LOCATION|does not exist/i);
  });

  it("fails when mapped field is a non-text dataset type", () => {
    const imageOnlyMapDataset: CanvaBrandTemplateDataset = {
      HEADLINE: { type: "text" },
      DESCRIPTION: { type: "text" },
      DATE: { type: "text" },
      TIME: { type: "text" },
      LOCATION: { type: "image" },
      URL: { type: "text" },
    };

    expect(() =>
      mapFormFieldsToCanvaData(
        {
          "What is the name of the promotion?": "X",
          Location: "Lobby",
        },
        imageOnlyMapDataset,
      ),
    ).toThrow(/type "image"/);
  });
});

describe("validateAutofillAgainstDataset", () => {
  it("rejects unknown autofill keys", () => {
    expect(() =>
      validateAutofillAgainstDataset(
        { NOPE: { type: "text", text: "x" } },
        { HEADLINE: { type: "text" } },
      ),
    ).toThrow(/does not exist/);
  });
});

describe("idempotency", () => {
  it("returns cached payload for the same key", () => {
    const key = buildIdempotencyKey({
      submittedAt: "2026-01-01T00:00:00.000Z",
      fields: { a: ["1"] },
    });
    setIdempotentResult(key, { success: true, requestId: "r1" });
    expect(getIdempotentResult(key)).toEqual({
      success: true,
      requestId: "r1",
    });
  });

  it("prefers Idempotency-Key header", () => {
    const key = buildIdempotencyKey({
      fields: {},
      headerKey: "abc-123",
    });
    expect(key).toBe("hdr:abc-123");
  });
});

describe("getPromotionName", () => {
  it("uses configured promotion form field", () => {
    expect(
      getPromotionName({
        "What is the name of the promotion?": "Camp Fair",
      }),
    ).toBe("Camp Fair");
  });
});

describe("buildCreativeDraftHtml", () => {
  it("includes promotion, status, and canva link", () => {
    const html = buildCreativeDraftHtml({
      promotionName: "Camp Fair",
      submittedAt: "2026-08-06T12:00:00.000Z",
      fields: { Location: "Lobby" },
      canvaDesignUrl: "https://www.canva.com/design/ABC/edit",
    });

    expect(html).toContain("Camp Fair");
    expect(html).toContain("Canva draft generated");
    expect(html).toContain('href="https://www.canva.com/design/ABC/edit"');
    expect(html).toContain("<strong>Location:</strong> Lobby");
  });
});
