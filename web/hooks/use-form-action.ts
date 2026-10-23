"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";

import { initialFormState, type FormState } from "@/lib/form-state";

type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * `useActionState` for our form server actions, submitted via onSubmit so
 * React doesn't reset the inputs when the server returns validation errors.
 * `onSuccess` runs once per successful submit (e.g. to close a dialog).
 */
export function useFormAction(action: FormAction, onSuccess?: () => void) {
  const [state, dispatch, pending] = useActionState(action, initialFormState);

  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });
  useEffect(() => {
    if (state.successAt) onSuccessRef.current?.();
  }, [state.successAt]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return { state, pending, onSubmit };
}
