import { describe, expect, it } from "vitest";
import { basecampPostSmokeBodySchema } from "@/lib/basecamp/post-smoke-schema";

describe("POST /api/test/basecamp/post body", () => {
  it("accepts subject and content", () => {
    const parsed = basecampPostSmokeBodySchema.safeParse({
      subject: "Creative Engine Test",
      content: "Basecamp connection confirmed.",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty subject or content", () => {
    expect(
      basecampPostSmokeBodySchema.safeParse({ subject: "", content: "x" })
        .success,
    ).toBe(false);
    expect(
      basecampPostSmokeBodySchema.safeParse({ subject: "x", content: "" })
        .success,
    ).toBe(false);
  });
});
