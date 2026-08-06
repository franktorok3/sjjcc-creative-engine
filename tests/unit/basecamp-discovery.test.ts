import { describe, expect, it } from "vitest";
import {
  BasecampDiscoveryError,
  extractMessageBoardFromProject,
  mapBasecampProjectSummary,
} from "@/lib/basecamp/discovery";
import type { BasecampProject } from "@/lib/basecamp/types";

const sampleProject: BasecampProject = {
  id: 2085958505,
  name: "Pulse",
  app_url: "https://3.basecamp.com/195539477/projects/2085958505",
  url: "https://3.basecampapi.com/195539477/projects/2085958505.json",
  dock: [
    {
      id: 1069479828,
      title: "Message Board",
      name: "message_board",
      enabled: true,
      app_url:
        "https://3.basecamp.com/195539477/buckets/2085958505/message_boards/1069479828",
      url: "https://3.basecampapi.com/195539477/buckets/2085958505/message_boards/1069479828.json",
    },
    {
      id: 1069479829,
      title: "To-dos",
      name: "todoset",
      enabled: true,
    },
  ],
};

describe("mapBasecampProjectSummary", () => {
  it("returns only id, name, and appUrl", () => {
    expect(mapBasecampProjectSummary(sampleProject)).toEqual({
      id: "2085958505",
      name: "Pulse",
      appUrl: "https://3.basecamp.com/195539477/projects/2085958505",
    });
  });

  it("falls back to api url when app_url is missing", () => {
    expect(
      mapBasecampProjectSummary({
        id: "1",
        name: "Solo",
        url: "https://3.basecampapi.com/1/projects/1.json",
      }),
    ).toEqual({
      id: "1",
      name: "Solo",
      appUrl: "https://3.basecampapi.com/1/projects/1.json",
    });
  });

  it("rejects projects without an id", () => {
    expect(() =>
      mapBasecampProjectSummary({ name: "Nope" } as BasecampProject),
    ).toThrow(BasecampDiscoveryError);
  });
});

describe("extractMessageBoardFromProject", () => {
  it("returns the Message Board dock fields for BASECAMP_MESSAGE_BOARD_ID discovery", () => {
    expect(extractMessageBoardFromProject(sampleProject)).toEqual({
      projectId: "2085958505",
      projectName: "Pulse",
      messageBoardId: "1069479828",
      messageBoardTitle: "Message Board",
      messageBoardUrl:
        "https://3.basecamp.com/195539477/buckets/2085958505/message_boards/1069479828",
    });
  });

  it("prefers an enabled message_board when multiple exist", () => {
    const project: BasecampProject = {
      id: 9,
      name: "Multi",
      dock: [
        {
          id: 1,
          name: "message_board",
          title: "Old Board",
          enabled: false,
          app_url: "https://example.com/old",
        },
        {
          id: 2,
          name: "message_board",
          title: "Live Board",
          enabled: true,
          app_url: "https://example.com/live",
        },
      ],
    };

    expect(extractMessageBoardFromProject(project).messageBoardId).toBe("2");
    expect(extractMessageBoardFromProject(project).messageBoardTitle).toBe(
      "Live Board",
    );
  });

  it("fails clearly when the dock has no message board", () => {
    expect(() =>
      extractMessageBoardFromProject({
        id: 3,
        name: "No Board",
        dock: [{ id: 10, name: "todoset", title: "To-dos" }],
      }),
    ).toThrow(/no message_board/i);
  });

  it("does not include token-like fields in the discovery DTO", () => {
    const result = extractMessageBoardFromProject(sampleProject);
    expect(Object.keys(result).sort()).toEqual([
      "messageBoardId",
      "messageBoardTitle",
      "messageBoardUrl",
      "projectId",
      "projectName",
    ]);
    expect(JSON.stringify(result)).not.toMatch(/token|secret|Bearer/i);
  });
});
