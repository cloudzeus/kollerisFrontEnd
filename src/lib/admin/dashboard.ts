import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * What the admin home page needs, in one round-trip.
 *
 * Built around the question an operator actually opens this page with — "is
 * anything waiting for me?" — rather than around a wall of counters. Anything
 * in `attention` is a thing a person has to do; everything else is context.
 *
 * A paid order that never reached SoftOne is first because it is the only item
 * here that costs money while it waits.
 */

export type AttentionItem = {
  id: string;
  count: number;
  label: string;
  detail: string;
  href: string;
  tone: "urgent" | "warn";
};

export type DashboardData = {
  attention: AttentionItem[];
  orders: { last7: number; last30: number; revenue7: number; revenue30: number; total: number };
  recent: Array<{
    orderNumber: string;
    createdAt: Date;
    status: string;
    paymentStatus: string;
    totalGross: number;
    customer: string;
    erpPushed: boolean;
  }>;
  catalogue: { products: number; active: number };
  sync: Array<{ channel: string; lastRunAt: Date | null; lastSuccessAt: Date | null; lastStatus: string | null }>;
};

const DAY = 86_400_000;

export async function getDashboard(): Promise<DashboardData> {
  const now = Date.now();
  const from7 = new Date(now - 7 * DAY);
  const from30 = new Date(now - 30 * DAY);

  const [
    stuckOrders,
    pendingCompanies,
    newMessages,
    failedSyncs,
    orders7,
    orders30,
    totalOrders,
    sums7,
    sums30,
    recentRows,
    products,
    activeProducts,
    syncStates,
  ] = await Promise.all([
    // Paid, but the ERP push failed or never happened.
    prisma.order.count({
      where: { paymentStatus: "PAID", erpPushedAt: null },
    }),
    prisma.company.count({ where: { status: "pending" } }),
    prisma.contactMessage.count({ where: { status: "new" } }),
    prisma.syncState.count({ where: { lastStatus: { in: ["FAILED", "PARTIAL"] } } }),
    prisma.order.count({ where: { createdAt: { gte: from7 } } }),
    prisma.order.count({ where: { createdAt: { gte: from30 } } }),
    prisma.order.count(),
    prisma.order.aggregate({
      where: { createdAt: { gte: from7 }, paymentStatus: "PAID" },
      _sum: { totalGross: true },
    }),
    prisma.order.aggregate({
      where: { createdAt: { gte: from30 }, paymentStatus: "PAID" },
      _sum: { totalGross: true },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        orderNumber: true,
        createdAt: true,
        status: true,
        paymentStatus: true,
        totalGross: true,
        firstName: true,
        lastName: true,
        companyName: true,
        erpPushedAt: true,
      },
    }),
    prisma.product.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.syncState.findMany({
      select: { channel: true, lastRunAt: true, lastSuccessAt: true, lastStatus: true },
      orderBy: { channel: "asc" },
    }),
  ]);

  const attention: AttentionItem[] = [];

  if (stuckOrders > 0) {
    attention.push({
      id: "erp",
      count: stuckOrders,
      label: stuckOrders === 1 ? "Πληρωμένη παραγγελία εκτός ERP" : "Πληρωμένες παραγγελίες εκτός ERP",
      detail: "Έχουν πληρωθεί αλλά δεν έχουν περάσει στο SoftOne.",
      href: "/admin/orders?filter=erp-pending",
      tone: "urgent",
    });
  }
  if (pendingCompanies > 0) {
    attention.push({
      id: "b2b",
      count: pendingCompanies,
      label: pendingCompanies === 1 ? "Αίτηση B2B σε αναμονή" : "Αιτήσεις B2B σε αναμονή",
      detail: "Δεν μπορούν να αγοράσουν με τιμές συνεργάτη μέχρι να εγκριθούν.",
      href: "/admin/customers?filter=pending",
      tone: "warn",
    });
  }
  if (newMessages > 0) {
    attention.push({
      id: "contact",
      count: newMessages,
      label: newMessages === 1 ? "Νέο μήνυμα" : "Νέα μηνύματα",
      detail: "Από τη φόρμα επικοινωνίας.",
      href: "/admin/engagement",
      tone: "warn",
    });
  }
  if (failedSyncs > 0) {
    attention.push({
      id: "sync",
      count: failedSyncs,
      label: failedSyncs === 1 ? "Συγχρονισμός με σφάλμα" : "Συγχρονισμοί με σφάλμα",
      detail: "Ο κατάλογος μπορεί να δείχνει παλιά δεδομένα.",
      href: "/admin/sync",
      tone: "urgent",
    });
  }

  return {
    attention,
    orders: {
      last7: orders7,
      last30: orders30,
      total: totalOrders,
      revenue7: Number(sums7._sum.totalGross ?? 0),
      revenue30: Number(sums30._sum.totalGross ?? 0),
    },
    recent: recentRows.map((o) => ({
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      status: o.status,
      paymentStatus: o.paymentStatus,
      totalGross: Number(o.totalGross),
      customer: o.companyName ?? `${o.firstName} ${o.lastName}`.trim(),
      erpPushed: o.erpPushedAt != null,
    })),
    catalogue: { products, active: activeProducts },
    sync: syncStates,
  };
}
