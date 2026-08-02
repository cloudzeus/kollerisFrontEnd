import "server-only";
import sharp from "sharp";

/**
 * Cutting a subject out of its background, via Claid.
 *
 * A product photographed on a studio backdrop cannot sit on a coloured banner
 * panel or over a video without its grey rectangle coming along. This is the
 * one thing in the pipeline that needs a model rather than a filter, so it is
 * the one thing that leaves the building.
 *
 * ── Two details the API makes easy to get wrong ──
 * `remove: true` alone returns the picture practically unchanged, as RGB with
 * no alpha channel — no error, no warning. Transparency needs `color:
 * "transparent"` AND a PNG output; either one missing and the call succeeds
 * while doing nothing. That silence is why `removeBackground` checks the result
 * for an alpha channel rather than trusting the response.
 *
 * Claid's `tmp_url` expires. Nothing that has to render for months may point at
 * it, so the bytes are fetched here and handed to the caller for permanent
 * storage on our own CDN.
 */

const ENDPOINT = "https://api.claid.ai/v1-beta1/image/edit";

export type CutoutResult =
  | { ok: true; buffer: Buffer; width: number; height: number; transparent: number }
  | { ok: false; error: string };

export async function removeBackground(imageUrl: string): Promise<CutoutResult> {
  const key = process.env.CLAID_API_KEY;
  if (!key) return { ok: false, error: "Το CLAID_API_KEY δεν έχει οριστεί." };

  let tmpUrl: string;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: imageUrl,
        operations: { background: { remove: true, color: "transparent" } },
        output: { format: "png" },
      }),
    });

    const payload = (await response.json()) as {
      data?: { output?: { tmp_url?: string } };
      error_message?: string;
    };

    if (!response.ok || !payload.data?.output?.tmp_url) {
      return {
        ok: false,
        error: payload.error_message ?? `Το Claid απάντησε ${response.status}.`,
      };
    }
    tmpUrl = payload.data.output.tmp_url;
  } catch (error) {
    console.error("[claid] request failed", error);
    return { ok: false, error: "Δεν ήταν δυνατή η σύνδεση με το Claid." };
  }

  try {
    const file = await fetch(tmpUrl);
    if (!file.ok) return { ok: false, error: "Το αποτέλεσμα δεν κατέβηκε." };
    const buffer = Buffer.from(await file.arrayBuffer());

    const meta = await sharp(buffer).metadata();
    if (!meta.hasAlpha) {
      // The call succeeded and did nothing — the failure mode this whole
      // function exists to catch. Saying so beats storing the original again
      // under a name that claims it was cut out.
      return { ok: false, error: "Το Claid επέστρεψε την εικόνα χωρίς διαφάνεια." };
    }

    // How much actually came away, so the operator can tell a clean cutout from
    // a model that found nothing to remove.
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 16) clear++;

    return {
      ok: true,
      buffer,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      transparent: Math.round((clear / (info.width * info.height)) * 100),
    };
  } catch (error) {
    console.error("[claid] result unusable", error);
    return { ok: false, error: "Το αποτέλεσμα δεν ήταν έγκυρη εικόνα." };
  }
}
