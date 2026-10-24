"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { FormField } from "@/components/form-field";
import { SearchableSelect } from "@/components/searchable-select";
import { Button } from "@/components/ui/button";

/** Step 1 of a new order: choose the customer, whose defaults the order starts from. */
export function NewOrderPicker({ customers }: { customers: { id: string; companyName: string; country: string }[] }) {
  const t = useTranslations("orders.new");
  const router = useRouter();
  const [customer, setCustomer] = useState("");

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (customer) router.push(`/orders/new?customer=${customer}`);
      }}
    >
      <FormField id="new-order-customer" label={t("customer")} hint={t("customerHint")}>
        <SearchableSelect
          id="new-order-customer"
          name="customer"
          options={customers.map((entry) => ({ value: entry.id, label: entry.companyName, flag: entry.country }))}
          placeholder={t("customerPlaceholder")}
          emptyText={t("noCustomer")}
          onValueChange={setCustomer}
        />
      </FormField>
      <div>
        <Button type="submit" disabled={!customer}>
          {t("continue")}
          <ArrowRight className="rtl:rotate-180" />
        </Button>
      </div>
    </form>
  );
}
