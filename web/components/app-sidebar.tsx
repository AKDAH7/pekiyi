import {
  FileText,
  Factory,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Tag,
  Truck,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/customers", key: "customers", icon: Users },
  { href: "/products", key: "products", icon: Package },
  { href: "/orders", key: "orders", icon: ShoppingCart },
  { href: "/proformas", key: "proformas", icon: FileText },
  { href: "/production", key: "production", icon: Factory },
  { href: "/loading", key: "loading", icon: Truck },
  { href: "/labels", key: "labels", icon: Tag },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

type Props = {
  side: "left" | "right";
};

export async function AppSidebar({ side }: Props) {
  const t = await getTranslations("nav");
  const common = await getTranslations("common");

  return (
    <Sidebar side={side} collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-semibold">
          {common("appName")}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton render={<Link href={item.href} />} tooltip={t(item.key)}>
                    <item.icon />
                    <span>{t(item.key)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
