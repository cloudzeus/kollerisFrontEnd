/**
 * Inbox shapes and labels.
 *
 * Split from `inbox.ts` because the client components need the types and the
 * topic labels, and `inbox.ts` carries `server-only` plus Prisma. Same split as
 * the settings and zone registries: definitions here, I/O there.
 *
 * Client-safe: no Prisma, no network.
 */

export type InboxFilter = "new" | "inProgress" | "answered" | "closed" | "all";

export const INBOX_FILTERS: ReadonlyArray<{ id: InboxFilter; label: string }> = [
  { id: "new", label: "Νέα" },
  { id: "inProgress", label: "Σε εξέλιξη" },
  { id: "answered", label: "Απαντήθηκαν" },
  { id: "closed", label: "Κλειστά" },
  { id: "all", label: "Όλα" },
] as const;

export const TOPIC_LABEL: Record<string, string> = {
  technical: "Τεχνική ερώτηση",
  quote: "Αίτημα προσφοράς",
  partnership: "Συνεργασία",
  order: "Παραγγελία",
  other: "Άλλο",
};

export type InboxMessage = {
  id: string;
  topic: string;
  status: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  vatNumber: string | null;
  subject: string;
  message: string;
  orderRef: string | null;
  pagePath: string | null;
  createdAt: Date;
  handledBy: string | null;
  handledAt: Date | null;
  notes: string | null;
  /** Hours since arrival, for the "waiting" marker on the new queue. */
  waitingHours: number;
};

export type InboxPage = {
  messages: InboxMessage[];
  counts: Record<InboxFilter, number>;
};
