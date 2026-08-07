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
import {
  getBrandTemplateDataset,
  getConfiguredBrandTemplateId,
} from "@/lib/canva/templates";
import {
  assertRequiredFormFields,
  attachQrAutofillFromDestinationUrl,
  flattenNamedValues,
  getPromotionName,
  mapFormFieldsToCanvaDataSafe,
} from "@/lib/creative/branded-mapping";
import { logFailed, logMilestone } from "@/lib/creative/logging";
import { MappingError } from "@/lib/creative/mapping";

export type FormSubmitPayload = {
  source: "google_form";
  submittedAt: string;
  fields: Record<string, unknown>;
};

export type WorkflowSuccess = {
  success: true;
  requestId: string;
  canvaDesignId: string;
  canvaDesignUrl: string;
  basecampMessageId: string;
  basecampMessageUrl: string;
  qrAssetId?: string;
};

export async function runFormToCanvaToBasecampWorkflow(
  payload: FormSubmitPayload,
  requestId: string,
): Promise<WorkflowSuccess> {
  try {
    logMilestone(requestId, "FORM_RECEIVED");

    const fields = flattenNamedValues(payload.fields);
    assertRequiredFormFields(fields);

    const brandTemplateId = getConfiguredBrandTemplateId();
    const dataset = await getBrandTemplateDataset(brandTemplateId);

    const structure = assertBrandTemplateStructure(dataset);
    logMilestone(
      requestId,
      "CANVA_BRAND_STRUCTURE_OK",
      `brandKit=${structure.brandKitName} templateId=${brandTemplateId}`,
    );
    logMilestone(requestId, "CANVA_TEMPLATE_VALIDATED", `templateId=${brandTemplateId}`);

    let { data } = mapFormFieldsToCanvaDataSafe(fields, dataset, requestId);
    const promotionName = getPromotionName(fields);

    const withQr = await attachQrAutofillFromDestinationUrl({
      fields,
      dataset,
      data,
      requestId,
    });
    data = withQr.data;
    if (!withQr.skipped) {
      logMilestone(
        requestId,
        "CANVA_QR_ATTACHED",
        `assetId=${withQr.qrAssetId}`,
      );
    }

    const design = await autofillBrandTemplate({
      brandTemplateId,
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
      fields,
      canvaDesignUrl: design.designUrl,
      status: "Canva draft generated (AI Marketing 2.0)",
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
      ...(withQr.qrAssetId ? { qrAssetId: withQr.qrAssetId } : {}),
    };
  } catch (error) {
    const stage = inferStage(error);
    const reason = error instanceof Error ? error.message : "Unknown error";
    logFailed(requestId, stage, reason);
    throw error;
  }
}

function inferStage(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  const name = (error as { name?: string }).name ?? "";
  const code = (error as { code?: string }).code ?? "";

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
