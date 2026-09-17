import "server-only";
import { prisma } from "@/lib/prisma";
import type { AdminRole } from "@/generated/prisma/enums";
import {
  applyRoleCapabilities,
  capabilitiesOf,
  DEFAULT_ROLE_CAPABILITIES,
  normaliseCapabilities,
  ROLES,
  type Capability,
} from "@/lib/rbac";

/**
 * The editable half of RBAC.
 *
 * `rbac.ts` answers "may this role do that" synchronously from memory; this
 * module keeps that memory in step with `admin_role_capabilities`. The read is
 * cached for a few seconds because `auth()` runs on every admin request and
 * the matrix changes a handful of times a year.
 *
 * Several containers can serve /admin, so the save updates this process at
 * once and the others catch up within `TTL_MS`.
 */
const TTL_MS = 10_000;

let loadedAt = 0;
let inflight: Promise<void> | null = null;

async function load() {
  try {
    const rows = await prisma.adminRoleCapabilities.findMany();
    applyRoleCapabilities(Object.fromEntries(rows.map((r) => [r.role, r.capabilities])));
    loadedAt = Date.now();
  } catch (err) {
    // Missing table (migration not applied yet) or a database blip: keep the
    // last known matrix — the defaults on a fresh process — rather than
    // locking every operator out of /admin.
    console.error("[rbac] role capabilities load failed:", (err as Error).message);
    loadedAt = Date.now() - TTL_MS / 2;
  }
}

export async function refreshRoleCapabilities(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  inflight ??= load().finally(() => {
    inflight = null;
  });
  await inflight;
}

export type RoleMatrixRow = {
  role: AdminRole;
  capabilities: readonly Capability[];
  isDefault: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
  activeUsers: number;
  inactiveUsers: number;
};

export async function getRoleMatrix(): Promise<RoleMatrixRow[]> {
  await refreshRoleCapabilities(true);
  const [rows, counts] = await Promise.all([
    prisma.adminRoleCapabilities.findMany(),
    prisma.adminUser.groupBy({ by: ["role", "isActive"], _count: true }),
  ]);
  const editorIds = rows.map((r) => r.updatedById).filter((id): id is string => !!id);
  const editors = editorIds.length
    ? await prisma.adminUser.findMany({ where: { id: { in: editorIds } }, select: { id: true, email: true } })
    : [];
  const emailById = new Map(editors.map((e) => [e.id, e.email]));

  return ROLES.map((role) => {
    const row = rows.find((r) => r.role === role);
    const count = (active: boolean) =>
      counts.find((c) => c.role === role && c.isActive === active)?._count ?? 0;
    return {
      role,
      capabilities: capabilitiesOf(role),
      isDefault: role === "ADMIN" || !row,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedById ? (emailById.get(row.updatedById) ?? null) : null,
      activeUsers: count(true),
      inactiveUsers: count(false),
    };
  });
}

/**
 * Stores one role's capabilities. Saving exactly the defaults deletes the row,
 * so "Επαναφορά" and "ticked the same boxes by hand" end in the same state and
 * a later change to the defaults in code still reaches that role.
 */
export async function saveRoleCapabilities(
  role: Exclude<AdminRole, "ADMIN">,
  requested: readonly string[],
  actorId: string,
): Promise<{ before: Capability[]; after: Capability[] }> {
  await refreshRoleCapabilities(true);
  const before = [...capabilitiesOf(role)];
  const after = normaliseCapabilities(role, requested);
  const isDefault =
    after.length === DEFAULT_ROLE_CAPABILITIES[role].length &&
    after.every((c) => DEFAULT_ROLE_CAPABILITIES[role].includes(c));

  if (isDefault) {
    await prisma.adminRoleCapabilities.deleteMany({ where: { role } });
  } else {
    await prisma.adminRoleCapabilities.upsert({
      where: { role },
      create: { role, capabilities: after, updatedById: actorId },
      update: { capabilities: after, updatedById: actorId },
    });
  }
  await refreshRoleCapabilities(true);
  return { before, after };
}
