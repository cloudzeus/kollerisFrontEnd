import "server-only";
import sharp from "sharp";

/**
 * Uploading media to BunnyCDN.
 *
 * Same storage zone and hostname HDCtool already writes product photography to,
 * so an image uploaded here and one synced from the PIM sit side by side and
 * are served the same way. Only the path prefix differs — everything the
 * storefront owns goes under `eshop/`, which keeps it clearly separate from the
 * `<supplier>/<sku>/` tree the catalogue sync manages and safe to purge without
 * touching product photography.
 *
 * ── Why images are converted here ─────────────────────────────────────────
 * A marketing upload is whatever came out of a camera or a supplier's press
 * kit: 6000px JPEGs of several megabytes. Serving one as a 400px banner costs
 * the visitor the whole file. Everything is re-encoded to WebP and capped at
 * 1920px on the long edge before it leaves this process, so the size is decided
 * here rather than hoped for.
 *
 * `withoutEnlargement` matters: a 600px logo must not be upscaled to 1920 and
 * gain nothing but blur and bytes.
 */

const MAX_EDGE = 1920;
const WEBP_QUALITY = 82;

function config() {
  const key = process.env.BUNNY_API_KEY;
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const hostname = process.env.BUNNY_CDN_HOSTNAME;
  if (!key || !zone || !hostname) {
    throw new Error(
      "BunnyCDN is not configured: set BUNNY_API_KEY, BUNNY_STORAGE_ZONE and BUNNY_CDN_HOSTNAME.",
    );
  }
  return { key, zone, hostname };
}

export type ProcessedImage = {
  buffer: Buffer;
  width: number;
  height: number;
  bytes: number;
  /** Bytes before conversion, so the saving can be reported. */
  originalBytes: number;
};

/**
 * Re-encode to WebP, capped at 1920px on the long edge.
 *
 * Animated GIFs keep their frames (`animated: true`); without it sharp would
 * silently flatten one to a still, which is the kind of loss nobody notices
 * until the banner is live.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const image = sharp(input, { animated: true });
  const meta = await image.metadata();

  const buffer = await image
    .rotate() // honour EXIF orientation before resizing, or portraits come out sideways
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer();

  const out = await sharp(buffer).metadata();
  return {
    buffer,
    width: out.width ?? meta.width ?? 0,
    height: out.height ?? meta.height ?? 0,
    bytes: buffer.length,
    originalBytes: input.length,
  };
}

/** Uploads bytes and returns the public CDN URL. */
export async function uploadToBunny(
  buffer: Buffer,
  path: string,
  contentType = "image/webp",
): Promise<string> {
  const { key, zone, hostname } = config();
  const clean = path.replace(/^\/+/, "");

  const response = await fetch(`https://storage.bunnycdn.com/${zone}/${clean}`, {
    method: "PUT",
    headers: {
      AccessKey: key,
      "Content-Type": contentType,
      "Content-Length": String(buffer.length),
    },
    body: new Uint8Array(buffer),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`BunnyCDN upload failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  return `https://${hostname}/${clean}`;
}

/**
 * Process and upload in one step.
 *
 * The filename carries a timestamp rather than reusing a stable name, because
 * Bunny caches at the edge: overwriting `hero.webp` leaves the old image served
 * for as long as the TTL, and a marketing team replacing a banner would see the
 * previous one for hours. A new name is always immediately correct.
 */
export async function uploadImage(
  input: Buffer,
  { folder, name }: { folder: string; name: string },
): Promise<{ url: string; width: number; height: number; bytes: number; originalBytes: number }> {
  const processed = await processImage(input);
  const slug = name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "image";

  const url = await uploadToBunny(
    processed.buffer,
    `eshop/${folder}/${slug}-${Date.now()}.webp`,
  );

  return {
    url,
    width: processed.width,
    height: processed.height,
    bytes: processed.bytes,
    originalBytes: processed.originalBytes,
  };
}

/** What a browser will actually play, by extension. */
const VIDEO_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export const VIDEO_EXTENSIONS = Object.keys(VIDEO_TYPES);

/**
 * Upload a video, byte for byte.
 *
 * No transcoding: doing it properly needs a queue and a media service, and
 * doing it badly — a synchronous ffmpeg in a request — would block the admin
 * for minutes on a file marketing could have exported correctly in the first
 * place. So the constraint is stated instead: MP4 or WebM, and a size cap the
 * caller enforces.
 *
 * `.mov` is accepted because it is what a phone produces, and refusing it at
 * the door is more annoying than serving it — Safari plays it, and everything
 * else at least downloads it.
 */
export async function uploadVideo(
  input: Buffer,
  { folder, name }: { folder: string; name: string },
): Promise<{ url: string; bytes: number; extension: string }> {
  const extension = (name.split(".").pop() ?? "").toLowerCase();
  const contentType = VIDEO_TYPES[extension];
  if (!contentType) {
    throw new Error(`Μη υποστηριζόμενος τύπος βίντεο: .${extension || "—"} (MP4, WebM ή MOV)`);
  }

  const slug =
    name
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "video";

  const url = await uploadToBunny(
    input,
    `eshop/${folder}/${slug}-${Date.now()}.${extension}`,
    contentType,
  );

  return { url, bytes: input.length, extension };
}

/** Deletes one file. Failure is reported, never thrown — a dead CDN object is
 *  untidy, but losing the edit that replaced it would be worse. */
export async function deleteFromBunny(url: string): Promise<boolean> {
  try {
    const { key, zone, hostname } = config();
    if (!url.includes(hostname)) return false;
    const path = new URL(url).pathname.replace(/^\/+/, "");
    const response = await fetch(`https://storage.bunnycdn.com/${zone}/${path}`, {
      method: "DELETE",
      headers: { AccessKey: key },
    });
    return response.ok;
  } catch (error) {
    console.error("[bunny] delete failed", url, error);
    return false;
  }
}
