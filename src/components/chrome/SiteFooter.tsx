import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { CategoryTile } from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";

const SOCIALS = ["FB", "IG", "IN"];
const PAYMENTS = ["VISA", "MC", "MAESTRO", "IRIS", "PAYPAL"];

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
        { href: "/logariasmos/entopismos", label: "Εντοπισμός παραγγελίας" },
        { href: "/logariasmos/epistrofes", label: "Επιστροφές" },
        { href: "/logariasmos/eggyiseis", label: "Εγγυήσεις" },
        { href: "/syxnes-erotiseis", label: "Συχνές ερωτήσεις" },
        { href: "/epikoinonia", label: "Επικοινωνία" },
      ],
    },
    {
      title: upGreek(t("i_etaireia")),
      links: [
        { href: "/etaireia", label: "Ποιοι είμαστε" },
        { href: "/brands", label: "Brands" },
        { href: "/prosfores", label: "Προσφορές" },
        { href: "/blog", label: "Blog" },
        { href: "/eisodos", label: "Λογαριασμός B2B" },
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
                key={social}
                href="#"
                aria-label={social}
                className="t-social flex h-9 w-9 items-center justify-center border border-white/18 text-white/72 transition-colors hover:border-k-red hover:text-white"
              >
                {social}
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

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 lg:mt-0 lg:border-t lg:border-white/10 lg:py-[22px]">
        <p className="t-footer-legal text-white/40">
          © {new Date().getFullYear()} Kolleris Bros IKE
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
    </footer>
  );
}
