import { expect, sidebar, test } from "./support/fixtures";

const ALL_LINKS = [
  "Dashboard",
  "Customers",
  "Products",
  "Orders",
  "Proformas",
  "Production",
  "Loading Control",
  "Labels",
  "My profile",
  "Company",
  "Bank accounts",
  "Exchange rates",
  "Users",
  "Audit log",
];

const VISIBLE = {
  admin: ALL_LINKS,
  export: [
    "Dashboard",
    "Customers",
    "Products",
    "Orders",
    "Proformas",
    "Production",
    "Loading Control",
    "Labels",
    "My profile",
    "Exchange rates",
  ],
  production: ["Dashboard", "Production", "Loading Control", "Labels", "My profile"],
} as const;

test.describe("sidebar per role", () => {
  for (const role of ["admin", "export", "production"] as const) {
    test(`${role} sees exactly their pages`, async ({ pageAs }) => {
      const page = await pageAs(role);
      await page.goto("/en/dashboard");
      const nav = sidebar(page);
      for (const name of ALL_LINKS) {
        const link = nav.getByRole("link", { name, exact: true });
        if ((VISIBLE[role] as readonly string[]).includes(name)) await expect(link).toBeVisible();
        else await expect(link).toHaveCount(0);
      }
    });
  }
});

test.describe("403 page", () => {
  test("production opening the catalog gets the translated 403", async ({ pageAs }) => {
    const page = await pageAs("production");
    const response = await page.goto("/en/products");
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { name: "No permission" })).toBeVisible();
  });

  test("export opening user management gets 403 in Arabic too", async ({ pageAs }) => {
    const page = await pageAs("export");
    const response = await page.goto("/ar/settings/users");
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { name: "لا توجد صلاحية" })).toBeVisible();
  });
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // The auto `hydrationErrors` fixture fails the test on any React hydration error.
  for (const locale of ["en", "ar"]) {
    test(`shell hydrates cleanly and the sidebar opens as a sheet (${locale})`, async ({ page }) => {
      await page.goto(`/${locale}/products`);
      await expect(page.locator('[data-slot="sidebar-inner"]')).toBeHidden();
      await page.locator('[data-sidebar="trigger"]').click();
      await expect(page.locator('[data-mobile="true"]')).toBeVisible();
      await expect(page.locator('[data-mobile="true"]').getByRole("link").first()).toBeVisible();
    });
  }
});
