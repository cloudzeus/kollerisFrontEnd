import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { upGreek } from "@/lib/greek";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "anamoni.page" });
  return {
    title: t("titlos_i_aitisi_sas_katachorithike"),
    robots: { index: false, follow: false },
  };
}

/** `title` and `body` are message keys — the list renders them through `t`. */
const STEPS = [
  {
    n: "01",
    title: "vima_01_titlos",
    body: "vima_01_keimeno",
    done: true,
  },
  {
    n: "02",
    title: "vima_02_titlos",
    body: "vima_02_keimeno",
    done: false,
  },
  {
    n: "03",
    title: "vima_03_titlos",
    body: "vima_03_keimeno",
    done: false,
  },
];

/**
 * B2B registration lands here, NOT in the account area.
 *
 * A company account is created pending, so signing the applicant in would put
 * them in an account that cannot yet do the one thing they registered for.
 */
export default async function PendingApprovalPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("anamoni.page");
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <AccountChrome locale={locale}>
      <main id="main">
        <div className="shell-x bg-k-ink-deep py-10 lg:py-14">
          <p className="t-eyebrow text-k-red">{upGreek(t("aitisi_b2b"))}</p>
          <h1 className="font-display mt-3 text-[24px] leading-[1.16] t-display text-white lg:text-[32px]">
            {upGreek(t("i_aitisi_sas_katachorithike"))}
          </h1>
          <p className="mt-3.5 max-w-[600px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
            {t("o_etairikos_logariasmos_energopoieitai_meta")}
          </p>
        </div>

        <section className="shell-x bg-white py-8 lg:py-12">
          <ol className="grid gap-px border border-k-line bg-k-line lg:grid-cols-3">
            {STEPS.map((step) => (
              <li
                key={step.n}
                className="flex flex-col gap-2 bg-white p-5 lg:p-6"
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`t-cat-num ${step.done ? "text-k-green" : "text-k-text-5"}`}
                  >
                    {step.n}
                  </span>
                  {step.done && (
                    <span
                      aria-hidden
                      className="block h-1.5 w-1.5 bg-k-green"
                    />
                  )}
                </span>
                <span className="text-[13.5px] font-semibold text-k-ink">
                  {t(step.title)}
                </span>
                <span className="text-[12.5px] leading-[1.6] text-k-text-3">
                  {t(step.body)}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/katalogos"
              className="t-btn-sm bg-k-ink px-7 py-4 text-white transition-colors hover:bg-k-red"
            >
              {upGreek(t("ston_katalogo"))} →
            </Link>
            <a
              href="tel:+302104111355"
              className="t-btn-sm border-[1.5px] border-k-ink px-7 py-4 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
            >
              {upGreek(t("t_210_411_1355"))}
            </a>
          </div>
        </section>
      </main>
    </AccountChrome>
  );
}
