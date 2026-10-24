"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ImageIcon,
  Loader2,
  MoreHorizontal,
  NotebookPen,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { uploadOrderPhotoAction } from "@/actions/orders";
import type { LocalizedText } from "@/db/schema/common";
import { compactText } from "@/lib/orders/editor";
import { fileUrl } from "@/lib/storage/urls";
import { cn } from "@/lib/utils";
import { TranslatedTextarea } from "@/components/translated-input";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

/** Thumbnail of the line: its own photo, else the model's. Click to upload / remove the line's own. */
export function PhotoCell({
  line,
  photoPath,
  modelPhotoUrl,
  editable,
  onChange,
}: {
  line: number;
  photoPath: string | null;
  modelPhotoUrl: string | null;
  editable: boolean;
  onChange: (photoPath: string | null) => void;
}) {
  const t = useTranslations("orders.grid.photo");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const src = photoPath ? fileUrl(photoPath, { thumb: true }) : modelPhotoUrl;
  const inputId = `line-photo-${line}`;

  const thumb = (
    <span className="flex size-9 items-center justify-center overflow-hidden rounded border bg-muted">
      {src ? (
        <Image src={src} alt="" width={36} height={36} unoptimized className="size-full object-cover" />
      ) : (
        <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
  if (!editable) return thumb;

  function upload(file: File) {
    setError(null);
    const formData = new FormData();
    formData.set("photo", file);
    startTransition(async () => {
      const result = await uploadOrderPhotoAction(formData);
      if ("key" in result) onChange(result.key);
      else setError(result.error);
    });
  }

  return (
    <Popover>
      <PopoverTrigger
        tabIndex={-1}
        aria-label={t("title", { line })}
        className={cn("rounded focus-visible:ring-3 focus-visible:ring-ring/50", photoPath && "ring-2 ring-primary/60")}
      >
        {thumb}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <PopoverHeader>
          <PopoverTitle>{t("title", { line })}</PopoverTitle>
          <PopoverDescription>{photoPath ? t("own") : modelPhotoUrl ? t("usingModel") : t("none")}</PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="peer sr-only"
            aria-label={t("upload")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload(file);
            }}
          />
          <label htmlFor={inputId} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}
            {t("upload")}
          </label>
          {photoPath ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <Trash2 />
              {t("remove")}
            </Button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** Customer note (proforma) + production note (production sheet) of one line. */
export function NotesCell({
  line,
  lineId,
  customerNote,
  productionNote,
  editable,
  onChange,
}: {
  line: number;
  lineId: string;
  customerNote: LocalizedText | null;
  productionNote: LocalizedText | null;
  editable: boolean;
  onChange: (notes: { customerNote?: LocalizedText | null; productionNote?: LocalizedText | null }) => void;
}) {
  const t = useTranslations("orders.grid");
  const has = Boolean(customerNote || productionNote);
  return (
    <Popover>
      <PopoverTrigger
        tabIndex={-1}
        aria-label={t("notesFor", { line })}
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          has ? "text-primary" : "text-muted-foreground",
        )}
      >
        <NotebookPen />
        {has ? <span className="sr-only">{t("hasNotes")}</span> : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 sm:w-96">
        <PopoverHeader>
          <PopoverTitle>{t("notesFor", { line })}</PopoverTitle>
        </PopoverHeader>
        <TranslatedTextarea
          id={`note-customer-${lineId}`}
          name={`note-customer-${lineId}`}
          label={t("customerNote")}
          hint={t("customerNoteHint")}
          defaultValue={customerNote}
          disabled={!editable}
          maxLength={2000}
          onValueChange={(value) => onChange({ customerNote: compactText(value) })}
        />
        <TranslatedTextarea
          id={`note-production-${lineId}`}
          name={`note-production-${lineId}`}
          label={t("productionNote")}
          hint={t("productionNoteHint")}
          defaultValue={productionNote}
          disabled={!editable}
          maxLength={2000}
          onValueChange={(value) => onChange({ productionNote: compactText(value) })}
        />
      </PopoverContent>
    </Popover>
  );
}

export function RowActions({
  line,
  first,
  last,
  onDuplicate,
  onMove,
  onDelete,
}: {
  line: number;
  first: boolean;
  last: boolean;
  onDuplicate: () => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("orders.grid");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        tabIndex={-1}
        aria-label={t("actionsFor", { line })}
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy />
          {t("duplicate")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={first} onClick={() => onMove(-1)}>
          <ArrowUp />
          {t("moveUp")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={last} onClick={() => onMove(1)}>
          <ArrowDown />
          {t("moveDown")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
