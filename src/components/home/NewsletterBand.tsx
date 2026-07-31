import { upGreek } from "@/lib/greek";

/**
 * Newsletter band. Handoff: stacked 48px input + 48px button on mobile,
 * side-by-side 52px row on desktop.
 *
 * The form posts nowhere yet — `subscribeNewsletter` and the
 * `NewsletterSubscriber` model land with the engagement phase. Disabled rather
 * than wired to a no-op so it cannot silently swallow a real address.
 */
export function NewsletterBand() {
  return (
    <section className="shell-x flex flex-col gap-3 bg-k-red py-[26px] lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-10 lg:py-[42px]">
      <div>
        <p className="t-news-title text-white">{upGreek("Εγγραφή στο newsletter")}</p>
        <p className="t-news-body mt-1.5 hidden text-white/86 lg:block">
          Νέα προϊόντα, προσφορές και τεχνικά tips — μία φορά τον μήνα.
        </p>
      </div>

      <form className="flex flex-col gap-3 lg:min-w-[520px] lg:flex-row lg:gap-0">
        <label htmlFor="newsletter-email" className="sr-only">
          Το email σας
        </label>
        <input
          id="newsletter-email"
          type="email"
          name="email"
          disabled
          placeholder="Το email σας"
          className="t-input h-12 border-0 bg-white px-3.5 text-k-ink outline-none disabled:bg-white/90 lg:h-[52px] lg:flex-1 lg:px-[18px]"
        />
        <button
          type="submit"
          disabled
          className="t-btn-sm h-12 border-0 bg-k-ink text-white disabled:opacity-70 lg:h-[52px] lg:px-[30px]"
        >
          {upGreek("Εγγραφή")}
        </button>
      </form>
    </section>
  );
}
