/**
 * Canva Connect capability assessment for Creative Engine shell generation.
 * Keep this accurate — do not claim unsupported APIs work.
 */
export const CANVA_SHELL_CAPABILITY_ASSESSMENT = {
  assessedAt: "2026-08-13",
  capabilities: {
    A_createDesignFromScratch: {
      supported: true,
      how: "POST /v1/designs with custom width/height (design:content:write)",
      notes: "Blank designs auto-delete if unedited within 7 days.",
    },
    B_createFromBrandTemplate: {
      supported: true,
      how: "POST /v1/designs type=brand_template (preview API)",
      notes: "Requires an existing Brand Template — not used for first shells.",
    },
    C_duplicateDesignOrTemplate: {
      supported: true,
      how: "POST /v1/designs type=design (preview copy)",
      notes: "Useful after a seed shell exists.",
    },
    D_importGeneratedFileAsDesign: {
      supported: true,
      how: "POST /v1/imports (PPTX/PDF/Office) — preferred for editable structure",
      notes: "PPTX yields the best editable text/shape fidelity.",
    },
    E_injectEditableElementsViaConnect: {
      supported: false,
      how: null,
      notes:
        "Connect cannot add text/image elements to an existing design. Apps SDK addPage can, but is in-editor only.",
    },
    F_publishDesignAsBrandTemplate: {
      supported: true,
      how: "POST /v1/brand-templates { design_id } (preview)",
      notes:
        "Requires brandtemplate:content:write. Current Creative Engine scopes include brandtemplate:content:read only — do not expand OAuth scopes in this phase; attempt publish and fall back to manual if denied.",
    },
    G_defineAutofillDatasetProgrammatically: {
      supported: false,
      how: null,
      notes:
        "Autofill fields are created in Canva via the Data autofill app on a Brand Template/design. Connect can only read datasets and autofill existing fields.",
    },
  },
  chosenCreationPath: {
    id: "pptx_import_then_manual_autofill_publish",
    steps: [
      "Build deterministic PPTX from CreativeShellSpec (dimensions, hierarchy, brand bar, logo zones, QR zone, labeled autofill roles)",
      "Import PPTX via Design Import API → editable Canva design",
      "Attempt POST /brand-templates publish (may fail without brandtemplate:content:write)",
      "Operator: replace logo zone markers with Brand Kit logos; bind Data Autofill fields to labeled text/image zones; Publish as Brand Template if API publish failed",
      "Inspect dataset; register in config/canva-templates.ts with approved=false until verified",
    ],
    notUsed: [
      "Flattened PNG as a finished shell",
      "Invented Brand Template IDs",
      "Programmatic Autofill field creation",
    ],
  },
  manualStepsRemaining: [
    "Swap SJJCC/UJA logo zone markers for approved Brand Kit logo assets (full-color light treatment)",
    "Open Data autofill app and bind fields: HEADLINE, DESCRIPTION, DATE, TIME, LOCATION, AUDIENCE (flyer), CTA, QR_CODE (+ optionals)",
    "Publish as Brand Template (File → Publish as Brand Template) if API publish was denied or skipped",
    "Confirm dataset via GET /api/test/canva/template-dataset?brandTemplateId=… then set approved=true",
  ],
} as const;
