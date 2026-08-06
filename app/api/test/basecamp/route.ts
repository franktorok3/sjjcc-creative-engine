import { NextResponse } from "next/server";
import { z } from "zod";
import {
  BasecampApiError,
  BasecampAuthError,
  buildCreativeDraftHtml,
  createMessageBoardMessage,
  verifyBasecampAuth,
} from "@/lib/basecamp/client";
import { createRequestId, logMilestone } from "@/lib/creative/logging";

export const runtime = "nodejs";

const bodySchema = z.object({
  canvaDesignUrl: z.string().url().optional(),
  promotionName: z.string().optional(),
  subject: z.string().optional(),
});

/**
 * GET  — TEST 5: verify Basecamp auth against the configured message board.
 * POST — TEST 6: create a clearly labeled TEST message (optionally with a Canva URL).
 */
export async function GET() {
  try {
    const result = await verifyBasecampAuth();
    return NextResponse.json({
      success: true,
      authenticated: true,
      ...result,
    });
  } catch (error) {
    return basecampErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_PAYLOAD",
          details: parsed.error.flatten(),
          requestId,
        },
        { status: 400 },
      );
    }

    const promotionName =
      parsed.data.promotionName ?? "TEST promotion (PoC)";
    const canvaDesignUrl =
      parsed.data.canvaDesignUrl ?? "https://www.canva.com/";
    const submittedAt = new Date().toISOString();

    logMilestone(requestId, "BASECAMP_POST_STARTED");

    const content = buildCreativeDraftHtml({
      promotionName,
      submittedAt,
      fields: {
        Note: "This is a TEST message from POST /api/test/basecamp",
      },
      canvaDesignUrl,
      status: "Canva draft generated",
    });

    const message = await createMessageBoardMessage({
      subject:
        parsed.data.subject ??
        `[TEST] Creative Draft: ${promotionName}`,
      content,
      status: "active",
    });

    const messageId = String(message.id);
    logMilestone(
      requestId,
      "BASECAMP_POST_COMPLETE",
      `messageId=${messageId}`,
    );

    return NextResponse.json({
      success: true,
      requestId,
      basecampMessageId: messageId,
      basecampMessageUrl: message.app_url || message.url || null,
      subject: message.subject ?? null,
    });
  } catch (error) {
    return basecampErrorResponse(error, requestId);
  }
}

function basecampErrorResponse(error: unknown, requestId?: string) {
  if (error instanceof BasecampAuthError) {
    return NextResponse.json(
      {
        success: false,
        error: error.code,
        message: error.message,
        requestId,
        hint: "Basecamp uses OAuth 2.0. Visit /api/basecamp/connect or set BASECAMP_ACCESS_TOKEN (+ ACCOUNT/BOARD/USER_AGENT). Do not pretend Basecamp succeeded without a token.",
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
        requestId,
      },
      { status: 502 },
    );
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json(
    {
      success: false,
      error: "BASECAMP_TEST_FAILED",
      message,
      requestId,
    },
    { status: 500 },
  );
}
