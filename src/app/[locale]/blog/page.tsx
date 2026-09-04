import { useTranslations } from "next-intl";
import { pageMeta } from "@/lib/seo/urls";
import { getLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Image from "next/image";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { BlogMissingNotice } from "@/components/blog/BlogMissingNotice";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { BlogMethodMissing, getBlogPosts } from "@/lib/blog/blog";
import type { BlogListResponse } from "@/lib/blog/contract";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";
import { Zone } from "@/components/zones/Zone";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "blog.page" });
  const title = "Blog";
  const description = t("perigrafi_odigoi_dokimes_kai_technika");
  return {
    /* Canonical, γλώσσες και Open Graph μαζί: το `openGraph` κληρονομείται
       ολόκληρο από όποια σελίδα δεν ορίζει δικό της, οπότε 12 από 16 σελίδες
       μοιράζονταν με τον τίτλο της αρχικής. */
    ...pageMeta({ path: "/blog", locale, title, description }),
    title,
    description,
  };
}

/** Reading order: newest first, one lead article, the rest in a grid. */
export default async function BlogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("blog.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const raw = await searchParams;
  const page = Math.max(1, Number(Array.isArray(raw.page) ? raw.page[0] : raw.page) || 1);

  const [chrome, rootCategories, miniCart] = await Promise.all([
    Promise.all([getMenuTree(locale), getTopBrands(locale, 16), getCatalogueStats()]),
    getRootCategories(locale),
    getMiniCart(locale),
  ]);
  const [menuTree, brands, stats] = chrome;

  let data: BlogListResponse | null = null;
  let missing: string | null = null;
  try {
    data = await getBlogPosts(locale, page);
  } catch (error) {
    if (error instanceof BlogMethodMissing) missing = error.endpoint;
    else throw error;
  }

  const [lead, ...rest] = data?.posts ?? [];

  return (
    <>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />

      <main id="main">
        <Zone id="blog.top" locale={locale} />
        <div className="shell-x bg-k-ink-deep">
          <nav aria-label="Breadcrumb" className="t-util flex h-11 items-center gap-2.5 text-white/45">
            <Link href="/" className="text-white/60 hover:text-white">
              {upGreek(t("archiki"))}
            </Link>
            <span className="text-k-red">/</span>
            <span className="text-white">BLOG</span>
          </nav>
          <div className="pt-2.5 pb-8">
            <h1 className="font-display text-[22px] leading-[1.16] t-display text-balance text-white lg:text-[30px]">
              {upGreek(t("odigoi_kai_dokimes"))}
            </h1>
            <p className="mt-3.5 max-w-[600px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
              {t("ti_doyleyei_ti_ochi_kai")}
            </p>
          </div>
        </div>

        <section className="band-base">
          <div className="shell-x py-8 lg:py-12">
            {missing ? (
              <BlogMissingNotice endpoint={missing} />
            ) : !lead ? (
              <p className="border border-k-line bg-k-surface-2 px-5 py-16 text-center text-[13px] text-k-text-3">
                {upGreek(t("den_yparchoyn_akomi_dimosieymena_arthra"))}
              </p>
            ) : (
              <>
                <LeadCard post={lead} />

                {rest.length > 0 && (
                  <div className="mt-8 grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:mt-10 lg:grid-cols-3">
                    {rest.map((post) => (
                      <PostCard key={post.slug} post={post} />
                    ))}
                  </div>
                )}

                {data && data.totalPages > 1 && (
                  <nav
                    aria-label={t("selides")}
                    className="mt-8 flex flex-wrap items-center justify-center gap-1.5"
                  >
                    {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((n) => (
                      <Link
                        key={n}
                        href={n === 1 ? "/blog" : `/blog?page=${n}`}
                        aria-current={n === data.page ? "page" : undefined}
                        className={`t-nav-sub flex h-10 min-w-10 items-center justify-center border px-3 transition-colors ${
                          n === data.page
                            ? "border-k-ink bg-k-ink text-white"
                            : "border-k-line-2 bg-white text-k-text-3 hover:border-k-ink hover:text-k-ink"
                        }`}
                      >
                        {n}
                      </Link>
                    ))}
                  </nav>
                )}
              </>
            )}
          </div>
        </section>
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}

function LeadCard({ post }: { post: import("@/lib/blog/contract").BlogPostSummary }) {
  const t = useTranslations("blog.page");
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group/lead grid border border-k-line bg-white transition-colors hover:border-k-ink lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]"
    >
      <div className="flex flex-col justify-between gap-6 p-5 lg:p-8">
        <div>
          <p className="t-eyebrow flex items-center gap-2.5 text-k-red">
            <span aria-hidden className="rule-accent block shrink-0" />
            {upGreek(t("pio_prosfato"))}
          </p>
          <h2 className="font-display t-display mt-3.5 text-[20px] leading-[1.22] text-balance text-k-ink transition-colors group-hover/lead:text-k-red lg:text-[27px]">
            {post.title}
          </h2>
          {post.shortDescription && (
            <p className="mt-3.5 max-w-[56ch] text-[13.5px] leading-[1.7] text-k-text-2">
              {post.shortDescription}
            </p>
          )}
        </div>
        <PostMeta post={post} />
      </div>

      {post.image && (
        <span className="relative order-first min-h-[220px] overflow-hidden bg-k-surface-2 lg:order-last lg:min-h-[300px]">
          <Image
            src={post.image.url}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 440px"
            className="object-cover transition-transform duration-500 group-hover/lead:scale-[1.03]"
          />
        </span>
      )}
    </Link>
  );
}

function PostCard({ post }: { post: import("@/lib/blog/contract").BlogPostSummary }) {
  const t = useTranslations("blog.page");
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group/post flex flex-col bg-white transition-colors hover:bg-k-surface-2"
    >
      <span className="relative block h-[180px] overflow-hidden bg-k-surface-2">
        {post.image ? (
          <Image
            src={post.image.url}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover/post:scale-[1.04]"
          />
        ) : (
          <span className="t-brand-count flex h-full items-center justify-center text-k-text-5">
            {upGreek(t("choris_eikona"))}
          </span>
        )}
      </span>

      <span className="flex flex-1 flex-col gap-2.5 p-5">
        <span className="font-display t-display block text-[15px] leading-[1.3] text-k-ink transition-colors group-hover/post:text-k-red">
          {post.title}
        </span>
        {post.shortDescription && (
          <span className="line-clamp-3 block text-[12.5px] leading-[1.6] text-k-text-3">
            {post.shortDescription}
          </span>
        )}
        <span className="mt-auto pt-2">
          <PostMeta post={post} />
        </span>
      </span>
    </Link>
  );
}

// Async because it needs `t`, and a server component may be awaited where it is
// rendered — cheaper than threading the one label down from both call sites.
async function PostMeta({ post }: { post: import("@/lib/blog/contract").BlogPostSummary }) {
  const locale = await getLocale();
  const t = await getTranslations("blog.page");
  const date = new Date(post.publishedAt);
  return (
    <span className="t-brand-count flex flex-wrap items-center gap-2.5 text-k-text-4">
      <time dateTime={post.publishedAt}>
        {Number.isNaN(date.getTime())
          ? "—"
          : date.toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" })}
      </time>
      {post.readingMinutes != null && (
        <>
          <span aria-hidden className="block h-[12px] w-px bg-k-line-2" />
          <span>{upGreek(t("anagnosi", { readingMinutes: post.readingMinutes }))}</span>
        </>
      )}
    </span>
  );
}
