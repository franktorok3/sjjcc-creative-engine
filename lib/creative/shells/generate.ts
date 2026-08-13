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
import { startDesignImport } from "@/lib/canva/design-imports";
import { buildShellPptx } from "@/lib/creative/shells/pptx-builder";
import { logShellStage } from "@/lib/creative/shells/stage-log";
import {
  validateShellSpec,
  type ShellValidationReport,
} from "@/lib/creative/shells/validate";
import { SHELL_FINISHING_CHECKLIST } from "@/config/shell-finishing-checklist";

export type SubmittedShellJob = {
  shellKey: string;
  title: string;
  importJobId: string;
  statusUrl: string;
  dimensions: {
    width: number;
    height: number;
    unit: "px" | "in";
    widthPx: number;
    heightPx: number;
  };
  validation: ShellValidationReport;
  missingLogoAssetEnv: string[];
  expectedAutofillRoles: string[];
  registryCandidatePreview: Omit<CreativeTemplate, "id"> & { id: string };
};

export type SubmitShellImportsReport = {
  success: true;
  status: "processing";
  capabilityAssessment: typeof CANVA_SHELL_CAPABILITY_ASSESSMENT;
  jobs: SubmittedShellJob[];
  note: string;
};

/**
 * Build PPTX shells and create Canva import jobs — does NOT wait for import
 * completion. Callers should poll GET /api/admin/canva/shell-jobs?jobId=…
 */
export async function submitCreativeShellImports(options?: {
  keys?: string[];
}): Promise<SubmitShellImportsReport> {
  const specs = CREATIVE_SHELL_SPECS.filter((s) =>
    options?.keys?.length ? options.keys.includes(s.key) : true,
  );

  const jobs: SubmittedShellJob[] = [];

  for (const spec of specs) {
    jobs.push(await submitOneShellImport(spec));
  }

  return {
    success: true,
    status: "processing",
    capabilityAssessment: CANVA_SHELL_CAPABILITY_ASSESSMENT,
    jobs,
    note: "Canva import jobs created. Poll /api/admin/canva/shell-jobs?jobId=… for status. Autofill binding and Brand Kit logo replacement remain one-time operator steps. Candidates stay approved=false.",
  };
}

async function submitOneShellImport(
  spec: CreativeShellSpec,
): Promise<SubmittedShellJob> {
  const validation = validateShellSpec(spec);
  if (!validation.ok) {
    throw new Error(
      `Shell spec ${spec.key} failed validation: ${validation.issues
        .map((i) => i.message)
        .join("; ")}`,
    );
  }

  logShellStage("pptx_generation_started", { shellKey: spec.key });
  const pptx = await buildShellPptx(spec);
  logShellStage("pptx_generation_complete", {
    shellKey: spec.key,
    bytes: pptx.buffer.byteLength,
  });

  logShellStage("canva_import_started", {
    shellKey: spec.key,
    title: spec.title,
  });
  const { importJobId } = await startDesignImport({
    bytes: pptx.buffer,
    title: spec.title,
    mimeType: pptx.mimeType,
  });
  logShellStage("canva_import_job_created", {
    shellKey: spec.key,
    importJobId,
  });

  const { widthPx, heightPx } = shellSpecToPixels(spec);
  const missingLogoAssetEnv = missingApprovedLogoAssetIds(getApprovedLogoAssets());

  const dataset: CreativeTemplate["dataset"] = {};
  for (const role of spec.requiredAutofillRoles) {
    dataset[role] = role === "QR_CODE" || role === "HERO_IMAGE" ? "image" : "text";
  }
  if (spec.optionalAutofillRoles.includes("HERO_IMAGE")) {
    dataset.HERO_IMAGE = "image";
  }

  const registryCandidatePreview: SubmittedShellJob["registryCandidatePreview"] =
    {
      id: `PENDING_IMPORT_${importJobId}`,
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
    shellKey: spec.key,
    title: spec.title,
    importJobId,
    statusUrl: `/api/admin/canva/shell-jobs?jobId=${encodeURIComponent(importJobId)}`,
    dimensions: {
      width: spec.width,
      height: spec.height,
      unit: spec.unit,
      widthPx,
      heightPx,
    },
    validation,
    missingLogoAssetEnv,
    expectedAutofillRoles: [
      ...spec.requiredAutofillRoles,
      ...spec.optionalAutofillRoles,
    ],
    registryCandidatePreview,
  };
}

export function finishingChecklistForShell(): string[] {
  return [...SHELL_FINISHING_CHECKLIST];
}
