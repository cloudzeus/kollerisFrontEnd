import { upGreek } from "@/lib/greek";
import type { FaqPair } from "@/lib/seo/seo-fix-protocol";

export function SeoFaqList({ faq }: { faq: FaqPair[] }) {
  return (
    <>
      <h2 className="t-eyebrow mb-5 text-k-text-4">
        {upGreek("Συχνές ερωτήσεις")}
      </h2>
      <div className="max-w-[860px] border-t border-k-line">
        {faq.map((item) => (
          <details key={item.q} className="group border-b border-k-line">
            <summary className="flex cursor-pointer items-center justify-between gap-4 py-3.5 text-[length:var(--fs-14)] font-medium text-k-ink marker:content-none [&::-webkit-details-marker]:hidden">
              {item.q}
              <span
                aria-hidden
                className="shrink-0 text-k-text-4 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="max-w-[70ch] pb-4 text-[length:var(--fs-13-5)] leading-[1.7] text-k-text-2">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </>
  );
}
