"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

/** Copies `value` to the clipboard; the icon turns into a check for a moment. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations("customers");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t("copyLabel", { field: label })}
        title={t("copyLabel", { field: label })}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        }}
      >
        {copied ? <Check className="text-emerald-600" /> : <Copy />}
      </Button>
      <span role="status" className="sr-only">
        {copied ? t("copied") : ""}
      </span>
    </>
  );
}

/** A value shown as text with a copy button; `ltr` keeps numbers/emails readable in Arabic. */
export function CopyableValue({
  value,
  display,
  label,
  href,
  ltr = true,
}: {
  value: string;
  display?: string;
  label: string;
  href?: string;
  ltr?: boolean;
}) {
  const text = display ?? value;
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      {href ? (
        <a href={href} dir={ltr ? "ltr" : undefined} className="truncate underline-offset-4 hover:underline">
          {text}
        </a>
      ) : (
        <span dir={ltr ? "ltr" : undefined} className="truncate">
          {text}
        </span>
      )}
      <CopyButton value={value} label={label} />
    </span>
  );
}

/** Opens a WhatsApp chat (wa.me) in a new tab. */
export function WhatsAppButton({ url, compact }: { url: string; compact?: boolean }) {
  const t = useTranslations("customers");
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("whatsappLabel")}
      title={t("whatsappLabel")}
      className={cn(
        buttonVariants({ variant: "outline", size: compact ? "icon-sm" : "sm" }),
        "text-emerald-700 dark:text-emerald-400",
      )}
    >
      <MessageCircle />
      {compact ? null : t("whatsapp")}
    </a>
  );
}
