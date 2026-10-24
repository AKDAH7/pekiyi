/** Driving the order editor from e2e specs (orders.spec.ts, order-workflow.spec.ts). */
import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";

/** Column names as the grid's editors are labelled ("Model, line 3"). */
const COLUMN_NAMES = {
  model: "Model",
  composition: "Set",
  fabrics: "Fabrics",
  quantity: "Qty",
  unitPrice: "Unit price",
  discount: "Discount %",
  unitCbm: "Unit CBM",
} as const;
type Column = keyof typeof COLUMN_NAMES;

export const grid = (page: Page) => page.getByTestId("order-grid");
export const cell = (page: Page, line: number, col: string): Locator =>
  grid(page).locator(`tr[data-line="${line}"] > td[data-col="${col}"]`);
export const editor = (page: Page, line: number, col: Column) =>
  page.getByLabel(`${COLUMN_NAMES[col]}, line ${line}`, { exact: true });

export async function setCell(page: Page, line: number, col: Exclude<Column, "model" | "fabrics">, value: string) {
  await cell(page, line, col).dblclick();
  await editor(page, line, col).fill(value);
  await editor(page, line, col).press("Enter");
  await expect(editor(page, line, col)).toBeHidden();
}

export async function setModel(page: Page, line: number, code: string) {
  if (!(await editor(page, line, "model").isVisible())) await cell(page, line, "model").dblclick();
  await editor(page, line, "model").fill(code);
  await page.getByRole("option", { name: new RegExp(`^${code}`) }).first().click();
  await expect(cell(page, line, "model")).toHaveText(code);
}

export async function setFabrics(page: Page, line: number, fabrics: string[]) {
  await cell(page, line, "fabrics").dblclick();
  const input = editor(page, line, "fabrics");
  for (const fabric of fabrics) {
    await input.fill(fabric);
    await page.getByRole("option", { name: new RegExp(`^${fabric}`) }).first().click();
  }
  await input.press("Enter");
  await expect(input).toBeHidden();
  for (const fabric of fabrics) await expect(cell(page, line, "fabrics")).toContainText(fabric);
}

type Line = { model: string; composition: string; fabrics: string[]; qty: number; price: string; cbm?: string };

export async function addLine(page: Page, line: number, data: Line) {
  await page.getByRole("button", { name: "Add line" }).click();
  await setModel(page, line, data.model);
  await setCell(page, line, "composition", data.composition);
  await setFabrics(page, line, data.fabrics);
  await setCell(page, line, "quantity", String(data.qty));
  await setCell(page, line, "unitPrice", data.price);
  if (data.cbm) await setCell(page, line, "unitCbm", data.cbm);
}

export async function startOrder(page: Page, customer: string) {
  await page.goto("/en/orders");
  await page.getByRole("link", { name: "New order" }).click();
  await expect(page).toHaveURL(/\/en\/orders\/new$/);
  await page.getByLabel("Customer", { exact: true }).fill(customer);
  await page.getByRole("option", { name: customer, exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New order" })).toBeVisible();
  await expect(page.getByText(`${customer} · The order number is assigned`)).toBeVisible();
}

export async function createOrder(page: Page) {
  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page).toHaveURL(/\/en\/orders\/[0-9a-f-]{36}$/);
  await expect(page.getByText("All changes saved")).toBeVisible();
  return page.url();
}

export async function openOrder(page: Page, number: string) {
  await page.goto(`/en/orders?q=${encodeURIComponent(number)}`);
  await page.getByRole("link", { name: number, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: number })).toBeVisible();
  return page.url();
}

export const pieces = (page: Page) => page.getByTestId("total-pieces");

/** Opens fixture order `number`, duplicates it and returns the new order's number (an offer, revision 0). */
export async function duplicateOrder(page: Page, number: string) {
  await openOrder(page, number);
  await page.getByRole("button", { name: "Duplicate order" }).click();
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(number);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^\d{6}-\d+ZOC$/);
  await expect(page.getByText("All changes saved")).toBeVisible();
  return (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
}

export async function saveOrder(page: Page) {
  await page.getByRole("button", { name: "Save order" }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
}
