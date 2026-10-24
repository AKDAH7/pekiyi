import { readFile } from "node:fs/promises";

import type { Page } from "@playwright/test";
import ExcelJS from "exceljs";

import { pdfText } from "../lib/documents/test-support";

import { expect, test } from "./support/fixtures";
import { duplicateOrder, openOrder } from "./support/orders";

/** Today in Turkey as the English documents print it ("24 Oct 2026"). */
const today = () =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" }).format(new Date());

async function issue(page: Page, language?: string) {
  await page.getByRole("button", { name: "Issue proforma" }).click();
  const dialog = page.getByRole("dialog", { name: "Issue proforma" });
  if (language) {
    await dialog.getByRole("combobox", { name: "Default download language" }).click();
    await page.getByRole("option", { name: language, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Issue", exact: true }).click();
  return dialog;
}

/** Picks the language on the issue's history entry, clicks a download button and returns the file. */
async function download(page: Page, entry: ReturnType<Page["locator"]>, language: string, button: "Download PDF" | "Download Excel") {
  await entry.getByRole("combobox", { name: "Language" }).click();
  await page.getByRole("option", { name: language, exact: true }).click();
  const [file] = await Promise.all([page.waitForEvent("download"), entry.getByRole("link", { name: button }).click()]);
  return { name: file.suggestedFilename(), body: await readFile((await file.path())!) };
}

test.describe("proforma documents", () => {
  test("issue → PDF and Excel in two languages, all of the same revision; another language is no new revision", async ({ page }) => {
    const base = await duplicateOrder(page, "261012-1ZOC");
    await issue(page);
    await expect(page.getByTestId("last-issue")).toContainText("Last issued: REV0 on");

    await page.getByRole("tab", { name: "History" }).click();
    const entry = page.getByTestId("order-history").locator("li[data-kind=issue]");
    await expect(entry).toHaveCount(1);

    const english = await download(page, entry, "English", "Download PDF");
    expect(english.name).toBe(`PROFORMA_${base}_HALA-FURNITURE_en.pdf`);
    const englishText = (await pdfText(english.body)).text.replace(/\s+/g, " ");
    expect(englishText).toContain(base);
    expect(englishText).toContain("$51,100.00");
    expect(englishText).toContain("PROFORMA INVOICE");
    expect(englishText).not.toContain("DRAFT");
    // The invoice date is the day this revision was issued, not the order date (12 Oct 2026, copied).
    expect(englishText).toContain(`Invoice date ${today()}`);

    const turkish = await download(page, entry, "Turkish", "Download PDF");
    expect(turkish.name).toBe(`PROFORMA_${base}_HALA-FURNITURE_tr.pdf`);
    const turkishText = (await pdfText(turkish.body)).text.replace(/\s+/g, " ");
    expect(turkishText).toContain("PROFORMA FATURA");
    expect(turkishText).toContain("$51.100,00");
    expect(turkishText).toContain(base);

    // Stored on the first download and reused: the same bytes again.
    const again = await download(page, entry, "English", "Download PDF");
    expect(again.body.equals(english.body)).toBe(true);

    for (const [language, code] of [["English", "en"], ["Arabic", "ar"]] as const) {
      const excel = await download(page, entry, language, "Download Excel");
      expect(excel.name).toBe(`PROFORMA_${base}_HALA-FURNITURE_${code}.xlsx`);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(new Uint8Array(excel.body).buffer);
      const sheet = workbook.getWorksheet("PROFORMA")!;
      expect(sheet.views[0]?.rightToLeft ?? false).toBe(code === "ar");
      let total: number | null = null;
      sheet.eachRow((row) =>
        row.eachCell((cell) => {
          const value = cell.value;
          if (value && typeof value === "object" && "formula" in value && String(value.formula).startsWith("SUM(")) {
            total = typeof value.result === "number" ? value.result : null;
          }
        }),
      );
      expect(total).toBe(51100);
    }

    // Still one issue, REV0; issuing the unchanged order in another language is refused.
    await page.getByRole("tab", { name: "Order" }).click();
    const refused = await issue(page, "العربية");
    await expect(refused.getByRole("alert")).toHaveText("Nothing changed since the last issue — there is nothing new to issue.");
    await refused.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(base);
    await page.getByRole("tab", { name: "History" }).click();
    await expect(entry).toHaveCount(1);
  });

  test("preview: a draft PDF of the saved order with a DRAFT watermark, in the chosen language", async ({ page }) => {
    const url = await openOrder(page, "261022ZOC-REV11");
    const id = url.split("/").pop()!;
    await page.getByRole("button", { name: "Preview" }).click();
    const items = page.getByRole("menuitem");
    await expect(items).toHaveText(["English", "Turkish", "Arabic", "English + Arabic"]);
    await expect(items.first()).toHaveAttribute("href", `/api/orders/${id}/proforma/preview?lang=en`);
    await expect(items.first()).toHaveAttribute("target", "_blank");
    await page.keyboard.press("Escape");

    const response = await page.request.get(`/api/orders/${id}/proforma/preview?lang=en-ar`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["content-disposition"]).toMatch(/^inline;/);
    const text = (await pdfText(await response.body())).text.replace(/\s+/g, " ");
    expect(text).toContain("DRAFT");
    expect(text).toContain("261022ZOC-REV11");
    // A draft is dated today, not with the order date (22 Oct 2026).
    expect(text).toContain(today());
    expect(text).toContain("€5,306.25");
    expect(text).toContain("33.6");
    // Nothing was issued by previewing.
    await expect(page.getByText("No proforma issued yet.")).toBeVisible();
  });

  test("production gets 403 on the preview and download URLs; signed out gets 401", async ({ page, pageAs }) => {
    const base = await duplicateOrder(page, "261010-1ZOC");
    const orderPath = new URL(page.url()).pathname.replace("/en/orders/", "/api/orders/");
    await issue(page);
    await expect(page.getByTestId("last-issue")).toContainText("REV0");
    await page.getByRole("tab", { name: "History" }).click();
    const pdfLink = page.getByTestId("order-history").locator("li[data-kind=issue]").getByRole("link", { name: "Download PDF" });
    const download = new URL((await pdfLink.getAttribute("href"))!, page.url()).pathname + "?format=pdf&lang=ar";
    const preview = `${orderPath}/proforma/preview?lang=en`;

    // Export may (and gets the Arabic file).
    const exporter = await pageAs("export");
    const exported = await exporter.request.get(download);
    expect(exported.status()).toBe(200);
    expect(exported.headers()["content-disposition"]).toContain(`PROFORMA_${base}_JIAN-SMART-ROIM_ar.pdf`);

    const production = await pageAs("production");
    for (const path of [download, `${download.split("?")[0]}?format=xlsx`, preview]) {
      expect((await production.request.get(path)).status(), path).toBe(403);
    }
    const anonymous = await pageAs(null);
    expect((await anonymous.request.get(preview, { maxRedirects: 0 })).status()).toBe(401);
    // An issue of another order, or no issue at all: 404.
    expect((await page.request.get(`${orderPath}/proforma/00000000-0000-4000-8000-000000000000?format=pdf`)).status()).toBe(404);
  });
});
