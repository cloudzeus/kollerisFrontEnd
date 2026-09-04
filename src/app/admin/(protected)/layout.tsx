import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { auth, signOut } from "@/auth";
import { capabilitiesOf, type Capability } from "@/lib/rbac";
import { AdminNav, type NavGroup } from "@/components/admin/AdminNav";
import { StorefrontPreview } from "@/components/admin/StorefrontPreview";

/**
 * /admin is Greek-only staff UI and deliberately sits OUTSIDE the [locale]
 * tree — it is not part of the localised storefront and must never be crawled
 * or locale-negotiated.
 *
 * Middleware already redirects unauthenticated requests; this second check is
 * the real gate. Middleware is routing, not authorisation.
 */

type Section = { href: string; label: string; icon: string; capability: Capability | null };

/**
 * Grouped by how often the work happens, not by data model. "Καθημερινά" is
 * what an operator opens on arrival; "Σύστημα" is what they touch twice a year.
 */
const GROUPS: Array<{ title: string; sections: Section[] }> = [
  {
    title: "Καθημερινά",
    sections: [
      { href: "/admin", label: "Επισκόπηση", icon: "dashboard", capability: null },
      { href: "/admin/orders", label: "Παραγγελίες", icon: "orders", capability: "orders" },
      { href: "/admin/courier", label: "Αποστολές", icon: "courier", capability: "orders" },
      { href: "/admin/customers", label: "Πελάτες", icon: "customers", capability: "customers" },
      { href: "/admin/service", label: "Επιστροφές", icon: "service", capability: "service" },
    ],
  },
  /*
   * Η «Επικοινωνία» ήταν ΕΝΑ item — το inbox των μηνυμάτων. Έγινε ομάδα όταν
   * απέκτησε δεύτερο κάτοικο, το newsletter. Τα δύο μοιράζονται το ίδιο
   * ερώτημα («τι λέμε στους πελάτες και τι μας λένε») και θα ήταν λάθος να
   * κάθονται σε διαφορετικές ενότητες επειδή το ένα είναι εισερχόμενο.
   *
   * Το Newsletter πρώτο: είναι η δουλειά που ξεκινά κανείς, ενώ τα μηνύματα
   * είναι δουλειά που τον βρίσκει.
   */
  {
    title: "Επικοινωνία",
    sections: [
      { href: "/admin/newsletter", label: "Newsletter", icon: "newsletter", capability: "engagement" },
      { href: "/admin/engagement", label: "Μηνύματα", icon: "engagement", capability: "engagement" },
    ],
  },
  {
    title: "Κατάστημα",
    sections: [
      { href: "/admin/zones", label: "Σελίδες", icon: "zones", capability: "content" },
      { href: "/admin/banners", label: "Banners", icon: "banners", capability: "content" },
      { href: "/admin/banners/templates", label: "Πλέγματα", icon: "templates", capability: "content" },
      { href: "/admin/content", label: "Κείμενα", icon: "content", capability: "content" },
      { href: "/admin/translations", label: "Μεταφράσεις", icon: "translations", capability: "content" },
      { href: "/admin/catalogue", label: "Κατάλογος", icon: "catalogue", capability: "catalogue" },
      { href: "/admin/offers", label: "Προσφορές", icon: "merchandising", capability: "merchandising" },
      { href: "/admin/editorial", label: "Άρθρα & FAQ", icon: "editorial", capability: "editorial" },
    ],
  },
  {
    title: "Σύστημα",
    sections: [
      { href: "/admin/sync", label: "Συγχρονισμός", icon: "sync", capability: "sync" },
      { href: "/admin/settings", label: "Ρυθμίσεις", icon: "settings", capability: "settings" },
      { href: "/admin/users", label: "Χρήστες", icon: "users", capability: "users" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");

  const allowed = capabilitiesOf(session.user.role);
  const groups: NavGroup[] = GROUPS.map((g) => ({
    title: g.title,
    items: g.sections
      .filter((s) => s.capability === null || allowed.includes(s.capability))
      .map(({ href, label, icon }) => ({ href, label, icon })),
  })).filter((g) => g.items.length > 0);

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/admin/login" });
  }

  return (
    <div className="flex min-h-screen bg-k-surface-2">
      <AdminNav
        groups={groups}
        user={session.user.email ?? ""}
        role={session.user.role}
        signOutAction={signOutAction}
      />
      <main id="main" className="min-w-0 flex-1">
        {/*
          Several admin screens preview real storefront components so the editor
          sees what the customer will. Those components translate themselves and
          /admin has no next-intl provider, so one is mounted here. It carries
          only the namespaces the previews use.
        */}
        <StorefrontPreview>{children}</StorefrontPreview>
      </main>
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
