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
import { getBrandTemplateDataset } from "@/lib/canva/templates";
import {
  attachQrAutofillFromDestinationUrl,
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
  DatasetMismatchError,
  NoApprovedTemplateError,
} from "@/lib/creative/errors";
import { logFailed, logMilestone } from "@/lib/creative/logging";
import {
  assertNoBrandOverwriteFromUser,
  mapCreativeRequestToCanvaData,
} from "@/lib/creative/map-request";
import { MappingError } from "@/lib/creative/mapping";
import {
  selectCreativeTemplate,
  validateTemplateDataset,
} from "@/lib/creative/select-template";
import type { CreativeRequest } from "@/lib/creative/types";
import { ASSET_TYPE_LABELS } from "@/lib/creative/types";

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
  basecampMessageId: string;
  basecampMessageUrl: string;
  qrAssetId?: string;
  templateTitle?: string;
  assetType?: string;
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
 * classify → select approved template → validate dataset →
 * QR/assets → Canva Autofill → Basecamp
 *
 * Does not fall back to arbitrary CANVA_BRAND_TEMPLATE_ID when no approved
 * registry match exists (Phase 1: registry empty → NO_APPROVED_TEMPLATE).
 */
export async function runFormToCanvaToBasecampWorkflow(
  payload: CreativeWorkflowPayload,
  requestId: string,
): Promise<WorkflowSuccess> {
  try {
    logMilestone(
      requestId,
      "FORM_RECEIVED",
      `source=${payload.source}`,
    );

    const request = resolveCreativeRequest(payload);
    const classification = classifyCreativeRequest(request);

    logMilestone(
      requestId,
      "CLASSIFIED",
      `asset=${request.assetType} density=${classification.density} contact=${classification.contactTreatment} image=${request.imageTreatment} qr=${classification.requiresQr}`,
    );

    const selection = selectCreativeTemplate(request, classification);
    if (!selection.ok) {
      throw new NoApprovedTemplateError(selection.reason, {
        requirements: selection.requirements,
        summary: {
          asset: ASSET_TYPE_LABELS[request.assetType],
          content: classification.density,
          image: request.imageTreatment,
          contact: classification.contactTreatment,
          partner:
            classification.partnerTreatment === "sjjcc_uja_partner"
              ? "Yes"
              : "SJJCC + UJA",
          registration: classification.requiresQr
            ? "QR enabled"
            : request.requiresRegistration
              ? "URL only"
              : "None",
        },
      });
    }

    const template = selection.template;
    logMilestone(
      requestId,
      "TEMPLATE_SELECTED",
      `title=${template.title} id=${template.id}`,
    );

    const dataset = await getBrandTemplateDataset(template.id);
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

    // Soft structure check for QR role when template claims QR support
    if (template.supportsQr) {
      try {
        assertBrandTemplateStructure(dataset);
        logMilestone(requestId, "CANVA_BRAND_STRUCTURE_OK", `templateId=${template.id}`);
      } catch (error) {
        // If structure assert fails only because of unconfigured env template, rethrow brand errors
        if (error instanceof BrandStructureError) {
          throw error;
        }
        throw error;
      }
    }

    logMilestone(requestId, "CANVA_TEMPLATE_VALIDATED", `templateId=${template.id}`);

    const { data: mappedData, mappedRoles } = mapCreativeRequestToCanvaData({
      request,
      classification,
      template,
      liveDataset: dataset,
      requestId,
    });
    let data = mappedData;
    assertNoBrandOverwriteFromUser(data);

    const fields = flattenNamedValues(
      payload.fields ?? creativeRequestToFormFields(request),
    );
    // Ensure registration URL is present for QR destination lookup
    if (request.registrationUrl && !fields["Registration URL"]) {
      fields["Registration URL"] = request.registrationUrl;
    }

    const promotionName = request.programName || getPromotionName(fields);

    let qrGenerated = false;
    let qrAssetId: string | undefined;
    if (classification.requiresQr) {
      const withQr = await attachQrAutofillFromDestinationUrl({
        fields,
        dataset,
        data,
        requestId,
      });
      data = withQr.data;
      qrAssetId = withQr.qrAssetId;
      qrGenerated = !withQr.skipped;
      if (qrGenerated) {
        logMilestone(
          requestId,
          "CANVA_QR_ATTACHED",
          `assetId=${withQr.qrAssetId}`,
        );
      }
    }

    assertNoBrandOverwriteFromUser(data);

    const design = await autofillBrandTemplate({
      brandTemplateId: template.id,
      title: promotionName,
      data,
      onJobStarted: (jobId) => {
        logMilestone(requestId, "CANVA_AUTOFILL_STARTED", `jobId=${jobId}`);
      },
    });

    logMilestone(
      requestId,
      "CANVA_AUTOFILL_COMPLETE",
      `designId=${design.designId}`,
    );

    logMilestone(requestId, "BASECAMP_POST_STARTED");
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
        ...(request.registrationUrl
          ? { "Registration URL": request.registrationUrl }
          : {}),
        Summary: [
          classification.density,
          request.imageTreatment,
          classification.contactTreatment,
        ].join(" · "),
      },
      canvaDesignUrl: design.designUrl,
      status: "Canva draft generated (approved Creative Engine layout)",
    });

    const message = await createMessageBoardMessage({
      subject: `Creative Draft: ${promotionName}`,
      content: html,
      status: "active",
    });

    const messageId = String(message.id);
    const messageUrl = message.app_url || message.url || "";

    logMilestone(
      requestId,
      "BASECAMP_POST_COMPLETE",
      `messageId=${messageId}`,
    );
    logMilestone(requestId, "WORKFLOW_COMPLETE");

    return {
      success: true,
      requestId,
      canvaDesignId: design.designId,
      canvaDesignUrl: design.designUrl,
      basecampMessageId: messageId,
      basecampMessageUrl: messageUrl,
      ...(qrAssetId ? { qrAssetId } : {}),
      templateTitle: template.title,
      assetType: request.assetType,
      brandChecks: {
        approvedLayout: true,
        brandTreatment: true,
        qrGenerated: classification.requiresQr ? qrGenerated : true,
        contentMapped: mappedRoles.length > 0,
      },
    };
  } catch (error) {
    const stage = inferStage(error);
    const reason = error instanceof Error ? error.message : "Unknown error";
    logFailed(requestId, stage, reason);
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

  if (code === "NO_APPROVED_TEMPLATE") return "template_selection";
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
