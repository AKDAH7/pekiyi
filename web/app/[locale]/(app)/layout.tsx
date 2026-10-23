import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

type Props = {
  children: React.ReactNode;
};

export default async function AppLayout({ children }: Props) {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);

  if (!user) {
    throw redirect({ href: "/login", locale });
  }

  const displayName = user.name || user.email || "";
  const side = locale === "ar" ? "right" : "left";

  return (
    <SidebarProvider>
      <AppSidebar side={side} role={user.role} />
      <SidebarInset>
        <Topbar displayName={displayName} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
