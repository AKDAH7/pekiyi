"use client";

import { useState, type FormEvent } from "react";

import type { FormState } from "@/lib/form-state";

import { useFormAction } from "./use-form-action";

type FormAction<S extends FormState> = (prev: S, formData: FormData) => Promise<S>;

/**
 * `useFormAction` for edit forms with optimistic locking. `version` is the
 * record version the form shows (a string joining several row versions
 * when one form saves several rows). `conflict` is true while the last submit
 * was refused because someone else saved first *and* the page still shows
 * that same version, i.e. until the user reloads. The form keeps its input
 * meanwhile; key the fields by `version` so a reload refills them.
 */
export function useVersionedForm<S extends FormState = FormState>(
  action: FormAction<S>,
  version: number | string,
  onSuccess?: () => void,
) {
  const { state, pending, onSubmit } = useFormAction(action, onSuccess);
  const [submittedVersion, setSubmittedVersion] = useState(version);

  function submit(event: FormEvent<HTMLFormElement>) {
    setSubmittedVersion(version);
    onSubmit(event);
  }

  return {
    state,
    pending,
    onSubmit: submit,
    conflict: state.conflict === true && submittedVersion === version,
  };
}
