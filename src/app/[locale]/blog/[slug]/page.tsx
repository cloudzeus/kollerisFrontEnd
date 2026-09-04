import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { BlogMissingNotice } from "@/components/blog/BlogMissingNotice";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { BlogMethodMissing, getBlogPost } from "@/lib/blog/blog";
import type { BlogPost } from "@/lib/blog/contract";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";
import { Zone } from "@/components/zones/Zone";

type PageProps = { params: Promise<{ locale: Locale; slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  try {
    const post = await getBlogPost(slug, locale);
    if (!post) return {};
    return {
      title: post.title,
      description: post.shortDescription ?? undefined,
      openGraph: {
        title: post.title,
        type: "article",
        publishedTime: post.publishedAt,
        images: post.image ? [post.image.url] : undefined,
      },
    };
  } catch {
    // The endpoint is not there yet; the page itself explains that.
    return { title: "Blog" };
  }
}

export default async function BlogPostPage({ params }: PageProps) {
  const t = await getTranslations("blog.page");
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [menuTree, brands, stats, rootCategories, miniCart] = await Promise.all([
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
  ]);

  let post: BlogPost | null = null;
  let missing: string | null = null;
  try {
    post = await getBlogPost(slug, locale);
  } catch (error) {
    if (error instanceof BlogMethodMissing) missing = error.endpoint;
    else throw error;
  }

  // A real 404 only once the endpoint exists — otherwise every article URL
  // would look permanently dead rather than not-yet-wired.
  if (!missing && !post) notFound();

  const date = post ? new Date(post.publishedAt) : null;

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
        <div className="shell-x bg-k-ink-deep">
          <nav
            aria-label="Breadcrumb"
            className="t-util flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-1 py-2 text-white/45"
          >
            <Link href="/" className="shrink-0 text-white/60 hover:text-white">
              {upGreek(t("archiki"))}
            </Link>
            <span className="text-k-red">/</span>
            <Link href="/blog" className="shrink-0 text-white/60 hover:text-white">
              BLOG
            </Link>
            {post && (
              <>
                <span className="text-k-red">/</span>
                <span className="truncate text-white">{post.title}</span>
              </>
            )}
          </nav>

          {post && (
            <div className="max-w-[68ch] pt-2.5 pb-9">
              <h1 className="font-display text-[24px] leading-[1.18] font-medium text-balance text-white lg:text-[36px]">
                {post.title}
              </h1>
              {post.shortDescription && (
                <p className="mt-4 text-[14px] leading-[1.7] text-white/65 lg:text-[16px]">
                  {post.shortDescription}
                </p>
              )}
              <p className="t-brand-count mt-5 flex flex-wrap items-center gap-2.5 text-white/45">
                {date && !Number.isNaN(date.getTime()) && (
                  <time dateTime={post.publishedAt}>
                    {date.toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </time>
                )}
                {post.readingMinutes != null && (
                  <>
                    <span aria-hidden className="block h-[12px] w-px bg-white/20" />
                    <span>{upGreek(t("anagnosi", { readingMinutes: post.readingMinutes }))}</span>
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        <section className="band-base">
          <div className="shell-x py-8 lg:py-12">
            {missing ? (
              <BlogMissingNotice endpoint={missing} />
            ) : (
              post && (
                <article className="mx-auto max-w-[70ch]">
                  {post.image && (
                    <span className="relative mb-8 block h-[240px] overflow-hidden bg-k-surface-2 lg:mb-10 lg:h-[420px]">
                      <Image
                        src={post.image.url}
                        alt=""
                        fill
                        priority
                        sizes="(max-width: 1024px) 100vw, 70ch"
                        className="object-cover"
                      />
                    </span>
                  )}

                  {/*
                    HDCtool's editor is the only writer and sanitises on the way
                    in; this renders what it stored. If the editor ever opens to
                    untrusted authors, sanitise HERE too — the storefront must
                    not be the only place that trusts it.
                  */}
                  <div
                    className="prose-kolleris"
                    dangerouslySetInnerHTML={{ __html: post.content }}
                  />
                </article>
              )
            )}
          </div>
        </section>

        <section className="band-alt border-t border-k-line">
          <div className="shell-x flex flex-wrap items-center justify-between gap-4 py-7">
            <p className="text-[13px] text-k-text-3">
              {t("erotisi_gia_kati_apo_to")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/blog"
                className="t-btn-sm border-[1.5px] border-k-ink px-6 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
              >
                ← {upGreek(t("ola_ta_arthra"))}
              </Link>
              <a
                href="tel:+302104111355"
                className="t-btn-sm bg-k-ink px-6 py-3.5 text-white transition-colors hover:bg-k-red"
              >
                210 411 1355
              </a>
            </div>
          </div>
        </section>
        <Zone id="article.below" locale={locale} />
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
