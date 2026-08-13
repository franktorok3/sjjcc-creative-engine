import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { CanvaApiError } from "@/lib/canva/client";
import { CanvaAuthError } from "@/lib/canva/oauth";
import { CanvaDesignImportError } from "@/lib/canva/design-imports";
import { assertAdminSecret } from "@/lib/creative/admin-auth";
import { generateCreativeShells } from "@/lib/creative/shells/generate";
import { CANVA_SHELL_CAPABILITY_ASSESSMENT } from "@/config/canva-shell-capabilities";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Operator-only: generate CE shell family via PPTX → Canva import.
 * Header: X-Admin-Secret
 * Resolves CREATIVE_ENGINE_ADMIN_SECRET, else GOOGLE_FORM_WEBHOOK_SECRET.
 *
 * Body (optional JSON):
 *   { "keys": ["flyer_standard_light"], "attemptPublish": true, "persistCandidates": true }
 */
export async function POST(request: Request) {
  try {
    assertAdminSecret(request);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: string }).code)
        : "ADMIN_UNAUTHORIZED";
    const status =
      code === "ADMIN_SECRET_MISSING"
        ? 503
        : code === "ADMIN_UNAUTHORIZED"
          ? 401
          : 403;
    return NextResponse.json(
      {
        success: false,
        error: code,
        message: error instanceof Error ? error.message : "Unauthorized",
      },
      { status },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      keys?: string[];
      attemptPublish?: boolean;
      persistCandidates?: boolean;
    };

    const report = await generateCreativeShells({
      keys: body.keys,
      attemptPublish: body.attemptPublish,
    });

    if (body.persistCandidates !== false) {
      try {
        await persistCandidateRegistry(
          report.shells.map((s) => s.registryCandidate),
        );
        await persistGenerationResults(report.shells.map(sanitizeShell));
      } catch {
        // Vercel FS is ephemeral/read-only — response still contains candidates.
      }
    }

    return NextResponse.json({
      success: true,
      capabilityAssessment: report.capabilityAssessment,
      shells: report.shells.map(sanitizeShell),
      note: report.note,
      previewPath: "/admin/shells",
    });
  } catch (error) {
    if (error instanceof CanvaAuthError) {
      return NextResponse.json(
        { success: false, error: error.code, message: error.message },
        { status: 401 },
      );
    }
    if (
      error instanceof CanvaApiError ||
      error instanceof CanvaDesignImportError
    ) {
      return NextResponse.json(
        {
          success: false,
          error: error.code,
          message: error.message,
          ...(error instanceof CanvaApiError ? { status: error.status } : {}),
        },
        { status: 502 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: "SHELL_GENERATION_FAILED", message },
      { status: 500 },
    );
  }
}

/** Capability assessment without generating (still requires admin secret). */
export async function GET(request: Request) {
  try {
    assertAdminSecret(request);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: string }).code)
        : "ADMIN_UNAUTHORIZED";
    return NextResponse.json(
      {
        success: false,
        error: code,
        message: error instanceof Error ? error.message : "Unauthorized",
      },
      { status: code === "ADMIN_SECRET_MISSING" ? 503 : 401 },
    );
  }

  return NextResponse.json({
    success: true,
    capabilityAssessment: CANVA_SHELL_CAPABILITY_ASSESSMENT,
  });
}

function sanitizeShell(shell: Awaited<
  ReturnType<typeof generateCreativeShells>
>["shells"][number]) {
  return {
    key: shell.key,
    title: shell.title,
    dimensions: shell.dimensions,
    creationMethod: shell.creationMethod,
    designId: shell.designId,
    designEditUrl: shell.designEditUrl,
    designViewUrl: shell.designViewUrl,
    thumbnailUrl: shell.thumbnailUrl,
    importJobId: shell.importJobId,
    importJobStatus: shell.importJobStatus,
    editableImportConfirmed: shell.editableImportConfirmed,
    brandTemplateId: shell.brandTemplateId,
    brandTemplateViewUrl: shell.brandTemplateViewUrl,
    publishAttempted: shell.publishAttempted,
    publishSucceeded: shell.publishSucceeded,
    publishError: shell.publishError,
    manualPublishRequired: shell.manualPublishRequired,
    AutofillBindingRequired: shell.AutofillBindingRequired,
    logoReplacementRequired: shell.logoReplacementRequired,
    autofillFieldsCreated: shell.autofillFieldsCreated,
    autofillStatus: shell.autofillStatus,
    liveDatasetFieldCount: shell.liveDatasetFieldCount,
    liveDatasetFields: shell.liveDatasetFields,
    expectedAutofillRoles: shell.expectedAutofillRoles,
    lockedBrandElements: shell.lockedBrandElements,
    validation: shell.validation,
    missingLogoAssetEnv: shell.missingLogoAssetEnv,
    finishingChecklist: shell.finishingChecklist,
    manualStepsRemaining: shell.manualStepsRemaining,
    registryCandidate: shell.registryCandidate,
  };
}

async function persistCandidateRegistry(
  candidates: Array<{
    id: string;
    title: string;
    assetType: string;
    width: number;
    height: number;
    unit: string;
    density: string;
    backgroundTreatment: string;
    contactTreatment: string;
    partnerTreatment: string;
    supportsImage: boolean;
    supportsQr: boolean;
    dataset: Record<string, string>;
    priority: number;
    approved: boolean;
  }>,
): Promise<void> {
  const dir = path.join(process.cwd(), "config");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "canva-template-candidates.generated.json");
  await writeFile(
    filePath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: "Candidates only — approved=false. Copy verified entries into config/canva-templates.ts after dataset inspection.",
        candidates,
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function persistGenerationResults(shells: unknown[]): Promise<void> {
  const dir = path.join(process.cwd(), "config");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "canva-shell-generation.latest.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        shells,
      },
      null,
      2,
    ),
    "utf8",
  );
}
