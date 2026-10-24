-- Rendered proforma files are stored per (issue, language, format) under a
-- key derived from the issue (lib/storage documentKey), not in the row: the
-- pdf_path / xlsx_path placeholders go, and with them the last columns an
-- update could touch. Issued documents are now refused every update.
ALTER TABLE "document_issues" DROP COLUMN "pdf_path";--> statement-breakpoint
ALTER TABLE "document_issues" DROP COLUMN "xlsx_path";--> statement-breakpoint
CREATE OR REPLACE FUNCTION document_issues_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'document_issues rows are immutable (delete of %)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RAISE EXCEPTION 'document_issues rows are immutable (update of %)', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$;
