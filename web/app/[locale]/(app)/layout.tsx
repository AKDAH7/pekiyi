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
      {/* min-w-0: wide tables scroll inside their own box; the page never scrolls sideways. */}
      <SidebarInset className="min-w-0">
        <Topbar displayName={displayName} />
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
