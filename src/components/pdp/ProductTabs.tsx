"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { SectionHead } from "@/components/chrome/SectionHead";
import { Expandable } from "@/components/ui/Expandable";
import { formatSpecValue, stripRestatement } from "@/lib/catalog/spec-format";
import type { ProductDetail } from "@/lib/catalog/pdp";
import { upGreek } from "@/lib/greek";

/**
 * Description / Specs / Shipping.
 *
 * All three panels are rendered into the markup and only hidden with `hidden`,
 * so the spec table is in the HTML for crawlers even when Description is the
 * tab on screen.
 *
 * Layout notes, because this section was the worst offender on the page:
 *
 *  - The short description is the LEAD — set large, on its own, behind a red
 *    keyline. It is the one sentence a customer actually reads, and it used to
 *    be a bold paragraph indistinguishable from the wall of text under it.
 *  - The long description runs in CSS columns rather than one 3xl-wide block.
 *    At 2500px a single column of 13px text was a 200-character line, which is
 *    roughly three times a readable measure.
 *  - Specs go three-up at xl. Twenty-six rows in two columns is a scroll;
 *    in three it is a glance.
 */
export function ProductTabs({ product }: { product: ProductDetail }) {
  const t = useTranslations("pdp.ProductTabs");
  const tabs = [
    { key: "description", label: t("perigrafi"), show: true },
    {
      key: "specs",
      label: product.specs.length
        ? t("charaktiristika_me_plithos", { count: product.specs.length })
        : t("charaktiristika"),
      show: true,
    },
    { key: "shipping", label: t("apostoli_epistrofes"), show: true },
  ] as const;

  const longText = stripRestatement(
    product.longDescription ?? "",
    product.shortDescription,
  );
  const body = longText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  /*
   * Six specs beside the lead. Measurements first — a customer scanning a
   * description wants voltage and torque, not "Χρώμα: Μαύρο". `category`,
   * `subcategory` and `brand` are dropped because the breadcrumb, the buy
   * column and the brand band already say all three.
   */
  const HIGHLIGHT_ORDER = [
    "voltage",
    "wattage",
    "maxTorque",
    "torque",
    "maxSpeed",
    "chuckSize",
    "bladeDiameter",
    "material",
    "powerSource",
    "model",
  ];
  const highlights = product.specs
    .filter((row) => HIGHLIGHT_ORDER.includes(row.fieldKey) && row.value.trim())
    .sort(
      (a, b) =>
        HIGHLIGHT_ORDER.indexOf(a.fieldKey) -
        HIGHLIGHT_ORDER.indexOf(b.fieldKey),
    )
    .slice(0, 6);

  const [active, setActive] = useState<(typeof tabs)[number]["key"]>(
    product.longDescription
      ? "description"
      : product.specs.length
        ? "specs"
        : "shipping",
  );

  return (
    <section className="band-alt border-t border-k-line">
      <div className="pdp-band py-8 lg:py-12">
        <div className="pdp-inner">
          <SectionHead eyebrow={t("technikos_fakelos")} title={t("stoicheia_proiontos")} />

          {/*
            The tab bar sits UNDER its own heading, full width, not in the
            section head's right-hand meta slot. Parked out there it ended up
            a metre from the title it belonged to, and nothing said the two
            were related.
          */}
          <div
            role="tablist"
            className="mt-6 flex flex-wrap gap-1.5 border-b border-k-line lg:mt-8"
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                type="button"
                aria-selected={active === tab.key}
                onClick={() => setActive(tab.key)}
                className={`t-nav-sub -mb-px cursor-pointer border-b-2 px-4 py-3.5 whitespace-nowrap transition-colors duration-200 lg:px-6 ${
                  active === tab.key
                    ? "border-k-red text-k-ink"
                    : "border-transparent text-k-text-4 hover:text-k-ink"
                }`}
              >
                {upGreek(tab.label)}
              </button>
            ))}
          </div>

          <div className="pt-7 lg:pt-9">
            {/* ── Description ── */}
            <div role="tabpanel" hidden={active !== "description"}>
              {body.length > 0 ? (
                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_clamp(320px,30%,420px)] lg:gap-14">
                  {/*
                    Long copy only — the short description is the lead in the
                    buy column, and the generated long text usually opens by
                    restating it word for word.

                    No CSS columns. The copy is often only 400-600 characters,
                    and splitting that into three columns left two of them
                    empty; a single column at a readable measure fills the row
                    honestly instead of faking density.
                  */}
                  <Expandable
                    lines={9}
                    collapsible={longText.length > 700}
                    className="max-w-[78ch] text-[13.5px] leading-[1.8] text-k-text-2"
                  >
                    {body.map((paragraph, index) => (
                      <p key={index} className="mb-4 last:mb-0">
                        {paragraph}
                      </p>
                    ))}
                  </Expandable>

                  {highlights.length > 0 && (
                    <aside className="self-start border border-k-line bg-white">
                      <p className="flex items-center gap-2.5 border-b border-k-line px-5 py-3.5">
                        <span
                          aria-hidden
                          className="rule-accent block shrink-0"
                        />
                        <span className="t-eyebrow text-k-red">
                          {upGreek(t("me_mia_matia"))}
                        </span>
                      </p>
                      <dl>
                        {highlights.map((row) => (
                          <div
                            key={row.fieldKey}
                            className="flex items-baseline gap-4 border-b border-k-line px-5 py-2.5 last:border-b-0"
                          >
                            <dt className="w-1/2 shrink-0 text-[12.5px] leading-[1.4] text-k-text-3">
                              {row.label}
                            </dt>
                            <dd className="min-w-0 flex-1 font-mono text-[12.5px] font-medium text-k-ink">
                              {formatSpecValue(row.value, row.unit)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <button
                        type="button"
                        onClick={() => setActive("specs")}
                        className="t-card-cta w-full cursor-pointer border-t border-k-line bg-k-surface-2 px-5 py-3.5 text-left text-k-ink transition-colors hover:bg-k-ink hover:text-white"
                      >
                        {upGreek(
                          t("kai_ta_ola_charaktiristika", { count: product.specs.length }),
                        )}{" "}
                        →
                      </button>
                    </aside>
                  )}
                </div>
              ) : (
                <p className="t-body text-k-text-4">
                  {t("den_yparchei_akomi_analytiki_perigrafi")}
                </p>
              )}
            </div>

            {/* ── Specs ── */}
            <div role="tabpanel" hidden={active !== "specs"}>
              {product.specGroups.length > 0 ? (
                <div className="grid gap-8 md:grid-cols-2 lg:gap-x-14 xl:grid-cols-3">
                  {product.specGroups.map((group) => (
                    <div key={group.group} className="break-inside-avoid">
                      <p className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="rule-accent block shrink-0"
                        />
                        <span className="t-eyebrow text-k-red">
                          {upGreek(group.label)}
                        </span>
                      </p>
                      <dl className="mt-3.5 border-t border-k-line">
                        {group.rows.map((row) => (
                          <div
                            key={row.fieldKey}
                            className="flex items-baseline gap-4 border-b border-k-line py-2.5 transition-colors hover:bg-k-surface-2"
                          >
                            <dt className="w-1/2 shrink-0 text-[12.5px] leading-[1.4] text-k-text-3">
                              {row.label}
                            </dt>
                            <dd className="min-w-0 flex-1 font-mono text-[12.5px] font-medium text-k-ink">
                              {formatSpecValue(row.value, row.unit)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="t-body text-k-text-4">
                  {t("ta_technika_charaktiristika_gia_ayton")}
                </p>
              )}
            </div>

            {/* ── Shipping ── */}
            <div role="tabpanel" hidden={active !== "shipping"}>
              <div className="grid gap-px border border-k-line bg-k-line sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    title: t("paradosi_24_48_ores"),
                    body: t("paradosi_body"),
                  },
                  {
                    title: t("dorean_metaforika_150"),
                    body: t("dorean_metaforika_body"),
                  },
                  {
                    title: t("epistrofi_14_imeres"),
                    body: t("epistrofi_body"),
                  },
                  {
                    title: t("eggyisi_kataskeyasti"),
                    body: product.guaranteeMonths
                      ? t("eggyisi_mines", { months: product.guaranteeMonths })
                      : t("episimi_eggyisi_kataskeyasti_servis_kai"),
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="border-l-[3px] border-k-red bg-white px-5 py-4"
                  >
                    <p className="text-[13px] leading-[1.35] font-semibold text-k-ink">
                      {item.title}
                    </p>
                    <p className="mt-1.5 text-[12.5px] leading-[1.6] text-k-text-3">
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
