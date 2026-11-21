import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { buildCustomerMatchCsv } from "@/lib/newsletter/customer-match";

export const dynamic = "force-dynamic";

/**
 * CSV for Google Ads → Audience manager → Customer list.
 *
 * Only confirmed subscribers from the checkout checkbox: that is the only place
 * where people agreed to see Kolleris ads. Phone and postcode come from their
 * latest order, which is where they typed them.
 */
export async function GET() {
  const session = await auth();
  assertCan(session?.user.role, "customers");

  const people = await prisma.newsletterSubscriber.findMany({
    where: { status: "confirmed", source: "checkout" },
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });

  const rows = await Promise.all(
    people.map(async ({ email }) => {
      const order = await prisma.order.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        select: { phone: true, firstName: true, lastName: true, shipCountry: true, shipPostcode: true },
      });
      return {
        email,
        phone: order?.phone,
        firstName: order?.firstName,
        lastName: order?.lastName,
        country: order?.shipCountry,
        zip: order?.shipPostcode,
      };
    }),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(buildCustomerMatchCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kolleris-customer-match-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
