import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { CategoryTile } from "@/lib/catalog/queries";
import { GoogleReviewsBadge } from "@/components/seo/GoogleReviewsBadge";
import { upGreek } from "@/lib/greek";

const PAYMENTS = ["VISA", "MC", "MAESTRO", "IRIS", "PAYPAL"];

/**
 * Real accounts, not placeholders — the same four Google's own Merchant
 * Center "social profiles" panel asks for, so this list and that panel stay
 * in step by construction rather than by remembering to update both.
 */
const SOCIALS = [
  { label: "TikTok", short: "TT", href: "https://www.tiktok.com/@kolleris_tools_official" },
  { label: "Facebook", short: "FB", href: "https://www.facebook.com/kolleristools/" },
  { label: "Instagram", short: "IG", href: "https://www.instagram.com/kolleris_tools/" },
  { label: "LinkedIn", short: "IN", href: "https://gr.linkedin.com/company/kolleris-bros-ike" },
] as const;

/**
 * The legal small print. Every one of these 404'd or didn't exist until now —
 * which is most of what Google's Merchant Center flagged as Misrepresentation:
 * a machine reading the site for "can this business be trusted" found a
 * returns link and a warranty link that both led nowhere, and no terms, no
 * privacy policy, no stated payment methods or shipping policy at all.
 */
const LEGAL_LINKS = [
  { href: "/oroi-chrisis", key: "oroi_chrisis" },
  { href: "/aporrito", key: "aporrito" },
  { href: "/tropoi-pliromis", key: "tropoi_pliromis" },
  { href: "/apostoli-paradosi", key: "apostoli_paradosi" },
] as const;

/**
 * Footer. Handoff: four columns on desktop; on mobile the link columns collapse
 * to accordion headers (`<details>`, so it works without JavaScript) and the
 * payment row drops.
 *
 * The category column is live from the projection.
 */
export function SiteFooter({ categories }: { categories: CategoryTile[] }) {
  const t = useTranslations("chrome.SiteFooter");
  const columns = [
    {
      title: upGreek(t("katigories")),
      links: categories.slice(0, 6).map((c) => ({
        href: `/katalogos/${c.slug}`,
        label: upGreek(c.name),
      })),
    },
    {
      title: upGreek(t("exypiretisi")),
      links: [
        { href: "/logariasmos/entopismos", label: t("entopismos_paraggelias") },
        { href: "/epistrofes", label: t("epistrofes") },
        { href: "/eggyiseis", label: t("eggyiseis") },
        { href: "/syxnes-erotiseis", label: t("sychnes_erotiseis") },
        { href: "/epikoinonia", label: t("epikoinonia") },
      ],
    },
    {
      title: upGreek(t("i_etaireia")),
      links: [
        { href: "/etaireia", label: t("poioi_eimaste") },
        { href: "/brands", label: "Brands" },
        { href: "/prosfores", label: t("prosfores") },
        { href: "/blog", label: "Blog" },
        { href: "/eisodos", label: t("logariasmos_b2b") },
      ],
    },
  ];

  return (
    <footer className="bg-k-ink-deep shell-x py-7 lg:pt-14 lg:pb-0">
      <div className="lg:grid lg:grid-cols-[300px_1fr_1fr_1fr] lg:gap-12 lg:pb-11">
        <div>
          <Image
            src="/brand/logo-horizontal-white.png"
            alt="Kolleris"
            width={170}
            height={38}
            className="block h-auto w-[140px] lg:w-[170px]"
          />
          <p className="t-footer-tag mt-3 text-white/40 lg:mt-4">
            PROFESSIONAL TOOLS · SINCE 1978
          </p>
          <div className="mt-5 hidden gap-2.5 lg:flex">
            {SOCIALS.map((social) => (
              <a
                key={social.href}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
                className="t-social flex h-9 w-9 items-center justify-center border border-white/18 text-white/72 transition-colors hover:border-k-red hover:text-white"
              >
                {social.short}
              </a>
            ))}
          </div>
        </div>

        {/* Mobile: collapsible sections. `<details>` needs no JavaScript. */}
        <div className="mt-5 border-t border-white/10 lg:hidden">
          {columns.map((column) => (
            <details key={column.title} className="border-b border-white/10">
              <summary className="t-footer-col flex cursor-pointer items-center justify-between py-4 text-white marker:content-none">
                {column.title}
                <span className="text-[15px] text-k-red">+</span>
              </summary>
              <ul className="flex flex-col gap-2.5 pb-4">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="t-footer-link text-white/58">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>

        {/* Desktop: open columns. */}
        {columns.map((column) => (
          <div key={column.title} className="hidden lg:block">
            <p className="t-footer-col mb-[18px] text-white">{column.title}</p>
            <ul className="flex flex-col gap-2.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="t-footer-link text-white/58 transition-colors hover:text-k-red"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:mt-0 lg:border-t lg:border-white/10 lg:py-[18px]">
        <nav aria-label={upGreek(t("nomika"))} className="flex flex-wrap gap-x-5 gap-y-2">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="t-footer-legal text-white/45 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="t-footer-legal text-white/40">
            {/* The registered legal entity, not a marketing name — it must
                match what HDCtool and every order document say. */}
            © {new Date().getFullYear()} ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ
            <br className="lg:hidden" />
            <span className="hidden lg:inline"> · </span>
            {t("k_mayromichali_4_18545_peiraias")}
          </p>
          <div className="hidden items-center gap-2 lg:flex">
            {PAYMENTS.map((payment) => (
              <span
                key={payment}
                className="t-pay flex h-[26px] items-center border border-white/16 px-[9px] text-white/55"
              >
                {payment}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/*
        The Google seller rating. Renders as a floating badge in the bottom
        corner rather than here in the flow — that is the widget's own
        behaviour, not a layout choice; see the component. Mounted from the
        footer so it appears on storefront pages only, never in /admin.
      */}
      <GoogleReviewsBadge />
    </footer>
  );
}
