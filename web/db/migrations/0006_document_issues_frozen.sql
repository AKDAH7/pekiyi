-- Issued documents are immutable (DOMAIN.md "Documents"): the snapshot and
-- everything that identifies the issue can never change, and issues are
-- never deleted. Only the rendered-file paths (pdf_path / xlsx_path) may be
-- filled in later, when Phase 4 renders the files.
CREATE FUNCTION document_issues_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'document_issues rows are immutable (delete of %)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.order_id, NEW.doc_type, NEW.number, NEW.revision, NEW.language, NEW.snapshot,
      NEW.content_hash, NEW.issued_by, NEW.issued_at)
     IS DISTINCT FROM
     (OLD.id, OLD.order_id, OLD.doc_type, OLD.number, OLD.revision, OLD.language, OLD.snapshot,
      OLD.content_hash, OLD.issued_by, OLD.issued_at) THEN
    RAISE EXCEPTION 'document_issues rows are immutable (update of %)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER document_issues_frozen
  BEFORE UPDATE OR DELETE ON document_issues
  FOR EACH ROW EXECUTE FUNCTION document_issues_frozen();
