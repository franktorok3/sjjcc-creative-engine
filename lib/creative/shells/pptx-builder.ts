import PptxGenJS from "pptxgenjs";
import {
  SJJCC_BRAND_COLORS,
  SJJCC_TYPOGRAPHY,
} from "@/config/canva-brand-assets";
import {
  SHELL_ACCENT_COLOR,
  SHELL_BACKGROUND_COLOR,
  SHELL_BRAND_BAR_COLOR,
  SHELL_INK_COLOR,
  toInches,
  type CreativeShellSpec,
  type ShellContentZone,
} from "@/config/creative-shells";

function fontFor(zone: ShellContentZone): string {
  if (!zone.fontRole) return SJJCC_TYPOGRAPHY.body.canvaFallback;
  return SJJCC_TYPOGRAPHY[zone.fontRole].canvaFallback;
}

function fontSizeFor(spec: CreativeShellSpec, zone: ShellContentZone): number {
  const scale = spec.unit === "px" ? 0.75 : 1;
  switch (zone.role) {
    case "HEADLINE":
      return Math.round((spec.assetType === "social_portrait" ? 36 : 28) * scale);
    case "DESCRIPTION":
      return Math.round(14 * scale);
    case "CTA":
      return Math.round(16 * scale);
    case "QR_CODE":
      return 10;
    default:
      return Math.round(12 * scale);
  }
}

/**
 * Build a structured PPTX shell from a CreativeShellSpec.
 * Text remains real text (not rasterized). Logos are reserved zones — not generated marks.
 */
export async function buildShellPptx(
  spec: CreativeShellSpec,
): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  const pptx = new PptxGenJS();
  const w = toInches(spec.width, spec.unit, spec.dpi);
  const h = toInches(spec.height, spec.unit, spec.dpi);

  pptx.defineLayout({ name: spec.key, width: w, height: h });
  pptx.layout = spec.key;
  pptx.author = "SJJCC Creative Engine";
  pptx.title = spec.title;

  const slide = pptx.addSlide();
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w,
    h,
    fill: { color: SHELL_BACKGROUND_COLOR.replace("#", "") },
    line: { color: SHELL_BACKGROUND_COLOR.replace("#", ""), width: 0 },
  });

  for (const zone of spec.contentZones) {
    const x = toInches(zone.x, spec.unit, spec.dpi);
    const y = toInches(zone.y, spec.unit, spec.dpi);
    const zw = toInches(zone.width, spec.unit, spec.dpi);
    const zh = toInches(zone.height, spec.unit, spec.dpi);

    if (zone.role === "BRAND_BAR") {
      slide.addShape(pptx.ShapeType.rect, {
        x,
        y,
        w: zw,
        h: zh,
        fill: { color: SHELL_BRAND_BAR_COLOR.replace("#", "") },
        line: { color: SHELL_BRAND_BAR_COLOR.replace("#", ""), width: 0 },
      });
      continue;
    }

    if (zone.role === "SJJCC_LOGO_ZONE" || zone.role === "UJA_LOGO_ZONE") {
      // Reserved logo frame — not a generated logo. Operator replaces with Brand Kit asset.
      slide.addShape(pptx.ShapeType.roundRect, {
        x,
        y,
        w: zw,
        h: zh,
        fill: { color: "FFFFFF", transparency: 70 },
        line: { color: SHELL_ACCENT_COLOR.replace("#", ""), width: 1.5 },
      });
      slide.addText(`LOGO ZONE · ${zone.placeholder} (Brand Kit)`, {
        x,
        y,
        w: zw,
        h: zh,
        fontSize: 8,
        color: "FFFFFF",
        align: "center",
        valign: "middle",
        fontFace: "Arial",
      });
      continue;
    }

    if (zone.role === "QR_CODE") {
      slide.addShape(pptx.ShapeType.rect, {
        x,
        y,
        w: zw,
        h: zh,
        fill: { color: "FFFFFF" },
        line: { color: SJJCC_BRAND_COLORS.gray.replace("#", ""), width: 1.25 },
      });
      slide.addText("QR_CODE", {
        x,
        y,
        w: zw,
        h: zh,
        fontSize: 11,
        color: SHELL_INK_COLOR.replace("#", ""),
        align: "center",
        valign: "middle",
        bold: true,
        fontFace: "Arial",
      });
      continue;
    }

    if (zone.role === "HERO_IMAGE") {
      slide.addShape(pptx.ShapeType.rect, {
        x,
        y,
        w: zw,
        h: zh,
        fill: { color: "E8F4F8" },
        line: { color: SHELL_ACCENT_COLOR.replace("#", ""), width: 1 },
      });
      slide.addText("HERO_IMAGE", {
        x,
        y,
        w: zw,
        h: zh,
        fontSize: 14,
        color: SJJCC_BRAND_COLORS.gray.replace("#", ""),
        align: "center",
        valign: "middle",
        fontFace: "Arial",
      });
      continue;
    }

    if (zone.role === "CTA") {
      slide.addShape(pptx.ShapeType.roundRect, {
        x,
        y,
        w: zw,
        h: zh,
        fill: { color: SJJCC_BRAND_COLORS.blue.replace("#", "") },
        line: { color: SJJCC_BRAND_COLORS.blue.replace("#", ""), width: 0 },
      });
      slide.addText(zone.placeholder, {
        x,
        y,
        w: zw,
        h: zh,
        fontSize: fontSizeFor(spec, zone),
        color: "FFFFFF",
        align: "center",
        valign: "middle",
        bold: true,
        fontFace: fontFor(zone),
      });
      continue;
    }

    // Labeled autofill text zones — editable text in Canva after PPTX import
    slide.addText(zone.placeholder, {
      x,
      y,
      w: zw,
      h: zh,
      fontSize: fontSizeFor(spec, zone),
      color: SHELL_INK_COLOR.replace("#", ""),
      fontFace: fontFor(zone),
      bold: zone.role === "HEADLINE",
      italic: zone.fontRole === "finePrint",
      align: "left",
      valign: "top",
      margin: 0,
    });
  }

  const output = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return {
    buffer: output,
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    filename: `${spec.key}.pptx`,
  };
}
