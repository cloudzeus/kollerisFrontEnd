"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@/generated/prisma/enums";

/**
 * Order tracking, without an account.
 *
 * Deliberately unauthenticated: the customer who most needs this is the guest
 * who ordered once, and making them create an account to ask "where is my
 * parcel" is how a support call happens instead.
 *
 * The pair (order number + email) is the credential. Both must match, and the
 * failure message is the same either way — otherwise the form becomes an oracle
 * for which order numbers exist.
 */

export type TrackedStep = {
  status: OrderStatus;
  label: string;
  at: string | null;
  done: boolean;
  current: boolean;
};

export type TrackedOrder = {
  orderNumber: string;
  placedAt: string;
  status: OrderStatus;
  statusLabel: string;
  paymentLabel: string;
  shippingMethod: string;
  totalGross: number;
  itemCount: number;
  lines: Array<{ name: string; sku: string; quantity: number; image: string | null }>;
  steps: TrackedStep[];
  /** ACS voucher, once the parcel is handed over. */
  voucher: string | null;
  shippedAt: string | null;
  city: string;
};

export type TrackState =
  | { state: "idle" }
  | { state: "error"; message: string }
  | { state: "found"; order: TrackedOrder };

const schema = z.object({
  orderNumber: z.string().trim().min(4).max(32),
  email: z.email().max(320),
});

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Αναμονή πληρωμής",
  CONFIRMED: "Επιβεβαιωμένη",
  SHIPPED: "Απεστάλη",
  DELIVERED: "Παραδόθηκε",
  CANCELLED: "Ακυρώθηκε",
  FAILED: "Η πληρωμή απέτυχε",
};

const PAYMENT_LABELS: Record<string, string> = {
  card: "Κάρτα",
  iris: "IRIS",
  bank: "Τραπεζική κατάθεση",
  // Kept although the method is no longer offered: this map renders orders that
  // were already placed, and a missing entry would show a raw "cod".
  cod: "Αντικαταβολή",
  credit: "Επί πιστώσει",
};

const SHIPPING_LABELS: Record<string, string> = {
  courier: "ACS Courier",
  express: "ACS Express",
  pickup: "Παραλαβή από Πειραιά",
};

/** The happy path, in order. Cancelled and failed orders bypass it. */
const FLOW: Array<{ status: OrderStatus; label: string }> = [
  { status: "PENDING_PAYMENT", label: "Καταχωρήθηκε" },
  { status: "CONFIRMED", label: "Επιβεβαιώθηκε" },
  { status: "SHIPPED", label: "Έφυγε από την αποθήκη" },
  { status: "DELIVERED", label: "Παραδόθηκε" },
];

export async function trackOrder(_prev: TrackState, formData: FormData): Promise<TrackState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  const generic =
    "Δεν βρέθηκε παραγγελία με αυτόν τον αριθμό και αυτό το email. Ελέγξτε τα και δοκιμάστε ξανά.";

  if (!parsed.success) return { state: "error", message: generic };

  const order = await prisma.order.findFirst({
    where: {
      orderNumber: parsed.data.orderNumber.trim().toUpperCase(),
      email: parsed.data.email.trim().toLowerCase(),
    },
    include: {
      lines: { select: { name: true, sku: true, quantity: true, imageUrl: true } },
      history: { orderBy: { createdAt: "asc" }, select: { status: true, createdAt: true } },
    },
  });

  if (!order) return { state: "error", message: generic };

  const reached = new Map<OrderStatus, Date>();
  for (const event of order.history) {
    if (!reached.has(event.status)) reached.set(event.status, event.createdAt);
  }
  // The order exists, so it was at least placed — even if nothing wrote history.
  if (!reached.has("PENDING_PAYMENT")) reached.set("PENDING_PAYMENT", order.createdAt);

  const currentIndex = FLOW.findIndex((s) => s.status === order.status);

  const steps: TrackedStep[] = FLOW.map((step, index) => ({
    status: step.status,
    label: step.label,
    at: reached.get(step.status)?.toISOString() ?? null,
    // A step counts as done if we passed it, whether or not a history row was
    // written — statuses can jump when payment and confirmation land together.
    done: currentIndex >= 0 && index < currentIndex,
    current: step.status === order.status,
  }));

  return {
    state: "found",
    order: {
      orderNumber: order.orderNumber,
      placedAt: order.createdAt.toISOString(),
      status: order.status,
      statusLabel: STATUS_LABELS[order.status],
      paymentLabel: PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod,
      shippingMethod: SHIPPING_LABELS[order.shippingMethod] ?? order.shippingMethod,
      totalGross: Number(order.totalGross),
      itemCount: order.lines.reduce((n, l) => n + l.quantity, 0),
      lines: order.lines.map((l) => ({
        name: l.name,
        sku: l.sku,
        quantity: l.quantity,
        image: l.imageUrl,
      })),
      steps,
      voucher: order.acsVoucherNo,
      shippedAt: order.shippedAt?.toISOString() ?? null,
      city: order.shipCity,
    },
  };
}
