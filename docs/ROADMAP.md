# Roadmap

- [x] **Phase 0 — Foundation** — repo, Docker (Postgres), Next.js app shell, i18n (tr/ar/en) with
  RTL, authentication (Drizzle + Better Auth), navigation skeleton.
- [x] **Phase 1 — Data model + users management + audit log**
  - [x] **1.1** — roles & permissions (Better Auth access control, `web/lib/auth/permissions.ts`),
    users management, my profile, `audit_log` table + `logAudit` helper, audit log page.
  - [x] **1.2** — business data model (company settings, bank accounts, exchange rates, catalog,
    fabrics, customers, orders, payments, document issues, label templates), insert-only seed +
    dev fixtures (`SEED_FIXTURES=true`), pure domain functions in `web/lib/domain/`
    (composition, price suggestion, totals, piece/label counts, order numbers, EAN-13),
    price-free production queries. See [DOMAIN.md](DOMAIN.md).
- [x] **Phase 2 — Customers & catalog** — CRUD UIs. These pages are where users fix
  the source-data problems listed in DOMAIN.md; the seed never overwrites their edits.
  - [x] **2.1** — admin settings + product catalog:
    - shared building blocks: `TranslatedInput`/`TranslatedTextarea` (TR/EN/AR tabs), optimistic
      locking (`web/lib/db/versioned.ts` + `runMutation` in `web/lib/actions.ts`), file storage
      (`web/lib/storage`, served by `app/api/files/[...key]`), locale-aware `DecimalInput`;
    - permissions: `settings` (admin) and `catalog` resources; price fields need `prices.update`
      (admin), export sees prices read-only;
    - admin: **company settings** (incl. logo and **order code**), **bank accounts** (IBAN
      checksum, one active account per currency), **exchange rates** (daily entry; export can
      view; "no rate today" banner);
    - **catalog**: models (photo, piece prices, CBM/weight/packages, presets with live suggested
      price), fabrics.
  - [x] **2.2** — browser tests + customers:
    - **tests in the repo**: Playwright e2e in `web/e2e/` against a separate `pekiyi_test`
      database and an own server on port 3100; `pnpm test` / `pnpm test:e2e` / `pnpm check`;
      phone-width sidebar hydration fix;
    - permissions: `customers` — admin and export maintain, only admin deletes (and only
      customers without orders); production none;
    - **customers**: list (Turkish-aware search, country/active filters, pagination, order
      counts), create/edit (E.164 phones, WhatsApp, tax-number list, document/pricing defaults,
      label branding + logo + default template), duplicate warning before creating, optimistic
      locking + audit, deactivate/delete; customer page with Info / Orders (placeholder) /
      **Product codes** (EAN-13 checked live and on the server, one code per product variant).
- [x] **Phase 3 — Orders** — editable grid, custom columns, realtime updates,
  history/audit trail.
  - [x] **3.1** — orders: create, header, items grid, totals:
    - housekeeping: `db:seed:check` runs against the test database; e2e for customer logo upload;
    - permissions: `orders` — admin and export full access, production none (it will see orders only
      through the production sheet); order prices (line/piece price, discount, advance) follow the
      prices rule: only `prices.update` (admin) writes them, export sees them read-only;
    - **list** (`/orders`): number + REV, customer with flag, date, status, sets / pieces, CBM, total;
      status / customer / date-range filters, search by number or customer, pagination;
    - **new order**: pick a customer → defaults from the customer (currency, secondary currency +
      latest rate, incoterm, label settings) and company (delivery time, payment terms); numbered on
      first save inside the transaction under a per-day advisory lock (tested with concurrent creates);
      **duplicate order** (new number, revision 0, status offer, same header + lines);
    - **order page**: header form (incl. advance, translated notes, sample approval, document options,
      label overrides) and a spreadsheet-like **items grid** (TanStack Table): model / set / fabrics
      editors, auto unit, suggested price, piece rows with model/fabric override and piece prices,
      keyboard navigation (RTL-aware), Excel paste (unknowns kept in red), "matrix" bulk add,
      line photos and notes, live totals + piece summary;
    - **saving**: header + lines + pieces + fabrics in one transaction with one version (optimistic
      locking), dirty indicator + leave warning, 20 s version check with a "<name> changed this order"
      banner, one audit entry per save with a readable diff.
  - [x] **3.2** — pricing permissions, safer saving, custom columns, revisions & issuing, status,
    history:
    - permissions: new `orderPrices.update` (admin + export) for sale prices on orders (line/piece
      price, discount, advance); catalog prices, presets, rates, bank and company settings stay
      `prices.update` / `settings` (admin); production still never receives prices;
      `orders.revertStatus` (admin) for stepping a status back;
    - **saving by diff**: lines, pieces and fabrics are UPDATEd / INSERTed / DELETEd by id in the
      save transaction (`syncOrderLines`), so unchanged rows keep their identity, timestamps and
      version — ready for Phase 7 loading ticks on `order_item_pieces`;
    - **orphan uploads**: `pnpm files:cleanup` (dry run, `--apply`); image removals skip files an
      issued document still mentions;
    - **custom columns**: "Columns" menu (add / edit / remove with confirmation / reorder; TR/EN/AR
      label, text or number, shown on proforma / production / loading), editable grid columns
      saved in `order_items.custom_values`; **column templates** (`column_templates`): save the
      current set for all customers or for this customer (optionally as its default, applied to
      its new orders), apply, delete;
    - **status**: own action and menu — forward one step, cancel before shipped, admin back one step
      (a cancelled order back to the status it was cancelled from) with a required reason; optional
      note; audited;
    - **issuing** (data side; PDF in Phase 4): "Issue proforma" freezes a snapshot (company, bank
      account for the currency, customer, header, lines, pieces, fabrics, notes, totals, document
      options, language) into `document_issues`; first issue = REV0 (base number), later issues
      after changes = next revision and the order number becomes base + `-REV{N}`; refused when
      nothing changed; offer → proforma; "Last issued" line and "changed since last issue" badge;
      issued rows are immutable (DB trigger);
    - **History** tab: audit entries + issues as one timeline, newest first, readable diffs, filter
      by order details / lines / status / issues.
- [ ] **Phase 4 — Proforma** *(in progress)* — numbering, versions, PDF/Excel export in all 3 languages.
  - [ ] **4.1** — the proforma document, PDF and Excel:
    - fix from 3.2: **language is not a revision** — issuing the same content in another language is
      refused like any unchanged issue; the snapshot carries every translatable value in tr/en/ar
      (model / piece type / fabric colour names, every active bank account — snapshot version 2),
      so any issued revision renders in any language; version-1 snapshots render with what they
      have (texts fall back en → tr, missing names from the current catalog);
    - **one view model** (`web/lib/documents/proforma/view-model.ts`) built from a snapshot — issued,
      or the draft built the same way from the live order — feeds the PDF template and the Excel
      writer;
    - **PDF**: HTML/CSS template printed by headless Chromium (playwright-core; `CHROMIUM_PATH` or
      the installed Chrome), one shared browser, 2 pages at a time, 30 s per document; bundled
      Noto Sans + IBM Plex Sans Arabic embedded as data URIs; A4 portrait, our bordered layout,
      table header repeated on every page, lines never split, "1 / 2" footer with the brand
      contact; Arabic fully RTL with Latin digits; "en + ar" bilingual labels;
    - **Excel** (exceljs): sheet "PROFORMA", same blocks, real formulas with cached results (line
      total, SUM, advance %, balance, secondary currency from the rate cell, CBM), A4 fit to width,
      repeating header row, nothing locked, right-to-left in Arabic, photos embedded;
    - columns per document options (piece prices per piece type, custom "proforma" columns,
      discount when used, secondary currency, CBM, photo); the invoice date is the revision's issue
      date (today on a draft), not the order date; new option: bank details of the order
      currency only (default: every active account);
    - **order page**: "Preview" ▾ language (draft PDF, DRAFT watermark, not stored); on each issue
      in History: language picker + "Download PDF" / "Download Excel"; files rendered on first
      download per (issue, language, format), stored under `UPLOAD_DIR/documents` and reused;
      names `PROFORMA_<number>_<CUSTOMER>_<lang>.pdf|xlsx`; admin + export only, production 403;
    - photos in documents use a medium-size (600 px) JPEG variant from the storage helper,
      generated on first use; `document_issues.pdf_path/xlsx_path` dropped, issues refuse every
      update.
  - [ ] **4.2** — price offer / price list documents.
- [ ] **Phase 5 — Pilot deployment** — deploy to a VPS for real use by the export team.
- [ ] **Phase 6 — Production sheet** — manufacturing sheet generation and export.
- [ ] **Phase 7 — Loading control** — loading control sheets, photos, container calculator.
- [ ] **Phase 8 — Labels** — barcode/QR print labels.
- [ ] **Phase 9 — Customer file, payments, order status, dashboard**.
- [ ] **Phase 10 — Commercial invoice & packing list**.
- [ ] **Phase 11 — Leads CRM**.
