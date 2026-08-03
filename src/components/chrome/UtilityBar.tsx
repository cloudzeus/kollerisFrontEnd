import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { LOCALE_LABELS, routing, type Locale } from "@/i18n/routing";
import { upGreek } from "@/lib/greek";

/**
 * Utility strip. Two distinct layouts per the handoff:
 *   mobile 390 — 32px, one centred claim, no locale switcher, no phone
 *   desktop 1440 — 36px, three claims left, locale + phone right
 *
 * The design also carried a ΜΕ ΦΠΑ / ΧΩΡΙΣ ΦΠΑ toggle — removed on the client's
 * instruction: every displayed price is VAT-inclusive.
 */
export function UtilityBar({
  locale,
  productCount,
  brandCount,
}: {
  locale: Locale;
  productCount: number;
  brandCount: number;
}) {
  const t = useTranslations("chrome.UtilityBar");
  const counts = `${productCount.toLocaleString(locale)}+ ${upGreek(t("kodikoi"))} · ${brandCount} BRANDS`;

  return (
    <>
      {/* Mobile — single condensed claim, centred. */}
      <div className="header-utility t-util flex h-8 items-center justify-center gap-2 bg-k-ink text-white/75 lg:hidden">
        <span className="block h-1 w-1 bg-k-red" />
        {upGreek(t("paradosi_24_48o_dorean_ano"))}
      </div>

      {/*
        Desktop. The handoff lays this out at 1440; the three claims need ~750px
        in a Greek-capable monospace, so between 1024 and 1440 they are dropped
        right-to-left rather than allowed to wrap inside the fixed 36px bar.
      */}
      <div className="header-utility t-util shell-x hidden h-9 items-center justify-between gap-6 overflow-hidden bg-k-ink text-white/72 lg:flex">
        <div className="flex items-center gap-[22px] whitespace-nowrap">
          <span className="flex items-center gap-2">
            <Image src="/icons/truck.png" alt="" width={17} height={17} className="block" />
            {upGreek(t("paradosi_24_48o_se_oli"))}
          </span>
          <span className="hidden text-white/24 xl:inline">/</span>
          <span className="hidden xl:inline">
            {upGreek(t("dorean_apostoli_ano_ton_150"))}
          </span>
          <span className="hidden text-white/24 2xl:inline">/</span>
          <span className="hidden 2xl:inline">{counts}</span>
        </div>

        <div className="flex shrink-0 items-center gap-[18px] whitespace-nowrap">
          <div className="flex border border-white/18">
            {routing.locales.map((code) => (
              <Link
                key={code}
                href="/"
                locale={code}
                aria-current={code === locale ? "true" : undefined}
                className={`t-lang px-2.5 py-[5px] transition-colors ${
                  code === locale ? "bg-k-red text-white" : "text-white/60 hover:text-white"
                }`}
              >
                {LOCALE_LABELS[code]}
              </Link>
            ))}
          </div>
          <span className="text-white/24">/</span>
          <a
            href="tel:+302104111355"
            className="whitespace-nowrap text-white transition-colors hover:text-k-red"
          >
            {t("t_30_210_411_1355")}
          </a>
        </div>
      </div>
    </>
  );
}
