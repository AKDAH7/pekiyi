"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/** Same limits as lib/storage (checked again on the server). */
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

type Props = {
  id: string;
  name: string;
  /** Checkbox name submitted to remove the current image. */
  removeName: string;
  label: string;
  /** Thumbnail URL of the current image, if there is one. */
  currentUrl: string | null;
  error?: string;
};

/** File picker with a preview of the current or newly chosen image. */
export function ImageInput({ id, name, removeName, label, currentUrl, error }: Props) {
  const t = useTranslations("upload");
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setLocalError(null);
    setPreview(null);
    setFileName(file?.name ?? null);
    if (!file) return;
    if (file.size > MAX_BYTES || !ACCEPT.includes(file.type)) {
      setLocalError(t(file.size > MAX_BYTES ? "tooLarge" : "wrongType"));
      event.target.value = "";
      setFileName(null);
      return;
    }
    setPreview(URL.createObjectURL(file));
    setRemove(false);
  }

  const shown = preview ?? (remove ? null : currentUrl);
  const message = localError ?? error;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm leading-none font-medium">{label}</span>
      <div className="flex flex-wrap items-start gap-4">
        <div
          className={cn(
            "flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted",
            message && "border-destructive",
          )}
        >
          {shown ? (
            <Image
              src={shown}
              alt={label}
              width={96}
              height={96}
              unoptimized
              className="size-full object-cover"
            />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* The native picker shows its text in the browser's language, so it is
              visually hidden behind a translated button. */}
          <div className="flex min-w-0 items-center gap-2">
            <input
              id={id}
              name={name}
              type="file"
              accept={ACCEPT.join(",")}
              onChange={onChange}
              className="peer sr-only"
              aria-label={label}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? `${id}-error` : `${id}-hint`}
            />
            <label
              htmlFor={id}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
              )}
            >
              {t(currentUrl || preview ? "replace" : "choose")}
            </label>
            <span className="truncate text-sm text-muted-foreground">{fileName ?? t("noFile")}</span>
          </div>
          {currentUrl && !preview ? (
            <Label className="font-normal">
              <Checkbox
                name={removeName}
                checked={remove}
                onCheckedChange={(value) => setRemove(value === true)}
              />
              {t("remove")}
            </Label>
          ) : null}
          {message ? (
            <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
              {message}
            </p>
          ) : (
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              {t("hint")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
