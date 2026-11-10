"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Viva sends the customer back before its webhook has marked the order paid,
 * so the confirmation page can render "awaiting payment" for a card that was
 * just charged. Nothing re-rendered it, so the customer never saw the thank-you
 * and the `purchase` event (GA4, Google Ads, Meta) was never sent.
 *
 * Re-reads the page every 3 seconds for a minute; it unmounts itself as soon as
 * the server renders the order as paid.
 */
export function AwaitPaymentRefresh() {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const id = setInterval(() => {
      if (++tries > 20) return clearInterval(id);
      router.refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
