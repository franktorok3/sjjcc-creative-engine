import type {
  BasecampMessageBoardDiscovery,
  BasecampProject,
  BasecampProjectSummary,
} from "./types";

/**
 * Pure mappers for Basecamp discovery responses.
 * Kept free of I/O so unit tests do not need network or tokens.
 */

export class BasecampDiscoveryError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 404) {
    super(message);
    this.name = "BasecampDiscoveryError";
    this.code = code;
    this.status = status;
  }
}

export function mapBasecampProjectSummary(
  project: BasecampProject,
): BasecampProjectSummary {
  const id = project.id;
  if (id === undefined || id === null || id === "") {
    throw new BasecampDiscoveryError(
      "BASECAMP_PROJECT_INVALID",
      "Basecamp project missing id",
      502,
    );
  }

  return {
    id: String(id),
    name: project.name?.trim() || `Project ${id}`,
    appUrl: project.app_url?.trim() || project.url?.trim() || "",
  };
}

export function extractMessageBoardFromProject(
  project: BasecampProject,
): BasecampMessageBoardDiscovery {
  const projectId = project.id;
  if (projectId === undefined || projectId === null || projectId === "") {
    throw new BasecampDiscoveryError(
      "BASECAMP_PROJECT_INVALID",
      "Basecamp project missing id",
      502,
    );
  }

  const dock = Array.isArray(project.dock) ? project.dock : [];
  const boards = dock.filter(
    (entry) => entry?.name === "message_board" && entry.id != null,
  );
  const board =
    boards.find((entry) => entry.enabled !== false) ?? boards[0] ?? null;

  if (!board) {
    throw new BasecampDiscoveryError(
      "BASECAMP_MESSAGE_BOARD_NOT_FOUND",
      `Project ${projectId} has no message_board entry in its dock`,
      404,
    );
  }

  return {
    projectId: String(projectId),
    projectName: project.name?.trim() || `Project ${projectId}`,
    messageBoardId: String(board.id),
    messageBoardTitle: board.title?.trim() || "Message Board",
    messageBoardUrl: board.app_url?.trim() || board.url?.trim() || "",
  };
}
