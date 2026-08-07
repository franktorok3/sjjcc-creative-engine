import { describe, expect, it } from "vitest";
import { buildBasecampTokenExchangeDiagnostics } from "@/lib/basecamp/oauth";

describe("buildBasecampTokenExchangeDiagnostics", () => {
  it("extracts JSON error fields and WWW-Authenticate", async () => {
    const response = new Response(
      JSON.stringify({
        error: "invalid_client",
        error_description: "Client authentication failed",
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": 'Bearer realm="launchpad"',
        },
      },
    );

    const diagnostics = await buildBasecampTokenExchangeDiagnostics(response);
    expect(diagnostics).toEqual({
      httpStatus: 401,
      contentType: "application/json",
      wwwAuthenticate: 'Bearer realm="launchpad"',
      jsonError: "invalid_client",
      jsonErrorDescription: "Client authentication failed",
      responseTextPreview: null,
    });
  });

  it("returns a text preview when the body is not JSON", async () => {
    const body = "Unauthorized: " + "x".repeat(600);
    const response = new Response(body, {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });

    const diagnostics = await buildBasecampTokenExchangeDiagnostics(response);
    expect(diagnostics.httpStatus).toBe(401);
    expect(diagnostics.contentType).toBe("text/plain");
    expect(diagnostics.jsonError).toBeNull();
    expect(diagnostics.jsonErrorDescription).toBeNull();
    expect(diagnostics.responseTextPreview).toBe(body.slice(0, 500));
    expect(diagnostics.responseTextPreview?.length).toBe(500);
  });

  it("never includes request secrets in the diagnostics object", async () => {
    const response = new Response(
      JSON.stringify({ error: "invalid_grant", error_description: "bad code" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );

    const diagnostics = await buildBasecampTokenExchangeDiagnostics(response);
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toMatch(/client_secret/i);
    expect(serialized).not.toMatch(/access_token/i);
    expect(serialized).not.toMatch(/refresh_token/i);
    expect(Object.keys(diagnostics).sort()).toEqual([
      "contentType",
      "httpStatus",
      "jsonError",
      "jsonErrorDescription",
      "responseTextPreview",
      "wwwAuthenticate",
    ]);
  });
});
