import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { Truck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/lib/account/guard";
import { claimGuestOrders, listCustomerOrders } from "@/lib/account/orders";
import { formatMoney } from "@/lib/format";
import { upGreek } from "@/lib/greek";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "paraggelies.page" });
  return { title: t("titlos"), robots: { index: false, follow: false } };
}

/**
 * My orders.
 *
 * For every customer, not only companies. The account area had a nav entry for
 * this and no page behind it, and the reason it could not be written is that
 * checkout never recorded who placed an order: the `customerId` column existed
 * and was never filled, so every order in the database was orphaned from its
 * account. It is written now, and this reads it.
 *
 * Orders placed before today still have no `customerId`, and so do orders placed
 * as a guest before registering, which is how most accounts begin. Those are
 * matched on the email address and adopted on sight, so a customer sees their
 * history rather than an empty page that is technically correct.
 *
 * Each row opens the confirmation page, which already shows the progress steps,
 * the lines, the totals and the courier reference. A second order-detail page
 * would be the same page written twice.
 */
export default async function OrdersPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("paraggelies.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const { user } = await requireCustomer(locale, "/logariasmos/paraggelies");

  // Stamp the guest orders onto the account, so the index on `customerId` can
  // answer next time instead of a case-insensitive scan on email.
  await claimGuestOrders(user.id, user.email);
  const orders = await listCustomerOrders(user.id, user.email);

  /*
   * Resolved here rather than looked up by a key built at render time.
   * `t(MAP[status])` cannot be checked by anything that reads the source, and
   * the message-key test says so — which is the point of having it. Every call
   * below is a literal, so a status that loses its translation fails the build
   * instead of rendering its own key to a customer.
   */
  const statusLabel: Record<string, string> = {
    PENDING_PAYMENT: t("status_pending_payment"),
    CONFIRMED: t("status_confirmed"),
    PACKING: t("status_packing"),
    SHIPPED: t("status_shipped"),
    DELIVERED: t("status_delivered"),
    CANCELLED: t("status_cancelled"),
    FAILED: t("status_failed"),
  };

  return (
    <AccountChrome locale={locale}>
      <AccountShell user={user} active="/logariasmos/paraggelies" title={t("titlos")}>
        {orders.length === 0 ? (
          /*
           * An empty state that says what to do, not just that there is nothing.
           * A new account with no orders is the normal first visit, not an error.
           */
          <div className="border border-k-line bg-k-surface-2 px-5 py-10 text-center lg:py-14">
            <p className="text-[14px] font-semibold text-k-ink">{t("kamia_paraggelia")}</p>
            <p className="mx-auto mt-2 max-w-[44ch] text-[12.5px] leading-[1.6] text-k-text-3">
              {t("kamia_paraggelia_body")}
            </p>
            <Link
              href="/proionta"
              className="t-btn-sm mt-5 inline-block bg-k-ink px-6 py-3.5 text-white transition-colors hover:bg-k-red"
            >
              {upGreek(t("ston_katalogo"))} →
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-px border border-k-line bg-k-line">
            {orders.map((order) => (
              <li key={order.id} className="bg-white">
                <Link
                  // The guest token is what makes the confirmation page open.
                  // It belongs to this order and this customer owns it.
                  href={`/checkout/epibebaiosi/${order.orderNumber}?t=${order.guestToken}`}
                  className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-k-surface-2 sm:flex-row sm:items-center sm:gap-6 lg:px-6 lg:py-5"
                >
                  {/* The picture first. An order number is a string nobody
                      memorised; the tool in the box is what they remember. */}
                  {order.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={order.image}
                      alt=""
                      className="size-12 shrink-0 border border-k-line object-contain"
                    />
                  ) : (
                    <span className="size-12 shrink-0 border border-k-line bg-k-surface-2" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-[13px] font-semibold tabular-nums text-k-ink">
                        {order.orderNumber}
                      </span>
                      <span className="t-brand-count text-k-text-4">
                        {order.createdAt.toLocaleDateString(locale, {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    {/* What was in it, in the customer's words rather than a count. */}
                    <p className="mt-1 truncate text-[12.5px] text-k-text-3">
                      {order.preview.join(", ")}
                      {order.itemCount > order.preview.length &&
                        ` ${t("kai_alla", { n: order.itemCount - order.preview.length })}`}
                    </p>
                    {/* The courier reference, where the question is asked. */}
                    {order.voucherNo && (
                      <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-k-text-3">
                        <Truck className="size-3" aria-hidden />
                        <span className="font-mono tabular-nums">ACS {order.voucherNo}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 sm:gap-6">
                    <span
                      className={`t-stat-label uppercase ${
                        order.status === "FAILED" || order.status === "CANCELLED"
                          ? "text-k-text-4"
                          : "text-k-red"
                      }`}
                    >
                      {upGreek(statusLabel[order.status] ?? statusLabel.CONFIRMED)}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[13.5px] font-semibold tabular-nums text-k-ink sm:ml-0">
                      {formatMoney(order.totalGross, locale)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AccountShell>
    </AccountChrome>
  );
}
