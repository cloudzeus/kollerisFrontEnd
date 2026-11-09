"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import { embedSrc } from "@/lib/blog/article-video";
import type { BlogVideo } from "@/lib/blog/contract";

/** Nothing loads from the provider until the visitor asks: no cookies, no weight on the page. */
export function ArticleVideo({ video, title, caption, playLabel }: { video: BlogVideo; title: string | null; caption: string; playLabel: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <figure className="my-8">
      <div className="relative flex aspect-video items-center justify-center bg-k-surface-2">
        {playing ? (
          <iframe
            src={embedSrc(video)}
            title={title ?? playLabel}
            className="absolute inset-0 size-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 bg-k-red px-5 text-[length:var(--fs-15)] text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
          >
            <Play className="size-4" aria-hidden />
            {playLabel}
          </button>
        )}
      </div>
      <figcaption className="mt-2.5 text-[length:var(--fs-13)] leading-relaxed text-k-text-3">
        {title && <span className="block text-[length:var(--fs-14)] text-k-ink">{title}</span>}
        {caption}
      </figcaption>
    </figure>
  );
}
