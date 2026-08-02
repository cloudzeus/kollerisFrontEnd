import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { clearCompareForm, removeFromCompareForm } from "@/lib/compare/actions";
import { COMPARE_MAX, type CompareTrayView } from "@/lib/compare/options";
import { upGreek } from "@/lib/greek";

/**
 * The compare tray — a SERVER component.
 *
 * Everything it shows comes from the selection cookie, read on the server, so
 * an empty tray costs the browser nothing at all: it is simply not in the HTML.
 * Remove and clear are plain `<form action={serverAction}>` posts, which means
 * no client component is involved even though the tray is interactive.
 *
 * Fixed to the bottom of the viewport and full-bleed like every other dark
 * band on the site: the bar itself runs edge to edge, while `.shell-x` caps
 * what is inside it so the thumbnails line up with the grid they came from.
 */
export function CompareTray({ tray }: { tray: CompareTrayView }) {
  const t = useTranslations("compare.CompareTray");
  if (tray.items.length === 0) return null;

  const slots = Array.from(
    { length: COMPARE_MAX },
    (_, i) => tray.items[i] ?? null,
  );
  const href = `/sygkrisi?ids=${tray.slugs.join(",")}`;

  return (
    <>
      {/* Rendered after the footer, so this reserves the height the fixed bar
          covers rather than letting it sit on the legal line. */}
      <div aria-hidden className="h-[88px] lg:h-[96px]" />

      <div className="fixed inset-x-0 bottom-0 z-40">
        <div className="shell-x bg-k-ink-deep text-white shadow-[0_-10px_30px_rgba(0,0,0,.22)]">
          <div className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:py-3.5">
            <div className="flex min-w-0 items-center gap-3 lg:gap-5">
              <p className="hidden shrink-0 lg:block">
                <span className="t-eyebrow block text-k-red">
                  {upGreek(t("sygkrisi"))}
                </span>
                <span className="t-brand-count block text-white/45">
                  {tray.scopeLabel
                    ? upGreek(tray.scopeLabel)
                    : upGreek(t("idia_katigoria"))}
                </span>
              </p>

              {/* Empty slots are drawn, not omitted — they are what tells the
                customer how many more they may add. */}
              <ul className="flex min-w-0 flex-1 items-center gap-1.5 lg:gap-2.5">
                {slots.map((item, index) =>
                  item ? (
                    <li
                      key={item.slug}
                      className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center border border-white/15 bg-white lg:h-[64px] lg:w-[64px]"
                    >
                      <Link
                        href={`/proion/${item.slug}`}
                        title={item.name}
                        className="block p-1.5"
                      >
                        {item.image ? (
                          <Image
                            src={item.image}
                            alt={item.name}
                            width={120}
                            height={120}
                            className="h-full max-h-[46px] w-auto object-contain"
                          />
                        ) : (
                          <span className="t-brand-count block px-1 text-center text-k-text-4">
                            {item.brandName ?? "—"}
                          </span>
                        )}
                      </Link>

                      <form
                        action={removeFromCompareForm}
                        className="absolute -top-2 -right-2"
                      >
                        <input type="hidden" name="slug" value={item.slug} />
                        <button
                          type="submit"
                          aria-label={t("afairesi_apo_ti_sygkrisi", { name: item.name })}
                          className="flex h-5 w-5 items-center justify-center border border-white/25 bg-k-ink text-[11px] leading-none text-white transition-colors hover:border-k-red hover:bg-k-red"
                        >
                          ×
                        </button>
                      </form>
                    </li>
                  ) : (
                    <li
                      key={`slot-${index}`}
                      aria-hidden
                      className="hidden h-[58px] w-[58px] shrink-0 items-center justify-center border border-dashed border-white/18 text-white/25 sm:flex lg:h-[64px] lg:w-[64px]"
                    >
                      +
                    </li>
                  ),
                )}
              </ul>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              <form action={clearCompareForm}>
                <button
                  type="submit"
                  className="t-brand-count px-2 py-3 text-white/45 underline-offset-4 transition-colors hover:text-white hover:underline"
                >
                  {upGreek(t("katharismos"))}
                </button>
              </form>

              <Link
                href={href}
                className="t-btn-sm flex h-11 flex-1 items-center justify-center gap-2 bg-k-red px-5 text-white transition-colors hover:bg-k-red-hover lg:flex-none lg:px-7"
              >
                {upGreek(t("sygkrisi"))} ({tray.items.length}) →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
