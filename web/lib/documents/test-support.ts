/**
 * Test support for generated documents: text and images of a PDF (pdf.js),
 * a PNG of a PDF page (pdf.js inside headless Chromium) so people can look
 * at what the tests generated, and a small evaluator for the formulas of a
 * generated workbook.
 *
 * Only imported by *.test.ts files.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type ExcelJS from "exceljs";
import { chromium, type Browser } from "playwright-core";

// From the web/ package (the cwd of vitest and Playwright); no import.meta: Playwright loads this as CommonJS.
const require = createRequire(path.join(process.cwd(), "package.json"));

async function openPdf(bytes: Buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
  const doc = await task.promise;
  return Object.assign(doc, { close: () => task.destroy() });
}

/** Every page's text, items joined as they are laid out (line ends kept). */
export async function pdfText(bytes: Buffer): Promise<{ text: string; pages: number }> {
  const doc = await openPdf(bytes);
  let text = "";
  for (let number = 1; number <= doc.numPages; number++) {
    const content = await (await doc.getPage(number)).getTextContent();
    for (const item of content.items) if ("str" in item) text += item.str + (item.hasEOL ? "\n" : "");
    text += "\n";
  }
  const pages = doc.numPages;
  await doc.close();
  return { text, pages };
}

/** How many raster images the PDF paints, over all pages. */
export async function pdfImageCount(bytes: Buffer): Promise<number> {
  const { OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await openPdf(bytes);
  let count = 0;
  for (let number = 1; number <= doc.numPages; number++) {
    const list = await (await doc.getPage(number)).getOperatorList();
    count += list.fnArray.filter((fn) => fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject).length;
  }
  await doc.close();
  return count;
}

let browser: Promise<Browser> | null = null;

/** Renders page `page` of a PDF to PNG bytes (pdf.js in headless Chromium, 2× scale). */
export async function pdfPagePng(bytes: Buffer, page = 1): Promise<Buffer> {
  browser ??= chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chrome" });
  const context = await (await browser).newContext({ viewport: { width: 1400, height: 1800 } });
  try {
    const tab = await context.newPage();
    const errors: string[] = [];
    tab.on("pageerror", (error) => errors.push(error.message));
    const files: Record<string, { body: Buffer | string; contentType: string }> = {
      "/pdf.mjs": { body: readFileSync(require.resolve("pdfjs-dist/build/pdf.min.mjs")), contentType: "text/javascript" },
      "/pdf.worker.mjs": { body: readFileSync(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs")), contentType: "text/javascript" },
      "/document.pdf": { body: bytes, contentType: "application/pdf" },
      "/": {
        contentType: "text/html",
        body: `<!doctype html><body style="margin:0;background:#fff"><canvas id="page"></canvas><script type="module">
          import * as pdfjs from "/pdf.mjs";
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
          const doc = await pdfjs.getDocument({ url: "/document.pdf" }).promise;
          const page = await doc.getPage(${page});
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.getElementById("page");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvas, viewport }).promise;
          document.body.dataset.done = "1";
        </script></body>`,
      },
    };
    await tab.route("http://render.test/**", (route) => {
      const file = files[new URL(route.request().url()).pathname];
      return file ? route.fulfill({ body: file.body, contentType: file.contentType }) : route.abort();
    });
    await tab.goto("http://render.test/");
    await tab.waitForSelector("body[data-done]", { state: "attached", timeout: 30_000 }).catch((error: unknown) => {
      throw new Error(`Rendering the PDF page failed: ${errors.join("; ") || String(error)}`);
    });
    return await tab.locator("#page").screenshot();
  } finally {
    await context.close();
  }
}

export async function closeRenderBrowser(): Promise<void> {
  const running = browser;
  browser = null;
  if (running) await (await running).close();
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Evaluates the formula (or value) of a cell the way Excel would, for the
 * few functions our workbooks use (SUM, ROUND, + − × ÷), following
 * references — so a test proves the formulas themselves add up, not only
 * their cached results.
 */
export function evaluateCell(sheet: ExcelJS.Worksheet, address: string, depth = 0): number {
  if (depth > 50) throw new Error(`Formula chain too deep at ${address}`);
  const value = sheet.getCell(address).value;
  if (typeof value === "number") return value;
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "object" && "formula" in value && typeof value.formula === "string") {
    const expression = value.formula
      .replace(/SUM\(([^()]*)\)/g, (_, args: string) => `(${args.split(",").join("+")})`)
      .replace(/\b([A-Z]{1,3}[0-9]+)\b/g, (ref: string) => `(${evaluateCell(sheet, ref, depth + 1)})`)
      .replace(/ROUND\(/g, "round(");
    if (!/^[\d\s+\-*/().,round]*$/.test(expression)) throw new Error(`Unexpected formula at ${address}: ${value.formula}`);
    return (new Function("round", `return (${expression});`) as (fn: typeof round) => number)(round);
  }
  throw new Error(`Not a number at ${address}: ${JSON.stringify(value)}`);
}

/** The cached result of a formula cell (what Excel shows before recalculating). */
export function cachedResult(sheet: ExcelJS.Worksheet, address: string): number | null {
  const value = sheet.getCell(address).value;
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "result" in value && typeof value.result === "number") return value.result;
  return null;
}
