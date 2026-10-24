import { cn } from "@/lib/utils";

/** A country's flag (decorative: the name is always shown next to it). */
export function Flag({ code, className }: { code: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG from /api/flags
    <img
      src={`/api/flags/${code}`}
      alt=""
      width={20}
      height={14}
      loading="lazy"
      className={cn("inline-block h-3.5 w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-foreground/10", className)}
    />
  );
}

/** Flag + country name in the UI language. */
export function CountryLabel({ code, name }: { code: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Flag code={code} />
      <span>{name}</span>
    </span>
  );
}
