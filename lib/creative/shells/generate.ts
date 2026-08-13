import "server-only";
import {
  getApprovedLogoAssets,
  missingApprovedLogoAssetIds,
} from "@/config/canva-brand-assets";
import { CANVA_SHELL_CAPABILITY_ASSESSMENT } from "@/config/canva-shell-capabilities";
import {
  CREATIVE_SHELL_SPECS,
  shellSpecToPixels,
  type CreativeShellSpec,
} from "@/config/creative-shells";
import type { CreativeTemplate } from "@/config/canva-templates";
import { CanvaApiError } from "@/lib/canva/client";
import { importDesignFromBytes } from "@/lib/canva/design-imports";
import {
  getDesignDataset,
  publishDesignAsBrandTemplate,
} from "@/lib/canva/designs";
import { getBrandTemplateDataset } from "@/lib/canva/templates";
import { buildShellPptx } from "@/lib/creative/shells/pptx-builder";
import {
  validateShellSpec,
  type ShellValidationReport,
} from "@/lib/creative/shells/validate";

export type GeneratedShellResult = {
  key: string;
  title: string;
  dimensions: {
    width: number;
    height: number;
    unit: "px" | "in";
    widthPx: number;
    heightPx: number;
  };
  creationMethod: "pptx_design_import";
  designId: string;
  designEditUrl: string | null;
  designViewUrl: string | null;
  thumbnailUrl: string | null;
  brandTemplateId: string | null;
  brandTemplateViewUrl: string | null;
  publishAttempted: boolean;
  publishSucceeded: boolean;
  publishError: string | null;
  autofillFieldsCreated: false;
  autofillStatus: "not_created_via_api";
  liveDatasetFieldCount: number;
  liveDatasetFields: Array<{ name: string; type: string }>;
  expectedAutofillRoles: string[];
  lockedBrandElements: string[];
  validation: ShellValidationReport;
  missingLogoAssetEnv: string[];
  manualStepsRemaining: string[];
  registryCandidate: CreativeTemplate;
};

export type GenerateShellsReport = {
  success: true;
  capabilityAssessment: typeof CANVA_SHELL_CAPABILITY_ASSESSMENT;
  shells: GeneratedShellResult[];
  note: string;
};

/**
 * Generate the initial CE shell family:
 * PPTX → Canva design import → optional Brand Template publish attempt.
 * Does NOT mark templates approved. Does NOT invent Autofill fields.
 */
export async function generateCreativeShells(options?: {
  keys?: string[];
  attemptPublish?: boolean;
}): Promise<GenerateShellsReport> {
  const attemptPublish = options?.attemptPublish !== false;
  const specs = CREATIVE_SHELL_SPECS.filter((s) =>
    options?.keys?.length ? options.keys.includes(s.key) : true,
  );

  const shells: GeneratedShellResult[] = [];

  for (const spec of specs) {
    shells.push(await generateOneShell(spec, attemptPublish));
  }

  return {
    success: true,
    capabilityAssessment: CANVA_SHELL_CAPABILITY_ASSESSMENT,
    shells,
    note: "Autofill datasets cannot be created via Connect API. Operator must bind Data Autofill fields and approve registry entries after verification.",
  };
}

async function generateOneShell(
  spec: CreativeShellSpec,
  attemptPublish: boolean,
): Promise<GeneratedShellResult> {
  const validation = validateShellSpec(spec);
  if (!validation.ok) {
    throw new Error(
      `Shell spec ${spec.key} failed validation: ${validation.issues
        .map((i) => i.message)
        .join("; ")}`,
    );
  }

  const pptx = await buildShellPptx(spec);
  const imported = await importDesignFromBytes({
    bytes: pptx.buffer,
    title: spec.title,
    mimeType: pptx.mimeType,
  });

  let brandTemplateId: string | null = null;
  let brandTemplateViewUrl: string | null = null;
  let publishAttempted = false;
  let publishSucceeded = false;
  let publishError: string | null = null;

  if (attemptPublish) {
    publishAttempted = true;
    try {
      const published = await publishDesignAsBrandTemplate(imported.designId);
      brandTemplateId = published.id;
      brandTemplateViewUrl = published.viewUrl;
      publishSucceeded = true;
    } catch (error) {
      publishSucceeded = false;
      if (error instanceof CanvaApiError) {
        publishError = `${error.code}: ${error.message}`;
      } else if (error instanceof Error) {
        publishError = error.message;
      } else {
        publishError = "Publish failed";
      }
    }
  }

  let liveDataset: Record<string, { type: string }> = {};
  try {
    if (brandTemplateId) {
      liveDataset = await getBrandTemplateDataset(brandTemplateId);
    } else {
      liveDataset = await getDesignDataset(imported.designId);
    }
  } catch {
    liveDataset = {};
  }

  const liveDatasetFields = Object.entries(liveDataset).map(([name, field]) => ({
    name,
    type: field.type,
  }));

  const { widthPx, heightPx } = shellSpecToPixels(spec);
  const missingLogoAssetEnv = missingApprovedLogoAssetIds(getApprovedLogoAssets());

  const manualSteps: string[] = [
    ...CANVA_SHELL_CAPABILITY_ASSESSMENT.manualStepsRemaining,
  ];
  if (missingLogoAssetEnv.length > 0) {
    manualSteps.unshift(
      `Approved logo asset IDs missing (${missingLogoAssetEnv.join(", ")}). Replace logo zone markers with Brand Kit logos in Canva.`,
    );
  }
  if (!publishSucceeded) {
    manualSteps.unshift(
      "Publish the imported design as a Brand Template in Canva (API publish unavailable or denied).",
    );
  }

  const dataset: CreativeTemplate["dataset"] = {};
  for (const role of spec.requiredAutofillRoles) {
    dataset[role] = role === "QR_CODE" || role === "HERO_IMAGE" ? "image" : "text";
  }
  // HERO_IMAGE optional — include when zone exists
  if (spec.optionalAutofillRoles.includes("HERO_IMAGE")) {
    dataset.HERO_IMAGE = "image";
  }

  const registryCandidate: CreativeTemplate = {
    id: brandTemplateId ?? `PENDING_DESIGN_${imported.designId}`,
    title: spec.title,
    assetType: spec.assetType,
    width: spec.width,
    height: spec.height,
    unit: spec.unit,
    density: spec.density,
    backgroundTreatment: "light",
    contactTreatment: "compact",
    partnerTreatment: "sjjcc_uja",
    supportsImage: Boolean(
      spec.contentZones.some((z) => z.role === "HERO_IMAGE"),
    ),
    supportsQr: true,
    dataset,
    priority: 10,
    approved: false,
  };

  return {
    key: spec.key,
    title: spec.title,
    dimensions: {
      width: spec.width,
      height: spec.height,
      unit: spec.unit,
      widthPx,
      heightPx,
    },
    creationMethod: "pptx_design_import",
    designId: imported.designId,
    designEditUrl: imported.editUrl,
    designViewUrl: imported.viewUrl,
    thumbnailUrl: imported.thumbnailUrl,
    brandTemplateId,
    brandTemplateViewUrl,
    publishAttempted,
    publishSucceeded,
    publishError,
    autofillFieldsCreated: false,
    autofillStatus: "not_created_via_api",
    liveDatasetFieldCount: liveDatasetFields.length,
    liveDatasetFields,
    expectedAutofillRoles: [
      ...spec.requiredAutofillRoles,
      ...spec.optionalAutofillRoles,
    ],
    lockedBrandElements: [
      "bottom_brand_bar",
      "sjjcc_logo_zone",
      "uja_logo_zone",
      "qr_placement_above_brand_bar",
    ],
    validation,
    missingLogoAssetEnv,
    manualStepsRemaining: manualSteps,
    registryCandidate,
  };
}

/**
 * Build registry candidates from generation results (approved=false).
 * Prefer real brandTemplateId when publish succeeded.
 */
export function candidatesFromGeneration(
  shells: GeneratedShellResult[],
): CreativeTemplate[] {
  return shells.map((s) => s.registryCandidate);
}
