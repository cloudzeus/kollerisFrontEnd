"use client";

import { useEffect } from "react";
import { trackLead, type LeadMethod } from "@/lib/analytics/ga4-events";

/** Μία φορά, όταν εμφανίζεται το μήνυμα επιτυχίας μιας φόρμας. */
export function LeadEvent({ method }: { method: LeadMethod }) {
  useEffect(() => trackLead(method), [method]);
  return null;
}
