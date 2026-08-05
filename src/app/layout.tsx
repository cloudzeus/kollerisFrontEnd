import type { Metadata } from "next";
import { IBM_Plex_Sans, Noto_Sans_Mono } from "next/font/google";
import localFont from "next/font/local";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { alternatesFor } from "@/lib/seo/urls";
import { siteJsonLd } from "@/lib/seo/structured-data";
import type { Locale } from "@/i18n/routing";

/*
 * Root layout owns <html>/<body> for BOTH trees — the localised storefront
 * under /[locale] and the Greek-only back office under /admin. `getLocale()`
 * reads what the next-intl middleware negotiated, so `lang` stays correct
 * without the storefront layout needing to own the document.
 */

/** Display face for headings, per the design handoff. */
const artegra = localFont({
  variable: "--font-artegra-face",
  display: "swap",
  src: [
    { path: "../../public/fonts/ArtegraSansExtended-ExtLt.otf", weight: "200", style: "normal" },
    { path: "../../public/fonts/ArtegraSansExtended-MedExp.otf", weight: "500", style: "normal" },
  ],
});
const plexSans = IBM_Plex_Sans({
  variable: "--font-sans-face",
  subsets: ["latin", "greek"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/*
 * Monospace face — NOT IBM Plex Mono, deliberately.
 *
 * The handoff specifies IBM Plex Mono for every technical label, and almost all
 * of them are Greek uppercase ("ΠΑΡΑΔΟΣΗ 24-48Ω", "ΟΛΕΣ ΟΙ 23 ΚΑΤΗΓΟΡΙΕΣ",
 * "ΚΩΔΙΚΟΙ ΣΕ ΑΜΕΣΗ ΔΙΑΘΕΣΙΜΟΤΗΤΑ"). IBM Plex Mono has no Greek glyphs at all —
 * verified against the full IBM release (@ibm/plex-mono 2.5.0: 1,207 glyphs,
 * no U+0370–03FF), not just the Google Fonts subset. The handoff's own font
 * link asks for `subset=greek,latin` and silently never gets it.
 *
 * The result was one label rendered in two faces: digits in Plex Mono, Greek in
 * the system monospace fallback, at visibly different sizes.
 *
 * Noto Sans Mono covers Latin + Greek in a single humanist monospace and sits
 * closest to Plex Mono's proportions, so each label is now one typeface.
 * Swappable for JetBrains Mono or Roboto Mono — both also carry Greek.
 */
const mono = Noto_Sans_Mono({
  variable: "--font-mono-face",
  subsets: ["latin", "greek"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/*
 * The site-wide default title and description.
 *
 * Every page sets its own, so this is what shows on the ones that do not — and
 * it is what a share preview quotes. Left static it was Greek in all three
 * languages, which is the one string a visitor sees before any page renders.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "layout" });
  return {
    /*
     * What every relative URL in metadata resolves against — canonical links,
     * share-preview images, `og:url`.
     *
     * Product pages already emit absolute CDN image URLs and so look fine
     * without it, which is exactly why this is easy to leave missing: the first
     * page that reaches for a relative path silently produces a broken preview.
     * The domain is written down once, in NEXT_PUBLIC_SITE_URL, and nowhere else.
     */
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    ),
    /*
     * The root canonical and the language alternates for `/`.
     *
     * Set here because the home page has no `generateMetadata` of its own, and
     * because with an unprefixed default locale `/` and `/en` and `/it` are
     * three addresses for one page. Without the alternates a crawler reads them
     * as duplicates competing with each other, and the two prefixed ones lose.
     *
     * Deeper pages override this with their own path.
     */
    alternates: alternatesFor("/", locale as Locale),
    /*
     * Search Console's HTML-tag verification, which is also what claims the
     * site for Merchant Center.
     *
     * The token is in the source rather than only in an environment variable,
     * because it is not a secret: it is published in this very tag for anyone
     * to read, and it identifies one property of one site — this one, whose
     * domain is already written into the Dockerfile. Making it a required
     * setting only added a step to a deployment chain that has already dropped
     * it three times. The variable still overrides, for a second property or a
     * staging domain.
     */
    verification: {
      // `||`, not `??`. A variable declared and left blank is the normal state
      // of a .env line, and `"" ?? fallback` is `""` — which shipped a page with
      // no verification tag at all while looking like it was configured.
      google:
        process.env.GOOGLE_SITE_VERIFICATION ||
        "KQ3VCyEKM40wz6J0F86WUhuE8kOmtOLKo0K7_aW6jl4",
    },
    title: {
      default: t("titlos_kolleris_ergaleia_epaggelmatikos"),
      template: "%s | Kolleris",
    },
    description: t("perigrafi_epaggelmatika_ergaleia_michanimata"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${plexSans.variable} ${mono.variable} ${artegra.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/*
          Who runs this shop, where it is, and how to search it.
          The product page already describes one item; this describes the
          business, which is what a knowledge panel is built from and what a
          language model has to quote when asked where to buy a tool in Piraeus.
          In the body rather than the head because Google reads it either way and
          a script in <head> delays first paint for nothing.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd(locale as Locale)) }}
        />
        {children}
      </body>
    </html>
  );
}
