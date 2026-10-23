import { getTranslations } from "next-intl/server";

import { isRole } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { ChangePasswordForm, ProfileForm } from "@/components/profile-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProfilePage() {
  // Every signed-in user can manage their own profile.
  const me = await requireUser();
  const [t, roles] = await Promise.all([getTranslations("profile"), getTranslations("roles")]);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("detailsTitle")}</CardTitle>
          <CardDescription>
            <span dir="ltr">{me.email}</span>
            {" · "}
            {isRole(me.role) ? roles(me.role) : me.role}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm name={me.name} preferredLocale={me.preferredLocale} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("passwordTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
