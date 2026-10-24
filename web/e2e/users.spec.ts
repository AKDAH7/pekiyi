import type { Page } from "@playwright/test";

import { expect, login, test, uniqueSuffix } from "./support/fixtures";

async function createUser(page: Page, name: string, email: string, password: string) {
  await page.goto("/en/settings/users");
  await page.getByRole("button", { name: "New user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Initial password").fill(password);
  await dialog.getByRole("button", { name: "Create user" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: email })).toBeVisible();
}

async function openUserAction(page: Page, name: string, action: string) {
  await page.goto("/en/settings/users");
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: action }).click();
}

test.describe("users management (admin)", () => {
  test("create a user who can then sign in", async ({ page, pageAs }) => {
    const suffix = uniqueSuffix();
    const email = `new-${suffix.toLowerCase()}@pekiyi.test`;
    await createUser(page, `New ${suffix}`, email, "first-password-1");

    const theirs = await pageAs(null);
    await login(theirs, email, "first-password-1");
    await expect(theirs).toHaveURL(/\/dashboard$/);
  });

  test("deactivating a user kills their open session and blocks login", async ({ page, pageAs }) => {
    const suffix = uniqueSuffix();
    const name = `Leaving ${suffix}`;
    const email = `leaving-${suffix.toLowerCase()}@pekiyi.test`;
    await createUser(page, name, email, "leaving-password-1");

    const theirs = await pageAs(null);
    await login(theirs, email, "leaving-password-1");
    await expect(theirs).toHaveURL(/\/dashboard$/);

    await openUserAction(page, name, "Deactivate");
    await page.getByRole("alertdialog").getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByRole("row").filter({ hasText: email })).toContainText("Deactivated");

    await theirs.reload();
    await expect(theirs).toHaveURL(/\/login$/);
    await login(theirs, email, "leaving-password-1");
    await expect(theirs.locator("form").getByRole("alert")).toHaveText(/deactivated/i);
  });

  test("resetting a password replaces the old one", async ({ page, pageAs }) => {
    const suffix = uniqueSuffix();
    const name = `Forgetful ${suffix}`;
    const email = `forgetful-${suffix.toLowerCase()}@pekiyi.test`;
    await createUser(page, name, email, "old-password-1");

    await openUserAction(page, name, "Reset password");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("New password").fill("new-password-2");
    await dialog.getByRole("button", { name: "Set password" }).click();
    await expect(dialog).toBeHidden();

    const theirs = await pageAs(null);
    await login(theirs, email, "old-password-1");
    await expect(theirs.locator("form").getByRole("alert")).toHaveText("Incorrect email or password.");
    await login(theirs, email, "new-password-2");
    await expect(theirs).toHaveURL(/\/dashboard$/);
  });
});
