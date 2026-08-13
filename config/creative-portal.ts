export const ASSET_TYPE_OPTIONS = [
  { value: "flyer", label: "Flyer" },
  { value: "social_post", label: "Social Post" },
  { value: "digital_screen", label: "Digital Screen" },
  { value: "email_graphic", label: "Email Graphic" },
] as const;

export type AssetTypeValue = (typeof ASSET_TYPE_OPTIONS)[number]["value"];

export function assetTypeLabel(value: AssetTypeValue): string {
  return (
    ASSET_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}
