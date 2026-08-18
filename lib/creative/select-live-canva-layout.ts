import "server-only";
import {
  CREATIVE_SHELL_SPECS,
  type CreativeShellSpec,
} from "@/config/creative-shells";
import type { AssetType } from "@/config/canva-templates";
import {
  DISALLOWED_BRAND_KIT_MARKERS,
  CANVA_BRAND_KIT_QUERY,
} from "@/config/canva-brand";
import {
  getBrandTemplateDataset,
  listAllBrandTemplates,
} from "@/lib/canva/templates";
import type { CanvaBrandTemplateDataset } from "@/lib/canva/types";
import { CreativeEngineError } from "@/lib/creative/errors";
import type { CreativeRequest } from "@/lib/creative/types";
import { ASSET_TYPE_LABELS } from "@/lib/creative/types";
import { logCreativeStage } from "@/lib/creative/workflow-stage-log";

export type LiveCanvaLayout = {
  id: string;
  title: string;
  dataset: CanvaBrandTemplateDataset;
  selectionMode: "approved_registry" | "shell_brand_template" | "live_discovery";
  matchedAssetType: AssetType;
  shellKey: string;
  shellTitle: string;
};

/**
 * Form → shell family → Canva Brand Template.
 * Maps portal asset types onto the three Creative Engine shells.
 */
export function selectShellSpecForRequest(
  request: CreativeRequest,
): CreativeShellSpec {
  const match = CREATIVE_SHELL_SPECS.find(
    (s) => s.assetType === request.assetType,
  );
  if (!match) {
    throw new CreativeEngineError(
      "NO_SHELL_FOR_ASSET",
      `No Creative Engine shell exists for ${ASSET_TYPE_LABELS[request.assetType]}.`,
    );
  }
  return match;
}

const CORE_TEXT_HINTS = ["headline", "title", "description", "body", "date"];

/**
 * Resolve a live Canva Brand Template that implements the selected shell.
 *
 * Path: form asset type → CE shell shape → Canva Brand Template with Autofill.
 * Never uses PPTX. Never invents template IDs.
 */
export async function selectLiveCanvaLayout(input: {
  request: CreativeRequest;
  requestId: string;
}): Promise<LiveCanvaLayout> {
  const { request, requestId } = input;
  const shell = selectShellSpecForRequest(request);

  logCreativeStage("template_selected", {
    requestId,
    mode: "shell_selected",
    shellKey: shell.key,
    shellTitle: shell.title,
    assetType: request.assetType,
  });

  const listed = await listAllBrandTemplates({
    dataset: "non_empty",
    limit: 100,
    maxPages: 10,
  });

  const scored: Array<{
    id: string;
    title: string;
    dataset: CanvaBrandTemplateDataset;
    score: number;
  }> = [];

  for (const template of listed.items) {
    const title = (template.title ?? "").trim();
    if (!title) continue;
    if (isDisallowedTitle(title)) continue;

    let dataset: CanvaBrandTemplateDataset;
    try {
      dataset = await getBrandTemplateDataset(template.id);
    } catch {
      continue;
    }
    if (!datasetLooksUsable(dataset)) continue;

    const score = scoreTemplateForShell(title, shell, dataset);
    if (score <= 0) continue;

    scored.push({
      id: String(template.id),
      title,
      dataset,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const pick = scored[0];

  if (!pick) {
    throw new CreativeEngineError(
      "NO_CANVA_LAYOUT",
      [
        `No Canva Brand Template was found for shell "${shell.title}".`,
        "The portal builds the shell shape first, then Canva Autofill fills content.",
        "Publish that shell as a Canva Brand Template with Autofill fields, then retry.",
        "PPTX import is not used for portal generation.",
      ].join(" "),
      {
        shellKey: shell.key,
        shellTitle: shell.title,
        assetType: request.assetType,
        summary: {
          asset: ASSET_TYPE_LABELS[request.assetType],
          shell: shell.title,
          requirement:
            "Live Canva Brand Template matching this shell, with Autofill dataset",
        },
      },
    );
  }

  const selectionMode =
    pick.score >= 50 ? "shell_brand_template" : "live_discovery";

  logCreativeStage("template_selected", {
    requestId,
    mode: selectionMode,
    shellKey: shell.key,
    templateId: pick.id,
    templateTitle: pick.title,
    score: pick.score,
  });

  return {
    id: pick.id,
    title: pick.title,
    dataset: pick.dataset,
    selectionMode,
    matchedAssetType: request.assetType,
    shellKey: shell.key,
    shellTitle: shell.title,
  };
}

function scoreTemplateForShell(
  title: string,
  shell: CreativeShellSpec,
  dataset: CanvaBrandTemplateDataset,
): number {
  const titleLower = title.toLowerCase();
  const shellTitleLower = shell.title.toLowerCase();
  let score = 0;

  // Exact / near-exact CE shell title match (preferred)
  if (titleLower === shellTitleLower) score += 100;
  if (titleLower.includes(shellTitleLower)) score += 80;
  if (titleLower.includes(shell.key.replace(/_/g, " "))) score += 40;

  // Asset-family hints
  if (shell.assetType === "flyer_full") {
    if (titleLower.includes("flyer")) score += 20;
    if (titleLower.includes("8.5")) score += 8;
  }
  if (shell.assetType === "handout_half") {
    if (titleLower.includes("half") || titleLower.includes("handout")) {
      score += 20;
    }
    if (titleLower.includes("5.5")) score += 8;
  }
  if (shell.assetType === "social_portrait") {
    if (
      titleLower.includes("social") ||
      titleLower.includes("instagram") ||
      titleLower.includes("portrait")
    ) {
      score += 20;
    }
    if (titleLower.includes("1080")) score += 8;
  }

  if (titleLower.includes("ce -") || titleLower.includes("creative engine")) {
    score += 15;
  }
  if (titleLower.includes(CANVA_BRAND_KIT_QUERY.toLowerCase())) {
    score += 5;
  }

  // Require at least some asset hint or CE naming, otherwise skip generic kits
  const hasFamilySignal =
    score >= 20 ||
    titleLower.includes("ce -") ||
    titleLower.includes(shellTitleLower);

  if (!hasFamilySignal) return 0;

  score += Math.min(Object.keys(dataset).length, 12);
  return score;
}

function datasetLooksUsable(dataset: CanvaBrandTemplateDataset): boolean {
  const entries = Object.entries(dataset);
  if (entries.length === 0) return false;
  const names = entries.map(([n]) => n.toLowerCase());
  return CORE_TEXT_HINTS.some((hint) =>
    names.some((n) => n.includes(hint)),
  );
}

function isDisallowedTitle(title: string): boolean {
  const lower = title.toLowerCase();
  const allowedKit = CANVA_BRAND_KIT_QUERY.toLowerCase();
  if (lower.includes(allowedKit)) return false;
  return DISALLOWED_BRAND_KIT_MARKERS.some((marker) =>
    lower.includes(marker.toLowerCase()),
  );
}
