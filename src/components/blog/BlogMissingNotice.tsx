import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { upGreek } from "@/lib/greek";

/**
 * Shown until HDCtool exposes the posts publicly.
 *
 * Names the endpoint, and says what already exists on the other side — the
 * `Post`, `PostTranslation` and `PostImage` models and their editor are all
 * there. Whoever picks this up should not have to discover that first.
 */
export function BlogMissingNotice({ endpoint }: { endpoint: string }) {
  const t = useTranslations("blog.BlogMissingNotice");
  return (
    <div className="border-l-[3px] border-k-amber bg-k-surface-2 p-5 lg:p-8">
      <p className="t-eyebrow text-k-amber">{upGreek(t("den_echei_energopoiithei_akomi"))}</p>
      <p className="font-display mt-2.5 text-[18px] leading-[1.3] text-k-ink lg:text-[22px]">
        {upGreek(t("ta_arthra_perimenoyn_to_hdctool"))}
      </p>
      <p className="mt-3 max-w-2xl text-[13px] leading-[1.7] text-k-text-2">
        {t("to_periechomeno_yparchei_idi_ta")} <span className="font-mono text-k-text-3">Post</span>,{" "}
        <span className="font-mono text-k-text-3">PostTranslation</span> {t("el_en_it_kai")}{" "}
        <span className="font-mono text-k-text-3">PostImage</span> {t("einai_sto_hdctool_mazi_me")}{" "}
        <span className="font-mono text-k-text-3">/api/posts</span> {t("zita_cookie_session_eno_to")}
      </p>
      <p className="mt-4 font-mono text-[12px] break-all text-k-text-3">
        <span className="mr-2 bg-k-ink px-1.5 py-0.5 text-white">404</span>
        {endpoint}
      </p>
      <p className="mt-4 text-[12px] leading-[1.6] text-k-text-4">
        {t("to_symvolaio_h16_h17_einai")}{" "}
        <span className="font-mono text-k-text-3">src/lib/blog/contract.ts</span> {t("kai_sto")}{" "}
        <span className="font-mono text-k-text-3">BACKEND_ALIGNMENT.md §3</span>.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/nees-afixeis"
          className="t-btn-sm bg-k-ink px-6 py-3.5 text-white transition-colors hover:bg-k-red"
        >
          {upGreek(t("nees_afixeis"))} →
        </Link>
        <Link
          href="/etaireia"
          className="t-btn-sm border-[1.5px] border-k-ink px-6 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
        >
          {upGreek(t("i_etaireia"))}
        </Link>
      </div>
    </div>
  );
}
