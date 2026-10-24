import type { Page } from "@playwright/test";
import sharp from "sharp";

import { expect, test, uniqueSuffix } from "./support/fixtures";

async function chooseOption(page: Page, label: string, search: string, option: string | RegExp) {
  await page.getByLabel(label, { exact: true }).fill(search);
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).first().click();
}

async function startNewCustomer(page: Page, companyName: string) {
  await page.goto("/en/customers");
  await page.getByRole("link", { name: "New customer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New customer" })).toBeVisible();
  await page.getByLabel("Company name").fill(companyName);
}

async function openCustomer(page: Page, companyName: string) {
  await page.goto(`/en/customers?status=all&q=${encodeURIComponent(companyName)}`);
  await page.getByRole("link", { name: companyName, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: companyName })).toBeVisible();
  return page.url().replace(/\?.*$/, "");
}

function ean13(first12: string): string {
  let total = 0;
  for (let i = 0; i < 12; i++) total += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return `${first12}${(10 - (total % 10)) % 10}`;
}

test.describe("customers", () => {
  test("create a customer: phones are stored in E.164 and WhatsApp opens wa.me", async ({ page }) => {
    const name = `Zebra Wonen ${uniqueSuffix()}`;
    await startNewCustomer(page, name);
    await page.getByLabel("Contact person").fill("Mr. Jansen");
    await chooseOption(page, "Country", "nether", "Netherlands");
    await page.getByLabel("City").fill("Rotterdam");
    // A national number, read in the chosen country.
    await page.getByLabel("Phone", { exact: true }).fill("06 1234 5678");
    await page.getByLabel("WhatsApp", { exact: true }).fill("+31 (0)6-1234-5678");
    await page.getByLabel("Tax number 1 type").fill("vat");
    await page.getByLabel("Tax number 1", { exact: true }).fill("NL001234567B01");
    await page.getByRole("button", { name: "Create customer" }).click();

    await expect(page).toHaveURL(/\/en\/customers\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByRole("link", { name: "+31 6 12345678" })).toHaveAttribute("href", "tel:+31612345678");
    await expect(page.getByRole("link", { name: "Chat on WhatsApp" }).first()).toHaveAttribute(
      "href",
      "https://wa.me/31612345678",
    );
    await expect(page.getByText("NL001234567B01")).toBeVisible();
    await expect(page.getByRole("term").filter({ hasText: "VAT" })).toBeVisible();

    // The list finds it, with flag + country name, and shows 0 orders.
    await page.goto(`/en/customers?q=${encodeURIComponent(name.toLowerCase())}`);
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("Netherlands");
    // Decorative (alt=""), so not an "img" role; check the SVG really loads.
    const flag = row.locator("img").first();
    await expect(flag).toHaveAttribute("src", "/api/flags/NL");
    await expect.poll(() => flag.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(row.getByRole("cell").nth(6)).toHaveText("0");
  });

  test("customer logo: required for logo branding, uploaded, shown and removable", async ({ page }) => {
    const name = `Logo Wonen ${uniqueSuffix()}`;
    await startNewCustomer(page, name);
    await chooseOption(page, "Country", "nether", "Netherlands");
    await page.getByLabel("Label branding").click();
    await page.getByRole("option", { name: "Customer's logo", exact: true }).click();
    await page.getByRole("button", { name: "Create customer" }).click();
    await expect(page.getByText("Upload the customer's logo", { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/\/customers\/new$/);

    const png = await sharp({
      create: { width: 48, height: 32, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .png()
      .toBuffer();
    await page.getByLabel("Customer logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
    await expect(page.getByText("logo.png")).toBeVisible();
    await page.getByRole("button", { name: "Create customer" }).click();
    await expect(page).toHaveURL(/\/en\/customers\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

    // Served (as a thumbnail) through the authenticated file route.
    const logo = page.getByRole("img", { name: "Customer logo" });
    await expect(logo).toHaveAttribute("src", /^\/api\/files\/customers\/.+\?thumb=1$/);
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    const src = await logo.getAttribute("src");
    expect((await page.request.get(src!)).headers()["content-type"]).toMatch(/^image\//);

    // Removing it while the branding still needs it is refused.
    await page.goto(`${page.url()}/edit`);
    await page.getByRole("checkbox", { name: "Remove the current image" }).click();
    await expect(page.getByRole("checkbox", { name: "Remove the current image" })).toBeChecked();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Upload the customer's logo", { exact: false })).toBeVisible();
  });

  test("an unreadable phone number is refused with a field error", async ({ page }) => {
    await startNewCustomer(page, `Broken Phone ${uniqueSuffix()}`);
    await chooseOption(page, "Country", "türk", "Türkiye");
    await page.getByLabel("Phone", { exact: true }).fill("12");
    await page.getByRole("button", { name: "Create customer" }).click();
    await expect(page.getByText("This doesn't look like a phone number", { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/\/customers\/new$/);
  });

  test("search folds Turkish letters both ways", async ({ page }) => {
    await page.goto("/en/customers?q=virona");
    await expect(page.getByRole("link", { name: "VİRONA FURNITURE" })).toBeVisible();
    await page.goto(`/en/customers?q=${encodeURIComponent("VİRONA")}&country=SE`);
    await expect(page.getByRole("link", { name: "VİRONA FURNITURE" })).toBeVisible();
    await page.goto("/en/customers?q=virona&country=NL");
    await expect(page.getByText("No customers found.")).toBeVisible();
  });

  test("duplicate warning: same email as an existing customer", async ({ page }) => {
    await startNewCustomer(page, `Totally New ${uniqueSuffix()}`);
    await chooseOption(page, "Country", "belg", "Belgium");
    await page.getByLabel("Email").fill("HalaWonen@gmail.com");
    await page.getByRole("button", { name: "Create customer" }).click();

    const warning = page.getByRole("alert").filter({ hasText: "This customer may already exist" });
    await expect(warning).toBeVisible();
    const match = warning.getByRole("listitem").filter({ hasText: "HALA FURNITURE" });
    await expect(match).toContainText("Same email");
    await expect(page).toHaveURL(/\/customers\/new$/);
  });

  test('duplicate warning: "ÖZBAY" vs "ozbay", then create anyway', async ({ page }) => {
    const suffix = uniqueSuffix();
    await startNewCustomer(page, `ÖZBAY ${suffix}`);
    await chooseOption(page, "Country", "türk", "Türkiye");
    await page.getByRole("button", { name: "Create customer" }).click();
    await expect(page).toHaveURL(/\/en\/customers\/[0-9a-f-]{36}$/);

    await startNewCustomer(page, `ozbay ${suffix.toLowerCase()}`);
    await chooseOption(page, "Country", "türk", "Türkiye");
    await page.getByRole("button", { name: "Create customer" }).click();
    const warning = page.getByRole("alert").filter({ hasText: "This customer may already exist" });
    await expect(warning.getByRole("listitem").filter({ hasText: `ÖZBAY ${suffix}` })).toContainText("Similar name");

    await warning.getByRole("button", { name: "Create anyway" }).click();
    await expect(page).toHaveURL(/\/en\/customers\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: `ozbay ${suffix.toLowerCase()}` })).toBeVisible();
  });

  test("two people editing the same customer: the second save gets the conflict message", async ({ page, pageAs }) => {
    const url = await openCustomer(page, "EIRFAN");
    const other = await pageAs("export");
    await page.goto(`${url}/edit`);
    await other.goto(`${url}/edit`);

    await page.getByLabel("City").fill("London");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByText("London", { exact: true })).toBeVisible();

    await other.getByLabel("Contact person").fill("Mr. Second");
    await other.getByRole("button", { name: "Save", exact: true }).click();
    await expect(other.getByText("changed by someone else", { exact: false })).toBeVisible();
    await expect(other.getByLabel("Contact person")).toHaveValue("Mr. Second");

    await other.getByRole("button", { name: "Reload" }).click();
    await expect(other.getByLabel("City")).toHaveValue("London");
    await expect(other.getByLabel("Contact person")).toHaveValue("");
  });

  test("product code: a wrong EAN-13 check digit is caught live and by the server", async ({ page }) => {
    const url = await openCustomer(page, "VİRONA FURNITURE");
    await page.goto(`${url}?tab=codes`);
    await page.getByRole("button", { name: "Add code" }).click();
    const dialog = page.getByRole("dialog");
    await chooseOption(page, "Model", "zerd", /^ZERDA/);

    const valid = ean13(`869${String(Date.now()).slice(-9)}`);
    const wrong = `${valid.slice(0, 12)}${(Number(valid[12]) + 1) % 10}`;
    const barcode = dialog.getByLabel("EAN-13 barcode");
    await barcode.fill(wrong.slice(0, 7));
    await expect(dialog.getByText("7 of 13 digits")).toBeVisible();
    await barcode.fill(wrong);
    await expect(dialog.getByText(`Wrong check digit: the last digit should be ${valid[12]}.`)).toBeVisible();

    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(/check digit\) doesn't match/);

    await barcode.fill(valid);
    await expect(dialog.getByText("Valid EAN-13")).toBeVisible();
    await dialog.getByLabel("Stock code").fill("VIR-ZERDA-1");
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByRole("row").filter({ hasText: valid });
    await expect(row).toContainText("ZERDA");
    await expect(row).toContainText("All piece types");
    await expect(row).toContainText("VIR-ZERDA-1");
  });

  test("order counts are shown, and only customers without orders can be deleted", async ({ page }) => {
    // HALA has one of the seeded sample orders.
    await page.goto("/en/customers?q=hala");
    await expect(page.getByRole("row").filter({ hasText: "HALA FURNITURE" }).getByRole("cell").nth(6)).toHaveText("1");
    await openCustomer(page, "HALA FURNITURE");
    await page.getByRole("navigation", { name: "Customer sections" }).getByRole("link", { name: "Orders" }).click();
    await expect(page.getByText("1 order is already recorded for this customer.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Show orders" })).toHaveAttribute("href", /\/en\/orders\?customer=[0-9a-f-]{36}$/);
    await expect(page.getByRole("link", { name: "New order" })).toBeVisible();
    await page.getByRole("button", { name: "Actions for HALA FURNITURE" }).click();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    const name = `Short Lived ${uniqueSuffix()}`;
    await startNewCustomer(page, name);
    await chooseOption(page, "Country", "germ", "Germany");
    await page.getByRole("button", { name: "Create customer" }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await page.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/en\/customers$/);
    await page.goto(`/en/customers?status=all&q=${encodeURIComponent(name)}`);
    await expect(page.getByText("No customers found.")).toBeVisible();
  });

  test("export can maintain customers but has no delete", async ({ pageAs }) => {
    const exporter = await pageAs("export");
    await openCustomer(exporter, "HARI");
    await exporter.getByRole("button", { name: "Actions for HARI" }).click();
    await expect(exporter.getByRole("menuitem", { name: "Deactivate" })).toBeVisible();
    await expect(exporter.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  });

  test("production gets 403 on the customer pages", async ({ page, pageAs }) => {
    const customerUrl = new URL(await openCustomer(page, "HARI")).pathname;
    const production = await pageAs("production");
    for (const path of ["/en/customers", "/en/customers/new", customerUrl, `${customerUrl}/edit`]) {
      const response = await production.goto(path);
      expect(response?.status(), path).toBe(403);
      await expect(production.getByRole("heading", { name: "No permission" })).toBeVisible();
    }
  });
});
