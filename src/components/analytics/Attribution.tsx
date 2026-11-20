"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { rememberClick } from "@/lib/analytics/attribution-client";
import { trackLead } from "@/lib/analytics/ga4-events";

/**
 * Κρατά από ποια διαφήμιση ή σύνδεσμο ήρθε ο επισκέπτης (μόνο με συγκατάθεση)
 * και μετρά τα κλικ σε τηλέφωνο και email ως επαφή.
 */
export function Attribution() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    rememberClick(new URL(window.location.href));
  }, [pathname, search]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.("a[href^='tel:'], a[href^='mailto:']");
      if (!a) return;
      trackLead(a.getAttribute("href")!.startsWith("tel:") ? "phone" : "email");
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
