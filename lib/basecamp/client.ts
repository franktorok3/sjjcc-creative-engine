import "server-only";
import {
  BasecampAuthError,
  fetchBasecampAuthorization,
  getValidBasecampAccessToken,
  resolveBasecampAccountId,
} from "./oauth";
import type {
  BasecampMessage,
  BasecampMessageBoardDiscovery,
  BasecampProject,
  BasecampProjectSummary,
  CreateBasecampMessageInput,
} from "./types";
import {
  extractMessageBoardFromProject,
  mapBasecampProjectSummary,
} from "./discovery";

export { BasecampAuthError } from "./oauth";
export {
  BasecampDiscoveryError,
  extractMessageBoardFromProject,
  mapBasecampProjectSummary,
} from "./discovery";

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

/** Auth + account only — enough for read-only discovery. */
async function requireBasecampAuthConfig() {
  const accessToken = await getValidBasecampAccessToken();
  const userAgent =
    process.env.BASECAMP_USER_AGENT?.trim() ||
    "SJJCC-Creative-PoC (franktorok3@gmail.com)";

  let accountId = process.env.BASECAMP_ACCOUNT_ID?.trim();
  if (!accountId) {
    const authorization = await fetchBasecampAuthorization(accessToken);
    accountId = resolveBasecampAccountId(authorization);
  }

  return { accessToken, accountId, userAgent };
}

/** Auth + configured message board — required for posting / board verify. */
async function requireBasecampRuntimeConfig() {
  const auth = await requireBasecampAuthConfig();
  const messageBoardId = process.env.BASECAMP_MESSAGE_BOARD_ID?.trim();

  if (!messageBoardId) {
    throw new BasecampAuthError(
      "BASECAMP_CONFIG_MISSING",
      "Missing BASECAMP_MESSAGE_BOARD_ID. Use GET /api/test/basecamp/projects then /api/test/basecamp/project?projectId=... to discover it.",
    );
  }

  return { ...auth, messageBoardId };
}

export async function getBasecampConfig() {
  return requireBasecampRuntimeConfig();
}

export async function basecampFetch<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<{ data: T; headers: Headers; status: number }> {
  const { accessToken, accountId, userAgent } =
    await requireBasecampAuthConfig();
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

function nextPagePath(headers: Headers, accountId: string): string | null {
  const link = headers.get("link") ?? headers.get("Link");
  if (!link) return null;

  // Rel=next; Basecamp uses RFC 5988 Link headers.
  const match = link
    .split(",")
    .map((part) => part.trim())
    .find((part) => /rel="?next"?/i.test(part));
  if (!match) return null;

  const urlMatch = match.match(/<([^>]+)>/);
  if (!urlMatch?.[1]) return null;

  try {
    const nextUrl = new URL(urlMatch[1]);
    const marker = `/${accountId}`;
    const idx = nextUrl.pathname.indexOf(marker);
    if (idx === -1) {
      return `${nextUrl.pathname}${nextUrl.search}`;
    }
    return `${nextUrl.pathname.slice(idx + marker.length)}${nextUrl.search}`;
  } catch {
    return null;
  }
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

/**
 * Read-only: list active projects visible to the authorized account.
 * Does not require BASECAMP_MESSAGE_BOARD_ID.
 */
export async function listBasecampProjects(): Promise<{
  accountId: string;
  projects: BasecampProjectSummary[];
}> {
  const { accountId } = await requireBasecampAuthConfig();
  const projects: BasecampProjectSummary[] = [];
  let path: string | null = "/projects.json";
  let pages = 0;
  const maxPages = 20;

  while (path && pages < maxPages) {
    pages += 1;
    const { data, headers } = await basecampFetch<BasecampProject[]>(path);
    if (!Array.isArray(data)) {
      throw new BasecampApiError(
        502,
        "BASECAMP_PROJECTS_INVALID",
        "Basecamp /projects.json did not return an array",
      );
    }
    for (const project of data) {
      projects.push(mapBasecampProjectSummary(project));
    }
    path = nextPagePath(headers, accountId);
  }

  return { accountId, projects };
}

/**
 * Read-only: resolve the Message Board dock entry for a project.
 * Returns the id to set as BASECAMP_MESSAGE_BOARD_ID.
 */
export async function getBasecampProjectMessageBoard(
  projectId: string,
): Promise<BasecampMessageBoardDiscovery> {
  const trimmed = projectId.trim();
  if (!trimmed) {
    throw new BasecampApiError(
      400,
      "BASECAMP_PROJECT_ID_REQUIRED",
      "projectId query parameter is required",
    );
  }

  const { data } = await basecampFetch<BasecampProject>(
    `/projects/${encodeURIComponent(trimmed)}.json`,
  );

  return extractMessageBoardFromProject(data);
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
