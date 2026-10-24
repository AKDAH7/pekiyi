import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures";

async function openModel(page: Page, code: string) {
  await page.goto("/en/products");
  await page.getByRole("link", { name: code, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(code);
}

function piecesForm(page: Page) {
  return page.locator("form").filter({ has: page.getByRole("button", { name: "Save pieces" }) });
}

test.describe("catalog", () => {
  test("admin edits a piece price and it is stored exactly", async ({ page }) => {
    await openModel(page, "SADE");
    const price = page.getByLabel("3-Seater price");
    await price.fill("12345.5");
    await page.getByRole("button", { name: "Save pieces" }).click();
    await expect(piecesForm(page).getByRole("status")).toHaveText("Saved.");

    await page.reload();
    await expect(page.getByLabel("3-Seater price")).toHaveValue("12,345.50");
  });

  test("export sees prices read-only and a crafted price field is refused with 403", async ({ page, pageAs }) => {
    const exporter = await pageAs("export");
    await openModel(exporter, "PORTO");
    await expect(exporter.getByText("Only admins can change prices.", { exact: false })).toBeVisible();
    await expect(exporter.getByLabel("3-Seater price")).toHaveCount(0);

    // Smuggle a price field into the otherwise legitimate pieces form.
    await piecesForm(exporter).evaluate((form) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "pieces.0.basePrice";
      input.value = "1";
      form.appendChild(input);
    });
    const response = exporter.waitForResponse(
      (res) => res.request().method() === "POST" && res.url().includes("/products/models/"),
    );
    await exporter.getByRole("button", { name: "Save pieces" }).click();
    expect((await response).status()).toBe(403);

    // The admin still sees the original price.
    await openModel(page, "PORTO");
    await expect(page.getByLabel("3-Seater price")).not.toHaveValue("1.00");
  });

  test("two tabs editing the same model: the second save gets the conflict message", async ({ page, pageAs }) => {
    const other = await pageAs("admin");
    await openModel(page, "NOTTE");
    await openModel(other, "NOTTE");

    await page.locator("#model-name-tr").fill("NOTTE first");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").first()).toHaveText("Saved.");

    await other.locator("#model-name-tr").fill("NOTTE second");
    await other.getByRole("button", { name: "Save", exact: true }).click();
    await expect(other.getByText("changed by someone else", { exact: false })).toBeVisible();
    // The user's input stays until they reload.
    await expect(other.locator("#model-name-tr")).toHaveValue("NOTTE second");

    await other.getByRole("button", { name: "Reload" }).click();
    await expect(other.locator("#model-name-tr")).toHaveValue("NOTTE first");
  });
});
