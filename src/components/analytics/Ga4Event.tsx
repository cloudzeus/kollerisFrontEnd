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
}: {
  name: string;
  params: { value?: number; items: Ga4Item[]; [k: string]: unknown };
  onceKey?: string;
}) {
  const payload = JSON.stringify(params);
  useEffect(() => {
    const key = onceKey ? `ga4-sent:${onceKey}` : null;
    try {
      if (key && localStorage.getItem(key)) return;
    } catch {
      /* storage blocked: send anyway — GA4 also dedupes purchases by transaction_id */
    }
    ga4Event(name, JSON.parse(payload));
    try {
      if (key) localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, [name, payload, onceKey]);
  return null;
}
