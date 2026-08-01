import type { MediaAssetView } from "@/lib/media/library-types";

/**
 * Sending files to the upload route.
 *
 * One request per file, with the file as the body. Not multipart and not a
 * server action: an action would cap the whole thing at 1MB, and a multipart
 * envelope would only add a parser and a second copy of the bytes on both ends.
 *
 * Each file reports its own outcome. A batch that stops at the first failure
 * loses the other nine uploads, and "upload failed" tells nobody which one.
 */

export type UploadOutcome = {
  added: Array<{ asset: MediaAssetView; note: string }>;
  failed: string[];
};

export async function uploadFiles(
  files: File[],
  { folder = "library" }: { folder?: string } = {},
): Promise<UploadOutcome> {
  const results = await Promise.all(
    files.map(async (file) => {
      const query = new URLSearchParams({ name: file.name, folder });
      try {
        const response = await fetch(`/api/admin/media/upload?${query}`, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        const payload = (await response.json()) as
          | { ok: true; asset: MediaAssetView; note: string }
          | { ok: false; error: string };

        if (!payload.ok) return { error: `${file.name}: ${payload.error}` };
        return { added: { asset: payload.asset, note: payload.note } };
      } catch {
        // A network failure mid-upload is the common one on a large video over
        // a bad connection, and it deserves the filename rather than "failed".
        return { error: `${file.name}: η μεταφορά διακόπηκε.` };
      }
    }),
  );

  return {
    added: results.flatMap((r) => ("added" in r && r.added ? [r.added] : [])),
    failed: results.flatMap((r) => ("error" in r && r.error ? [r.error] : [])),
  };
}
