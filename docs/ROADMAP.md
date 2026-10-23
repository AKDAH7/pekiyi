# Roadmap

- [x] **Phase 0 — Foundation** — repo, Docker (Postgres), Next.js app shell, i18n (tr/ar/en) with
  RTL, authentication (Drizzle + Better Auth), navigation skeleton.
- [~] **Phase 1 — Data model + users management + audit log** *(in progress)*
  - [x] **1.1** — roles & permissions (Better Auth access control, `web/lib/auth/permissions.ts`),
    users management, my profile, `audit_log` table + `logAudit` helper, audit log page.
  - [ ] **1.2** — business data model (company settings, bank accounts, exchange rates, catalog,
    fabrics, customers, orders, payments, document issues, label templates), insert-only seed +
    dev fixtures (`SEED_FIXTURES=true`), pure domain functions in `web/lib/domain/`
    (composition, price suggestion, totals, piece/label counts, order numbers, EAN-13),
    price-free production queries. See [DOMAIN.md](DOMAIN.md).
- [ ] **Phase 2 — Customers & catalog** — CRUD UIs for:
  - customers (incl. label branding, default label template, customer product codes/barcodes);
  - admin: **company settings** (incl. order number pattern, revision suffix and **order code**),
    **bank accounts**, **exchange rates** (daily manual entry);
  - admin: **catalog** — models, piece prices (incl. CBM, package count/contents), presets,
    fabrics.
  - These pages are where users fix the source-data problems listed in DOMAIN.md; the seed never
    overwrites their edits.
- [ ] **Phase 3 — Orders** — editable grid, custom columns, realtime updates, history/audit trail.
- [ ] **Phase 4 — Proforma** — numbering, versions, PDF/Excel export in all 3 languages.
- [ ] **Phase 5 — Pilot deployment** — deploy to a VPS for real use by the export team.
- [ ] **Phase 6 — Production sheet** — manufacturing sheet generation and export.
- [ ] **Phase 7 — Loading control** — loading control sheets, photos, container calculator.
- [ ] **Phase 8 — Labels** — barcode/QR print labels.
- [ ] **Phase 9 — Customer file, payments, order status, dashboard**.
- [ ] **Phase 10 — Commercial invoice & packing list**.
- [ ] **Phase 11 — Leads CRM**.
