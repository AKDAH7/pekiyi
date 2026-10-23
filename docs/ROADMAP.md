# Roadmap

- [x] **Phase 0 — Foundation** — repo, Docker (Postgres), Next.js app shell, i18n (tr/ar/en) with
  RTL, authentication (Drizzle + Better Auth), navigation skeleton.
- [~] **Phase 1 — Data model + users management + audit log** *(in progress)*
  - [x] **1.1** — roles & permissions (Better Auth access control, `web/lib/auth/permissions.ts`),
    users management, my profile, `audit_log` table + `logAudit` helper, audit log page.
  - [ ] **1.2** — Drizzle schema for the business modules (customers, products, orders, …),
    relations, committed migrations.
- [ ] **Phase 2 — Customers & catalog** — customers and product catalog CRUD UIs.
- [ ] **Phase 3 — Orders** — editable grid, custom columns, realtime updates, history/audit trail.
- [ ] **Phase 4 — Proforma** — numbering, versions, PDF/Excel export in all 3 languages.
- [ ] **Phase 5 — Pilot deployment** — deploy to a VPS for real use by the export team.
- [ ] **Phase 6 — Production sheet** — manufacturing sheet generation and export.
- [ ] **Phase 7 — Loading control** — loading control sheets, photos, container calculator.
- [ ] **Phase 8 — Labels** — barcode/QR print labels.
- [ ] **Phase 9 — Customer file, payments, order status, dashboard**.
- [ ] **Phase 10 — Commercial invoice & packing list**.
- [ ] **Phase 11 — Leads CRM**.
