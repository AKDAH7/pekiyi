/**
 * Test support: the 4 real sample orders of the seed JSON as proforma
 * snapshots, built through the same functions issuing uses
 * (proformaContent + buildProformaSnapshot) from an order graph shaped like
 * the one loadOrderGraph returns for the seeded fixtures — without a
 * database, so the document tests always see the original figures (the e2e
 * suite edits the seeded fixture orders).
 *
 * Only imported by *.test.ts files.
 */
import { catalogFromSeed, loadSeedData, resolveFabric, type SampleOrder, type SeedData } from "@/db/seed/data";
import type { DocLanguage, LocalizedText } from "@/db/schema/common";
import { normalizePhone } from "@/lib/domain/phone";
import { stripRevision } from "@/lib/domain/order-number";
import { buildProformaSnapshot, proformaContent, type DocumentNames } from "@/lib/orders/issue";
import type { OrderGraph } from "@/lib/orders/persist";

import { parseProformaSnapshot, type ProformaSnapshot } from "./snapshot";

export const FIXTURE_NUMBERS = {
  hala: "261012-1ZOC",
  jian: "261010-1ZOC",
  virona: "261020ZOC-REV1",
  grand: "261022ZOC-REV11",
} as const;
export type FixtureKey = keyof typeof FIXTURE_NUMBERS;

/** The day the fixtures' revisions are taken as issued (the invoice date printed). */
export const FIXTURE_ISSUE_DATE = "2026-10-24";

const BOOKKEEPING = { createdAt: new Date("2026-10-23T09:00:00Z"), updatedAt: new Date("2026-10-23T09:00:00Z"), createdBy: null, version: 1 };

let counter = 0;
const id = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

function fabricLabelOf(label: string, data: SeedData): { fabricId: string | null; freeText: string | null; label: string } {
  const match = resolveFabric(label, data.fabrics);
  return match ? { fabricId: id(), freeText: null, label: `${match.brand} ${match.code}` } : { fabricId: null, freeText: label, label };
}

/** The graph loadOrderGraph returns for a seeded sample order (db/seed/fixtures.ts inserts it the same way). */
function sampleGraph(order: SampleOrder, data: SeedData, customerId: string): OrderGraph {
  const advance = order.advance ?? null;
  const baseNumber = order.baseNumber ?? stripRevision(order.number);
  const orderId = id();
  return {
    order: {
      id: orderId,
      number: order.number,
      baseNumber,
      revision: order.revision,
      orderCode: "ZOC",
      customerId,
      status: "proforma",
      orderDate: order.date,
      currency: order.currency,
      secondaryCurrency: order.secondaryCurrency?.currency ?? null,
      secondaryRate: order.secondaryCurrency ? String(order.secondaryCurrency.usdPerEur) : null,
      incoterm: order.incoterm as OrderGraph["order"]["incoterm"],
      deliveryTime: order.deliveryTime ? { en: order.deliveryTime } : null,
      paymentTerms: order.paymentTerms ? { en: order.paymentTerms } : null,
      advanceType: advance === null ? null : "amount" in advance ? "amount" : "percent",
      advanceValue: advance === null ? null : String("amount" in advance ? advance.amount : advance.percent),
      customerNotes: order.customerNotes ?? null,
      productionNotes: order.productionNotes ?? null,
      sampleApprovalRequired: order.sampleApprovalRequired !== undefined,
      sampleApprovalText: order.sampleApprovalRequired ?? null,
      documentOptions: order.documentOptions ?? {},
      labelBranding: order.labelRequirements ? "customer_logo" : null,
      labelTemplateId: null,
      customColumns: [],
      ...BOOKKEEPING,
    },
    items: order.items.map((item, position) => {
      const itemId = id();
      return {
        id: itemId,
        orderId,
        position,
        modelId: id(),
        displayName: null,
        composition: item.composition,
        quantity: item.qty,
        unit: item.unit,
        unitPrice: item.unitPrice.toFixed(2),
        discountPercent: "0.00",
        unitCbm: item.unitCbm === undefined ? null : item.unitCbm.toFixed(3),
        photoPath: null,
        customerNote: item.notes?.customer ?? null,
        productionNote: item.notes?.production ?? null,
        customValues: {},
        ...BOOKKEEPING,
        modelCode: item.model,
        modelPhotoPath: null,
        pieces: item.pieces.map((piece, piecePosition) => ({
          id: id(),
          itemId,
          position: piecePosition,
          pieceTypeId: id(),
          qtyPerUnit: piece.qtyPerUnit,
          modelOverrideId: piece.modelOverride ? id() : null,
          unitPrice: piece.unitPrice === undefined ? null : piece.unitPrice.toFixed(2),
          fabricOverrideId: null,
          ...BOOKKEEPING,
          pieceTypeCode: piece.pieceType,
          modelOverrideCode: piece.modelOverride ?? null,
          fabricOverrideLabel: null,
        })),
        fabrics: item.fabrics.map((label) => fabricLabelOf(label, data)),
      };
    }),
  };
}

/** Names as db/seed/reference.ts seeds them: model codes as names, piece types and fabric colours from the JSON. */
function seedNames(data: SeedData, graph: OrderGraph): DocumentNames {
  const usedTypes = new Set(graph.items.flatMap((item) => item.pieces.map((piece) => piece.pieceTypeCode)));
  const same = (text: string): LocalizedText => ({ tr: text, en: text, ar: text });
  return {
    models: Object.fromEntries(
      graph.items.flatMap((item) => [item.modelCode, ...item.pieces.flatMap((piece) => piece.modelOverrideCode ?? [])]).map((code) => [code, same(code)]),
    ),
    pieceTypes: Object.fromEntries(
      data.pieceTypes
        .map((type, index) => [type.code, { name: type.name, shortName: type.short, isAccessory: type.isAccessory ?? false, sort: index * 10 }] as const)
        .filter(([code]) => usedTypes.has(code)),
    ),
    fabrics: Object.fromEntries(data.fabrics.flatMap((fabric) => (fabric.color ? [[`${fabric.brand} ${fabric.code}`, fabric.color]] : []))),
  };
}

const data = loadSeedData();

/** Snapshot of fixture order `key`, as issuing it would freeze it (plus optional changes to the order first). */
export function fixtureSnapshot(
  key: FixtureKey,
  { language, change }: { language?: DocLanguage; change?: (graph: OrderGraph) => void } = {},
): ProformaSnapshot {
  const sample = data.sampleOrders.find((order) => order.number === FIXTURE_NUMBERS[key]);
  if (!sample) throw new Error(`Fixture ${key} missing from the seed JSON`);
  const customer = data.customers.find((entry) => entry.key === sample.customer)!;
  const customerId = id();
  const graph = sampleGraph(sample, data, customerId);
  change?.(graph);
  const content = proformaContent(
    graph,
    (sample.referenceNotes ?? []).map((note) => ({ title: note.title, body: null, photoPath: null, showOn: ["proforma", "production"] })),
  );
  const bankAccounts = data.bank.accounts.map((account, index) => ({
    bankName: data.bank.bankName,
    swift: data.bank.swift,
    branch: data.bank.branch,
    beneficiary: data.bank.beneficiary,
    currency: account.currency,
    iban: account.iban,
    active: true,
    sort: index * 10,
  }));
  const snapshot = buildProformaSnapshot(graph, content, {
    number: sample.number,
    revision: sample.revision,
    language: language ?? customer.docLanguage,
    company: { ...data.company, logoPath: null, orderNumber: undefined },
    bankAccount: bankAccounts.find((account) => account.currency === sample.currency)!,
    bankAccounts,
    customer: {
      companyName: customer.company,
      contactPerson: customer.contactPerson ?? null,
      country: customer.country,
      city: customer.city ?? null,
      address: customer.address ?? null,
      phone: normalizePhone(customer.phone, customer.country) ?? customer.phone,
      email: customer.email ?? null,
      taxIds: customer.taxIds ?? null,
      docLanguage: customer.docLanguage,
    },
    names: seedNames(data, graph),
    catalog: catalogFromSeed(data),
  });
  // Through JSON, like a snapshot read back from jsonb.
  return parseProformaSnapshot(JSON.parse(JSON.stringify(snapshot)));
}

/** The production notes of a fixture (must never appear on a proforma). */
export function fixtureProductionNotes(key: FixtureKey): string[] {
  const sample = data.sampleOrders.find((order) => order.number === FIXTURE_NUMBERS[key])!;
  return [
    ...Object.values(sample.productionNotes ?? {}),
    ...sample.items.flatMap((item) => Object.values(item.notes?.production ?? {})),
  ].filter((text): text is string => typeof text === "string" && text !== "");
}

export const FIXTURE_IBANS = data.bank.accounts.map((account) => account.iban);
