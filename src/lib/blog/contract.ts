/**
 * Blog contract with HDCtool.
 *
 * HDCtool already owns the content: `Post`, `PostTranslation` (el/en/it) and
 * `PostImage` exist there, with an editor behind `/api/posts`. That route
 * authenticates with a better-auth COOKIE session, which the storefront does
 * not have — it holds a bearer from `/api/public/auth`. So the posts need a
 * public counterpart, and the shapes below mirror HDCtool's own models field
 * for field so that endpoint is a serialisation and not a translation layer.
 *
 * Listed as H16–H17 in BACKEND_ALIGNMENT.md §3. Client-safe: no Prisma, no
 * network — `blog.ts` does the calling.
 */

export type BlogImage = {
  url: string;
  mainImage: boolean;
  width: number | null;
  height: number | null;
};

export type BlogPostSummary = {
  slug: string;
  title: string;
  shortDescription: string | null;
  image: BlogImage | null;
  publishedAt: string;
  updatedAt: string;
  /** Reading time in minutes, computed from `content` by HDCtool. */
  readingMinutes: number | null;
};

export type BlogPost = BlogPostSummary & {
  /** Sanitised HTML. HDCtool's editor is the only writer. */
  content: string;
  images: BlogImage[];
};

export type BlogListResponse = {
  posts: BlogPostSummary[];
  total: number;
  page: number;
  totalPages: number;
};
