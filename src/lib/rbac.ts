import type { AdminRole } from "@/generated/prisma/enums";

/**
 * /admin permission model.
 *
 * Deliberately coarse — one capability per admin section, not per action.
 * Fine-grained permissions are a maintenance tax nobody pays; the audit log
 * (AdminAuditLog) is what actually answers "who changed this".
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

const ROLE_CAPABILITIES: Record<AdminRole, readonly Capability[]> = {
  ADMIN: CAPABILITIES,
  EDITOR: ["content", "catalogue", "merchandising", "editorial", "engagement"],
  OPS: ["orders", "customers", "service", "engagement", "sync"],
};

export function can(role: AdminRole | undefined, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role].includes(capability);
}

/** Capabilities a role holds — drives which nav items /admin renders. */
export function capabilitiesOf(role: AdminRole | undefined): readonly Capability[] {
  return role ? ROLE_CAPABILITIES[role] : [];
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
