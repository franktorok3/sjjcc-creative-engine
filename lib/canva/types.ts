/** Canva Connect API types used by this PoC. */

export type CanvaTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
  scope?: string;
  tokenType?: string;
};

export type CanvaDatasetFieldType = "text" | "image" | "chart";

export type CanvaDatasetField = {
  type: CanvaDatasetFieldType;
};

export type CanvaBrandTemplateDataset = Record<string, CanvaDatasetField>;

export type CanvaBrandTemplate = {
  id: string;
  title?: string;
  view_url?: string;
  create_url?: string;
  thumbnail?: {
    width: number;
    height: number;
    url: string;
  };
  created_at?: number;
  updated_at?: number;
};

export type CanvaAutofillTextData = {
  type: "text";
  text: string;
};

export type CanvaAutofillImageData = {
  type: "image";
  asset_id: string;
};

export type CanvaAutofillDataValue =
  | CanvaAutofillTextData
  | CanvaAutofillImageData;

export type CanvaAutofillData = Record<string, CanvaAutofillDataValue>;

export type CanvaAutofillJobStatus = "in_progress" | "success" | "failed";

export type CanvaDesign = {
  id: string;
  title?: string;
  url: string;
  urls?: {
    edit_url?: string;
    view_url?: string;
  };
  created_at?: number;
  updated_at?: number;
};

export type CanvaAutofillJob = {
  id: string;
  status: CanvaAutofillJobStatus;
  result?: {
    type: "create_design";
    design: CanvaDesign;
  };
  error?: {
    code: string;
    message: string;
  };
};

export type CanvaUser = {
  id: string;
  display_name?: string;
  team_id?: string;
};

export const CANVA_REQUIRED_SCOPES = [
  "asset:read",
  "asset:write",
  "brandtemplate:content:read",
  "brandtemplate:meta:read",
  "design:content:read",
  "design:content:write",
  "design:meta:read",
  "profile:read",
] as const;
