import "server-only";
import {
  buildCreativeDraftHtml,
  createMessageBoardMessage,
} from "@/lib/basecamp/client";
import { autofillBrandTemplate } from "@/lib/canva/autofill";
import { getBrandTemplateDataset, getConfiguredBrandTemplateId } from "@/lib/canva/templates";
import {
  assertRequiredFormFields,
  flattenNamedValues,
  getPromotionName,
  mapFormFieldsToCanvaData,
} from "@/lib/creative/mapping";
import { logFailed, logMilestone } from "@/lib/creative/logging";

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
    logMilestone(requestId, "CANVA_TEMPLATE_VALIDATED", `templateId=${brandTemplateId}`);

    const { data } = mapFormFieldsToCanvaData(fields, dataset, requestId);
    const promotionName = getPromotionName(fields);

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
      status: "Canva draft generated",
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

  if (name.includes("Mapping") || code.includes("FORM") || code.includes("MAPPING") || code.includes("REQUIRED_FORM")) {
    return "mapping";
  }
  if (name.includes("Canva") || code.startsWith("CANVA_")) return "canva";
  if (name.includes("Basecamp") || code.startsWith("BASECAMP_")) return "basecamp";
  return "workflow";
}
