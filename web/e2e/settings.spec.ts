import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures";

/** A valid IBAN for `country` + `bban` (ISO 13616 mod-97 check digits). */
function makeIban(country: string, bban: string): string {
  const digits = `${bban}${country}00`
    .split("")
    .map((char) => (/[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char))
    .join("");
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return `${country}${String(98 - remainder).padStart(2, "0")}${bban}`;
}

function randomBban(): string {
  // TR: 5-digit bank code, 1 reserve digit, 16-digit account number.
  return `00205${"0"}${String(Date.now()).slice(-10)}${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
}

async function fillAccount(page: Page, currency: string, iban: string) {
  await page.goto("/en/settings/bank-accounts");
  await page.getByRole("button", { name: "New account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Bank").fill("E2E Bank");
  await dialog.getByLabel("Beneficiary").fill("PEKİYİ MOBİLYA");
  await dialog.getByLabel("Currency").click();
  await page.getByRole("option", { name: currency, exact: true }).click();
  await dialog.getByLabel("IBAN").fill(iban);
  await dialog.getByRole("button", { name: "Add account" }).click();
  return dialog;
}

test.describe("bank accounts", () => {
  test("an IBAN with wrong check digits is refused", async ({ page }) => {
    const valid = makeIban("TR", randomBban());
    const broken = `${valid.slice(0, 2)}${valid[2] === "9" ? "1" : "9"}${valid.slice(3)}`;
    const dialog = await fillAccount(page, "TRY", broken);
    await expect(dialog.getByText("This IBAN is not valid", { exact: false })).toBeVisible();
  });

  test("only one active account per currency", async ({ page }) => {
    // The seed has an active USD account already.
    const dialog = await fillAccount(page, "USD", makeIban("TR", randomBban()));
    await expect(dialog.getByText("There is already an active account for this currency.", { exact: false })).toBeVisible();

    // TRY has none: the first one is accepted, a second one is refused.
    const first = makeIban("TR", randomBban());
    const created = await fillAccount(page, "TRY", first);
    await expect(created).toBeHidden();
    await expect(page.getByRole("row").filter({ hasText: "TRY" })).toHaveCount(1);

    const second = await fillAccount(page, "TRY", makeIban("TR", randomBban()));
    await expect(second.getByText("There is already an active account for this currency.", { exact: false })).toBeVisible();
  });
});
