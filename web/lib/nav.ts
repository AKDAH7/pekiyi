import {
  Building,
  Coins,
  Factory,
  FileText,
  History,
  LayoutDashboard,
  type LucideIcon,
  Package,
  ShoppingCart,
  Landmark,
  Tag,
  Truck,
  UserCog,
  Users,
  UsersRound,
} from "lucide-react";

import { can } from "@/lib/auth/permissions";

export type NavItem = {
  href: string;
  /** Translation key under `nav.*`. */
  key: string;
  icon: LucideIcon;
  /** Whether a user with this role may open the page (mirrors the page's own check). */
  visible: (role: string | null | undefined) => boolean;
};

const everyone = () => true;

export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard, visible: everyone },
  { href: "/customers", key: "customers", icon: Users, visible: (r) => can(r, "customers", "read") },
  { href: "/products", key: "products", icon: Package, visible: (r) => can(r, "catalog", "read") },
  { href: "/orders", key: "orders", icon: ShoppingCart, visible: (r) => can(r, "orders", "read") },
  {
    href: "/proformas",
    key: "proformas",
    icon: FileText,
    visible: (r) => can(r, "proformas", "read"),
  },
  {
    href: "/production",
    key: "production",
    icon: Factory,
    visible: (r) => can(r, "production", "read"),
  },
  { href: "/loading", key: "loading", icon: Truck, visible: (r) => can(r, "loading", "read") },
  { href: "/labels", key: "labels", icon: Tag, visible: (r) => can(r, "labels", "read") },
];

export const SETTINGS_NAV: NavItem[] = [
  { href: "/settings/profile", key: "profile", icon: UserCog, visible: everyone },
  {
    href: "/settings/company",
    key: "company",
    icon: Building,
    visible: (r) => can(r, "settings", "read"),
  },
  {
    href: "/settings/bank-accounts",
    key: "bankAccounts",
    icon: Landmark,
    visible: (r) => can(r, "settings", "read"),
  },
  {
    // Export users may look at the rates (they price with them); only admins add them.
    href: "/settings/exchange-rates",
    key: "exchangeRates",
    icon: Coins,
    visible: (r) => can(r, "prices", "read"),
  },
  { href: "/settings/users", key: "users", icon: UsersRound, visible: (r) => can(r, "users", "read") },
  { href: "/settings/audit", key: "audit", icon: History, visible: (r) => can(r, "auditLog", "read") },
];
