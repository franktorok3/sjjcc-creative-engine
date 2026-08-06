export type BasecampMessage = {
  id: number | string;
  subject?: string;
  content?: string;
  app_url?: string;
  url?: string;
  status?: string;
  created_at?: string;
};

export type CreateBasecampMessageInput = {
  subject: string;
  content: string;
  status?: "active";
};

export type BasecampTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
  tokenType?: string;
};

export type BasecampAuthorizationAccount = {
  product?: string;
  id: number | string;
  name?: string;
  href?: string;
  app_href?: string;
};

export type BasecampAuthorization = {
  expires_at?: string;
  identity?: {
    id?: number;
    first_name?: string;
    last_name?: string;
    email_address?: string;
  };
  accounts?: BasecampAuthorizationAccount[];
};

export type BasecampDockEntry = {
  id: number | string;
  title?: string;
  name?: string;
  enabled?: boolean;
  position?: number | null;
  url?: string;
  app_url?: string;
};

export type BasecampProject = {
  id: number | string;
  name?: string;
  status?: string;
  url?: string;
  app_url?: string;
  dock?: BasecampDockEntry[];
};

/** Safe discovery DTO — never includes tokens or secrets. */
export type BasecampProjectSummary = {
  id: string;
  name: string;
  appUrl: string;
};

/** Safe discovery DTO for the project's Message Board dock entry. */
export type BasecampMessageBoardDiscovery = {
  projectId: string;
  projectName: string;
  messageBoardId: string;
  messageBoardTitle: string;
  messageBoardUrl: string;
};
