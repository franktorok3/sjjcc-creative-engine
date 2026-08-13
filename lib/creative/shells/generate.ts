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
import { SHELL_FINISHING_CHECKLIST } from "@/config/shell-finishing-checklist";

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
  importJobId: string;
  importJobStatus: "success" | "failed" | "in_progress";
  editableImportConfirmed: boolean;
  brandTemplateId: string | null;
  brandTemplateViewUrl: string | null;
  publishAttempted: boolean;
  publishSucceeded: boolean;
  publishError: string | null;
  manualPublishRequired: boolean;
  AutofillBindingRequired: true;
  logoReplacementRequired: boolean;
  autofillFieldsCreated: false;
  autofillStatus: "not_created_via_api";
  liveDatasetFieldCount: number;
  liveDatasetFields: Array<{ name: string; type: string }>;
  expectedAutofillRoles: string[];
  lockedBrandElements: string[];
  validation: ShellValidationReport;
  missingLogoAssetEnv: string[];
  finishingChecklist: string[];
  manualStepsRemaining: string[];
  registryCandidate: CreativeTemplate;
};

export type GenerateShellsReport = {
  success: true;
  capabilityAssessment: typeof CANVA_SHELL_CAPABILITY_ASSESSMENT;
  shells: GeneratedShellResult[];
  note: string;
};

const FINISHING_CHECKLIST = SHELL_FINISHING_CHECKLIST;

/**
 * Generate the initial CE shell family:
 * PPTX → Canva design import → optional Brand Template publish attempt.
 *
 * First successful operational target is an editable Canva design URL.
 * Brand Template publication is best-effort and never blocks generation.
 * Does NOT mark templates approved. Does NOT invent Autofill fields.
 */
export async function generateCreativeShells(options?: {
  keys?: string[];
  /** Default true — attempt publish; denial sets manualPublishRequired. */
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
    note: "Editable Canva designs created via PPTX import. Autofill binding and Brand Kit logo replacement remain one-time operator steps. Candidates stay approved=false.",
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
      // Do not fail generation — scopes may lack brandtemplate:content:write
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

  const manualPublishRequired = !publishSucceeded;

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
  const logoReplacementRequired = true;

  const finishingChecklist = [...FINISHING_CHECKLIST];
  const manualSteps: string[] = [
    "Replace [[SJJCC_LOGO_LOCKUP]] and [[UJA_LOGO]] with approved Brand Kit assets",
    "Bind Data Autofill fields to visible [[FIELD]] markers",
    "Bind [[QR_CODE]] as an image Autofill field",
    "Confirm QR sits above the brand bar",
  ];
  if (manualPublishRequired) {
    manualSteps.push(
      "Publish the design as a Brand Template in Canva (API publish unavailable or denied)",
    );
  }
  manualSteps.push(
    "Run dataset inspection, then set approved=true only after verification",
  );

  const dataset: CreativeTemplate["dataset"] = {};
  for (const role of spec.requiredAutofillRoles) {
    dataset[role] = role === "QR_CODE" || role === "HERO_IMAGE" ? "image" : "text";
  }
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
    importJobId: imported.jobId,
    importJobStatus: imported.importJobStatus,
    editableImportConfirmed: imported.editableImportConfirmed,
    brandTemplateId,
    brandTemplateViewUrl,
    publishAttempted,
    publishSucceeded,
    publishError,
    manualPublishRequired,
    AutofillBindingRequired: true,
    logoReplacementRequired,
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
    finishingChecklist,
    manualStepsRemaining: manualSteps,
    registryCandidate,
  };
}

export function candidatesFromGeneration(
  shells: GeneratedShellResult[],
): CreativeTemplate[] {
  return shells.map((s) => s.registryCandidate);
}
