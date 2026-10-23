import { SidebarTrigger } from "@/components/ui/sidebar";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/user-menu";

type Props = {
  displayName: string;
};

export function Topbar({ displayName }: Props) {
  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b px-4">
      <SidebarTrigger />
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <UserMenu displayName={displayName} />
      </div>
    </header>
  );
}
