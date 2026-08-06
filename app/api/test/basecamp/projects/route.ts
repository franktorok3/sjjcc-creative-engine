import { NextResponse } from "next/server";
import {
  BasecampApiError,
  BasecampAuthError,
  listBasecampProjects,
} from "@/lib/basecamp/client";
import { BasecampDiscoveryError } from "@/lib/basecamp/discovery";

export const runtime = "nodejs";

/**
 * GET — list Basecamp projects for the authorized account (read-only).
 * Does not require BASECAMP_MESSAGE_BOARD_ID. Never returns tokens/secrets.
 */
export async function GET() {
  try {
    const { accountId, projects } = await listBasecampProjects();
    return NextResponse.json({
      success: true,
      accountId,
      projects,
    });
  } catch (error) {
    return discoveryErrorResponse(error);
  }
}

function discoveryErrorResponse(error: unknown) {
  if (error instanceof BasecampAuthError) {
    return NextResponse.json(
      {
        success: false,
        error: error.code,
        message: error.message,
        hint: "Visit /api/basecamp/connect or set BASECAMP_ACCESS_TOKEN first.",
      },
      { status: 401 },
    );
  }
  if (error instanceof BasecampDiscoveryError) {
    return NextResponse.json(
      { success: false, error: error.code, message: error.message },
      { status: error.status },
    );
  }
  if (error instanceof BasecampApiError) {
    return NextResponse.json(
      { success: false, error: error.code, message: error.message },
      { status: error.status >= 400 && error.status < 600 ? error.status : 502 },
    );
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json(
    { success: false, error: "BASECAMP_PROJECTS_FAILED", message },
    { status: 500 },
  );
}
