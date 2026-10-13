"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { upGreek } from "@/lib/greek";
import {
  acceptOfferAction,
  declineOfferAction,
  type RequestActionState,
} from "@/lib/requests/actions";

/**
 * «Αποδοχή & πληρωμή» / «Απόρριψη», and the time left.
 *
 * Two plain forms posting to server actions, so they work before hydration.
 * They send the token and the offer version the customer is looking at —
 * nothing else; the amount is computed on the server from the stored offer.
 */
export function RequestActions({
  token,
  offerVersion,
  expiresAt,
  mode,
}: {
  token: string;
  offerVersion: number | null;
  /** ISO, for the countdown. Null when there is nothing to count down. */
  expiresAt: string | null;
  /** offer: accept + decline · pay: an accepted, unpaid request (pay again). */
  mode: "offer" | "pay";
}) {
  const t = useTranslations("aitima.page");
  const router = useRouter();
  const [acceptState, accept, accepting] = useActionState<RequestActionState, FormData>(acceptOfferAction, {});
  const [declineState, decline, declining] = useActionState<RequestActionState, FormData>(declineOfferAction, {});
  const [confirming, setConfirming] = useState(false);

  // The page itself is server-rendered from the order; after a decline (or a
  // refused accept) it has to be read again to show the new state.
  useEffect(() => {
    if (declineState.done || declineState.error || acceptState.error) router.refresh();
  }, [declineState, acceptState.error, router]);

  const error = acceptState.error ?? declineState.error;
  const busy = accepting || declining;

  return (
    <div className="mt-4">
      {mode === "offer" && expiresAt && <Countdown expiresAt={expiresAt} label={t("remaining")} />}

      {error && (
        <p role="alert" className="mb-3 border-l-[3px] border-k-red bg-k-red/8 px-4 py-3 text-[12.5px] text-k-ink">
          {t(`error_${error}`)}
        </p>
      )}
      {declineState.done && (
        <p role="status" className="mb-3 border-l-[3px] border-k-line-2 bg-k-surface-2 px-4 py-3 text-[12.5px] text-k-ink">
          {t("declined_done")}
        </p>
      )}

      <form action={accept}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="offerVersion" value={offerVersion ?? ""} />
        <button
          type="submit"
          disabled={busy}
          className="t-btn flex h-14 w-full items-center justify-center bg-k-red text-white transition-colors hover:bg-k-red-hover disabled:opacity-50"
        >
          {accepting ? upGreek(t("pending")) : `${upGreek(mode === "pay" ? t("pay_again") : t("accept"))} →`}
        </button>
      </form>
      <p className="mt-2 text-[11.5px] leading-[1.5] text-k-text-4">{t("pay_hint")}</p>

      {mode === "offer" && (
        <form
          action={decline}
          className="mt-3"
          onSubmit={(event) => {
            if (!confirming) {
              event.preventDefault();
              setConfirming(true);
            }
          }}
        >
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="offerVersion" value={offerVersion ?? ""} />
          {confirming && <p className="mb-2 text-[12px] text-k-ink">{t("decline_confirm")}</p>}
          <button
            type="submit"
            disabled={busy}
            className="t-btn-sm flex h-11 w-full items-center justify-center border-[1.5px] border-k-ink text-k-ink transition-colors hover:bg-k-ink hover:text-white disabled:opacity-50"
          >
            {declining ? upGreek(t("pending")) : upGreek(t("decline"))}
          </button>
        </form>
      )}
    </div>
  );
}

function Countdown({ expiresAt, label }: { expiresAt: string; label: string }) {
  const end = Date.parse(expiresAt);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  // Nothing on the server render: the clock there is not the visitor's.
  if (now == null || !Number.isFinite(end)) return null;
  const left = Math.max(0, end - now);
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const text = days > 0 ? `${days}d ${hours}h` : `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return (
    <p className="mb-3 flex items-baseline justify-between border border-k-line px-4 py-3">
      <span className="t-account-label text-k-text-4">{upGreek(label)}</span>
      <span className="font-mono text-[16px] font-semibold tabular-nums text-k-ink">{text}</span>
    </p>
  );
}
