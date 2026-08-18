import "server-only";
import {
  buildCreativeDraftHtml,
  createMessageBoardMessage,
} from "@/lib/basecamp/client";
import { autofillBrandTemplate } from "@/lib/canva/autofill";
import {
  assertBrandTemplateStructure,
  BrandStructureError,
} from "@/lib/canva/brand-validation";
import { createDesignFromBrandTemplate } from "@/lib/canva/designs";
import { getBrandTemplateDataset } from "@/lib/canva/templates";
import {
  attachQrAutofillFromDestinationUrl,
  attachQrAutofillToField,
  flattenNamedValues,
  getPromotionName,
} from "@/lib/creative/branded-mapping";
import { classifyCreativeRequest } from "@/lib/creative/classify";
import type { CreativeWorkflowPayload } from "@/lib/creative/creative-request";
import {
  creativeRequestToFormFields,
  googleFormToCreativeRequest,
} from "@/lib/creative/creative-request";
import {
  CreativeEngineError,
  DatasetMismatchError,
} from "@/lib/creative/errors";
import { logFailed, logMilestone } from "@/lib/creative/logging";
import {
  assertNoBrandOverwriteFromUser,
  mapCreativeRequestToCanvaData,
} from "@/lib/creative/map-request";
import { mapRequestToLiveCanvaDataset } from "@/lib/creative/map-request-to-live-dataset";
import { MappingError } from "@/lib/creative/mapping";
import {
  selectCreativeTemplate,
  validateTemplateDataset,
} from "@/lib/creative/select-template";
import { selectLiveCanvaLayout } from "@/lib/creative/select-live-canva-layout";
import {
  isBasecampPostingEnabled,
  isCreativeEngineTestMode,
  isGoogleFormProcessingEnabled,
} from "@/lib/creative/test-mode";
import type { CreativeRequest } from "@/lib/creative/types";
import { ASSET_TYPE_LABELS } from "@/lib/creative/types";
import { logCreativeStage } from "@/lib/creative/workflow-stage-log";
import type { CanvaAutofillData, CanvaBrandTemplateDataset } from "@/lib/canva/types";

/** @deprecated Prefer CreativeWorkflowPayload — kept for Google Form callers. */
export type FormSubmitPayload = Extract<
  CreativeWorkflowPayload,
  { source: "google_form" }
>;

export type WorkflowSuccess = {
  success: true;
  requestId: string;
  canvaDesignId: string;
  canvaDesignUrl: string;
  basecampMessageId: string | null;
  basecampMessageUrl: string | null;
  basecampPosting: "posted" | "disabled" | "skipped";
  testMode: boolean;
  contentDensity?: string;
  qrAssetId?: string;
  templateTitle?: string;
  assetType?: string;
  creationMethod?: "brand_template_autofill" | "brand_template_copy";
  layoutSource?:
    | "approved_registry"
    | "shell_brand_template"
    | "live_discovery"
    | "configured_env"
    | "agentic_fallback";
  shellKey?: string;
  shellTitle?: string;
  autofillApplied?: boolean;
  brandChecks?: {
    approvedLayout: boolean;
    brandTreatment: boolean;
    qrGenerated: boolean;
    contentMapped: boolean;
  };
};

/**
 * Shared Creative Engine path for Google Form and the native portal.
 *
 * Flow:
 * classify → prefer approved registry → else form asset → CE shell shape →
 * live Canva Brand Template for that shell → Autofill fills content → Basecamp
 *
 * Always uses a real Canva Brand Template layout (never PPTX).
 */
export async function runFormToCanvaToBasecampWorkflow(
  payload: CreativeWorkflowPayload,
  requestId: string,
): Promise<WorkflowSuccess> {
  try {
    // Test mode: only native portal may enter the full Canva/Basecamp path.
    if (
      payload.source === "google_form" &&
      !isGoogleFormProcessingEnabled()
    ) {
      logCreativeStage("google_form_processing_disabled", { requestId });
      throw new CreativeEngineError(
        "GOOGLE_FORM_PROCESSING_DISABLED",
        "Google Form processing is currently disabled while the Creative Engine is in test mode.",
      );
    }

    if (
      isCreativeEngineTestMode() &&
      payload.source !== "creative_engine_portal"
    ) {
      throw new CreativeEngineError(
        "TEST_MODE_PORTAL_ONLY",
        "Only creative_engine_portal requests may run the Creative Engine workflow during test mode.",
      );
    }

    logMilestone(
      requestId,
      "FORM_RECEIVED",
      `source=${payload.source}`,
    );
    logCreativeStage("request_validated", {
      requestId,
      source: payload.source,
    });

    const request = resolveCreativeRequest(payload);
    const classification = classifyCreativeRequest(request);

    logMilestone(
      requestId,
      "CLASSIFIED",
      `asset=${request.assetType} density=${classification.density} contact=${classification.contactTreatment} image=${request.imageTreatment} qr=${classification.requiresQr}`,
    );
    logCreativeStage("request_classified", {
      requestId,
      assetType: request.assetType,
      density: classification.density,
      requiresQr: classification.requiresQr,
    });

    const selection = selectCreativeTemplate(request, classification);

    let brandTemplateId: string;
    let templateTitle: string;
    let dataset: CanvaBrandTemplateDataset;
    let layoutSource: NonNullable<WorkflowSuccess["layoutSource"]>;
    let data: CanvaAutofillData = {};
    let mappedRoles: string[] = [];
    let approvedLayout = false;
    let liveQrFieldName: string | null = null;
    let shellKey: string | undefined;
    let shellTitle: string | undefined;
    let fillMode: "autofill" | "visual_copy" = "autofill";

    if (selection.ok) {
      const template = selection.template;
      brandTemplateId = template.id;
      templateTitle = template.title;
      layoutSource = "approved_registry";
      approvedLayout = true;

      logMilestone(
        requestId,
        "TEMPLATE_SELECTED",
        `title=${template.title} id=${template.id}`,
      );
      logCreativeStage("template_selected", {
        requestId,
        templateTitle: template.title,
        templateId: template.id,
        mode: "approved_registry",
      });

      dataset = await getBrandTemplateDataset(template.id);
      const liveTypes: Record<string, string> = {};
      for (const [name, field] of Object.entries(dataset)) {
        liveTypes[name] = field.type;
      }

      const datasetCheck = validateTemplateDataset(template, liveTypes);
      if (!datasetCheck.ok) {
        throw new DatasetMismatchError(
          [
            "Selected template dataset does not match the approved registry contract.",
            datasetCheck.missing.length
              ? `Missing fields: ${datasetCheck.missing.join(", ")}`
              : "",
            datasetCheck.typeMismatches.length
              ? `Type mismatches: ${datasetCheck.typeMismatches.join("; ")}`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
          datasetCheck,
        );
      }

      if (template.supportsQr) {
        assertBrandTemplateStructure(dataset);
        logMilestone(
          requestId,
          "CANVA_BRAND_STRUCTURE_OK",
          `templateId=${template.id}`,
        );
      }

      const mapped = mapCreativeRequestToCanvaData({
        request,
        classification,
        template,
        liveDataset: dataset,
        requestId,
      });
      data = mapped.data;
      mappedRoles = mapped.mappedRoles;
    } else {
      // Form → shell → Canva Brand Template (Autofill when possible; never PPTX).
      const live = await selectLiveCanvaLayout({ request, requestId });
      brandTemplateId = live.id;
      templateTitle = live.title;
      dataset = live.dataset;
      layoutSource = live.selectionMode;
      shellKey = live.shellKey;
      shellTitle = live.shellTitle;
      fillMode = live.fillMode;

      if (live.fillMode === "autofill") {
        const mapped = mapRequestToLiveCanvaDataset({
          request,
          classification,
          dataset,
          requestId,
        });
        data = mapped.data;
        mappedRoles = mapped.mappedRoles;
        liveQrFieldName = mapped.qrFieldName;
      }
    }

    logCreativeStage("dataset_validated", {
      requestId,
      templateId: brandTemplateId,
      fieldCount: Object.keys(dataset).length,
      layoutSource,
      fillMode,
    });
    logMilestone(
      requestId,
      "CANVA_TEMPLATE_VALIDATED",
      `templateId=${brandTemplateId} source=${layoutSource} fill=${fillMode}`,
    );

    assertNoBrandOverwriteFromUser(data);

    const fields = flattenNamedValues(
      payload.fields ?? creativeRequestToFormFields(request),
    );
    if (request.registrationUrl && !fields["Registration URL"]) {
      fields["Registration URL"] = request.registrationUrl;
    }

    const promotionName = request.programName || getPromotionName(fields);

    let qrGenerated = false;
    let qrAssetId: string | undefined;
    if (fillMode === "autofill" && classification.requiresQr) {
      if (liveQrFieldName && request.registrationUrl) {
        const withQr = await attachQrAutofillToField({
          destinationUrl: request.registrationUrl,
          qrField: liveQrFieldName,
          dataset,
          data,
          requestId,
        });
        data = withQr.data;
        qrAssetId = withQr.qrAssetId;
        qrGenerated = true;
      } else if (selection.ok) {
        const withQr = await attachQrAutofillFromDestinationUrl({
          fields,
          dataset,
          data,
          requestId,
        });
        data = withQr.data;
        qrAssetId = withQr.qrAssetId;
        qrGenerated = !withQr.skipped;
      } else if (request.registrationUrl) {
        logMilestone(
          requestId,
          "CANVA_QR_SKIPPED",
          "Live Canva layout has no QR image Autofill field",
        );
      }

      if (qrGenerated) {
        logMilestone(
          requestId,
          "CANVA_QR_ATTACHED",
          `assetId=${qrAssetId}`,
        );
        logCreativeStage("qr_generated", {
          requestId,
          attached: true,
        });
      }
    }

    assertNoBrandOverwriteFromUser(data);

    let designId: string;
    let designUrl: string;
    let creationMethod: NonNullable<WorkflowSuccess["creationMethod"]>;
    const autofillApplied = fillMode === "autofill";

    if (fillMode === "autofill") {
      logCreativeStage("canva_autofill_started", {
        requestId,
        templateId: brandTemplateId,
        layoutSource,
      });
      const design = await autofillBrandTemplate({
        brandTemplateId,
        title: promotionName,
        data,
        onJobStarted: (jobId) => {
          logMilestone(requestId, "CANVA_AUTOFILL_STARTED", `jobId=${jobId}`);
        },
      });
      designId = design.designId;
      designUrl = design.editUrl || design.designUrl;
      creationMethod = "brand_template_autofill";
      logMilestone(
        requestId,
        "CANVA_AUTOFILL_COMPLETE",
        `designId=${design.designId}`,
      );
      logCreativeStage("canva_autofill_complete", {
        requestId,
        designId: design.designId,
      });
    } else {
      // Real Canva Brand Template layout opened as editable copy.
      // Content Autofill is unavailable until Data Autofill fields are bound.
      logCreativeStage("canva_autofill_started", {
        requestId,
        templateId: brandTemplateId,
        mode: "visual_copy",
      });
      const design = await createDesignFromBrandTemplate({
        brandTemplateId,
        title: promotionName,
      });
      designId = design.id;
      designUrl =
        design.urls?.edit_url ||
        design.urls?.view_url ||
        `https://www.canva.com/design/${design.id}/edit`;
      creationMethod = "brand_template_copy";
      logCreativeStage("canva_autofill_complete", {
        requestId,
        designId,
        mode: "visual_copy",
      });
      logMilestone(
        requestId,
        "CANVA_LAYOUT_COPY_COMPLETE",
        `designId=${designId} (Autofill fields not bound yet)`,
      );
    }

    // Basecamp only after Canva success — never on Canva/QR/dataset failure.
    let basecampMessageId: string | null = null;
    let basecampMessageUrl: string | null = null;
    let basecampPosting: WorkflowSuccess["basecampPosting"] = "skipped";

    if (!isBasecampPostingEnabled()) {
      logCreativeStage("basecamp_posting_skipped", {
        requestId,
        reason: "CREATIVE_ENGINE_BASECAMP_POSTING_ENABLED=false",
      });
      basecampPosting = "disabled";
    } else {
      logMilestone(requestId, "BASECAMP_POST_STARTED");
      logCreativeStage("basecamp_post_started", { requestId });
      const html = buildCreativeDraftHtml({
        promotionName,
        submittedAt: payload.submittedAt,
        fields: {
          "Asset Type": ASSET_TYPE_LABELS[request.assetType],
          ...(request.department ? { Department: request.department } : {}),
          Source:
            request.source === "creative_engine_portal"
              ? "Creative Engine Portal"
              : "Google Form",
          Layout: `${templateTitle} (${layoutSource})`,
          Fill: autofillApplied ? "Autofill" : "Brand Template copy",
          ...(request.registrationUrl
            ? { "Registration URL": request.registrationUrl }
            : {}),
          Summary: [
            classification.density,
            request.imageTreatment,
            classification.contactTreatment,
          ].join(" · "),
          ...(isCreativeEngineTestMode() ? { Mode: "TEST MODE" } : {}),
        },
        canvaDesignUrl: designUrl,
        status: autofillApplied
          ? "Canva draft generated from Brand Template Autofill"
          : "Canva Brand Template copy opened (bind Autofill fields for full agentic fill)",
      });

      const message = await createMessageBoardMessage({
        subject: `Creative Draft: ${promotionName}`,
        content: html,
        status: "active",
      });

      basecampMessageId = String(message.id);
      basecampMessageUrl = message.app_url || message.url || "";
      basecampPosting = "posted";

      logMilestone(
        requestId,
        "BASECAMP_POST_COMPLETE",
        `messageId=${basecampMessageId}`,
      );
      logCreativeStage("basecamp_post_complete", {
        requestId,
        messageId: basecampMessageId,
      });
    }

    logMilestone(requestId, "WORKFLOW_COMPLETE");

    return {
      success: true,
      requestId,
      canvaDesignId: designId,
      canvaDesignUrl: designUrl,
      basecampMessageId,
      basecampMessageUrl,
      basecampPosting,
      testMode: isCreativeEngineTestMode(),
      contentDensity: classification.density,
      ...(qrAssetId ? { qrAssetId } : {}),
      templateTitle,
      assetType: request.assetType,
      creationMethod,
      autofillApplied,
      layoutSource,
      ...(shellKey ? { shellKey } : {}),
      ...(shellTitle ? { shellTitle } : {}),
      brandChecks: {
        approvedLayout,
        brandTreatment: true,
        qrGenerated: classification.requiresQr ? qrGenerated : true,
        contentMapped: mappedRoles.length > 0,
      },
    };
  } catch (error) {
    const stage = inferStage(error);
    const reason = error instanceof Error ? error.message : "Unknown error";
    logFailed(requestId, stage, reason);
    logCreativeStage("workflow_failed", {
      requestId,
      stage,
      code:
        error && typeof error === "object" && "code" in error
          ? String((error as { code: string }).code)
          : undefined,
    });
    throw error;
  }
}

function resolveCreativeRequest(
  payload: CreativeWorkflowPayload,
): CreativeRequest {
  if (payload.request) {
    return payload.request;
  }
  if (payload.source === "google_form") {
    return googleFormToCreativeRequest({
      submittedAt: payload.submittedAt,
      fields: payload.fields,
    });
  }
  throw new MappingError(
    "CREATIVE_REQUEST_MISSING",
    "Portal workflow payload is missing a normalized CreativeRequest.",
  );
}

function inferStage(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  const name = (error as { name?: string }).name ?? "";
  const code = (error as { code?: string }).code ?? "";

  if (code === "NO_APPROVED_TEMPLATE" || code === "NO_CANVA_LAYOUT") {
    return "template_selection";
  }
  if (code === "DATASET_MISMATCH") return "dataset_validation";
  if (
    name.includes("Mapping") ||
    code.includes("FORM") ||
    code.includes("MAPPING") ||
    code.includes("REQUIRED_FORM")
  ) {
    return "mapping";
  }
  if (
    name.includes("BrandStructure") ||
    code.includes("BRAND") ||
    code.includes("QR_") ||
    code.includes("LOCKED_FIELD")
  ) {
    return "brand_structure";
  }
  if (name.includes("Canva") || code.startsWith("CANVA_")) return "canva";
  if (name.includes("Basecamp") || code.startsWith("BASECAMP_")) return "basecamp";
  if (error instanceof MappingError) return "mapping";
  if (error instanceof BrandStructureError) return "brand_structure";
  return "workflow";
}
