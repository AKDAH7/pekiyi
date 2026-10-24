import type { Page } from "@playwright/test";

import { expect, test, uniqueSuffix } from "./support/fixtures";
import { cell, duplicateOrder, grid, saveOrder, setCell, startOrder } from "./support/orders";

/** The "Columns" dialog of the order page. */
async function openColumns(page: Page) {
  await page.getByRole("button", { name: /^Columns/ }).click();
  const dialog = page.getByRole("dialog", { name: "Custom columns" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function addColumn(page: Page, label: string, { number = false, production = false } = {}) {
  const dialog = page.getByRole("dialog", { name: "Custom columns" });
  await dialog.getByRole("button", { name: "Add column" }).click();
  await dialog.getByLabel("Column name (Türkçe)").fill(label);
  if (number) {
    await dialog.getByRole("combobox", { name: "Type" }).click();
    await page.getByRole("option", { name: "Number" }).click();
  }
  if (production) await dialog.getByRole("checkbox", { name: "Production sheet" }).check();
  await dialog.getByRole("button", { name: "Add column" }).click();
  await expect(dialog.locator("li[data-column]").filter({ hasText: label })).toBeVisible();
}

const header = (page: Page) => grid(page).getByRole("columnheader");

async function changeStatus(page: Page, item: string, { note, reason }: { note?: string; reason?: string } = {}) {
  await page.getByRole("button", { name: "Change status" }).click();
  await page.getByRole("menuitem", { name: item }).click();
  const dialog = page.getByRole("dialog");
  if (reason !== undefined) await dialog.getByLabel("Reason").fill(reason);
  if (note) await dialog.getByLabel("Note (optional)").fill(note);
  await dialog.getByRole("button", { name: "Change status" }).click();
}

const status = (page: Page) => page.locator("h1 + div [data-status]");

async function issue(page: Page) {
  await page.getByRole("button", { name: "Issue proforma" }).click();
  const dialog = page.getByRole("dialog", { name: "Issue proforma" });
  await dialog.getByRole("button", { name: "Issue", exact: true }).click();
  return dialog;
}

test.describe("order workflow", () => {
  test("custom columns: added, edited in the grid, saved, and confirmed before removal", async ({ page }) => {
    await duplicateOrder(page, "261010-1ZOC");
    const dialog = await openColumns(page);
    await addColumn(page, "Ayak rengi", { production: true });
    await addColumn(page, "Koli", { number: true });
    await expect(dialog.locator("li[data-column]")).toHaveCount(2);
    // Reorder: "Koli" first.
    await dialog.getByRole("button", { name: "Move “Koli” up" }).click();
    await expect(dialog.locator("li[data-column]").first()).toContainText("Koli");
    await dialog.getByRole("button", { name: "Done" }).click();

    await expect(header(page).filter({ hasText: "Koli" })).toBeVisible();
    await expect(header(page).filter({ hasText: "Ayak rengi" })).toBeVisible();
    await cell(page, 1, "custom:ayak_rengi").dblclick();
    await page.getByLabel("Ayak rengi, line 1", { exact: true }).fill("GOLD");
    await page.keyboard.press("Enter");
    await cell(page, 2, "custom:koli").dblclick();
    await page.getByLabel("Koli, line 2", { exact: true }).fill("2.5");
    await page.keyboard.press("Enter");
    await saveOrder(page);

    await page.reload();
    await expect(cell(page, 1, "custom:ayak_rengi")).toHaveText("GOLD");
    await expect(cell(page, 2, "custom:koli")).toHaveText("2.5");

    // Removing a column that has values asks first; dismissing keeps it.
    const columns = await openColumns(page);
    page.once("dialog", (confirm) => {
      expect(confirm.message()).toContain("“Ayak rengi” has values on 1 line");
      void confirm.dismiss();
    });
    await columns.getByRole("button", { name: "Remove “Ayak rengi”" }).click();
    await expect(columns.locator("li[data-column]")).toHaveCount(2);
    // An empty column goes without asking.
    await addColumn(page, "Boş");
    await columns.getByRole("button", { name: "Remove “Boş”" }).click();
    await expect(columns.locator("li[data-column]")).toHaveCount(2);
  });

  test("column templates: a customer's default is applied to its new orders; a global one can be applied anywhere", async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    await duplicateOrder(page, "261010-1ZOC");
    const dialog = await openColumns(page);
    await addColumn(page, "Etiket notu");

    await dialog.getByLabel("Template name").fill(`JIAN ${suffix}`);
    await dialog.getByRole("checkbox", { name: "Default for this customer's new orders" }).check();
    await dialog.getByRole("button", { name: "Save template" }).click();
    await expect(dialog.getByText(`Template “JIAN ${suffix}” saved.`)).toBeVisible();
    await expect(dialog.locator(`li[data-template="JIAN ${suffix}"]`)).toContainText("This customer · default for new orders");

    await dialog.getByLabel("Template name").fill(`Global ${suffix}`);
    await dialog.getByRole("checkbox", { name: "For all customers" }).check();
    await dialog.getByRole("button", { name: "Save template" }).click();
    await expect(dialog.locator(`li[data-template="Global ${suffix}"]`)).toContainText("All customers");
    await dialog.getByRole("button", { name: "Done" }).click();
    await saveOrder(page);

    // A new order for JIAN starts with the columns of the default template.
    await startOrder(page, "JIAN SMART ROIM");
    await expect(header(page).filter({ hasText: "Etiket notu" })).toBeVisible();

    // A new order for another customer: no columns until the global template is applied.
    await startOrder(page, "AL-SHAM FURNITURE");
    await expect(header(page).filter({ hasText: "Etiket notu" })).toHaveCount(0);
    const other = await openColumns(page);
    await expect(other.locator(`li[data-template="JIAN ${suffix}"]`)).toHaveCount(0);
    await other.locator(`li[data-template="Global ${suffix}"]`).getByRole("button", { name: "Apply" }).click();
    await expect(other.locator("li[data-column]").filter({ hasText: "Etiket notu" })).toBeVisible();
    await other.getByRole("button", { name: "Done" }).click();
    await expect(header(page).filter({ hasText: "Etiket notu" })).toBeVisible();
  });

  test("status flow: forward steps, export can't go back, admin goes back with a reason", async ({ page, pageAs }) => {
    await duplicateOrder(page, "261012-1ZOC");
    const url = page.url();
    await expect(status(page)).toHaveText("Offer");

    await changeStatus(page, "Move to “Proforma”", { note: "Customer agreed by phone" });
    await expect(status(page)).toHaveText("Proforma");
    await changeStatus(page, "Move to “Confirmed”");
    await expect(status(page)).toHaveText("Confirmed");

    // Export moves forward or cancels, never back.
    const exporter = await pageAs("export");
    await exporter.goto(url);
    await exporter.getByRole("button", { name: "Change status" }).click();
    await expect(exporter.getByRole("menuitem")).toHaveText(["Move to “In production”", "Cancel the order"]);
    await exporter.keyboard.press("Escape");

    // Admin: back one step needs a reason.
    await page.getByRole("button", { name: "Change status" }).click();
    await page.getByRole("menuitem", { name: "Back to “Proforma”" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Change status" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("This field is required.");
    await dialog.getByLabel("Reason").fill("Confirmed by mistake");
    await dialog.getByRole("button", { name: "Change status" }).click();
    await expect(status(page)).toHaveText("Proforma");

    // Cancel, then the admin restores the status it was cancelled from.
    await changeStatus(page, "Cancel the order");
    await expect(status(page)).toHaveText("Cancelled");
    await changeStatus(page, "Back to “Proforma”", { reason: "Customer changed their mind" });
    await expect(status(page)).toHaveText("Proforma");

    // The other tab is now stale: its status menu acts on an old version and is refused.
    await exporter.getByRole("button", { name: "Change status" }).click();
    await exporter.getByRole("menuitem", { name: "Move to “In production”" }).click();
    await exporter.getByRole("dialog").getByRole("button", { name: "Change status" }).click();
    await expect(exporter.getByRole("dialog").getByRole("alert")).toContainText("changed by someone else");

    await page.getByRole("tab", { name: "History" }).click();
    const history = page.getByTestId("order-history");
    await page.getByRole("radio", { name: "Status" }).click();
    await expect(history.locator("li[data-kind=status]")).toHaveCount(5);
    await expect(history).toContainText("Reason: Customer changed their mind");
    await expect(history).toContainText("Reason: Confirmed by mistake");
    await expect(history).toContainText("Note: Customer agreed by phone");
  });

  test("issuing: REV0, edit, REV1, then 'nothing changed'; the history shows all of it", async ({ page }) => {
    const base = await duplicateOrder(page, "261012-1ZOC");
    await expect(page.getByText("No proforma issued yet.")).toBeVisible();

    // REV0: the number stays the base number; an offer becomes a proforma.
    await issue(page);
    await expect(page.getByTestId("last-issue")).toContainText("Last issued: REV0 on");
    await expect(page.getByTestId("last-issue")).toContainText("by E2E Admin");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(base);
    await expect(status(page)).toHaveText("Proforma");
    await expect(page.getByText("Changed since last issue")).toHaveCount(0);

    // Unsaved edits block issuing; saved ones show the "changed" badge.
    await setCell(page, 1, "quantity", "29");
    await expect(page.getByRole("button", { name: "Issue proforma" })).toBeDisabled();
    await saveOrder(page);
    await page.reload();
    await expect(page.getByText("Changed since last issue")).toBeVisible();

    await issue(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${base}-REV1`);
    await expect(page.getByTestId("last-issue")).toContainText("Last issued: REV1 on");
    await expect(page.getByText("Changed since last issue")).toHaveCount(0);

    // Nothing changed since REV1: refused, and the number stays.
    const refused = await issue(page);
    await expect(refused.getByRole("alert")).toHaveText(
      "Nothing changed since the last issue — there is nothing new to issue.",
    );
    await refused.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${base}-REV1`);

    // The list shows the revision number too.
    await page.goto(`/en/orders?q=${encodeURIComponent(`${base}-REV1`)}`);
    await expect(page.getByRole("row").filter({ hasText: `${base}-REV1` })).toContainText("Proforma");
    await page.getByRole("link", { name: `${base}-REV1`, exact: true }).click();

    await page.getByRole("tab", { name: "History" }).click();
    const history = page.getByTestId("order-history");
    await expect(history.locator("li[data-kind]")).toHaveCount(4);
    await expect(history.locator("li[data-kind]").first()).toContainText(`Proforma issued`);
    await expect(history.locator("li[data-kind]").first()).toContainText(`${base}-REV1 (REV1, English)`);
    await expect(history.locator("li[data-kind=issue]").last()).toContainText(`${base} (REV0, English)`);
    const edit = history.locator("li[data-kind=edited]");
    await expect(edit.locator("[data-change=changed]")).toContainText("#1");
    await expect(edit.locator("[data-change=changed]")).toContainText("29 SET");
    await expect(history.locator("li[data-kind=created]")).toContainText("Copied from 261012-1ZOC");

    await page.getByRole("radio", { name: "Issues" }).click();
    await expect(history.locator("li[data-kind]")).toHaveCount(2);
    await page.getByRole("radio", { name: "Lines" }).click();
    await expect(history.locator("li[data-kind=issue]")).toHaveCount(0);
    await expect(history.locator("li[data-kind=edited]")).toHaveCount(1);
  });
});

test.describe("order page in Arabic on a tablet", () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test("columns, status and history work in RTL without sideways scrolling", async ({ page }) => {
    await page.goto("/ar/orders?q=261010-1ZOC");
    await page.getByRole("link", { name: "261010-1ZOC", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("button", { name: "تغيير الحالة" })).toBeVisible();
    await expect(page.getByRole("button", { name: "إصدار فاتورة أولية" })).toBeVisible();
    // The wide items grid scrolls inside its own box; the page itself never scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(820);

    await page.getByRole("button", { name: /^الأعمدة/ }).click();
    const dialog = page.getByRole("dialog", { name: "الأعمدة المخصصة" });
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(820);
    await dialog.getByRole("button", { name: "تم" }).click();

    await page.getByRole("tab", { name: "السجل" }).click();
    // Seeded orders have no audit trail yet.
    await expect(page.getByText("لا يوجد ما يُعرض.")).toBeVisible();
    await page.getByRole("radio", { name: "البنود" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
