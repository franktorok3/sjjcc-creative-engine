import "server-only";
import QRCode from "qrcode";

export class QrGenerationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "QrGenerationError";
    this.code = code;
  }
}

/**
 * Generate a PNG QR code for a destination URL.
 * Placement in the design is template-owned (bottom-right above brand bar);
 * this only produces the scannable image asset for Autofill.
 */
export async function generateQrPngBuffer(
  destinationUrl: string,
  options?: { width?: number; margin?: number },
): Promise<Buffer> {
  const url = destinationUrl.trim();
  if (!url) {
    throw new QrGenerationError(
      "QR_URL_REQUIRED",
      "Cannot generate QR code without a destination URL",
    );
  }

  try {
    // Validate absolute URL (throws TypeError if invalid).
    void new URL(url);
  } catch {
    throw new QrGenerationError(
      "QR_URL_INVALID",
      `Destination URL is not a valid absolute URL: ${url.slice(0, 120)}`,
    );
  }

  const width = options?.width ?? 512;
  const margin = options?.margin ?? 2; // quiet zone modules

  try {
    return await QRCode.toBuffer(url, {
      type: "png",
      width,
      margin,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "QR encode failed";
    throw new QrGenerationError("QR_ENCODE_FAILED", message);
  }
}
