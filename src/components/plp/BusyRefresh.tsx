"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { scheduleRefresh } from "@/components/plp/busy-refresh";

/**
 * Re-renders the busy listing once after a few seconds.
 *
 * `router.refresh()` and not a `<meta http-equiv="refresh">`: it asks the
 * server for the same route again without a full document load, keeps the
 * scroll and client state, and — unlike a meta refresh — stops when the
 * visitor navigates away (the timer is cleared on unmount). One refresh per
 * mount: if the gate is still full, the next busy view schedules the next.
 */
export function BusyRefresh({ afterMs = 5_000 }: { afterMs?: number }) {
  const router = useRouter();
  useEffect(() => scheduleRefresh(() => router.refresh(), afterMs), [router, afterMs]);
  return null;
}
