"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";

import { initialFormState, type FormState } from "@/lib/form-state";

type FormAction<S extends FormState> = (prev: S, formData: FormData) => Promise<S>;

/**
 * `useActionState` for our form server actions, submitted via onSubmit so
 * React doesn't reset the inputs when the server returns validation errors.
 * `onSuccess` runs once per successful submit (e.g. to close a dialog). The
 * clicked submit button's name/value is sent along, like a native submit.
 */
export function useFormAction<S extends FormState = FormState>(action: FormAction<S>, onSuccess?: () => void) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initialFormState as Awaited<S>);

  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });
  useEffect(() => {
    if (state.successAt) onSuccessRef.current?.();
  }, [state.successAt]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  }

  return { state, pending, onSubmit };
}
