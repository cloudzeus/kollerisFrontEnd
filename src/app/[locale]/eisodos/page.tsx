import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { SignInForm } from "@/components/account/AuthForms";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCustomerSession } from "@/lib/account/session";
import { upGreek } from "@/lib/greek";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "eisodos.page" });
  return {
    title: t("titlos_syndesi"),
    robots: { index: false, follow: false },
  };
}

/**
 * Sign in.
 *
 * Deliberately does NOT explain which of email or password was wrong, and does
 * not say whether an account exists — the action returns one message for both.
 */
export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("eisodos.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCustomerSession();
  if (session.state === "signed-in") redirect("/logariasmos");

  const raw = await searchParams;
  const redirectTo = typeof raw.redirect === "string" ? raw.redirect : undefined;

  return (
    <AccountChrome locale={locale}>
      <main id="main">
        <div className="shell-x bg-k-ink-deep">
          <nav aria-label="Breadcrumb" className="t-util flex h-11 items-center gap-2.5 text-white/45">
            <Link href="/" className="text-white/60 hover:text-white">
              {upGreek(t("archiki"))}
            </Link>
            <span className="text-k-red">/</span>
            <span className="text-white">{upGreek(t("syndesi"))}</span>
          </nav>
          <div className="pt-2.5 pb-7">
            <h1 className="font-display text-[22px] leading-[1.16] font-medium text-white lg:text-[30px]">
              {upGreek(t("syndesi"))}
            </h1>
            <p className="mt-3.5 max-w-[560px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
              {t("paraggelies_eggyiseis_kai_dieythynseis_se")}
            </p>
          </div>
        </div>

        <div className="shell-w bg-white lg:grid lg:grid-cols-[1fr_420px] lg:items-start">
          <div className="min-w-0 px-4 py-8 lg:px-10 lg:py-12">
            <div className="max-w-md">
              <SignInForm redirectTo={redirectTo} />

              {/*
                Both ways back in, on the page where somebody discovers they
                cannot get in. A forgotten password and "I bought as a guest and
                want an account" feel like one problem to whoever is stuck, so
                they lead to one page that asks which it is.
              */}
              <p className="mt-5 text-[13px] leading-[1.6] text-k-text-3">
                <Link
                  href="/eisodos/prosvasi"
                  className="text-k-ink underline-offset-2 hover:underline"
                >
                  Ξεχάσατε τον κωδικό σας;
                </Link>
                {" · "}
                <Link
                  href="/eisodos/prosvasi"
                  className="text-k-ink underline-offset-2 hover:underline"
                >
                  Έχετε παραγγείλει χωρίς λογαριασμό;
                </Link>
              </p>
            </div>
          </div>

          <aside className="border-t border-k-line bg-k-surface-2 px-4 py-8 lg:border-t-0 lg:border-l lg:px-8 lg:py-12">
            <p className="t-eyebrow text-k-red">{upGreek(t("etairikos_logariasmos"))}</p>
            <p className="font-display mt-2.5 text-[18px] leading-[1.28] text-k-ink">
              {upGreek(t("agorazete_gia_etaireia"))}
            </p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {[
                t("times_synergati_se_olo_ton"),
                t("pliromi_epi_pistosei_kai_timologio"),
                t("polloi_christes_me_roloys_kai"),
                t("istoriko_paraggelion_olis_tis_etaireias"),
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[12.5px] leading-[1.55] text-k-text-2">
                  <span aria-hidden className="mt-1.5 block h-1.5 w-1.5 shrink-0 bg-k-red" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/eggrafi"
              className="t-btn-sm mt-6 inline-block border-[1.5px] border-k-ink px-7 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
            >
              {upGreek(t("aitisi_b2b"))} →
            </Link>
          </aside>
        </div>
      </main>
    </AccountChrome>
  );
}
