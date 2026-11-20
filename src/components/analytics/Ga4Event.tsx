"use client";

import { useEffect } from "react";
import { ga4Event, type Ga4Item } from "@/lib/analytics/ga4-events";

/**
 * Sends one GA4 event when a server-rendered page mounts (view_item,
 * begin_checkout, purchase). `onceKey`: sent at most once per browser for that
 * key, so reloading the confirmation page does not count the order twice.
 */
export function Ga4Event({
  name,
  params,
  onceKey,
  skip,
}: {
  name: string;
  params: { value?: number; items: Ga4Item[]; [k: string]: unknown };
  onceKey?: string;
  /** Κανάλια που τα στέλνει ο server· η σελίδα τα παραλείπει. */
  skip?: { ga4: boolean; meta: boolean };
}) {
  const payload = JSON.stringify(params);
  const skipGa4 = skip?.ga4 ?? false;
  const skipMeta = skip?.meta ?? false;
  useEffect(() => {
    const key = onceKey ? `ga4-sent:${onceKey}` : null;
    try {
      if (key && localStorage.getItem(key)) return;
    } catch {
      /* storage blocked: send anyway — GA4 also dedupes purchases by transaction_id */
    }
    if (skipGa4 && skipMeta) return;
    ga4Event(name, JSON.parse(payload), { ga4: !skipGa4, meta: !skipMeta });
    try {
      if (key) localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, [name, payload, onceKey, skipGa4, skipMeta]);
  return null;
}
