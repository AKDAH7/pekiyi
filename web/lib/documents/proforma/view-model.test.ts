import { describe, expect, it } from "vitest";

import { fixtureProductionNotes, fixtureSnapshot, FIXTURE_ISSUE_DATE, FIXTURE_IBANS } from "./test-fixtures";
import { parseProformaSnapshot } from "./snapshot";
import { buildProformaViewModel, type ProformaViewModel } from "./view-model";

const keys = (model: ProformaViewModel) => model.columns.map((column) => column.key);
const total = (model: ProformaViewModel, key: "total" | "advance" | "balance") => model.totals.find((row) => row.key === key);
const ibans = (model: ProformaViewModel) => model.bank.flatMap((group) => group.accounts.map((account) => account.iban));

describe("proforma view model — 261012-1ZOC (HALA, NL)", () => {
  const model = buildProformaViewModel(fixtureSnapshot("hala"), { invoiceDate: FIXTURE_ISSUE_DATE, language: "en" });

  it("has the base columns only, and the EXW total without advance rows", () => {
    expect(keys(model)).toEqual(["product", "composition", "fabric", "amount", "unit", "unitPrice", "total"]);
    expect(model.totals.map((row) => row.key)).toEqual(["total"]);
    expect(total(model, "total")).toMatchObject({ label: { main: "EXW Total Price" }, amount: { text: "$51,100.00", value: "51100.00" } });
    expect(model.lines.map((line) => line.cells.total.text)).toEqual(["$18,200.00", "$17,500.00", "$15,400.00"]);
  });

  it("prints the buyer with address and tax ids, the terms and every bank account", () => {
    expect(model.buyer.map((row) => row.label.main)).toEqual(["Buyer company", "Address", "Phone", "E-mail", "BTW", "KVK"]);
    expect(model.buyer[1].lines).toEqual(["VERRIJN STUARTLAAN 42B, 2288 EM RIJSWIJK, NETHERLANDS"]);
    expect(model.terms.map((row) => [row.label.main, row.lines.join(" ")])).toEqual([
      ["Invoice date", "24 Oct 2026"],
      ["Invoice number", "261012-1ZOC"],
      ["Delivery time", "2-3 WEEKS"],
      ["Payment terms", "30% DOWN PAYMENT / 70% AT DELIVERY"],
      ["Incoterm", "EXW"],
    ]);
    expect(ibans(model)).toEqual(FIXTURE_IBANS);
    expect(model.bank).toHaveLength(1);
    expect(model.bank[0].accounts.map((account) => account.label.main)).toEqual(["IBAN USD", "IBAN EUR"]);
  });

  it("names fabrics with their colour in the document language", () => {
    expect(model.lines[0].cells.fabric.lines).toEqual(["BOYTEKS 30147202 Anthracite"]);
    const turkish = buildProformaViewModel(fixtureSnapshot("hala"), { invoiceDate: FIXTURE_ISSUE_DATE, language: "tr" });
    expect(turkish.lines[0].cells.fabric.lines).toEqual(["BOYTEKS 30147202 Antrasit"]);
    expect(turkish.lines[0].cells.unit.text).toBe("TAKIM");
    expect(total(turkish, "total")?.amount.text).toBe("$51.100,00");
    expect(turkish.terms[0].lines).toEqual(["24 Eki 2026"]);
    // Delivery time exists in English only: the Turkish document falls back to it.
    expect(turkish.terms[2].lines).toEqual(["2-3 WEEKS"]);
  });

  it("can print only the order currency's bank account", () => {
    const snapshot = fixtureSnapshot("hala", { change: (graph) => void (graph.order.documentOptions = { bankOrderCurrencyOnly: true }) });
    expect(ibans(buildProformaViewModel(snapshot, { invoiceDate: FIXTURE_ISSUE_DATE, language: "en" }))).toEqual([FIXTURE_IBANS[0]]);
  });
});

describe("proforma view model — 261010-1ZOC (JIAN, IQ): per-piece prices", () => {
  const model = buildProformaViewModel(fixtureSnapshot("jian"), { invoiceDate: FIXTURE_ISSUE_DATE, language: "en" });

  it("has one price column per piece type used, before the amount", () => {
    expect(keys(model)).toEqual(["product", "composition", "fabric", "piece:SEAT_3", "piece:SEAT_1", "amount", "unit", "unitPrice", "total"]);
    expect(model.columns[3].label.main).toBe("3-Seater price");
    expect(model.columns[4].label.main).toBe("Armchair price");
    expect(model.lines[0].cells["piece:SEAT_3"].text).toBe("$235.20");
    expect(model.lines[0].cells["piece:SEAT_1"].text).toBe("$92.40");
    expect(model.lines[0].cells.unitPrice.text).toBe("$840.00");
  });

  it("total 9,480, a fixed 500 advance and the balance", () => {
    expect(total(model, "total")?.amount.text).toBe("$9,480.00");
    expect(total(model, "advance")).toMatchObject({ label: { main: "Advance payment" }, percent: null, amount: { text: "$500.00" } });
    expect(total(model, "balance")?.amount.text).toBe("$8,980.00");
  });

  it("in Arabic: right to left, Arabic labels, Latin digits, Arabic-only notes", () => {
    const arabic = buildProformaViewModel(fixtureSnapshot("jian"), { invoiceDate: FIXTURE_ISSUE_DATE, language: "ar" });
    expect(arabic.dir).toBe("rtl");
    expect(arabic.labels.title.main).toBe("فاتورة أولية");
    expect(arabic.columns[3].label.main).toBe("سعر كنبة ثلاثية");
    expect(total(arabic, "total")?.amount.text).toBe("$9,480.00");
    expect(arabic.terms[0].lines).toEqual(["24 أكتوبر 2026"]);
    expect(arabic.notes.customer[0]).toContain("موديل MODA");
  });

  it("bilingual: every fixed label shows English and Arabic", () => {
    const both = buildProformaViewModel(fixtureSnapshot("jian"), { invoiceDate: FIXTURE_ISSUE_DATE, language: "en-ar" });
    expect(both.dir).toBe("ltr");
    expect(both.labels.title).toEqual({ main: "PROFORMA INVOICE", alt: "فاتورة أولية" });
    expect(both.columns[3].label).toEqual({ main: "3-Seater price", alt: "سعر كنبة ثلاثية" });
    expect(total(both, "balance")?.label).toEqual({ main: "Balance", alt: "المبلغ المتبقي" });
  });
});

describe("proforma view model — 261020ZOC-REV1 (VIRONA, SE): notes", () => {
  const snapshot = fixtureSnapshot("virona");
  const model = buildProformaViewModel(snapshot, { invoiceDate: FIXTURE_ISSUE_DATE, language: "en" });

  it("total 12,000, advance 1,000, balance 11,000; 30 sets with their pieces, cushions left out", () => {
    expect(model.totals.map((row) => row.amount.text)).toEqual(["$12,000.00", "$1,000.00", "$11,000.00"]);
    expect(model.pieceSummary.main).toBe("30 sets · 60 × 3-seater · 60 × armchair");
    expect(buildProformaViewModel(snapshot, { invoiceDate: FIXTURE_ISSUE_DATE, language: "tr" }).pieceSummary.main).toBe("30 takım · 60 × 3'lü · 60 × 1'li");
  });

  it("prints customer notes in the document language, and never a production note", () => {
    expect(model.lines[0].notes).toEqual(["1. GOLD PIPING ON ARM UPHOLSTERY\n2. GOLD LEGS\n3. NEVA MODEL CUSHIONS WITH GOLD PIPING"]);
    expect(model.notes.customer[0]).toMatch(/^Springs must be firm/);
    const arabic = buildProformaViewModel(snapshot, { invoiceDate: FIXTURE_ISSUE_DATE, language: "ar" });
    expect(arabic.lines[0].notes[0]).toMatch(/^1\. فتيل ذهبي/);
    expect(arabic.notes.customer[0]).toMatch(/^جميع المنتجات بالراصور/);
    // Bilingual: both languages of the note.
    expect(buildProformaViewModel(snapshot, { invoiceDate: FIXTURE_ISSUE_DATE, language: "en-ar" }).lines[0].notes).toHaveLength(2);

    const everything = JSON.stringify([model, arabic, buildProformaViewModel(snapshot, { invoiceDate: FIXTURE_ISSUE_DATE, language: "tr" })]);
    const productionNotes = fixtureProductionNotes("virona");
    expect(productionNotes.length).toBeGreaterThan(0);
    for (const note of productionNotes) expect(everything).not.toContain(note.split("\n")[0]);
  });

  it("prints the sample approval and the reference notes", () => {
    expect(model.notes.sampleApproval[0]).toMatch(/^ÜRETİME BAŞLANDIĞINDA/);
    expect(model.notes.references.map((note) => note.title)).toEqual([["Gold model legs"], ["NEVA model cushions with gold piping"]]);
  });
});

describe("proforma view model — 261022ZOC-REV11 (GRAND DIZAJN, ME): EUR and CBM", () => {
  const model = buildProformaViewModel(fixtureSnapshot("grand"), { invoiceDate: FIXTURE_ISSUE_DATE, language: "en" });

  it("adds the EUR and CBM columns", () => {
    expect(keys(model)).toEqual([
      "product", "composition", "fabric", "amount", "unit", "unitPrice", "total",
      "secondaryUnitPrice", "secondaryTotal", "unitCbm", "cbm",
    ]);
    expect(model.columns[7].label.main).toBe("Unit price EUR");
    expect(model.lines.map((line) => line.cells.secondaryTotal.text)).toEqual(["€1,125.00", "€2,081.25", "€2,100.00"]);
    expect(model.lines.map((line) => line.cells.cbm.text)).toEqual(["8", "12.6", "13"]);
    expect(model.secondary?.note).toBe("1 EUR = 1.12 USD");
  });

  it("totals: 5,943 USD = 5,306.25 EUR, 33.6 CBM, 30 % advance in both currencies", () => {
    expect(total(model, "total")).toMatchObject({
      amount: { text: "$5,943.00" },
      secondary: { text: "€5,306.25" },
      cbm: { text: "33.6" },
    });
    expect(total(model, "advance")).toMatchObject({ percent: "30%", percentValue: "30", amount: { text: "$1,782.90" }, secondary: { text: "€1,591.88" } });
    expect(total(model, "balance")).toMatchObject({ amount: { text: "$4,160.10" }, secondary: { text: "€3,714.37" } });
  });

  it("keeps both fabrics of a line, one per row, and the contact person with the buyer", () => {
    expect(model.lines[0].cells.fabric.lines).toEqual(["APOLLO 23", "APOLLO 21"]);
    expect(model.buyer[0].lines).toEqual(["GRAND DIZAJN / Mr. VLATKO"]);
    expect(model.buyer[1].lines).toEqual(["Podgorica / Montenegro"]);
  });
});

describe("proforma view model — invoice date", () => {
  it("is the day the revision was issued, not the order date", () => {
    const snapshot = fixtureSnapshot("virona");
    expect(snapshot.order.orderDate).toBe("2026-10-22");
    const issued = buildProformaViewModel(snapshot, { invoiceDate: "2026-11-03", language: "en" });
    expect(issued.terms[0]).toEqual({ label: { main: "Invoice date" }, lines: ["3 Nov 2026"] });
    expect(JSON.stringify(issued.terms)).not.toContain("22 Oct 2026");
  });
});

describe("proforma view model — options and older snapshots", () => {
  it("shows photos and a discount column only when there is something to show", () => {
    const snapshot = fixtureSnapshot("hala", {
      change: (graph) => {
        graph.order.documentOptions = { showPhotos: true };
        graph.items[0].discountPercent = "10.00";
        graph.items[1].photoPath = "orders/0b6c7d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e.jpg";
      },
    });
    const model = buildProformaViewModel(snapshot, { invoiceDate: FIXTURE_ISSUE_DATE, language: "en" });
    expect(keys(model)).toEqual(["product", "composition", "fabric", "amount", "unit", "unitPrice", "discount", "total", "photo"]);
    expect(model.lines[0].cells.discount).toEqual({ text: "10%", value: "10.00" });
    expect(model.lines[0].cells.total.text).toBe("$16,380.00");
    expect(model.lines.map((line) => line.photo)).toEqual([null, "orders/0b6c7d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e.jpg", null]);
  });

  it("puts custom columns marked for the proforma before the amount", () => {
    const snapshot = fixtureSnapshot("hala", {
      change: (graph) => {
        graph.order.customColumns = [
          { key: "legs", label: { tr: "Ayak", en: "Legs" }, type: "text", showOn: ["proforma"] },
          { key: "internal", label: { tr: "İç" }, type: "text", showOn: ["production"] },
        ];
        graph.items[0].customValues = { legs: "GOLD", internal: "secret" };
      },
    });
    const model = buildProformaViewModel(snapshot, { invoiceDate: FIXTURE_ISSUE_DATE, language: "en" });
    expect(keys(model)).toEqual(["product", "composition", "fabric", "custom:legs", "amount", "unit", "unitPrice", "total"]);
    expect(model.lines[0].cells["custom:legs"].text).toBe("GOLD");
    expect(JSON.stringify(model)).not.toContain("secret");
  });

  it("renders a Phase 3.2 snapshot (one bank account, no names) with what it has", () => {
    const current = fixtureSnapshot("jian");
    const old = parseProformaSnapshot({ ...current, names: undefined, bankAccounts: undefined, snapshotVersion: undefined });
    const model = buildProformaViewModel(old, { invoiceDate: FIXTURE_ISSUE_DATE, language: "en" });
    expect(ibans(model)).toEqual([FIXTURE_IBANS[0]]);
    expect(model.lines[0].cells.fabric.lines).toEqual(["BOYTEKS 30147204"]);
    expect(model.columns[3].label.main).toBe("SEAT_3 price");
    // With the current catalog names as fallback.
    const named = buildProformaViewModel(old, { invoiceDate: FIXTURE_ISSUE_DATE, language: "en", fallbackNames: current.names });
    expect(named.columns[3].label.main).toBe("3-Seater price");
    expect(total(named, "total")?.amount.text).toBe("$9,480.00");
  });
});
