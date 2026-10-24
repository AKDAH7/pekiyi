/**
 * HTML → PDF with headless Chromium (playwright-core). One browser per
 * process, started on first use and reused; documents render in a small
 * queue (MAX_PARALLEL pages at a time), each with a 30 s budget.
 *
 * The executable: CHROMIUM_PATH when set (the VPS: a Playwright-installed
 * Chromium), otherwise the locally installed Google Chrome. Pages get no
 * network at all — the HTML carries its fonts and images inline.
 *
 * Not `server-only` so the document tests can render; only server code
 * imports it.
 */
import { chromium, type Browser } from "playwright-core";

export const RENDER_TIMEOUT_MS = 30_000;
const MAX_PARALLEL = 2;

type PdfOptions = {
  /** Chromium footer template (supports .pageNumber / .totalPages). */
  footerHtml?: string;
};

// Kept on globalThis so Next's dev-mode module reloads don't start a browser per reload.
const state = globalThis as typeof globalThis & {
  pekiyiBrowser?: Promise<Browser> | null;
  pekiyiRenderQueue?: { running: number; waiting: (() => void)[] };
};

function browser(): Promise<Browser> {
  if (!state.pekiyiBrowser) {
    const executablePath = process.env.CHROMIUM_PATH || undefined;
    const launching = chromium.launch({
      ...(executablePath ? { executablePath } : { channel: "chrome" }),
      headless: true,
      args: ["--disable-gpu", "--no-first-run", "--no-default-browser-check"],
    });
    state.pekiyiBrowser = launching;
    launching.then(
      (started) => started.on("disconnected", () => {
        if (state.pekiyiBrowser === launching) state.pekiyiBrowser = null;
      }),
      () => {
        if (state.pekiyiBrowser === launching) state.pekiyiBrowser = null;
      },
    );
  }
  return state.pekiyiBrowser;
}

async function inQueue<T>(work: () => Promise<T>): Promise<T> {
  const queue = (state.pekiyiRenderQueue ??= { running: 0, waiting: [] });
  if (queue.running >= MAX_PARALLEL) await new Promise<void>((resolve) => queue.waiting.push(resolve));
  queue.running++;
  try {
    return await work();
  } finally {
    queue.running--;
    queue.waiting.shift()?.();
  }
}

export class RenderTimeoutError extends Error {
  constructor() {
    super(`Rendering the document took longer than ${RENDER_TIMEOUT_MS / 1000} s`);
    this.name = "RenderTimeoutError";
  }
}

/** Prints `html` to an A4 PDF (the page's own @page rules set size and margins). */
export function renderPdf(html: string, { footerHtml }: PdfOptions = {}): Promise<Buffer> {
  return inQueue(async () => {
    const context = await (await browser()).newContext({ offline: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const page = await context.newPage();
      await page.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      const render = (async () => {
        await page.setContent(html, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        return page.pdf({
          format: "A4",
          preferCSSPageSize: true,
          printBackground: true,
          displayHeaderFooter: footerHtml !== undefined,
          headerTemplate: "<span></span>",
          footerTemplate: footerHtml ?? "<span></span>",
        });
      })();
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RenderTimeoutError()), RENDER_TIMEOUT_MS);
      });
      return await Promise.race([render, timeout]);
    } finally {
      clearTimeout(timer);
      await context.close().catch(() => {});
    }
  });
}

/** Closes the shared browser (tests; the server keeps it until it exits). */
export async function closeBrowser(): Promise<void> {
  const running = state.pekiyiBrowser;
  state.pekiyiBrowser = null;
  if (running) await (await running.catch(() => null))?.close();
}
