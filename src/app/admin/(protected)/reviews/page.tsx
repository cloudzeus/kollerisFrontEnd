import { PageShell } from "@/components/admin/PageShell";
import { ReviewQueue } from "@/components/admin/reviews/ReviewQueue";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Η ουρά μετριασμού.
 *
 * Οι εκκρεμείς πρώτες και μόνες στην κορυφή: μια κριτική που περιμένει είναι
 * δουλειά, μια κριτική που κρίθηκε είναι αρχείο. Ανακατεμένες, η δουλειά
 * κρύβεται μέσα στο αρχείο και ο χρόνος απάντησης μεγαλώνει σιωπηλά.
 */
export default async function ReviewsPage() {
  const [pending, decided] = await Promise.all([
    prisma.productReview.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: REVIEW_SELECT,
    }),
    prisma.productReview.findMany({
      where: { status: { in: ["approved", "rejected"] } },
      orderBy: { moderatedAt: "desc" },
      take: 40,
      select: REVIEW_SELECT,
    }),
  ]);

  return (
    <PageShell
      title="Αξιολογήσεις"
      description="Κριτικές πελατών που έχουν παραλάβει το προϊόν. Δημοσιεύονται μόνο μετά από έγκριση."
    >
      <ReviewQueue
        pending={pending.map(toView)}
        decided={decided.map(toView)}
      />
    </PageShell>
  );
}

const REVIEW_SELECT = {
  id: true,
  rating: true,
  title: true,
  body: true,
  status: true,
  moderationNote: true,
  moderatedAt: true,
  moderatedBy: true,
  orderNumber: true,
  createdAt: true,
  product: { select: { slug: true, name: true } },
  customer: { select: { firstName: true, lastName: true, email: true } },
} as const;

type Row = Awaited<ReturnType<typeof prisma.productReview.findMany<{ select: typeof REVIEW_SELECT }>>>[number];

function toView(row: Row) {
  return {
    id: row.id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    status: row.status,
    moderationNote: row.moderationNote,
    moderatedBy: row.moderatedBy,
    orderNumber: row.orderNumber,
    createdAt: row.createdAt.toISOString(),
    productSlug: row.product.slug,
    productName: row.product.name,
    customerName: `${row.customer.firstName} ${row.customer.lastName}`.trim(),
    customerEmail: row.customer.email,
  };
}
