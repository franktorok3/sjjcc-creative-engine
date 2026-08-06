import { NextResponse } from "next/server";
import {
  BasecampApiError,
  BasecampAuthError,
  getBasecampProjectMessageBoard,
} from "@/lib/basecamp/client";
import { BasecampDiscoveryError } from "@/lib/basecamp/discovery";

export const runtime = "nodejs";

/**
 * GET — resolve Message Board dock entry for a project (read-only).
 * Query: projectId
 * Use messageBoardId as BASECAMP_MESSAGE_BOARD_ID. Never returns tokens/secrets.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? "";

  if (!projectId.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: "BASECAMP_PROJECT_ID_REQUIRED",
        message: "Query parameter projectId is required",
      },
      { status: 400 },
    );
  }

  try {
    const board = await getBasecampProjectMessageBoard(projectId);
    return NextResponse.json({
      success: true,
      ...board,
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
    const status =
      error.status === 400
        ? 400
        : error.status >= 400 && error.status < 600
          ? error.status
          : 502;
    return NextResponse.json(
      { success: false, error: error.code, message: error.message },
      { status },
    );
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json(
    { success: false, error: "BASECAMP_PROJECT_FAILED", message },
    { status: 500 },
  );
}
