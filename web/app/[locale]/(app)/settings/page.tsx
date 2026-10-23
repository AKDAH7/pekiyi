import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

/** Settings has no page of its own; every user can open their profile. */
export default async function SettingsPage() {
  const locale = await getLocale();
  redirect({ href: "/settings/profile", locale });
}
