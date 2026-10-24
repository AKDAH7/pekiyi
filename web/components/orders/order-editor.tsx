"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleDot, Loader2, RefreshCw, Save, TriangleAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { createOrderAction, saveOrderAction, type OrderSaveState } from "@/actions/orders";
import type { CustomColumn } from "@/db/schema/orders";
import { computePieceCounts } from "@/lib/domain/piece-counts";
import { pieceTypeTotals } from "@/lib/domain/order-lines";
import { suggestUnitPrice } from "@/lib/domain/pricing";
import { computeOrderTotals } from "@/lib/domain/totals";
import { findCatalogPiece, type RatesToTry } from "@/lib/domain/types";
import { VERSION_POLL_MS } from "@/lib/orders/constants";
import { pruneCustomValues } from "@/lib/orders/custom-columns";
import {
  catalogUnitCbm,
  editorCatalog,
  lineToDomain,
  piecePriceTotal,
  toDomain,
  toPayload,
  type EditorHeader,
  type EditorLine,
  type EditorOptions,
  type EditorState,
} from "@/lib/orders/editor";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { CustomColumnsMenu, type TemplateOption } from "./custom-columns-menu";
import { OrderEditorContext } from "./editor-context";
import { ItemsGrid, type LineFigures } from "./items-grid";
import { OrderHeaderForm } from "./order-header";
import { OrderTotals } from "./order-totals";

type Props = {
  /** Null while the order is new (numbered on first save). */
  order: { id: string; version: number } | null;
  initial: EditorState;
  options: EditorOptions;
  /** Latest rates to TRY, for suggested prices and the secondary rate. */
  rates: RatesToTry;
  permissions: { editable: boolean; canWritePrices: boolean; canSeePrices: boolean };
  /** Heading area (number, status, actions) rendered by the page, with the save bar next to it. */
  title: React.ReactNode;
  actions?: React.ReactNode;
  /** Column templates offered in the "Columns" menu (this customer's and the global ones). */
  columnTemplates: readonly TemplateOption[];
};

type RemoteChange = { version: number; by: string | null; at: string };

/** Splits "header.x" / "items.3.pieces.0.qtyPerUnit" save errors per header field and per line id. */
function splitErrors(fieldErrors: Record<string, string>, lines: readonly EditorLine[]) {
  const header: Record<string, string> = {};
  const byLine: Record<string, Record<string, string>> = {};
  const general: string[] = [];
  for (const [path, message] of Object.entries(fieldErrors)) {
    const [root, index, ...rest] = path.split(".");
    if (root === "header" && index) header[[index, ...rest].join(".")] = message;
    else if (root === "items" && index !== undefined && lines[Number(index)]) {
      const id = lines[Number(index)].id;
      byLine[id] = { ...byLine[id], [rest.join(".") || "line"]: message };
    } else general.push(message);
  }
  return { header, byLine, general };
}

export function OrderEditor({ order, initial, options, rates, permissions, title, actions, columnTemplates }: Props) {
  const t = useTranslations("orders.editor");
  const grid = useTranslations("orders.grid");
  const format = useFormatter();
  const router = useRouter();
  const { editable, canWritePrices, canSeePrices } = permissions;

  const [state, setState] = useState(initial);
  const [version, setVersion] = useState(order?.version ?? 0);
  const [baseline, setBaseline] = useState(() => JSON.stringify(toPayload(initial, true)));
  const [result, setResult] = useState<(OrderSaveState & { lines?: EditorLine[] }) | null>(null);
  const [remote, setRemote] = useState<RemoteChange | null>(null);
  const [saving, startSaving] = useTransition();
  const skipGuard = useRef(false);

  const snapshot = useMemo(() => JSON.stringify(toPayload(state, true)), [state]);
  const dirty = snapshot !== baseline;

  const ref = useMemo(() => editorCatalog(options), [options]);
  const domain = useMemo(() => toDomain(state, ref), [state, ref]);
  const totals = useMemo(() => computeOrderTotals(domain, ref.catalog), [domain, ref]);
  const counts = useMemo(() => computePieceCounts(domain), [domain]);

  const figures = useMemo(() => {
    const map = new Map<string, LineFigures>();
    let domainIndex = 0;
    for (const line of state.lines) {
      const lineDomain = lineToDomain(line, ref);
      const lineTotals = lineDomain ? totals.lines[domainIndex++] : undefined;
      let suggested: string | null = null;
      let suggestedReason: string | null = null;
      if (lineDomain && lineDomain.pieces.length > 0) {
        suggested = suggestUnitPrice(lineDomain, ref.catalog, rates, state.header.currency);
        if (suggested === null) {
          const unpriced = lineDomain.pieces
            .filter((piece) => {
              const entry = findCatalogPiece(ref.catalog, piece.modelOverride ?? lineDomain.model, piece.pieceType);
              return (!entry || entry.basePrice === null) && !ref.catalog.accessoryPieceTypes.includes(piece.pieceType);
            })
            .map((piece) => {
              const name = options.pieceTypes.find((type) => type.code === piece.pieceType)?.name ?? piece.pieceType;
              return piece.modelOverride ? `${piece.modelOverride} ${name}` : name;
            });
          suggestedReason =
            unpriced.length > 0 ? grid("missingPiecePrice", { pieces: unpriced.join(", ") }) : grid("missingRate");
        }
      } else {
        suggestedReason = grid("noSuggestionYet");
      }
      map.set(line.id, {
        suggested,
        suggestedReason,
        piecePriceSum: piecePriceTotal(line, options.pieceTypes),
        lineTotal: lineTotals?.lineTotal ?? null,
        unitCbm: lineTotals?.unitCbm ?? null,
        catalogCbm: catalogUnitCbm(line, ref),
        lineCbm: lineTotals?.lineCbm ?? null,
      });
    }
    return map;
  }, [state.lines, state.header.currency, ref, totals, rates, options.pieceTypes, grid]);

  const pieceSummary = useMemo(
    () =>
      pieceTypeTotals(
        counts,
        options.pieceTypes.map((type) => type.code),
      ).map(({ pieceType, quantity }) => {
        const type = options.pieceTypes.find((entry) => entry.code === pieceType);
        return { name: type ? (type.isAccessory ? type.name : type.shortName) : pieceType, quantity };
      }),
    [counts, options.pieceTypes],
  );
  const totalPieces = counts.reduce((sum, group) => sum + group.quantity, 0);

  const errors = useMemo(
    () => splitErrors(result?.fieldErrors ?? {}, result?.lines ?? state.lines),
    [result, state.lines],
  );

  const setHeader = useCallback(
    (patch: Partial<EditorHeader>) => setState((current) => ({ ...current, header: { ...current.header, ...patch } })),
    [],
  );
  const setCustomColumns = useCallback(
    (customColumns: CustomColumn[]) =>
      setState((current) => ({
        header: { ...current.header, customColumns },
        // Values of removed columns go with them.
        lines: current.lines.map((line) => ({
          ...line,
          customValues: pruneCustomValues(line.customValues, customColumns),
        })),
      })),
    [],
  );
  const setLines = useCallback(
    (update: (lines: EditorLine[]) => EditorLine[]) => setState((current) => ({ ...current, lines: update(current.lines) })),
    [],
  );

  const save = useCallback(() => {
    if (!editable || saving) return;
    const sent = state;
    const sentSnapshot = snapshot;
    const payload = toPayload(sent, canWritePrices);
    startSaving(async () => {
      const response = order
        ? await saveOrderAction({ ...payload, id: order.id, version })
        : await createOrderAction(payload);
      setResult({ ...response, lines: sent.lines });
      if (response.status === "success" && response.version !== undefined) {
        setVersion(response.version);
        setBaseline(sentSnapshot);
        setRemote(null);
      }
    });
  }, [editable, saving, state, snapshot, canWritePrices, order, version]);

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // Unsaved changes: warn on reload/close and on in-app links.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (skipGuard.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (skipGuard.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      // Buttons that leave the page through a server action (e.g. "Duplicate order").
      const guarded = event.target instanceof Element ? event.target.closest("[data-guard-unsaved]") : null;
      if (guarded) {
        if (!window.confirm(t("leaveWarning"))) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(t("leaveWarning"))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, t]);

  // Someone else saved? Checked every 20 s while the tab is visible, and when it becomes visible.
  useEffect(() => {
    if (!order) return;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/orders/${order.id}/version`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data: unknown = await response.json();
        if (
          data &&
          typeof data === "object" &&
          "version" in data &&
          typeof data.version === "number" &&
          data.version > version
        ) {
          const by = "changedBy" in data && typeof data.changedBy === "string" ? data.changedBy : null;
          const at = "changedAt" in data && typeof data.changedAt === "string" ? data.changedAt : new Date().toISOString();
          setRemote({ version: data.version, by, at });
        }
      } catch {
        // Offline for a moment: try again next time.
      }
    };
    const timer = window.setInterval(check, VERSION_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [order, version]);

  function reload() {
    if (dirty && !window.confirm(t("reloadDiscards"))) return;
    skipGuard.current = true;
    router.refresh();
  }

  const conflict = result?.conflict === true && result.status === "error";
  const lineErrorList = state.lines.flatMap((line, index) =>
    Object.values(errors.byLine[line.id] ?? {}).map((message) => grid("lineError", { line: index + 1, message })),
  );
  const changedAt = remote ? format.dateTime(new Date(remote.at), { timeStyle: "short" }) : "";

  const editorStatus = useMemo(() => ({ version, dirty, saving }), [version, dirty, saving]);

  return (
    <OrderEditorContext.Provider value={editorStatus}>
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {title}
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("saving")}
                </>
              ) : dirty ? (
                <>
                  <CircleDot className="size-4 text-amber-600" />
                  {t("unsaved")}
                </>
              ) : order ? (
                <>
                  <CircleCheck className="size-4 text-emerald-600" />
                  {t("saved")}
                </>
              ) : null}
            </span>
          ) : null}
          {actions}
          {editable ? (
            <Button type="button" onClick={save} disabled={saving || (!dirty && order !== null)}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {order ? t("save") : t("create")}
            </Button>
          ) : null}
        </div>
      </div>

      {remote ? (
        <Alert className="border-amber-500/50 bg-amber-50 pe-28 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert />
          <AlertTitle>{remote.by ? t("remoteChanged", { name: remote.by, time: changedAt }) : t("remoteChangedUnknown", { time: changedAt })}</AlertTitle>
          <AlertDescription className="text-amber-900/90 dark:text-amber-200/90">{t("remoteChangedHint")}</AlertDescription>
          <AlertAction>
            <Button type="button" size="sm" variant="outline" onClick={reload}>
              <RefreshCw />
              {t("reload")}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {conflict ? (
        <Alert variant="destructive" className="pe-28">
          <TriangleAlert />
          <AlertDescription className="text-destructive">{result?.formError}</AlertDescription>
          <AlertAction>
            <Button type="button" size="sm" variant="outline" onClick={reload}>
              <RefreshCw />
              {t("reload")}
            </Button>
          </AlertAction>
        </Alert>
      ) : result?.status === "error" && (result.formError || lineErrorList.length > 0 || errors.general.length > 0 || Object.keys(errors.header).length > 0) ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{result.formError ?? t("fixErrors")}</AlertTitle>
          {lineErrorList.length > 0 || errors.general.length > 0 ? (
            <AlertDescription>
              <ul className="list-disc ps-4">
                {[...errors.general, ...lineErrorList].slice(0, 12).map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            </AlertDescription>
          ) : null}
        </Alert>
      ) : null}

      <OrderHeaderForm
        header={state.header}
        onChange={setHeader}
        options={options}
        rates={rates}
        errors={errors.header}
        editable={editable}
        canWritePrices={canWritePrices}
        canSeePrices={canSeePrices}
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{grid("title")}</CardTitle>
          {editable ? (
            <CustomColumnsMenu
              columns={state.header.customColumns}
              lines={state.lines}
              onChange={setCustomColumns}
              templates={columnTemplates}
              customerId={state.header.customerId}
              canManageTemplates={editable}
            />
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ItemsGrid
            lines={state.lines}
            onLinesChange={setLines}
            figures={figures}
            options={options}
            currency={state.header.currency}
            piecePricing={state.header.documentOptions.showPiecePrices}
            editable={editable}
            canWritePrices={canWritePrices}
            canSeePrices={canSeePrices}
            customColumns={state.header.customColumns}
            errors={errors.byLine}
          />
          <OrderTotals
            totals={totals}
            pieceSummary={pieceSummary}
            totalPieces={totalPieces}
            lineCount={state.lines.length}
            canSeePrices={canSeePrices}
            linesWithoutModel={state.lines.length - domain.items.length}
          />
        </CardContent>
      </Card>
    </div>
    </OrderEditorContext.Provider>
  );
}
