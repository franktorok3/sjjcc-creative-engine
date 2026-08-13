import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/canva/oauth", () => ({
  getValidCanvaAccessToken: vi.fn(async () => "test-access-token"),
  CanvaAuthError: class CanvaAuthError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

describe("pollDesignImportJob hard timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns CANVA_IMPORT_PENDING instead of looping forever", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        job: { id: "job_pending", status: "in_progress" },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { pollDesignImportJob } = await import("@/lib/canva/design-imports");
    const promise = pollDesignImportJob("job_pending", { maxMs: 5_000 });

    await vi.advanceTimersByTimeAsync(6_000);
    const result = await promise;

    expect(result).toMatchObject({
      status: "pending",
      importJobId: "job_pending",
      code: "CANVA_IMPORT_PENDING",
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.length).toBeLessThan(20);
  });
});
