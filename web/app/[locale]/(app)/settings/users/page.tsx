import { Search } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { can, isRole } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { listUsers } from "@/lib/users/queries";
import { usersSearchSchema } from "@/lib/validation/users";
import { PageHeader } from "@/components/page-header";
import { CreateUserButton, UserRowActions } from "@/components/users/user-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UsersPage({ searchParams }: Props) {
  const { q } = usersSearchSchema.parse(await searchParams);
  const me = await requirePermission("users", "read");

  const [users, t, roles, languages, format] = await Promise.all([
    listUsers(q),
    getTranslations("users"),
    getTranslations("roles"),
    getTranslations("languages"),
    getFormatter(),
  ]);
  const canManage = can(me.role, "users", "update");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={can(me.role, "users", "create") ? <CreateUserButton /> : null}
      />

      <form role="search" className="flex max-w-md gap-2">
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
        />
        <Button type="submit" variant="outline">
          <Search />
          {t("search")}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead>{t("columns.email")}</TableHead>
              <TableHead>{t("columns.role")}</TableHead>
              <TableHead>{t("columns.language")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead>{t("columns.createdAt")}</TableHead>
              {canManage ? (
                <TableHead className="w-0">
                  <span className="sr-only">{t("columns.actions")}</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id} className={user.active ? undefined : "text-muted-foreground"}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {user.name}
                      {user.id === me.id ? <Badge variant="outline">{t("you")}</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell dir="ltr" className="text-start">
                    {user.email}
                  </TableCell>
                  <TableCell>{isRole(user.role) ? roles(user.role) : user.role}</TableCell>
                  <TableCell>
                    {languages.has(user.preferredLocale)
                      ? languages(user.preferredLocale)
                      : user.preferredLocale}
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.active ? "secondary" : "destructive"}>
                      {t(user.active ? "status.active" : "status.deactivated")}
                    </Badge>
                  </TableCell>
                  <TableCell>{format.dateTime(user.createdAt, { dateStyle: "medium" })}</TableCell>
                  {canManage ? (
                    <TableCell>
                      <UserRowActions user={user} isSelf={user.id === me.id} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
