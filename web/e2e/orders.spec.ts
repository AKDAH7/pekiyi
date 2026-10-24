import { expect, sidebar, test } from "./support/fixtures";
import { addLine, cell, createOrder, editor, grid, openOrder, pieces, saveOrder, setCell, setModel, startOrder } from "./support/orders";

test.describe("orders", () => {
  test("recreate the HALA (NETHERLANDS) order: 51,100 USD and 336 pieces", async ({ page }) => {
    await startOrder(page, "HALA FURNITURE");
    // Defaults copied from the customer and the company settings.
    await expect(page.getByRole("combobox", { name: "Currency", exact: true })).toContainText("USD");
    await expect(page.getByRole("combobox", { name: "Delivery term" })).toContainText("EXW");

    await addLine(page, 1, { model: "DAMLA", composition: "3+3+1+1", fabrics: ["BOYTEKS 30147202"], qty: 28, price: "650" });
    await addLine(page, 2, { model: "VERA", composition: "3+3+1+1", fabrics: ["BOYTEKS 30147205"], qty: 28, price: "625" });
    await addLine(page, 3, { model: "RİVA", composition: "3+3+1+1", fabrics: ["BOYTEKS 30147203"], qty: 28, price: "550" });

    await expect(cell(page, 1, "unit")).toHaveText("SET");
    await expect(cell(page, 1, "lineTotal")).toHaveText("18,200.00");
    // The suggestion comes from the catalog piece prices at the latest rates.
    await expect(cell(page, 1, "suggested")).not.toHaveText("—");
    await expect(page.getByTestId("total")).toHaveText("51,100.00 USD");
    await expect(pieces(page)).toHaveText("336");
    await expect(page.getByTestId("piece-summary")).toHaveText(
      "3-seater 168 · 2-seater 0 · armchair 168 · Extra Cushion 0",
    );
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    const url = await createOrder(page);
    const number = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
    expect(number).toMatch(/^\d{6}-\d+ZOC$/);

    // Saved as one unit: reloading shows the same order.
    await page.reload();
    await expect(page.getByTestId("total")).toHaveText("51,100.00 USD");
    await expect(pieces(page)).toHaveText("336");
    await expect(cell(page, 3, "model")).toHaveText("RİVA");

    // The list shows it with its figures.
    await page.goto(`/en/orders?q=${number}`);
    const row = page.getByRole("row").filter({ hasText: number });
    await expect(row).toContainText("HALA FURNITURE");
    await expect(row).toContainText("84 / 336");
    await expect(row).toContainText("51,100.00 USD");
    await expect(row).toContainText("Offer");

    // One audit entry for the creation.
    await page.goto("/en/settings/audit?entity=order");
    await expect(page.getByRole("row").filter({ hasText: "Order" }).first()).toBeVisible();
    expect(url).toContain("/en/orders/");
  });

  test("recreate GRAND DIZAJN: EUR column 5,306.25, CBM 33.6 and the VERA set's DAMLA armchair", async ({ page }) => {
    await startOrder(page, "GRAND DIZAJN");
    // The customer's secondary currency comes along, with today's rate prefilled.
    await expect(page.getByRole("combobox", { name: "Secondary currency" })).toContainText("EUR");
    const rate = page.getByLabel("Exchange rate");
    await expect(rate).not.toHaveValue("");
    await rate.fill("1.12");
    await rate.blur();

    await addLine(page, 1, {
      model: "SEREN",
      composition: "3",
      fabrics: ["APOLLO 23", "APOLLO 21"],
      qty: 10,
      price: "126",
    });
    // Single piece → PCS; CBM from the catalog.
    await expect(cell(page, 1, "unit")).toHaveText("PCS");
    await expect(cell(page, 1, "unitCbm")).toHaveText("0.800");
    await addLine(page, 2, { model: "ZERDA", composition: "3+2+1", fabrics: ["OGUZCAN F2-03"], qty: 7, price: "333", cbm: "1.8" });
    await addLine(page, 3, {
      model: "VERA",
      composition: "3+2+1",
      fabrics: ["BOYTEKS 30147203"],
      qty: 5,
      price: "470.40",
      cbm: "2.6",
    });

    await page.getByRole("button", { name: "Show the pieces of line 3" }).click();
    await page.getByLabel("Model of Armchair").selectOption({ label: "DAMLA" });

    await expect(page.getByTestId("total")).toHaveText("5,943.00 USD");
    await expect(page.getByTestId("secondary-total")).toHaveText("5,306.25 EUR");
    await expect(page.getByTestId("total-cbm")).toHaveText("33.600 m³");
    await expect(pieces(page)).toHaveText("46");
    await expect(page.getByTestId("piece-summary")).toHaveText("3-seater 22 · 2-seater 12 · armchair 12 · Extra Cushion 0");

    await createOrder(page);
    await page.reload();
    await expect(page.getByTestId("secondary-total")).toHaveText("5,306.25 EUR");
    await expect(page.getByTestId("total-cbm")).toHaveText("33.600 m³");
    await page.getByRole("button", { name: "Show the pieces of line 3" }).click();
    await expect(page.getByLabel("Model of Armchair")).toHaveValue(/[0-9a-f-]{36}/);
    await expect(page.getByLabel("Model of Armchair").locator("option:checked")).toHaveText("DAMLA");
  });

  test("bulk add: 4 models × 6 fabrics = 24 lines", async ({ page }) => {
    await startOrder(page, "VİRONA FURNITURE");
    await page.getByRole("button", { name: "Bulk add" }).click();
    const dialog = page.getByRole("dialog");
    for (const model of ["DAMLA", "VERA", "ZERDA", "NİSAN"]) {
      await dialog.getByLabel("Models").fill(model);
      await page.getByRole("option", { name: new RegExp(`^${model}`) }).first().click();
    }
    for (const code of ["D-01", "D-02", "D-03", "D-04", "D-05", "D-06"]) {
      await dialog.getByLabel("Fabrics / colours").fill(`SETRA ${code}`);
      await page.getByRole("option", { name: new RegExp(`^SETRA ${code}`) }).first().click();
    }
    await dialog.getByLabel("Quantity per line").fill("2");
    await expect(dialog.getByText("4 models × 6 fabrics = 24 lines")).toBeVisible();
    await dialog.getByRole("button", { name: "Add 24 lines" }).click();
    await expect(dialog).toBeHidden();

    await expect(grid(page).locator("tbody > tr[data-line]")).toHaveCount(24);
    await expect(cell(page, 1, "model")).toHaveText("DAMLA");
    await expect(cell(page, 6, "fabrics")).toContainText("SETRA D-06");
    await expect(cell(page, 7, "model")).toHaveText("VERA");
    await expect(cell(page, 24, "model")).toHaveText("NİSAN");
    // 24 lines × 2 sets × 4 pieces.
    await expect(pieces(page)).toHaveText("192");
    await expect(page.getByRole("status").filter({ hasText: "24 lines added." })).toBeVisible();
  });

  test("paste 3 rows from Excel: unknown entries are kept and shown in red", async ({ page }) => {
    await startOrder(page, "HARI");
    const tsv = [
      "DAMLA\t3+3+1+1\tBOYTEKS 30147202\t2\t650",
      "GHOSTMODEL\t3+1\tNOPE 9\t1\t100",
      "riva\t3\tAPOLLO 23 / APOLLO 21\t4\t1,250.50",
    ].join("\r\n");
    await grid(page).evaluate((element, text) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, tsv);

    await expect(grid(page).locator("tbody > tr[data-line]")).toHaveCount(3);
    await expect(page.getByRole("status").filter({ hasText: "3 lines pasted — 1 needs fixing" })).toBeVisible();
    await expect(cell(page, 1, "model")).toHaveText("DAMLA");
    await expect(cell(page, 2, "model")).toContainText("GHOSTMODEL");
    await expect(cell(page, 2, "model").locator(".text-destructive")).toBeVisible();
    await expect(cell(page, 2, "fabrics")).toContainText("NOPE 9 (not in the fabric catalog)");
    await expect(cell(page, 3, "model")).toHaveText("RİVA");
    await expect(cell(page, 3, "unit")).toHaveText("PCS");
    await expect(cell(page, 3, "unitPrice")).toContainText("1,250.50");
    await expect(cell(page, 3, "fabrics")).toContainText("APOLLO 21");

    // The unknown model blocks the save until it is fixed.
    await page.getByRole("button", { name: "Create order" }).click();
    await expect(page.getByText("Line 2: Choose a model.")).toBeVisible();
    await expect(cell(page, 2, "model")).toHaveAttribute("aria-invalid", "true");
    await setModel(page, 2, "VERA");
    await createOrder(page);
    await expect(grid(page).locator("tbody > tr[data-line]")).toHaveCount(3);
  });

  test("keyboard: arrows, Enter and Esc move and edit cells", async ({ page }) => {
    await startOrder(page, "EIRFAN");
    await addLine(page, 1, { model: "DAMLA", composition: "3+1", fabrics: ["SETRA D-01"], qty: 3, price: "500" });
    await cell(page, 1, "quantity").click();
    await page.keyboard.press("Enter");
    await expect(editor(page, 1, "quantity")).toBeFocused();
    await page.keyboard.type("9");
    await page.keyboard.press("Escape");
    await expect(cell(page, 1, "quantity")).toHaveText("3");
    await expect(cell(page, 1, "quantity")).toBeFocused();
    // Typing starts editing with that character.
    await page.keyboard.type("7");
    await page.keyboard.press("Enter");
    await expect(cell(page, 1, "quantity")).toHaveText("7");
    await page.keyboard.press("ArrowRight");
    await expect(cell(page, 1, "unit")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(cell(page, 1, "quantity")).toBeFocused();
  });

  test("keyboard in Arabic: the arrow keys follow the RTL layout", async ({ page }) => {
    await page.goto("/ar/orders/new");
    await page.getByLabel("العميل", { exact: true }).fill("EIRFAN");
    await page.getByRole("option", { name: "EIRFAN", exact: true }).click();
    await page.getByRole("button", { name: "متابعة" }).click();
    await page.getByRole("button", { name: "إضافة بند" }).click();
    await page.getByLabel("الموديل، البند 1", { exact: true }).fill("DAMLA");
    await page.getByRole("option", { name: /^DAMLA/ }).first().click();
    await cell(page, 1, "composition").click();
    await page.keyboard.press("ArrowLeft");
    await expect(cell(page, 1, "fabrics")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(cell(page, 1, "composition")).toBeFocused();
  });

  test("two people on one order: the other sees who changed it, keeps the edits, and can't overwrite", async ({
    page,
    pageAs,
  }) => {
    const url = await openOrder(page, "261012-1ZOC");
    const other = await pageAs("export");
    await other.goto(url);
    await expect(cell(other, 1, "quantity")).toHaveText("28");

    await setCell(other, 2, "quantity", "27");
    await setCell(page, 1, "quantity", "30");
    await page.getByRole("button", { name: "Save order" }).click();
    await expect(page.getByText("All changes saved")).toBeVisible();

    // Within one 20-second check.
    await expect(other.getByText("E2E Admin changed this order at", { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(cell(other, 2, "quantity")).toHaveText("27");
    await other.getByRole("button", { name: "Save order" }).click();
    await expect(other.getByText("changed by someone else", { exact: false })).toBeVisible();
    await expect(cell(other, 2, "quantity")).toHaveText("27");

    other.once("dialog", (dialog) => dialog.accept());
    await other.getByRole("button", { name: "Reload" }).first().click();
    await expect(cell(other, 1, "quantity")).toHaveText("30");
    await expect(cell(other, 2, "quantity")).toHaveText("28");
  });

  test("unsaved changes: a dirty indicator, and a warning before leaving", async ({ page }) => {
    await openOrder(page, "261010-1ZOC");
    await expect(page.getByText("All changes saved")).toBeVisible();
    await setCell(page, 1, "quantity", "5");
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    // Reload / close: the beforeunload handler asks the browser to warn.
    expect(
      await page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    ).toBe(true);

    // In-app links ask first; dismissing keeps the page and the edit.
    let message = "";
    page.once("dialog", (dialog) => {
      message = dialog.message();
      void dialog.dismiss();
    });
    await sidebar(page).getByRole("link", { name: "Customers" }).click();
    expect(message).toContain("unsaved changes");
    await expect(page).toHaveURL(/\/en\/orders\/[0-9a-f-]{36}$/);
    await expect(cell(page, 1, "quantity")).toHaveText("5");
  });

  test("export prices an order: line price, discount and advance are saved", async ({ page, pageAs }) => {
    const url = await openOrder(page, "261020ZOC-REV1");
    const exporter = await pageAs("export");
    await exporter.goto(url);
    await expect(exporter.getByText("You can't change prices on this order.")).toHaveCount(0);
    await expect(cell(exporter, 1, "unitPrice")).not.toHaveAttribute("aria-readonly", "true");
    await expect(cell(exporter, 1, "unitPrice")).toHaveText("400.00");

    await setCell(exporter, 1, "unitPrice", "412.50");
    await setCell(exporter, 1, "discount", "10");
    await exporter.getByRole("combobox", { name: "Advance" }).click();
    await exporter.getByRole("option", { name: "Percentage" }).click();
    await exporter.getByLabel("Advance (%)").fill("30");
    await exporter.getByLabel("Advance (%)").blur();
    await saveOrder(exporter);

    await exporter.reload();
    await expect(cell(exporter, 1, "unitPrice")).toHaveText("412.50");
    await expect(cell(exporter, 1, "discount")).toHaveText("10.00 %");
    await expect(exporter.getByLabel("Advance (%)")).toHaveValue("30.00");
    // Catalog prices stay admin-only: catalog.spec.ts checks the 403 for export on a crafted piece-price edit.
  });

  test("duplicate order: a new offer with the same customer and lines", async ({ page }) => {
    await openOrder(page, "261022ZOC-REV11");
    await page.getByRole("button", { name: "Duplicate order" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^\d{6}-\d+ZOC$/);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("261022ZOC-REV11");
    await expect(page.getByText("GRAND DIZAJN")).toBeVisible();
    await expect(page.locator("[data-status]").first()).toHaveText("Offer");
    await expect(grid(page).locator("tbody > tr[data-line]")).toHaveCount(3);
    await expect(page.getByTestId("total")).toHaveText("5,943.00 USD");
  });

  test("production gets 403 on the order pages", async ({ page, pageAs }) => {
    const orderUrl = new URL(await openOrder(page, "261012-1ZOC")).pathname;
    const production = await pageAs("production");
    for (const path of ["/en/orders", "/en/orders/new", orderUrl]) {
      const response = await production.goto(path);
      expect(response?.status(), path).toBe(403);
      await expect(production.getByRole("heading", { name: "No permission" })).toBeVisible();
    }
    const api = await production.request.get(`${orderUrl.replace("/en/orders/", "/api/orders/")}/version`);
    expect(api.status()).toBe(403);
  });
});
