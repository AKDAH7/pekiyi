import "server-only";

import { and, asc, count, eq, like, or, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  customerProductCodes,
  customers,
  fabrics,
  labelTemplates,
  models,
  orders,
  pieceTypes,
} from "@/db/schema";
import { CUSTOMERS_PAGE_SIZE } from "@/lib/customers/constants";
import { escapeLike } from "@/lib/db/like";
import { FOLD_FROM, FOLD_TO, foldSearchText } from "@/lib/domain/text-fold";
import type { CustomerFilters } from "@/lib/validation/customers";

/** SQL twin of `foldSearchText`: Turkish letters → ASCII, then lower case. */
function folded(column: AnyColumn): SQL {
  return sql`lower(translate(coalesce(${column}, ''), ${FOLD_FROM}, ${FOLD_TO}))`;
}

function digitsOf(column: AnyColumn): SQL {
  return sql`regexp_replace(coalesce(${column}, ''), '[^0-9]', '', 'g')`;
}

/**
 * Correlated subquery, written with explicit table-qualified identifiers: in
 * a single-table select Drizzle renders `${orders.customerId}` as a bare
 * "customer_id", which inside the subquery would compare orders to itself.
 */
const orderCount = sql<number>`(select count(*)::int from ${orders} where ${orders}.${sql.identifier(
  orders.customerId.name,
)} = ${customers}.${sql.identifier(customers.id.name)})`;

function listConditions(filters: CustomerFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.q) {
    const pattern = `%${escapeLike(foldSearchText(filters.q))}%`;
    const matches: SQL[] = [
      like(folded(customers.companyName), pattern),
      like(folded(customers.contactPerson), pattern),
      like(folded(customers.email), pattern),
    ];
    // Phone search by digits, so "0633 999 931" finds "+31633999931".
    const digits = filters.q.replace(/\D/g, "").replace(/^0+/, "");
    if (digits.length >= 3) {
      const digitPattern = `%${digits}%`;
      matches.push(like(digitsOf(customers.phone), digitPattern), like(digitsOf(customers.whatsapp), digitPattern));
    }
    conditions.push(or(...matches)!);
  }
  if (filters.country) conditions.push(eq(customers.country, filters.country));
  if (filters.status === "active") conditions.push(eq(customers.active, true));
  if (filters.status === "inactive") conditions.push(eq(customers.active, false));
  return conditions.length ? and(...conditions) : undefined;
}

export async function listCustomers(filters: CustomerFilters) {
  const where = listConditions(filters);
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(customers).where(where),
    db
      .select({
        id: customers.id,
        companyName: customers.companyName,
        country: customers.country,
        city: customers.city,
        contactPerson: customers.contactPerson,
        phone: customers.phone,
        whatsapp: customers.whatsapp,
        docLanguage: customers.docLanguage,
        active: customers.active,
        orderCount,
      })
      .from(customers)
      .where(where)
      .orderBy(folded(customers.companyName), asc(customers.id))
      .limit(CUSTOMERS_PAGE_SIZE)
      .offset((filters.page - 1) * CUSTOMERS_PAGE_SIZE),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE)) };
}

export type CustomerListRow = Awaited<ReturnType<typeof listCustomers>>["rows"][number];

/** Countries that have customers, for the list filter. */
export async function listCustomerCountries(): Promise<string[]> {
  const rows = await db.selectDistinct({ country: customers.country }).from(customers);
  return rows.map((row) => row.country);
}

export async function getCustomer(id: string) {
  const [row] = await db
    .select({ customer: customers, orderCount, labelTemplateName: labelTemplates.name })
    .from(customers)
    .leftJoin(labelTemplates, eq(labelTemplates.id, customers.defaultLabelTemplateId))
    .where(eq(customers.id, id));
  return row ?? null;
}

export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomer>>>;

export async function listProductCodes(customerId: string) {
  return db
    .select({
      id: customerProductCodes.id,
      version: customerProductCodes.version,
      modelId: customerProductCodes.modelId,
      modelCode: models.code,
      modelName: models.name,
      pieceTypeId: customerProductCodes.pieceTypeId,
      pieceTypeName: pieceTypes.name,
      fabricId: customerProductCodes.fabricId,
      fabricBrand: fabrics.brand,
      fabricCode: fabrics.code,
      barcode: customerProductCodes.barcode,
      stockCode: customerProductCodes.stockCode,
      customerProductName: customerProductCodes.customerProductName,
      brandText: customerProductCodes.brandText,
    })
    .from(customerProductCodes)
    .innerJoin(models, eq(models.id, customerProductCodes.modelId))
    .leftJoin(pieceTypes, eq(pieceTypes.id, customerProductCodes.pieceTypeId))
    .leftJoin(fabrics, eq(fabrics.id, customerProductCodes.fabricId))
    .where(eq(customerProductCodes.customerId, customerId))
    .orderBy(asc(models.code), asc(pieceTypes.sort), asc(fabrics.brand), asc(fabrics.code));
}

export type ProductCodeRow = Awaited<ReturnType<typeof listProductCodes>>[number];

/** What the product-code form chooses from. Inactive entries stay selectable when already used. */
export async function productCodeOptions() {
  const [modelRows, pieceTypeRows, fabricRows] = await Promise.all([
    db
      .select({ id: models.id, code: models.code, name: models.name, active: models.active })
      .from(models)
      .orderBy(asc(models.sort), asc(models.code)),
    db
      .select({ id: pieceTypes.id, code: pieceTypes.code, name: pieceTypes.name })
      .from(pieceTypes)
      .orderBy(asc(pieceTypes.sort)),
    db
      .select({ id: fabrics.id, brand: fabrics.brand, code: fabrics.code, active: fabrics.active })
      .from(fabrics)
      .orderBy(asc(fabrics.brand), asc(fabrics.code)),
  ]);
  return { models: modelRows, pieceTypes: pieceTypeRows, fabrics: fabricRows };
}

export async function listLabelTemplateOptions() {
  return db
    .select({ id: labelTemplates.id, name: labelTemplates.name, active: labelTemplates.active })
    .from(labelTemplates)
    .orderBy(asc(labelTemplates.sort), asc(labelTemplates.code));
}

/** Every customer, reduced to what the duplicate check compares. */
export async function listDuplicateCandidates() {
  return db
    .select({
      id: customers.id,
      companyName: customers.companyName,
      email: customers.email,
      phone: customers.phone,
      whatsapp: customers.whatsapp,
      country: customers.country,
      city: customers.city,
      active: customers.active,
    })
    .from(customers);
}
