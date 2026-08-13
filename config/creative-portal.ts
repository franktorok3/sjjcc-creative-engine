import { ASSET_TYPE_META, ASSET_TYPES, type AssetType } from "@/config/canva-templates";
import { ASSET_TYPE_LABELS, CTA_LABEL_OPTIONS } from "@/lib/creative/types";

export const ASSET_TYPE_OPTIONS = ASSET_TYPES.map((value) => ({
  value,
  label: ASSET_TYPE_LABELS[value],
  dimensionsLabel: ASSET_TYPE_META[value].dimensionsLabel,
  channels: ASSET_TYPE_META[value].channels,
}));

export type AssetTypeValue = AssetType;

export function assetTypeLabel(value: AssetTypeValue): string {
  return ASSET_TYPE_LABELS[value] ?? value;
}

export { CTA_LABEL_OPTIONS, ASSET_TYPE_META };
