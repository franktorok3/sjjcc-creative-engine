import "server-only";
import type { BasecampMessage, CreateBasecampMessageInput } from "./types";

export class BasecampAuthError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BasecampAuthError";
    this.code = code;
  }
}

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

function requireBasecampConfig() {
  const accessToken = process.env.BASECAMP_ACCESS_TOKEN?.trim();
  const accountId = process.env.BASECAMP_ACCOUNT_ID?.trim();
  const messageBoardId = process.env.BASECAMP_MESSAGE_BOARD_ID?.trim();
  const userAgent = process.env.BASECAMP_USER_AGENT?.trim();

  if (!accessToken) {
    throw new BasecampAuthError(
      "BASECAMP_AUTH_REQUIRED",
      "BASECAMP_ACCESS_TOKEN is not configured. Obtain an OAuth 2.0 access token from launchpad.37signals.com and set it in the environment.",
    );
  }

  if (!accountId || !messageBoardId || !userAgent) {
    throw new BasecampAuthError(
      "BASECAMP_CONFIG_MISSING",
      "Missing BASECAMP_ACCOUNT_ID, BASECAMP_MESSAGE_BOARD_ID, or BASECAMP_USER_AGENT",
    );
  }

  return { accessToken, accountId, messageBoardId, userAgent };
}

export function getBasecampConfig() {
  return requireBasecampConfig();
}

export async function basecampFetch<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<{ data: T; headers: Headers; status: number }> {
  const { accessToken, accountId, userAgent } = requireBasecampConfig();
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
      `Basecamp rejected the access token (${response.status}). Refresh or replace BASECAMP_ACCESS_TOKEN.`,
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
    throw new BasecampApiError(response.status, `HTTP_${response.status}`, message);
  }

  return { data: data as T, headers: response.headers, status: response.status };
}

/** Lightweight auth check — list recent messages on the configured board. */
export async function verifyBasecampAuth(): Promise<{
  ok: true;
  accountId: string;
  messageBoardId: string;
}> {
  const { accountId, messageBoardId } = requireBasecampConfig();
  await basecampFetch<unknown>(
    `/message_boards/${messageBoardId}/messages.json`,
  );
  return { ok: true, accountId, messageBoardId };
}

export async function createMessageBoardMessage(
  input: CreateBasecampMessageInput,
): Promise<BasecampMessage> {
  const { messageBoardId } = requireBasecampConfig();
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
