"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { requestEmailProofAction } from "@/lib/account/actions";

/**
 * Asks the customer to prove their email before guest orders are shown.
 *
 * Shown only to accounts that have not proven it. The wording never says
 * whether guest orders exist: "if you ordered as a guest, they will appear",
 * which is true either way.
 *
 * Strings come from the page (server translations), so the three locales stay
 * in the message files with everything else.
 */
export function EmailProofPanel({
  text,
}: {
  text: {
    title: string;
    body: string;
    steps: string[];
    button: string;
    sending: string;
    sent: string;
    sentHint: string;
  };
}) {
  const [state, action, pending] = useActionState(requestEmailProofAction, {});

  return (
    <section
      aria-live="polite"
      className="mb-6 border border-k-line border-l-[3px] border-l-k-red bg-k-surface-2 px-4 py-4 lg:px-6 lg:py-5"
    >
      <div className="flex items-start gap-3">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-k-red" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-k-ink">{text.title}</p>

          {state.sent ? (
            <>
              <p className="mt-1.5 text-[13px] leading-[1.6] text-k-text-2">{text.sent}</p>
              <p className="mt-1 text-[12.5px] leading-[1.6] text-k-text-3">{text.sentHint}</p>
            </>
          ) : (
            <>
              <p className="mt-1.5 max-w-[62ch] text-[13px] leading-[1.6] text-k-text-2">{text.body}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-[12.5px] leading-[1.6] text-k-text-3">
                {text.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {state.error && (
                <p role="alert" className="mt-3 text-[12.5px] text-k-red">
                  {state.error}
                </p>
              )}
              <form action={action} className="mt-4">
                <button
                  type="submit"
                  disabled={pending}
                  className="t-btn-sm min-h-11 bg-k-ink px-6 py-3 text-white transition-colors hover:bg-k-red disabled:opacity-50"
                >
                  {pending ? text.sending : text.button}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
