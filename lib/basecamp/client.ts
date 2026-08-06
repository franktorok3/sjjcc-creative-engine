import "server-only";
import {
  BasecampAuthError,
  fetchBasecampAuthorization,
  getValidBasecampAccessToken,
  resolveBasecampAccountId,
} from "./oauth";
import type { BasecampMessage, CreateBasecampMessageInput } from "./types";

export { BasecampAuthError } from "./oauth";

export class BasecampApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "BasecampApiError";
    this.status = status;
    this.code = code;
  }
}

async function requireBasecampRuntimeConfig() {
  const accessToken = await getValidBasecampAccessToken();
  const messageBoardId = process.env.BASECAMP_MESSAGE_BOARD_ID?.trim();
  const userAgent =
    process.env.BASECAMP_USER_AGENT?.trim() ||
    "SJJCC-Creative-PoC (franktorok3@gmail.com)";

  if (!messageBoardId) {
    throw new BasecampAuthError(
      "BASECAMP_CONFIG_MISSING",
      "Missing BASECAMP_MESSAGE_BOARD_ID. Set it to the target message board id after OAuth.",
    );
  }

  let accountId = process.env.BASECAMP_ACCOUNT_ID?.trim();
  if (!accountId) {
    const authorization = await fetchBasecampAuthorization(accessToken);
    accountId = resolveBasecampAccountId(authorization);
  }

  return { accessToken, accountId, messageBoardId, userAgent };
}

export async function getBasecampConfig() {
  return requireBasecampRuntimeConfig();
}

export async function basecampFetch<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<{ data: T; headers: Headers; status: number }> {
  const { accessToken, accountId, userAgent } =
    await requireBasecampRuntimeConfig();
  const url = `https://3.basecampapi.com/${accountId}${path}`;

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
      "User-Agent": userAgent,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 200) };
    }
  }

  if (response.status === 401 || response.status === 403) {
    throw new BasecampAuthError(
      "BASECAMP_AUTH_REQUIRED",
      `Basecamp rejected the access token (${response.status}). Revisit /api/basecamp/connect or refresh BASECAMP_ACCESS_TOKEN.`,
    );
  }

  if (!response.ok) {
    const record = (data ?? {}) as Record<string, unknown>;
    const message =
      typeof record.error === "string"
        ? record.error
        : typeof record.message === "string"
          ? record.message
          : `Basecamp API error (${response.status})`;
    throw new BasecampApiError(
      response.status,
      `HTTP_${response.status}`,
      message,
    );
  }

  return { data: data as T, headers: response.headers, status: response.status };
}

/** Lightweight auth check — list recent messages on the configured board. */
export async function verifyBasecampAuth(): Promise<{
  ok: true;
  accountId: string;
  messageBoardId: string;
}> {
  const { accountId, messageBoardId } = await requireBasecampRuntimeConfig();
  await basecampFetch<unknown>(
    `/message_boards/${messageBoardId}/messages.json`,
  );
  return { ok: true, accountId, messageBoardId };
}

export async function createMessageBoardMessage(
  input: CreateBasecampMessageInput,
): Promise<BasecampMessage> {
  const { messageBoardId } = await requireBasecampRuntimeConfig();
  const { data } = await basecampFetch<BasecampMessage>(
    `/message_boards/${messageBoardId}/messages.json`,
    {
      method: "POST",
      body: {
        subject: input.subject,
        content: input.content,
        status: input.status ?? "active",
      },
    },
  );
  return data;
}

export function buildCreativeDraftHtml(input: {
  promotionName: string;
  submittedAt: string;
  fields: Record<string, string>;
  canvaDesignUrl: string;
  status?: string;
}): string {
  const fieldRows = Object.entries(input.fields)
    .map(
      ([key, value]) =>
        `<p><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</p>`,
    )
    .join("\n");

  return [
    "<h2>Creative Draft Generated</h2>",
    `<p><strong>Promotion:</strong> ${escapeHtml(input.promotionName)}</p>`,
    `<p><strong>Submitted:</strong> ${escapeHtml(input.submittedAt)}</p>`,
    `<p><strong>Status:</strong> ${escapeHtml(input.status ?? "Canva draft generated")}</p>`,
    fieldRows,
    "<p>",
    `  <a href="${escapeHtml(input.canvaDesignUrl)}">Open editable design in Canva</a>`,
    "</p>",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
