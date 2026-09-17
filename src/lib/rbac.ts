import type { AdminRole } from "@/generated/prisma/enums";

/**
 * /admin permission model.
 *
 * Deliberately coarse — one capability per admin section, not per action.
 * Fine-grained permissions are a maintenance tax nobody pays; the audit log
 * (AdminAuditLog) is what actually answers "who changed this".
 *
 * The roles are fixed (the AdminRole enum); what each one may do is editable
 * from /admin/users/roles. This module stays synchronous and database-free so
 * every page and action can keep calling `assertCan` inline: the matrix saved
 * in the database is pushed into it by `refreshRoleCapabilities`, which the
 * `auth()` wrapper runs before handing out a session.
 */
export const CAPABILITIES = [
  "content", // homepage zones, pages, menu, blocks
  "catalogue", // curation, slugs, badges, featured sets
  "merchandising", // offers, deal-of-day, bundles, coupons
  "editorial", // blog, guides, FAQ, terms
  "orders", // eshop orders, ERP push, vouchers
  "customers", // customers, B2B approvals, price tiers
  "service", // returns/RMA, service requests, warranties
  "engagement", // newsletter, alerts, contact inbox, reviews
  "settings", // site config, shipping, payment, redirects
  "sync", // HDCtool delta status, reconcile
  "users", // admin user management
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const ROLES = ["ADMIN", "EDITOR", "OPS"] as const satisfies readonly AdminRole[];

export const ROLE_META: Record<AdminRole, { label: string; description: string }> = {
  ADMIN: {
    label: "Διαχειριστής",
    description: "Τα πάντα, μαζί με χρήστες και ρόλους. Δεν περιορίζεται.",
  },
  EDITOR: {
    label: "Συντάκτης",
    description: "Περιεχόμενο, κατάλογος και προσφορές. Χωρίς παραγγελίες και στοιχεία πελατών.",
  },
  OPS: {
    label: "Λειτουργίες",
    description: "Παραγγελίες, αποστολές, πελάτες και επιστροφές. Χωρίς περιεχόμενο.",
  },
};

export const CAPABILITY_META: Record<Capability, { label: string; description: string }> = {
  content: { label: "Περιεχόμενο", description: "Σελίδες, banners, αρχεία, κείμενα, μεταφράσεις, αξιολογήσεις" },
  catalogue: { label: "Κατάλογος", description: "Προϊόντα, slugs, σήματα, επιλεγμένα σετ" },
  merchandising: { label: "Προσφορές", description: "Προσφορές, κουπόνια, πακέτα" },
  editorial: { label: "Άρθρα & FAQ", description: "Blog, οδηγοί, συχνές ερωτήσεις, όροι" },
  orders: { label: "Παραγγελίες", description: "Παραγγελίες, αποστολές, αποστολή στο ERP" },
  customers: { label: "Πελάτες", description: "Πελάτες, εγκρίσεις B2B — προσωπικά δεδομένα" },
  service: { label: "Επιστροφές", description: "Επιστροφές, αιτήματα service, εγγυήσεις" },
  engagement: { label: "Επικοινωνία", description: "Newsletter, Mailgun, μηνύματα πελατών" },
  settings: { label: "Ρυθμίσεις", description: "Ρυθμίσεις καταστήματος, κλειδιά πληρωμών και courier" },
  sync: { label: "Συγχρονισμός", description: "Κατάσταση συγχρονισμού με το HDCtool" },
  users: { label: "Χρήστες & ρόλοι", description: "Μόνο για διαχειριστές" },
};

/**
 * Never grantable to a non-ADMIN role. Whoever manages users can make
 * themselves ADMIN, so handing out `users` is handing out everything.
 */
export const ADMIN_ONLY_CAPABILITIES: readonly Capability[] = ["users"];

export const DEFAULT_ROLE_CAPABILITIES: Record<AdminRole, readonly Capability[]> = {
  ADMIN: CAPABILITIES,
  EDITOR: ["content", "catalogue", "merchandising", "editorial", "engagement"],
  OPS: ["orders", "customers", "service", "engagement", "sync"],
};

let effective: Record<AdminRole, readonly Capability[]> = DEFAULT_ROLE_CAPABILITIES;

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

/**
 * Cleans a stored or submitted list: known capabilities only, no admin-only
 * ones, canonical order. ADMIN always gets everything regardless of input.
 */
export function normaliseCapabilities(role: AdminRole, list: readonly string[]): Capability[] {
  if (role === "ADMIN") return [...CAPABILITIES];
  const wanted = new Set(list);
  return CAPABILITIES.filter((c) => wanted.has(c) && !ADMIN_ONLY_CAPABILITIES.includes(c));
}

/** Replaces the in-process matrix. Roles missing from `stored` use the defaults. */
export function applyRoleCapabilities(stored: Partial<Record<AdminRole, readonly string[]>>) {
  effective = {
    ADMIN: CAPABILITIES,
    EDITOR: stored.EDITOR ? normaliseCapabilities("EDITOR", stored.EDITOR) : DEFAULT_ROLE_CAPABILITIES.EDITOR,
    OPS: stored.OPS ? normaliseCapabilities("OPS", stored.OPS) : DEFAULT_ROLE_CAPABILITIES.OPS,
  };
}

export function can(role: AdminRole | undefined, capability: Capability): boolean {
  if (!role) return false;
  return effective[role].includes(capability);
}

/** Capabilities a role holds — drives which nav items /admin renders. */
export function capabilitiesOf(role: AdminRole | undefined): readonly Capability[] {
  return role ? effective[role] : [];
}

/**
 * Throwing guard for server actions and route handlers.
 *
 * Hiding a nav item is not authorisation — every mutation must call this.
 */
export function assertCan(
  role: AdminRole | undefined,
  capability: Capability,
): asserts role is AdminRole {
  if (!can(role, capability)) {
    throw new Error(`Forbidden: '${capability}' requires a role that grants it`);
  }
}
