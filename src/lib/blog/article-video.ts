import type { BlogVideo } from "@/lib/blog/contract";

export const PROVIDER_NAME: Record<BlogVideo["provider"], string> = { youtube: "YouTube", vimeo: "Vimeo" };

export function watchUrl(v: BlogVideo): string {
  return v.provider === "youtube" ? `https://www.youtube.com/watch?v=${v.id}` : `https://vimeo.com/${v.id}`;
}

export function embedSrc(v: BlogVideo): string {
  return v.provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0`
    : `https://player.vimeo.com/video/${v.id}?autoplay=1&dnt=1`;
}

/** shortcut: regex on HDCtool's own HTML; only an opening `<p>` counts, anything else puts the video first. */
export function splitIntro(html: string): { intro: string; rest: string } {
  const intro = html.match(/^\s*<p\b[\s\S]*?<\/p>/i)?.[0] ?? "";
  return { intro, rest: html.slice(intro.length) };
}
