import "server-only";

import { refresh } from "next/cache";

import { db, type Tx } from "@/db";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/db/errors";
import { VersionConflictError } from "@/lib/db/versioned";
import { conflict, fieldError, formError, success, type FormState } from "@/lib/forms";

/** Outcomes a mutation can end with besides success. */
export type Failure =
  | { kind: "field"; field: string; key: string }
  | { kind: "form"; key: string };

class FailureSignal extends Error {
  constructor(readonly failure: Failure) {
    super(failure.key);
  }
}

/** Ends the running mutation with a translated error and rolls back its transaction. */
export function fail(failure: Failure): never {
  throw new FailureSignal(failure);
}

type MutationOptions = {
  /** Unique-constraint name → error shown when an insert/update hits it. */
  unique?: Record<string, Failure>;
  /** Error shown when a delete is blocked by rows still referencing the record. */
  inUse?: Failure;
  /**
   * Re-render the page after success (default). Off for editors that keep
   * their own state and only need the action's result.
   */
  refresh?: boolean;
};

async function toFormState(failure: Failure): Promise<FormState> {
  return failure.kind === "field" ? fieldError(failure.field, failure.key) : formError(failure.key);
}

/**
 * The write half of every catalog/settings server action, after zod parsing
 * and the permission check: runs `work` in one transaction (which also writes
 * the audit log via `logAudit(tx, …)`), then refreshes the page.
 *
 * - `fail(...)` inside `work` rolls back and returns that error;
 * - a `VersionConflictError` (optimistic locking) rolls back and returns the
 *   "changed by someone else" state;
 * - known unique / foreign-key violations become field or form errors.
 */
export async function runMutation(
  work: (tx: Tx) => Promise<void>,
  options: MutationOptions = {},
): Promise<FormState> {
  try {
    await db.transaction(work);
  } catch (error) {
    if (error instanceof FailureSignal) return toFormState(error.failure);
    if (error instanceof VersionConflictError) return conflict();
    for (const [constraint, failure] of Object.entries(options.unique ?? {})) {
      if (isUniqueViolation(error, constraint)) return toFormState(failure);
    }
    // A unique clash we didn't map is most likely a concurrent insert of the
    // same row (e.g. two tabs adding the same piece row): a conflict too.
    if (isUniqueViolation(error)) return conflict();
    if (options.inUse && isForeignKeyViolation(error)) return toFormState(options.inUse);
    throw error;
  }
  if (options.refresh !== false) refresh();
  return success();
}
