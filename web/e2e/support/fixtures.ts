import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { ACCOUNTS, BASE_URL, storageStatePath, type AccountRole } from "./accounts";

/** Signs in through the real login form. Lands on the user's preferred-locale dashboard. */
export async function login(page: Page, email: string, password: string, locale = "en") {
  await page.goto(`/${locale}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("form button[type=submit]").click();
}

export async function loginAs(page: Page, role: AccountRole) {
  await login(page, ACCOUNTS[role].email, ACCOUNTS[role].password);
  await page.waitForURL(/\/(tr|ar|en)\/dashboard$/);
}

async function newContext(browser: Browser, role: AccountRole | null): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: BASE_URL,
    storageState: role ? storageStatePath(role) : undefined,
  });
}

/**
 * The e2e server is a production build, where React minifies its messages:
 * hydration mismatches show up as errors #418 / #419 / #423 / #425.
 */
const HYDRATION_ERROR = /hydrat|react\.dev\/errors\/(418|419|423|425)\b|React error #(418|419|423|425)\b/i;

type Fixtures = {
  /** An extra, independent browser page signed in as `role` (null = signed out). */
  pageAs: (role: AccountRole | null) => Promise<Page>;
  /** Console errors React reports about hydration on `page`; asserted empty after each test. */
  hydrationErrors: string[];
};

export const test = base.extend<Fixtures>({
  pageAs: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (role) => {
      const context = await newContext(browser, role);
      contexts.push(context);
      return context.newPage();
    });
    for (const context of contexts) await context.close();
  },
  hydrationErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" && HYDRATION_ERROR.test(message.text())) errors.push(message.text());
      });
      page.on("pageerror", (error) => {
        if (HYDRATION_ERROR.test(error.message)) errors.push(error.message);
      });
      await use(errors);
      expect(errors, "React hydration errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Unique suffix so reruns against the same seeded DB never collide. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`.toUpperCase();
}

/** The sidebar of the authenticated shell (desktop layout). */
export function sidebar(page: Page) {
  return page.locator('[data-slot="sidebar-inner"]');
}
