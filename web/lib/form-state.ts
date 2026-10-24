/**
 * Result of a form server action. Messages are already translated into the
 * current user's language.
 */
export type FormState = {
  status: "idle" | "success" | "error";
  fieldErrors?: Record<string, string>;
  formError?: string;
  /** Bumped on every successful submit so clients can react (close dialogs). */
  successAt?: number;
  /**
   * The record was saved by someone else since this form loaded it
   * (optimistic locking). `formError` holds the message; the form keeps the
   * user's input and offers a reload.
   */
  conflict?: boolean;
};

export const initialFormState: FormState = { status: "idle" };

