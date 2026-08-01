/**
 * What the picker knows about a file.
 *
 * Split from `library.ts` because that module is `server-only` and every screen
 * that shows a thumbnail is a client component.
 */

export type MediaKind = "image" | "video";

export type MediaAssetView = {
  id: string;
  url: string;
  kind: MediaKind;
  name: string;
  width: number | null;
  height: number | null;
  bytes: number;
  createdAt: Date;
};

/** Human size. Rounded hard — nobody needs the third digit of a file size. */
export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
