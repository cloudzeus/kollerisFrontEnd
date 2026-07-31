import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { capabilitiesOf, type Capability } from "@/lib/rbac";
import { upGreek } from "@/lib/greek";
import { Toaster } from "sonner";

/**
 * /admin is Greek-only staff UI and deliberately sits OUTSIDE the [locale]
 * tree — it is not part of the localised storefront and must never be crawled
 * or locale-negotiated.
 *
 * Middleware already redirects unauthenticated requests; this second check is
 * the real gate. Middleware is routing, not authorisation.
 */
const SECTIONS: Array<{ href: string; label: string; capability: Capability }> = [
  { href: "/admin/content", label: "Περιεχόμενο", capability: "content" },
  { href: "/admin/catalogue", label: "Κατάλογος", capability: "catalogue" },
  { href: "/admin/merchandising", label: "Προσφορές", capability: "merchandising" },
  { href: "/admin/editorial", label: "Άρθρα & FAQ", capability: "editorial" },
  { href: "/admin/orders", label: "Παραγγελίες", capability: "orders" },
  { href: "/admin/customers", label: "Πελάτες", capability: "customers" },
  { href: "/admin/service", label: "Επιστροφές & Service", capability: "service" },
  { href: "/admin/engagement", label: "Επικοινωνία", capability: "engagement" },
  { href: "/admin/sync", label: "Συγχρονισμός", capability: "sync" },
  { href: "/admin/settings", label: "Ρυθμίσεις", capability: "settings" },
  { href: "/admin/users", label: "Χρήστες", capability: "users" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");

  const allowed = capabilitiesOf(session.user.role);
  const visible = SECTIONS.filter((s) => allowed.includes(s.capability));

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col bg-k-ink-deep text-white">
        <div className="border-b border-white/10 px-6 py-6">
          <p className="text-sm font-bold tracking-widest">
            {upGreek("Kolleris")}
          </p>
          <p className="numeral mt-1 text-[11px] tracking-wider text-k-text-5">
            {session.user.role}
          </p>
        </div>

        <nav className="flex-1 py-4">
          {visible.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="block px-6 py-2.5 text-sm text-k-text-6 transition-colors hover:bg-white/5 hover:text-white"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="border-t border-white/10 px-6 py-4">
          <p className="truncate text-xs text-k-text-5">{session.user.email}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/admin/login" });
            }}
          >
            <button
              type="submit"
              className="mt-2 text-xs text-k-red transition-colors hover:text-white"
            >
              Αποσύνδεση
            </button>
          </form>
        </div>
      </aside>

      <main id="main" className="flex-1 bg-k-surface-2">{children}</main>
      <Toaster position="bottom-right" richColors closeButton />
      </div>
  );
}
