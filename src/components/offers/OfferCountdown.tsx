"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * The time left, ticking.
 *
 * Server-rendered with the first reading so the markup is never empty, then
 * updated every second in the browser. The unit labels are keys rather than
 * words for the same reason everything else is — "ημέρες" would pin this widget
 * to one language.
 *
 * Past the deadline it says so instead of counting negative, which is the state
 * a forgotten campaign is actually in.
 */

const UNITS = ["imeres", "ores", "lepta", "deyt"] as const;

function split(target: number, now: number): number[] | null {
  const ms = target - now;
  if (ms <= 0) return null;
  return [
    Math.floor(ms / 86_400_000),
    Math.floor((ms % 86_400_000) / 3_600_000),
    Math.floor((ms % 3_600_000) / 60_000),
    Math.floor((ms % 60_000) / 1000),
  ];
}

export function OfferCountdown({ endsAt }: { endsAt: string | null }) {
  const t = useTranslations("offers.OfferCountdown");
  const target = endsAt ? new Date(endsAt).getTime() : null;
  const [parts, setParts] = useState<number[] | null>(() =>
    target ? split(target, Date.now()) : null,
  );

  useEffect(() => {
    if (!target) return;
    const tick = () => setParts(split(target, Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);

  if (!target) {
    return (
      <p className="text-[12.5px] text-white/50">{t("choris_imerominia_lixis_den_yparchei")}</p>
    );
  }

  if (!parts) return <p className="text-[13px] font-medium text-white/70">{t("i_prosfora_elixe")}</p>;

  return (
    <ul className="flex items-start gap-2 motion-safe:animate-[offer-rise_.6s_cubic-bezier(.22,1,.36,1)_both] motion-safe:[animation-delay:120ms]">
      {parts.map((value, i) => (
        <li key={UNITS[i]} className="min-w-[3.6rem] border border-white/15 px-2 py-1.5">
          <span className="numeral block text-[24px] font-semibold leading-none text-white lg:text-[30px]">
            {String(value).padStart(2, "0")}
          </span>
          <span className="mt-1 block text-[9.5px] uppercase tracking-[0.1em] text-white/45">
            {t(UNITS[i])}
          </span>
        </li>
      ))}
    </ul>
  );
}
