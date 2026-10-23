import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { MAIN_NAV, SETTINGS_NAV, type NavItem } from "@/lib/nav";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type Props = {
  side: "left" | "right";
  role: string | null | undefined;
};

export async function AppSidebar({ side, role }: Props) {
  const t = await getTranslations("nav");
  const common = await getTranslations("common");

  const groups: { label?: string; items: NavItem[] }[] = [
    { items: MAIN_NAV.filter((item) => item.visible(role)) },
    { label: t("settings"), items: SETTINGS_NAV.filter((item) => item.visible(role)) },
  ];

  return (
    <Sidebar side={side} collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-semibold">
          {common("appName")}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group, index) => (
          <SidebarGroup key={group.label ?? index}>
            {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
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
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
