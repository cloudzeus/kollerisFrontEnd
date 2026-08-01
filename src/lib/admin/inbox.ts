import "server-only";
import { prisma } from "@/lib/prisma";
import type { InboxFilter, InboxPage } from "@/lib/admin/inbox-types";

export * from "@/lib/admin/inbox-types";

/**
 * The contact inbox.
 *
 * Ordered oldest-first inside the "new" queue and newest-first everywhere else.
 * That is deliberate: unanswered messages are a queue and the one waiting
 * longest is the one to answer, while a closed archive is browsed from the top.
 * Sorting everything newest-first is how the oldest unanswered message quietly
 * becomes three days old.
 */

export async function getInbox(filter: InboxFilter = "new"): Promise<InboxPage> {
  const where = filter === "all" ? {} : { status: filter as never };

  const [rows, newCount, inProgress, answered, closed, all] = await Promise.all([
    prisma.contactMessage.findMany({
      where,
      // Oldest first while something is waiting on us; newest first once it is
      // not our move.
      orderBy: { createdAt: filter === "new" || filter === "inProgress" ? "asc" : "desc" },
      take: 100,
    }),
    prisma.contactMessage.count({ where: { status: "new" } }),
    prisma.contactMessage.count({ where: { status: "inProgress" } }),
    prisma.contactMessage.count({ where: { status: "answered" } }),
    prisma.contactMessage.count({ where: { status: "closed" } }),
    prisma.contactMessage.count(),
  ]);

  const now = Date.now();

  return {
    messages: rows.map((m) => ({
      id: m.id,
      topic: m.topic,
      status: m.status,
      name: m.name,
      email: m.email,
      phone: m.phone,
      company: m.company,
      vatNumber: m.vatNumber,
      subject: m.subject,
      message: m.message,
      orderRef: m.orderRef,
      pagePath: m.pagePath,
      createdAt: m.createdAt,
      handledBy: m.handledBy,
      handledAt: m.handledAt,
      notes: m.notes,
      waitingHours: Math.floor((now - m.createdAt.getTime()) / 3_600_000),
    })),
    counts: { new: newCount, inProgress, answered, closed, all },
  };
}

/**
 * Move a message along.
 *
 * `handledBy` and `handledAt` are stamped on every change, not only on the
 * first: when a message has been through three people, the useful question is
 * who touched it last.
 */
export async function setStatus(
  id: string,
  status: "new" | "inProgress" | "answered" | "closed",
  actor: string,
): Promise<void> {
  await prisma.contactMessage.update({
    where: { id },
    data: { status, handledBy: actor.slice(0, 120), handledAt: new Date() },
  });
}

/** Internal note. Never shown to the customer — it is the handover between us. */
export async function setNotes(id: string, notes: string, actor: string): Promise<void> {
  await prisma.contactMessage.update({
    where: { id },
    data: { notes: notes.slice(0, 4000), handledBy: actor.slice(0, 120), handledAt: new Date() },
  });
}
