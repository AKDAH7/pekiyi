# Roadmap

- [~] **Phase 0 — Foundation** — repo, Docker (Postgres), Next.js app shell, i18n (tr/ar/en) with
  RTL, authentication (Drizzle + Better Auth), navigation skeleton. *(in progress)*
- [ ] **Phase 1 — Data model + users management + audit log** — Drizzle schema for every module,
  relations, committed migrations; users management page (admin creates/edits users, sets role,
  resets password); `audit_log` table and shared write helper wired into mutating actions.
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
