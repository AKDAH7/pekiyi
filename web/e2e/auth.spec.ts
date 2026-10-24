import { ACCOUNTS } from "./support/accounts";
import { expect, login, test } from "./support/fixtures";

test.describe("authentication", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("wrong password is refused, right password lands on the preferred-language dashboard", async ({ page }) => {
    await login(page, ACCOUNTS.admin.email, "not-the-password");
    await expect(page.locator("form").getByRole("alert")).toHaveText("Incorrect email or password.");
    await expect(page).toHaveURL(/\/en\/login$/);

    await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password);
    // The admin's preferred language is Turkish.
    await expect(page).toHaveURL(/\/tr\/dashboard$/);
  });

  test("a URL without locale is redirected to a locale-prefixed login", async ({ pageAs }) => {
    const page = await pageAs(null);
    await page.goto("/");
    await expect(page).toHaveURL(/\/(tr|en|ar)\/login$/);

    await page.goto("/en/customers");
    await expect(page).toHaveURL(/\/en\/login$/);
  });

  test("Arabic login page renders in RTL", async ({ page }) => {
    await page.goto("/ar/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  });

  test("logout ends the session on the server, not just in this browser", async ({ page, pageAs }) => {
    await login(page, ACCOUNTS.export.email, ACCOUNTS.export.password);
    await page.waitForURL(/\/dashboard$/);
    const cookies = await page.context().cookies();

    await page.goto("/en/dashboard");
    await page.getByRole("button", { name: ACCOUNTS.export.name }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/en\/login$/);

    // Replaying the old cookie must not get back in.
    const replay = await pageAs(null);
    await replay.context().addCookies(cookies);
    await replay.goto("/en/dashboard");
    await expect(replay).toHaveURL(/\/en\/login$/);
  });

  test("a forged session cookie passes the proxy but not the real session check", async ({ page }) => {
    await page.context().addCookies([
      { name: "better-auth.session_token", value: "forged.token-value", url: "http://localhost:3100" },
    ]);
    await page.goto("/en/settings/users");
    await expect(page).toHaveURL(/\/en\/login$/);
    await expect(page.getByLabel("Email")).toBeVisible();
  });
});
