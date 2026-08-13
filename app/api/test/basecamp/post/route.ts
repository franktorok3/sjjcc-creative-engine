import { NextResponse } from "next/server";
import {
  BasecampApiError,
  BasecampAuthError,
  createMessageBoardMessage,
  getBasecampConfig,
} from "@/lib/basecamp/client";
import { basecampPostSmokeBodySchema } from "@/lib/basecamp/post-smoke-schema";

export const runtime = "nodejs";

/**
 * POST — smallest Basecamp write smoke test.
 * Creates one Message Board message using Production
 * BASECAMP_ACCOUNT_ID + BASECAMP_MESSAGE_BOARD_ID (+ access token).
 * Never returns tokens/secrets.
 */
export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => ({}));
    const parsed = basecampPostSmokeBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_PAYLOAD",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { messageBoardId } = await getBasecampConfig();
    const message = await createMessageBoardMessage({
      subject: parsed.data.subject,
      content: parsed.data.content,
      status: "active",
    });

    const projectId =
      process.env.BASECAMP_PROJECT_ID?.trim() || "46516309";

    return NextResponse.json({
      success: true,
      projectId,
      messageBoardId,
      messageId: String(message.id),
      appUrl: message.app_url || message.url || null,
    });
  } catch (error) {
    if (error instanceof BasecampAuthError) {
      return NextResponse.json(
        {
          success: false,
          error: error.code,
          message: error.message,
        },
        { status: 401 },
      );
    }
    if (error instanceof BasecampApiError) {
      return NextResponse.json(
        {
          success: false,
          error: error.code,
          message: error.message,
        },
        {
          status:
            error.status >= 400 && error.status < 600 ? error.status : 502,
        },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: "BASECAMP_POST_FAILED", message },
      { status: 500 },
    );
  }
}
