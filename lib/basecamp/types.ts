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
