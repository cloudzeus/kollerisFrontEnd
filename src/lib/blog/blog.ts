import "server-only";
import { cache } from "react";
import { HdctoolError, hdctoolRequest } from "@/lib/hdctool/client";
import type { Locale } from "@/i18n/routing";
import { watchUrl } from "@/lib/blog/article-video";
import type { BlogListResponse, BlogPost, BlogVideo } from "@/lib/blog/contract";

/**
 * Blog reads, through HDCtool.
 *
 * The endpoints do not exist yet — see `contract.ts` for why — so a 404 becomes
 * `BlogMethodMissing` and the pages render a notice naming the exact path.
 * Deliberately not stubbed with sample posts: fake content on a blog is the
 * placeholder that survives to production, because it looks finished.
 */

const BASE = "/api/public/posts";

export class BlogMethodMissing extends Error {
  constructor(readonly endpoint: string) {
    super(`HDCtool has not implemented ${endpoint} yet`);
    this.name = "BlogMethodMissing";
  }
}

async function call<T>(endpoint: string): Promise<T> {
  try {
    return await hdctoolRequest<T>(endpoint, undefined, { method: "GET" });
  } catch (error) {
    if (error instanceof HdctoolError && error.status === 404) {
      throw new BlogMethodMissing(endpoint);
    }
    throw error;
  }
}

export const getBlogPosts = cache(
  (locale: Locale, page = 1, perPage = 12): Promise<BlogListResponse> =>
    call<BlogListResponse>(`${BASE}?locale=${locale}&page=${page}&limit=${perPage}`),
);

export const getBlogPost = cache(
  (slug: string, locale: Locale): Promise<BlogPost | null> =>
    call<BlogPost | null>(`${BASE}/${encodeURIComponent(slug)}?locale=${locale}`),
);

const OEMBED: Record<BlogVideo["provider"], string> = {
  youtube: "https://www.youtube.com/oembed?format=json&url=",
  vimeo: "https://vimeo.com/api/oembed.json?url=",
};

/** Title and channel, fetched by the server so the visitor still loads nothing from the provider. Null never hides the video. */
export async function getVideoMeta(video: BlogVideo): Promise<{ title: string; channel: string } | null> {
  try {
    const res = await fetch(OEMBED[video.provider] + encodeURIComponent(watchUrl(video)), { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: unknown; author_name?: unknown };
    return typeof data.title === "string" && typeof data.author_name === "string" ? { title: data.title, channel: data.author_name } : null;
  } catch {
    return null;
  }
}
