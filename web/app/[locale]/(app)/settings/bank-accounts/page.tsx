import { getTranslations } from "next-intl/server";

import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatIban } from "@/lib/domain/iban";
import { listBankAccounts } from "@/lib/settings/queries";
import { PageHeader } from "@/components/page-header";
import { BankAccountActions, CreateBankAccountButton } from "@/components/settings/bank-account-dialogs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function BankAccountsPage() {
  const me = await requirePermission("settings", "read");
  const [accounts, t, common] = await Promise.all([
    listBankAccounts(),
    getTranslations("bankAccounts"),
    getTranslations("common"),
  ]);
  const canManage = can(me.role, "settings", "update");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={canManage ? <CreateBankAccountButton /> : null}
      />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.currency")}</TableHead>
              <TableHead>{t("fields.iban")}</TableHead>
              <TableHead>{t("fields.bankName")}</TableHead>
              <TableHead>{t("fields.swift")}</TableHead>
              <TableHead>{t("fields.branch")}</TableHead>
              <TableHead>{t("fields.beneficiary")}</TableHead>
              <TableHead>{common("status")}</TableHead>
              {canManage ? (
                <TableHead className="w-0">
                  <span className="sr-only">{common("actions")}</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account) => (
                <TableRow key={account.id} className={account.active ? undefined : "text-muted-foreground"}>
                  <TableCell className="font-medium">{account.currency}</TableCell>
                  <TableCell dir="ltr" className="text-start font-mono whitespace-nowrap">
                    {formatIban(account.iban)}
                  </TableCell>
                  <TableCell>{account.bankName}</TableCell>
                  <TableCell dir="ltr" className="text-start font-mono">
                    {account.swift ?? "—"}
                  </TableCell>
                  <TableCell>{account.branch ?? "—"}</TableCell>
                  <TableCell className="min-w-48 whitespace-normal">{account.beneficiary}</TableCell>
                  <TableCell>
                    <Badge variant={account.active ? "secondary" : "destructive"}>
                      {common(account.active ? "active" : "inactive")}
                    </Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <BankAccountActions
                        account={{
                          id: account.id,
                          version: account.version,
                          bankName: account.bankName,
                          swift: account.swift,
                          branch: account.branch,
                          beneficiary: account.beneficiary,
                          currency: account.currency,
                          iban: account.iban,
                          active: account.active,
                        }}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">{t("oneActiveNote")}</p>
    </div>
  );
}
