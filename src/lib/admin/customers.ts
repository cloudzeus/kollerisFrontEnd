import "server-only";
import { prisma } from "@/lib/prisma";
import type { CustomerFilter, CustomersPage } from "@/lib/admin/customers-types";

export * from "@/lib/admin/customers-types";

/**
 * The customers screen.
 *
 * Two populations that only look alike: companies waiting to be approved as B2B
 * partners, and individuals who simply bought something. The first is a queue
 * with a decision at the end of it; the second is a list. They are fetched
 * separately rather than unioned into "customers", because merging them would
 * bury three pending approvals inside a thousand shoppers.
 *
 * Pending companies sort oldest-first, for the reason the inbox does: a queue
 * sorted newest-first is how the oldest application quietly becomes a week old.
 */

export async function getCustomers(filter: CustomerFilter = "pending"): Promise<CustomersPage> {
  const wantsCompanies = filter !== "individuals";
  const wantsIndividuals = filter === "individuals" || filter === "all";

  const companyWhere =
    filter === "pending" ? { status: "pending" as const }
    : filter === "active" ? { status: "active" as const }
    : {};

  const [companies, individuals, pending, active, individualCount, all] = await Promise.all([
    wantsCompanies
      ? prisma.company.findMany({
          where: companyWhere,
          orderBy: { createdAt: filter === "pending" ? "asc" : "desc" },
          take: 100,
          include: {
            members: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                status: true,
                spendLimit: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
        })
      : Promise.resolve([]),

    wantsIndividuals
      ? prisma.customer.findMany({
          where: { accountType: "individual" },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true, createdAt: true },
        })
      : Promise.resolve([]),

    prisma.company.count({ where: { status: "pending" } }),
    prisma.company.count({ where: { status: "active" } }),
    prisma.customer.count({ where: { accountType: "individual" } }),
    prisma.company.count(),
  ]);

  // Order counts for individuals, in one grouped query rather than per row.
  const emails = individuals.map((i) => i.email);
  const orderCounts = emails.length
    ? await prisma.order.groupBy({
        by: ["email"],
        where: { email: { in: emails } },
        _count: { _all: true },
      })
    : [];
  const ordersByEmail = new Map(orderCounts.map((o) => [o.email, o._count._all]));

  const now = Date.now();

  return {
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      afm: c.afm,
      doy: c.doy,
      profession: c.profession,
      phone: c.phone,
      address: [c.billAddress, c.billPostcode, c.billCity].filter(Boolean).join(", ") || null,
      status: c.status,
      erpTrdr: c.erpTrdr,
      partnerFactor: c.partnerFactor == null ? null : Number(c.partnerFactor),
      creditLimit: c.creditLimit == null ? null : Number(c.creditLimit),
      approvedBy: c.approvedBy,
      approvedAt: c.approvedAt,
      notes: c.notes,
      createdAt: c.createdAt,
      members: c.members.map((m) => ({
        id: m.id,
        name: `${m.firstName} ${m.lastName}`.trim(),
        email: m.email,
        role: m.role,
        status: m.status,
        spendLimit: m.spendLimit == null ? null : Number(m.spendLimit),
      })),
      waitingHours: Math.floor((now - c.createdAt.getTime()) / 3_600_000),
    })),

    individuals: individuals.map((i) => ({
      id: i.id,
      name: `${i.firstName} ${i.lastName}`.trim(),
      email: i.email,
      phone: i.phone,
      status: i.status,
      createdAt: i.createdAt,
      orders: ordersByEmail.get(i.email) ?? 0,
    })),

    counts: { pending, active, individuals: individualCount, all },
  };
}
