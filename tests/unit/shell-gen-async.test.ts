import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CANVA_IMPORT_POLL_MAX_MS } from "@/lib/canva/design-imports";
import { logShellStage, type ShellGenStage } from "@/lib/creative/shells/stage-log";

describe("shell generation stage logging", () => {
  const stages: ShellGenStage[] = [
    "auth_validated",
    "pptx_generation_started",
    "pptx_generation_complete",
    "canva_import_started",
    "canva_import_job_created",
    "canva_import_polling",
    "canva_import_complete",
    "canva_import_failed",
    "response_returned",
  ];

  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("emits all required stage markers", () => {
    for (const stage of stages) {
      logShellStage(stage, { shellKey: "flyer_standard_light" });
    }
    expect(infoSpy).toHaveBeenCalledTimes(stages.length);
    const payloads = infoSpy.mock.calls.map(
      (call) => JSON.parse(String(call[0])) as { stage: string; scope: string },
    );
    expect(payloads.map((p) => p.stage)).toEqual(stages);
    expect(payloads.every((p) => p.scope === "shell_generation")).toBe(true);
  });

  it("never logs token/secret/authorization fields", () => {
    logShellStage("canva_import_job_created", {
      importJobId: "job_123",
      accessToken: "SECRET",
      refresh_token: "SECRET",
      authorization: "Bearer SECRET",
      secret: "SECRET",
      shellKey: "flyer_standard_light",
    });
    const payload = JSON.parse(String(infoSpy.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >;
    expect(payload.importJobId).toBe("job_123");
    expect(payload.shellKey).toBe("flyer_standard_light");
    expect(payload.accessToken).toBeUndefined();
    expect(payload.refresh_token).toBeUndefined();
    expect(payload.authorization).toBeUndefined();
    expect(payload.secret).toBeUndefined();
  });
});

describe("Canva import poll timeout constant", () => {
  it("caps polling at 60 seconds", () => {
    expect(CANVA_IMPORT_POLL_MAX_MS).toBe(60_000);
  });
});
