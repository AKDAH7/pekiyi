/**
 * View model → file. The images a document embeds come from the storage
 * helper's medium-size variant (lib/storage readMedium), generated on first
 * use, so photos keep PDFs and workbooks small.
 *
 * Not `server-only` so the document tests can render with a temporary
 * storage; only server code imports it.
 */
import type { DocumentFormat } from "../languages";
import { renderPdf } from "../pdf";

import { proformaWorkbook } from "./excel";
import { proformaFooter, proformaHtml, type DocumentImage } from "./html";
import { imageKeys, type ProformaViewModel } from "./view-model";

type ImageSource = {
  readMedium(key: string): Promise<{ body: Buffer; width: number; height: number } | null>;
};

/** The medium-size variants of every image the document shows; missing files are left out. */
export async function loadDocumentImages(model: ProformaViewModel, source: ImageSource): Promise<Map<string, DocumentImage>> {
  const images = new Map<string, DocumentImage>();
  for (const key of imageKeys(model)) {
    const image = await source.readMedium(key);
    if (image) images.set(key, { ...image, contentType: "image/jpeg" });
  }
  return images;
}

export const CONTENT_TYPES: Record<DocumentFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function renderProforma(model: ProformaViewModel, format: DocumentFormat, source: ImageSource): Promise<Buffer> {
  const images = await loadDocumentImages(model, source);
  if (format === "xlsx") return proformaWorkbook(model, images);
  return renderPdf(proformaHtml(model, images), { footerHtml: proformaFooter(model) });
}
