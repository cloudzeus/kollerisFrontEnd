"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ChevronRight,
  FileText,
  Frame,
  LayoutDashboard,
  LayoutTemplate,
  LifeBuoy,
  Mail,
  Menu,
  Newspaper,
  Package,
  RefreshCw,
  Settings,
  Tag,
  Truck,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Admin navigation.
 *
 * Grouped rather than a flat list of eleven links: the sections split cleanly
 * into daily work, content, and system, and eleven equal-weight items give no
 * hint about which of them somebody opens every morning.
 *
 * Icons carry a label in every case. An icon-only rail saves 180px and costs
 * recognition on exactly the items used least often.
 *
 * `Link` rather than `a` — the previous shell did a full page load on every
 * navigation, which is the single most noticeable thing about a slow admin.
 */

export type NavItem = { href: string; label: string; icon: string; badge?: number };
export type NavGroup = { title: string; items: NavItem[] };

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  zones: LayoutTemplate,
  banners: Frame,
  content: FileText,
  catalogue: Boxes,
  merchandising: Tag,
  editorial: Newspaper,
  orders: Package,
  courier: Truck,
  customers: UsersRound,
  service: LifeBuoy,
  engagement: Mail,
  sync: RefreshCw,
  settings: Settings,
  users: Users,
};

export function AdminNav({
  groups,
  user,
  role,
  signOutAction,
}: {
  groups: NavGroup[];
  user: string;
  role: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex-1 overflow-y-auto py-2" aria-label="Ενότητες διαχείρισης">
      {groups.map((group) => (
        <div key={group.title} className="mb-1 px-3 py-2">
          <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-white/35">
            {group.title}
          </p>
          {group.items.map((item) => {
            const Icon = ICONS[item.icon] ?? LayoutDashboard;
            // Exact match for the dashboard, prefix for everything else, or
            // every section would light up while on /admin.
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-2.5 px-2 py-[7px] text-[13px] transition-colors",
                  active
                    ? "bg-white/10 font-medium text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon
                  className={cn(
                    "size-[15px] shrink-0",
                    active ? "text-k-red" : "text-white/40 group-hover:text-white/70",
                  )}
                />
                <span className="min-w-0 truncate">{item.label}</span>
                {item.badge ? (
                  <span className="numeral ml-auto bg-k-red px-1.5 py-px text-[10px] font-medium text-white">
                    {item.badge}
                  </span>
                ) : (
                  active && <ChevronRight className="ml-auto size-3 text-white/30" />
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 px-5 py-3.5">
      <p className="truncate text-[12px] text-white/70">{user}</p>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="numeral text-[10px] uppercase tracking-wider text-white/35">{role}</span>
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-[11.5px] text-white/50 underline-offset-2 transition-colors hover:text-white hover:underline"
          >
            Αποσύνδεση
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile trigger. The sidebar was a fixed 256px column with no way to
          reach the page underneath on a phone. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-50 grid size-10 place-items-center border border-k-line bg-white text-k-ink shadow-sm lg:hidden"
        aria-label="Άνοιγμα μενού"
      >
        <Menu className="size-4" />
      </button>

      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-k-ink/50 lg:hidden"
          aria-label="Κλείσιμο μενού"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-k-ink-deep transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-[18px]">
          <Link href="/admin" className="text-[13px] font-bold tracking-[0.14em] text-white">
            KOLLERIS
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-white/50 hover:text-white lg:hidden"
            aria-label="Κλείσιμο μενού"
          >
            <X className="size-4" />
          </button>
        </div>
        {nav}
        {footer}
      </aside>
    </>
  );
}
