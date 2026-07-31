import type { Metadata } from "next";
import { IBM_Plex_Sans, Noto_Sans_Mono } from "next/font/google";
import localFont from "next/font/local";
import { getLocale } from "next-intl/server";
import "./globals.css";

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

export const metadata: Metadata = {
  title: {
    default: "Kolleris — Εργαλεία & Επαγγελματικός Εξοπλισμός",
    template: "%s | Kolleris",
  },
  description:
    "Επαγγελματικά εργαλεία, μηχανήματα και αναλώσιμα. Άμεση διαθεσιμότητα, τιμές συνεργάτη.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${plexSans.variable} ${mono.variable} ${artegra.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
