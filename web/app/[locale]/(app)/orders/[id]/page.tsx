import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { countryName } from "@/lib/domain/countries";
import { mayReadProformas } from "@/lib/documents/http";
import { toDocumentLanguage } from "@/lib/documents/languages";
import { allowedTransitions } from "@/lib/domain/order-status";
import { graphToEditorState } from "@/lib/orders/editor";
import {
  getEditorOptions,
  getOrderForEditor,
  getOrderHistory,
  getOrderIssueState,
  listColumnTemplates,
  localizeEditorOptions,
  statusBeforeCancel,
} from "@/lib/orders/queries";
import { getLatestRates } from "@/lib/settings/queries";
import { CountryLabel } from "@/components/customers/country";
import { MissingRateBanner } from "@/components/missing-rate-banner";
import { DuplicateOrderButton } from "@/components/orders/duplicate-order-button";
import { IssueProformaButton, IssueState } from "@/components/orders/issue-proforma";
import { OrderEditor } from "@/components/orders/order-editor";
import { OrderHistory } from "@/components/orders/order-history";
import { OrderStatusMenu } from "@/components/orders/order-status-menu";
import { ProformaPreviewMenu } from "@/components/orders/proforma-documents";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = { params: Promise<{ id: string }> };

export default async function OrderPage({ params }: Props) {
  const me = await requirePermission("orders", "read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [order, data, latest, t, locale] = await Promise.all([
    getOrderForEditor(id),
    getEditorOptions(),
    getLatestRates(),
    getTranslations("orders"),
    getLocale(),
  ]);
  if (!order) notFound();

  const { number, status, version } = order.order;
  const editable = can(me.role, "orders", "update");
  const documents = mayReadProformas(me.role);
  const [issueState, history, templates, cancelledFrom] = await Promise.all([
    getOrderIssueState(order),
    getOrderHistory(id),
    listColumnTemplates(order.order.customerId),
    status === "cancelled" ? statusBeforeCancel(id) : Promise.resolve(null),
  ]);
  const transitions = editable
    ? allowedTransitions(status, { mayStepBack: can(me.role, "orders", "revertStatus"), cancelledFrom })
    : [];

  return (
    <Tabs defaultValue="order" className="flex flex-col gap-4">
      <MissingRateBanner role={me.role} latest={latest} />
      <TabsList>
        <TabsTrigger value="order" className="px-4">
          {t("tabs.order")}
        </TabsTrigger>
        <TabsTrigger value="history" className="px-4">
          {t("tabs.history")}
        </TabsTrigger>
      </TabsList>
      {/* Kept mounted, so looking at the history never loses unsaved edits. */}
      <TabsContent value="order" keepMounted>
        <OrderEditor
          // A newer version from the server (after "Reload", a status change or an issue) starts the editor afresh.
          key={version}
          order={{ id, version }}
          initial={graphToEditorState(order)}
          options={localizeEditorOptions(data, locale)}
          rates={latest.rates}
          permissions={{
            editable,
            canWritePrices: can(me.role, "orderPrices", "update"),
            canSeePrices: can(me.role, "prices", "read"),
          }}
          columnTemplates={templates}
          title={
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight" dir="ltr">
                  {number}
                </h1>
                <OrderStatusMenu orderId={id} status={status} transitions={transitions} />
              </div>
              <p className="text-muted-foreground">
                <Link href={`/customers/${order.customer.id}`} className="underline-offset-4 hover:underline">
                  {order.customer.companyName}
                </Link>{" "}
                · <CountryLabel code={order.customer.country} name={countryName(order.customer.country, locale)} />
              </p>
              <IssueState last={issueState.last} changed={issueState.changedSinceIssue} />
            </div>
          }
          actions={
            <>
              <Link href="/orders" className={buttonVariants({ variant: "ghost" })}>
                {t("editor.backToList")}
              </Link>
              {can(me.role, "orders", "create") ? <DuplicateOrderButton orderId={id} /> : null}
              {documents ? (
                <ProformaPreviewMenu orderId={id} defaultLanguage={toDocumentLanguage(order.customer.docLanguage)} />
              ) : null}
              {can(me.role, "proformas", "create") ? (
                <IssueProformaButton orderId={id} defaultLanguage={order.customer.docLanguage} />
              ) : null}
            </>
          }
        />
      </TabsContent>
      <TabsContent value="history">
        <OrderHistory entries={history} orderId={id} downloads={documents} />
      </TabsContent>
    </Tabs>
  );
}
