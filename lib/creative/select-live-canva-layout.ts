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
  /**
   * autofill = Brand Template has Data Autofill fields (true agentic fill)
   * visual_copy = Brand Template exists but dataset empty (open editable copy)
   */
  fillMode: "autofill" | "visual_copy";
  selectionMode:
    | "approved_registry"
    | "shell_brand_template"
    | "live_discovery"
    | "agentic_fallback";
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

type ScoredTemplate = {
  id: string;
  title: string;
  dataset: CanvaBrandTemplateDataset;
  score: number;
  fillMode: "autofill" | "visual_copy";
};

/**
 * Agentic flyer/handout/social path:
 * form asset → CE shell → live Canva Brand Template → Autofill when possible.
 *
 * Never PPTX. Never invents template IDs.
 * Falls back to any Autofill-ready Brand Template, then visual Brand Template copy.
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

  // Prefer Autofill-ready templates; also list visual ones for copy fallback.
  const [autofillListed, anyListed] = await Promise.all([
    listAllBrandTemplates({ dataset: "non_empty", limit: 100, maxPages: 10 }),
    listAllBrandTemplates({ dataset: "any", limit: 100, maxPages: 10 }),
  ]);

  const autofillScored: ScoredTemplate[] = [];
  for (const template of autofillListed.items) {
    const title = (template.title ?? "").trim();
    if (!title || isDisallowedTitle(title)) continue;
    let dataset: CanvaBrandTemplateDataset;
    try {
      dataset = await getBrandTemplateDataset(template.id);
    } catch {
      continue;
    }
    if (!datasetLooksUsable(dataset)) continue;
    const score = scoreTemplateForShell(title, shell, dataset, true);
    autofillScored.push({
      id: String(template.id),
      title,
      dataset,
      score,
      fillMode: "autofill",
    });
  }
  autofillScored.sort((a, b) => b.score - a.score);

  // 1) Shell / family Autofill match
  const familyAutofill = autofillScored.find((s) => s.score >= 20);
  // 2) Any Autofill-ready template (true agentic fill with available Canva layout)
  const anyAutofill = autofillScored[0];

  const pick = familyAutofill ?? anyAutofill;
  if (pick) {
    const selectionMode =
      pick.score >= 50
        ? "shell_brand_template"
        : pick.score >= 20
          ? "live_discovery"
          : "agentic_fallback";

    logCreativeStage("template_selected", {
      requestId,
      mode: selectionMode,
      fillMode: "autofill",
      shellKey: shell.key,
      templateId: pick.id,
      templateTitle: pick.title,
      score: pick.score,
    });

    return {
      id: pick.id,
      title: pick.title,
      dataset: pick.dataset,
      fillMode: "autofill",
      selectionMode,
      matchedAssetType: request.assetType,
      shellKey: shell.key,
      shellTitle: shell.title,
    };
  }

  // 3) Visual Brand Template copy — real Canva layout, content not Autofilled yet
  const visualScored: ScoredTemplate[] = [];
  for (const template of anyListed.items) {
    const title = (template.title ?? "").trim();
    if (!title || isDisallowedTitle(title)) continue;
    const score = scoreTemplateForShell(title, shell, {}, false);
    visualScored.push({
      id: String(template.id),
      title,
      dataset: {},
      score,
      fillMode: "visual_copy",
    });
  }
  visualScored.sort((a, b) => b.score - a.score);
  const visual =
    visualScored.find((s) => s.score >= 15) ?? visualScored[0];

  if (visual) {
    logCreativeStage("template_selected", {
      requestId,
      mode: "agentic_fallback",
      fillMode: "visual_copy",
      shellKey: shell.key,
      templateId: visual.id,
      templateTitle: visual.title,
      score: visual.score,
    });

    return {
      id: visual.id,
      title: visual.title,
      dataset: {},
      fillMode: "visual_copy",
      selectionMode: "agentic_fallback",
      matchedAssetType: request.assetType,
      shellKey: shell.key,
      shellTitle: shell.title,
    };
  }

  throw new CreativeEngineError(
    "NO_CANVA_LAYOUT",
    [
      `No Canva Brand Template is available for agentic ${ASSET_TYPE_LABELS[request.assetType]} generation.`,
      "Canva Connect can only Autofill an existing Brand Template (or open a Brand Template copy).",
      "It cannot invent a designed flyer from a blank canvas, and PPTX is not used.",
      `Create/publish a Brand Template for "${shell.title}", bind Data Autofill fields, reconnect Canva tokens, then retry.`,
    ].join(" "),
    {
      shellKey: shell.key,
      shellTitle: shell.title,
      assetType: request.assetType,
      summary: {
        asset: ASSET_TYPE_LABELS[request.assetType],
        shell: shell.title,
        requirement:
          "Live Canva Brand Template (Autofill preferred) + valid Canva access token",
      },
    },
  );
}

function scoreTemplateForShell(
  title: string,
  shell: CreativeShellSpec,
  dataset: CanvaBrandTemplateDataset,
  requireFamilySignal: boolean,
): number {
  const titleLower = title.toLowerCase();
  const shellTitleLower = shell.title.toLowerCase();
  let score = 0;

  if (titleLower === shellTitleLower) score += 100;
  if (titleLower.includes(shellTitleLower)) score += 80;
  if (titleLower.includes(shell.key.replace(/_/g, " "))) score += 40;

  if (shell.assetType === "flyer_full") {
    if (titleLower.includes("flyer")) score += 25;
    if (titleLower.includes("8.5")) score += 8;
  }
  if (shell.assetType === "handout_half") {
    if (titleLower.includes("half") || titleLower.includes("handout")) {
      score += 25;
    }
    if (titleLower.includes("5.5")) score += 8;
  }
  if (shell.assetType === "social_portrait") {
    if (
      titleLower.includes("social") ||
      titleLower.includes("instagram") ||
      titleLower.includes("portrait")
    ) {
      score += 25;
    }
    if (titleLower.includes("1080")) score += 8;
  }

  if (titleLower.includes("ce -") || titleLower.includes("creative engine")) {
    score += 15;
  }
  if (titleLower.includes(CANVA_BRAND_KIT_QUERY.toLowerCase())) {
    score += 8;
  }

  const hasFamilySignal =
    score >= 20 ||
    titleLower.includes("ce -") ||
    titleLower.includes(shellTitleLower);

  if (requireFamilySignal && !hasFamilySignal) {
    // Still allow weak score for agentic fallback ranking
    score += Math.min(Object.keys(dataset).length, 12);
    return score; // may be low; caller may still use as last resort
  }

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
