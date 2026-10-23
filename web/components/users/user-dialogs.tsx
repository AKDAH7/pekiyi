"use client";

import { useState } from "react";
import { KeyRound, MoreHorizontal, Pencil, Plus, UserCheck, UserX, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  createUserAction,
  resetPasswordAction,
  setUserActiveAction,
  updateUserAction,
} from "@/actions/users";
import { useFormAction } from "@/hooks/use-form-action";
import { generatePassword } from "@/lib/password";
import type { UserListItem } from "@/lib/users/queries";
import { FormField, FormMessage, fieldAria } from "@/components/form-field";
import { LocaleSelect, RoleSelect } from "@/components/option-select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

function PasswordInput({ id, error }: { id: string; error?: string }) {
  const t = useTranslations("users");
  const [value, setValue] = useState("");

  return (
    <div className="flex gap-2">
      <Input
        {...fieldAria(id, error)}
        name="password"
        type="text"
        autoComplete="new-password"
        spellCheck={false}
        className="font-mono"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button type="button" variant="outline" onClick={() => setValue(generatePassword())}>
        <Wand2 />
        {t("generate")}
      </Button>
    </div>
  );
}

function FormFooter({ pending, submitLabel }: { pending: boolean; submitLabel: string }) {
  const common = useTranslations("common");
  return (
    <DialogFooter>
      <DialogClose render={<Button type="button" variant="outline" />}>{common("cancel")}</DialogClose>
      <Button type="submit" disabled={pending}>
        {pending ? common("saving") : submitLabel}
      </Button>
    </DialogFooter>
  );
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("users");
  const { state, pending, onSubmit } = useFormAction(createUserAction, onDone);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormField id="create-name" label={t("fields.name")} error={errors.name}>
        <Input {...fieldAria("create-name", errors.name)} name="name" autoComplete="off" />
      </FormField>
      <FormField id="create-email" label={t("fields.email")} error={errors.email}>
        <Input
          {...fieldAria("create-email", errors.email)}
          name="email"
          type="email"
          dir="ltr"
          autoComplete="off"
        />
      </FormField>
      <FormField id="create-role" label={t("fields.role")} error={errors.role}>
        <RoleSelect id="create-role" name="role" defaultValue="export" invalid={!!errors.role} />
      </FormField>
      <FormField id="create-locale" label={t("fields.language")} error={errors.preferredLocale}>
        <LocaleSelect
          id="create-locale"
          name="preferredLocale"
          defaultValue="tr"
          invalid={!!errors.preferredLocale}
        />
      </FormField>
      <FormField
        id="create-password"
        label={t("fields.initialPassword")}
        error={errors.password}
        hint={t("passwordHint")}
      >
        <PasswordInput id="create-password" error={errors.password} />
      </FormField>
      <FormMessage error={state.formError} />
      <FormFooter pending={pending} submitLabel={t("createSubmit")} />
    </form>
  );
}

export function CreateUserButton() {
  const t = useTranslations("users");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t("newUser")}
      </Button>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
        <CreateUserForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditUserForm({
  user,
  isSelf,
  onDone,
}: {
  user: UserListItem;
  isSelf: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("users");
  const common = useTranslations("common");
  const { state, pending, onSubmit } = useFormAction(updateUserAction, onDone);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="userId" value={user.id} />
      <FormField id="edit-name" label={t("fields.name")} error={errors.name}>
        <Input {...fieldAria("edit-name", errors.name)} name="name" defaultValue={user.name} />
      </FormField>
      <FormField id="edit-email" label={t("fields.email")} error={errors.email}>
        <Input
          {...fieldAria("edit-email", errors.email)}
          name="email"
          type="email"
          dir="ltr"
          defaultValue={user.email}
        />
      </FormField>
      <FormField
        id="edit-role"
        label={t("fields.role")}
        error={errors.role}
        hint={isSelf ? t("selfRoleHint") : undefined}
      >
        <RoleSelect
          id="edit-role"
          name="role"
          defaultValue={user.role}
          disabled={isSelf}
          invalid={!!errors.role}
        />
      </FormField>
      <FormField id="edit-locale" label={t("fields.language")} error={errors.preferredLocale}>
        <LocaleSelect
          id="edit-locale"
          name="preferredLocale"
          defaultValue={user.preferredLocale}
          invalid={!!errors.preferredLocale}
        />
      </FormField>
      <FormMessage error={state.formError} />
      <FormFooter pending={pending} submitLabel={common("save")} />
    </form>
  );
}

function ResetPasswordForm({ user, onDone }: { user: UserListItem; onDone: () => void }) {
  const t = useTranslations("users");
  const { state, pending, onSubmit } = useFormAction(resetPasswordAction, onDone);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="userId" value={user.id} />
      <FormField
        id="reset-password"
        label={t("fields.newPassword")}
        error={errors.password}
        hint={t("passwordHint")}
      >
        <PasswordInput id="reset-password" error={errors.password} />
      </FormField>
      <FormMessage error={state.formError} />
      <FormFooter pending={pending} submitLabel={t("resetSubmit")} />
    </form>
  );
}

function SetActiveForm({ user, onDone }: { user: UserListItem; onDone: () => void }) {
  const t = useTranslations("users");
  const common = useTranslations("common");
  const { state, pending, onSubmit } = useFormAction(setUserActiveAction, onDone);
  const activating = !user.active;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="active" value={String(activating)} />
      <FormMessage error={state.formError} />
      <AlertDialogFooter>
        <AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
        <Button type="submit" variant={activating ? "default" : "destructive"} disabled={pending}>
          {pending ? common("saving") : t(activating ? "reactivate" : "deactivate")}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

type OpenDialog = "edit" | "reset" | "active" | null;

export function UserRowActions({ user, isSelf }: { user: UserListItem; isSelf: boolean }) {
  const t = useTranslations("users");
  const [open, setOpen] = useState<OpenDialog>(null);
  const close = () => setOpen(null);
  const onOpenChange = (next: boolean) => {
    if (!next) close();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label={t("actionsMenu", { name: user.name })}>
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpen("edit")}>
            <Pencil />
            {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("reset")}>
            <KeyRound />
            {t("resetPassword")}
          </DropdownMenuItem>
          {/* Deactivating yourself is refused on the server too. */}
          {isSelf ? null : (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant={user.active ? "destructive" : "default"}
                onClick={() => setOpen("active")}
              >
                {user.active ? <UserX /> : <UserCheck />}
                {t(user.active ? "deactivate" : "reactivate")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === "edit"} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>
          <EditUserForm user={user} isSelf={isSelf} onDone={close} />
        </DialogContent>
      </Dialog>

      <Dialog open={open === "reset"} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("resetTitle")}</DialogTitle>
            <DialogDescription>{t("resetDescription", { name: user.name })}</DialogDescription>
          </DialogHeader>
          <ResetPasswordForm user={user} onDone={close} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={open === "active"} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(user.active ? "deactivateTitle" : "reactivateTitle", { name: user.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(user.active ? "deactivateDescription" : "reactivateDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <SetActiveForm user={user} onDone={close} />
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
