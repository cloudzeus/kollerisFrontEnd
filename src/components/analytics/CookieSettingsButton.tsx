"use client";

import { OPEN_COOKIE_SETTINGS } from "@/components/analytics/CookieConsent";

/** Reopens the consent banner so a visitor can change their answer. */
export function CookieSettingsButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS))}>
      {label}
    </button>
  );
}
