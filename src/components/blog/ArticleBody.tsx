import { getTranslations } from "next-intl/server";
import { ArticleVideo } from "@/components/blog/ArticleVideo";
import { PROVIDER_NAME, splitIntro } from "@/lib/blog/article-video";
import { getVideoMeta } from "@/lib/blog/blog";
import type { BlogVideo } from "@/lib/blog/contract";

/*
 * HDCtool's editor is the only writer and sanitises on the way in; this renders
 * what it stored. If the editor ever opens to untrusted authors, sanitise HERE
 * too — the storefront must not be the only place that trusts it.
 */
const Html = ({ html }: { html: string }) => <div className="prose-kolleris" dangerouslySetInnerHTML={{ __html: html }} />;

export async function ArticleBody({ content, video }: { content: string; video?: BlogVideo | null }) {
  if (!video) return <Html html={content} />;
  const [t, meta] = await Promise.all([getTranslations("blog.page"), getVideoMeta(video)]);
  const provider = PROVIDER_NAME[video.provider];
  const { intro, rest } = splitIntro(content);
  return (
    <>
      {intro && <Html html={intro} />}
      <ArticleVideo
        video={video}
        title={meta?.title ?? null}
        playLabel={t("video_play")}
        caption={meta ? t("video_from_channel", { channel: meta.channel, provider }) : t("video_from_provider", { provider })}
      />
      <Html html={rest} />
    </>
  );
}
