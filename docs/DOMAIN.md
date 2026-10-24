# Domain model

How PEKİYİ's export business is represented in the system. Source of truth for the data:
[web/db/seed-data/pekiyi-seed-data.json](../web/db/seed-data/pekiyi-seed-data.json), extracted
from the real Excel/PDF files in `docs/samples/` (git-ignored). Schema:
[web/db/schema/](../web/db/schema/). Calculations:
[web/lib/domain/](../web/lib/domain/) (pure functions, no database, fully unit-tested).

## The company

- **Legal entity**: DİRENÇ MOBİLYA İMALAT SANAYİ VE TİCARET LTD. ŞTİ. **Brand**: PEKİYİ.
  Both live in `company_settings`, a table with exactly one row.
- **One bank** (Kuveyt Türk), **one IBAN per currency** (`bank_accounts`).
- **Exchange rates** are typed in by hand each day (`exchange_rates`: date, from, to, rate),
  e.g. 2026-10-23: 1 USD = 49 TRY, 1 EUR = 55.8 TRY.

## Catalog

- **Piece types** (`piece_types`): `SEAT_3` (3-seater), `SEAT_2`, `SEAT_1` (armchair), and
  accessories like `CUSHION_EXTRA`. Each has a seat count, which is the digit used in compositions.
- **Models** (`models`): DAMLA, VERA, ZERDA, … (30 today), all sofa beds.
- **Piece prices** (`model_piece_prices`): the catalog price of one piece of one model, with its
  own currency (almost always TRY), plus packing data: CBM, weight, number of packages per
  piece and what is inside them ("2 ADET AYAK"). The price may be empty.
- **Presets** (`model_presets`): standard compositions a model is sold in. Some models (KOTON,
  LİDYA, SENA, VİLLA) have no piece prices at all, only a **fixed set price in USD**.
- **Fabrics** (`fabrics`): brand + code (unique together), the supplier's colour word
  ("A.GRİ") and a translated colour name.

## Customers

`customers`: company, contact, country (ISO-2), address, phones, tax ids (BTW/KVK…), the
**language their documents are printed in** (tr/en/ar), default and secondary currency, default
incoterm (EXW, sometimes FOB), and **label branding**: `pekiyi`, `none`, or `customer_logo`.
Some customers forbid the PEKİYİ name on labels; `customer_logo` requires an uploaded logo.
`customer_product_codes` keeps a customer's own EAN-13 barcodes, stock codes and brand names for
our products (private-label stickers). A code targets a model, optionally narrowed to one piece
type and/or one fabric (empty = all). Per customer, a barcode is used once and each
model/piece-type/fabric combination has at most one code.

Phones and WhatsApp numbers are stored in E.164 (`+31633999931`); a number typed without a
country code is read in the customer's country. Before a new customer is created we look for
an existing one with the same email, a shared phone/WhatsApp number, or a very similar company
name (Turkish letters, case, spaces, punctuation and words like "Furniture"/"Mobilya"/"Ltd"
ignored; one-letter typos tolerated) and ask the user to confirm. Customers are deactivated
rather than deleted; an admin can delete one only while it has no orders.

## Orders

An **order** (`orders`) belongs to one customer and moves through
`offer → proforma → confirmed → in_production → ready → loading → shipped → closed`
(or `cancelled`). The status is changed on its own (not with the order save), one step forward
at a time; an order can be cancelled from any status before `shipped`; only an admin can move it
back one step (a cancelled order back to the status it was cancelled from), and must give a
reason. Every change is in the audit log with its optional note / reason
([web/lib/domain/order-status.ts](../web/lib/domain/order-status.ts)).

**Order numbers** look like `261012-1ZOC`: date (YYMMDD), a running number for that day, and an
internal company code. The pattern (`{YY}{MM}{DD}-{SEQ}{CODE}`), the revision suffix (`-REV{N}`)
and the code (`ZOC`) are company settings. The code changes from time to time, so **every order
stores the code it was created with** (`orders.order_code`) and changing the setting never
renumbers existing orders. SEQ counts all orders of the day whatever their code. Revisions add
`-REV1`, `-REV2`, … (we have reached REV11) and keep the original code.
A new order gets its number on its **first save**, inside the saving transaction and under a
per-day Postgres advisory lock, so two people saving at the same second get consecutive numbers.

An order is **saved as one unit** — header, lines, pieces and fabrics — guarded by the single
`orders.version` (optimistic locking) and recorded as one audit entry listing what changed. Lines,
pieces and fabrics are written **by diff**: unchanged rows are not touched and keep their id, so
rows that point at them (loading ticks on pieces, Phase 7) survive every save.
**Order prices** (line and piece prices, discount, advance) are set by admin and export users
(`orderPrices.update`). Catalog prices, presets, exchange rates, bank and company settings stay
admin-only (`prices.update`, `settings`).

An order holds: currency, optional **secondary currency + rate** (e.g. EUR at 1.12 USD per EUR,
stored as "order currency per 1 secondary unit"), incoterm, delivery time and payment terms (in
three languages), the **advance** (a fixed amount *or* a percentage; balance = total − advance),
notes, document options and custom columns.

**Custom columns** (`orders.custom_columns`, values in `order_items.custom_values`) are extra
per-line columns: a TR/EN/AR label, text or number, and the documents they are printed on
(proforma / production / loading). The key is generated once from the Turkish label and never
changes. A **column template** (`column_templates`) is a named column set, for all customers or
for one; a customer's default template is applied to its new orders.

### Order lines

A **line** (`order_items`) = model + composition + fabric(s) + quantity + unit (`SET` or `PCS`)
+ unit price.

- **Composition** describes one set: `3+3+1+1` = 2 × 3-seater + 2 × armchair. Also seen:
  `3+3+1+1+1+1`, `3+2+1`, and `3` (a single piece, unit PCS).
- **Pieces** (`order_item_pieces`) are generated from the composition but editable:
  - a piece can be **another model's piece** (VERA 3+2+1 where the armchair is a DAMLA armchair);
  - **accessories** are extra zero-price pieces ("1 extra cushion per 3-seater");
  - with per-piece pricing a piece carries its own price;
  - a piece can have its own fabric.
- **Fabrics** (`order_item_fabrics`): one or more per line (APOLLO 23 + APOLLO 21), each either
  a catalog fabric or free text, with a role (main, secondary, piping…).
- The **unit price is always editable**. The catalog only *suggests* one (`suggestUnitPrice`):
  a preset's fixed set price if there is one, otherwise Σ (piece price × qty per set), each piece
  priced from the model it is actually built as, summed in TRY and converted at the day's rate,
  rounded to cents. No suggestion when a piece has no price or a rate is missing.

### Notes, for two audiences

- **Customer notes**: printed on the proforma, in en/ar/tr. On the order and on each line.
- **Production notes**: printed on the production sheet, mainly in Turkish. On the order and on
  each line.
- **Reference notes** (`order_reference_notes`): a title, text and a photo ("GOLD model legs"
  + picture), shown on the documents listed in `show_on`.
- **Sample approval**: an optional "a sample must be approved before mass production" flag with
  its text.

### Documents

Proforma options seen in our files: per-piece price columns, a secondary-currency column, unit and
total CBM, a photo per line (`orders.document_options`). Issuing a document
(`document_issues`) freezes a **snapshot** of every value it was built from; editing the order
afterwards leads to a new revision, never to a changed document (a database trigger refuses any
update or delete of an issued row).

**Issuing a proforma** ([web/lib/orders/issue.ts](../web/lib/orders/issue.ts)) snapshots the
company, every active bank account (one for the order currency is required), the customer, the
header, lines with pieces and fabrics, customer notes, the custom columns and reference notes
marked for the proforma, totals, document options, and the names of the models, piece types and
fabric colours the order uses — every translatable value in all three languages. The first issue
keeps the order's number (revision 0, or an imported order's existing REV); each later issue is the
next revision and the order's number becomes base + `-REV{N}`. Issuing again when nothing the
proforma shows has changed (same content fingerprint) is refused; status, production notes, label
settings and **the language** don't count as changes — a revision is about content, and every
issued revision can be downloaded in any language (tr, en, ar, or en + ar). The language picked
when issuing is only the default for downloads. Issuing an offer makes it a proforma. Files an
issued document mentions (line photos, logos) are kept even after the order or the settings stop
using them.

**Proforma documents** ([web/lib/documents/](../web/lib/documents/)): one view model per
(snapshot, language) feeds both the PDF (HTML printed by headless Chromium) and the Excel workbook
(real formulas). The "Preview" on the order page renders the saved order the same way with a DRAFT
watermark and stores nothing; an issued revision's PDF/Excel is rendered on its first download per
language and format, stored, and served unchanged afterwards. Production notes and everything
marked production-only never reach a proforma; the production role gets 403 on every document URL.
Dates print with month names ("22 Oct 2026", "22 Eki 2026", "22 أكتوبر 2026"), money with the
currency symbol and the language's separators ("$51,100.00", "$51.100,00").

### Production never sees prices

The production role must never receive price data, not even hidden (our old production Excel
files had prices in hidden columns). Everything production can reach goes through
[web/lib/orders/production-queries.ts](../web/lib/orders/production-queries.ts), which selects
explicit columns only: no unit/piece/catalog prices, discounts, totals, currency, advance,
payment terms, customer notes or payments. Custom columns reach production only when they are
marked for the production sheet. A test checks the generated SQL.

### Labels (rendering in Phase 8)

Label kinds seen in `ETİKET.xlsx`, one label per A4 landscape page (`label_templates`):
product (name + colour code + logo), shipping (sender / receiver / address + package contents),
English export label (logo, company, address, category, set type, colour, "Made in TURKEY"),
customer private-label barcode (customer EAN-13 + their brand name), and stock barcode (EAN-13,
stock code, name, colour, photo). The customer has a default template and branding; the order can
override both. Labels to print = Σ pieces × packages per piece (default 1).

### Payments

`payments`: date, amount, currency, type (advance / balance / other). Table only; UI in Phase 9.

## Worked examples: the 4 sample orders

All four are reproduced exactly by `computeOrderTotals` / `computePieceCounts`
([sample-orders.test.ts](../web/lib/domain/sample-orders.test.ts)), both from the JSON and after
a round trip through the database (`pnpm db:seed:check`).

### 261012-1ZOC: HALA FURNITURE (Netherlands), plain sets

| Model | Composition | Fabric | Qty | Unit price | Line total |
|---|---|---|---:|---:|---:|
| DAMLA | 3+3+1+1 | BOYTEKS 30147202 | 28 SET | 650 | 18,200 |
| VERA | 3+3+1+1 | BOYTEKS 30147205 | 28 SET | 625 | 17,500 |
| RİVA | 3+3+1+1 | BOYTEKS 30147203 | 28 SET | 550 | 15,400 |

**Total 51,100 USD.** 84 sets × 4 pieces = **336 pieces** (168 three-seaters, 168 armchairs).
No advance recorded, so balance = 51,100. Production note: no decor on the arms of DAMLA's
3-seaters.

### 261010-1ZOC: JIAN SMART ROIM (Iraq), per-piece prices

12 lines of 1 set each, `3+3+1+1+1+1` (2 three-seaters + 4 armchairs), one line per colour:

| Model | 3-seater | Armchair | Set price (2 × 3-seater + 4 × armchair) |
|---|---:|---:|---:|
| DAMLA | 235.20 | 92.40 | 840 |
| VERA | 209 | 93 | 790 |
| MODA | 184 | 93 | 740 |

4 colours each: 4 × 840 + 4 × 790 + 4 × 740 = **9,480 USD**. Advance: fixed **500**, so
**balance 8,980**. The customer wants no PEKİYİ name on labels and a metal label with their own
logo, so label branding on this order is `customer_logo`.

### 261020ZOC-REV1: VİRONA FURNITURE (Sweden), accessories and lots of notes

18 lines, 30 sets in total, every set `3+3+1+1` + 2 extra cushions at price 0, all at 400 USD:
İKLİM, LAHZA, GOLD × 6 colours × 1 set; REYHAN, NEVA × 3 colours × 2 sets.

**Total 30 × 400 = 12,000 USD**, fixed advance **1,000**, **balance 11,000**.
Pieces: **60 three-seaters, 60 armchairs, 60 extra cushions** ("1 extra cushion per
3-seater"). Lines carry customer notes (en + ar) and production notes (tr) such as "gold legs
like the GOLD model". The order has two reference notes with photos and requires **sample
approval**: one 3-seater is built first, and the customer tries it and approves it before the
rest is produced.

### 261022ZOC-REV11: GRAND DIZAJN (Montenegro), EUR column, CBM, model override

| Model | Composition | Fabric | Qty | Unit price | Line total | Unit CBM | CBM |
|---|---|---|---:|---:|---:|---:|---:|
| SEREN | 3 | APOLLO 23 + APOLLO 21 | 10 PCS | 126 | 1,260 | 0.8 | 8.0 |
| ZERDA | 3+2+1 | OGUZCAN F2-03 | 7 SET | 333 | 2,331 | 1.8 | 12.6 |
| VERA (DAMLA armchair) | 3+2+1 | BOYTEKS 30147203 | 5 SET | 470.40 | 2,352 | 2.6 | 13.0 |

**Total 5,943 USD = 5,306.25 EUR** at 1.12 USD/EUR. **33.6 CBM.** Advance **30 %** =
1,782.90 USD, balance 4,160.10 USD (1,591.88 / 3,714.37 EUR).
Pieces: 22 three-seaters, 12 two-seaters, 12 armchairs = **46**. The 5 armchairs of the VERA
sets are **DAMLA** armchairs, and they are counted as DAMLA on the loading form.

## Rounding rules

- All money and volume arithmetic is decimal (decimal.js), never JS floats. Money is stored as
  `numeric(12,2)`, rates as `numeric(14,6)`, CBM as `numeric(8,3)`.
- Half-up rounding to cents. Each **line total is rounded before summing**, so printed lines
  always add up to the printed total.
- A percentage advance is rounded to cents. Secondary-currency totals = order-currency figure ÷
  rate, rounded. The secondary balance is derived from the rounded secondary total and advance, so
  advance + balance = total on paper.

## Problems in the source data

The seed inserts these values **as they are** and never overwrites them later. Users correct
them from the admin pages (Phase 2). `pnpm db:seed` prints the first two groups on every run.

**Recorded in the JSON (`catalogWarnings`, bank notes, `sourceIssues`):**

1. Duplicate catalog row "ZERDA 3-SEATER SOFA BED" priced 7750 and 6800. 7750 was kept; to be
   confirmed with Ömer Bey.
2. EUR IBAN: several old Excel files print the USD IBAN in the EURO row. `TR69…0101` (used in
   the JIAN and NETHERLANDS proformas) was seeded; **confirm with accounting before go-live.**
3. 261012-1ZOC: invoice date typed 2026-12-10 although the number says 12 Oct (day/month swap).
4. 261012-1ZOC: the production Excel header shows GRAND DIZAJN / Mr. VLATKO and a Montenegro
   phone (copied from another file).
5. 261022ZOC-REV11: down-payment formula is `=#REF!*0.3` (broken).
6. 261022ZOC-REV11: the production Excel keeps old prices/CBM in hidden columns F–L (SEREN 303 /
   2.35 CBM) that disagree with the proforma (126 / 0.8). This is exactly the leak the
   production price-safety rule prevents.
7. 261022ZOC-REV11: the EURO IBAN row shows the USD IBAN.

**Found while building step 1.2:**

8. **Payment terms vs. advance disagree.** HALA's terms say "30% DOWN PAYMENT" but no advance is
   recorded (30 % would be 15,330). JIAN says 30 % but the advance is 500 (30 % = 2,844).
   VİRONA says "30% ADVANCE" but the advance is 1,000 (30 % = 3,600). The system uses the
   recorded advance, and the terms text is printed as written.
9. **Two order numbers don't follow the pattern.** `261020ZOC` and `261022ZOC` have no
   `-{SEQ}`. They are stored as they are; `nextOrderNumber` still counts them so their day's SEQ is
   never reused.
10. 261020ZOC-REV1 is dated 2026-10-22 but its number says 20 Oct, probably because REV1 was
    issued two days later. We keep one date per order; revision dates come from
    `document_issues.issued_at`.
11. **No catalog price for any 2-seater** (`SEAT_2`), and **no CBM for any model except SEREN**.
    So ZERDA/VERA 3+2+1 get no price suggestion, and CBM only comes from the line overrides typed
    on the proforma.
12. Models GOLD, LAHZA, NEVA (used in VİRONA) and EFSUN, ELVAN, MAVI, NESVE, PERİ, SADE, VİSAL
    have a preset with **no fixed price and no piece prices**, so no price suggestion is possible.
13. Model code **MAVI** is written without the Turkish dotted İ, while every other code uses it
    (LİDYA, NİSAN, RİVA, …). It is probably "MAVİ"; check before users search for it.
14. Fabrics from EMK, APOLLO and OGUZCAN have no colour names; only BOYTEKS and SETRA do.
15. Models have only codes, no display names or descriptions; the code was seeded as the name in
    all three languages.
16. The day's rates (49 / 55.8 TRY) imply 1.139 USD per EUR, while the GRAND DIZAJN proforma
    uses 1.12. That is not necessarily wrong (a different date, or a negotiated rate), but it is
    why the secondary rate is stored per order.
