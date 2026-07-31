import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption for stored secrets.
 *
 * Split out from `settings.ts` so it carries no `server-only` marker and no
 * database import, and can therefore be tested directly — the properties worth
 * proving (a secret is unreadable at rest, tampering fails loudly, two
 * encryptions differ) are properties of this file alone.
 *
 * AES-256-GCM rather than CBC because it authenticates: a ciphertext edited in
 * the database fails to decrypt instead of decrypting to something else.
 *
 * The key is read at call time, not at module load, so rotating
 * `SETTINGS_ENCRYPTION_KEY` does not require a restart to take effect — and so
 * importing this file cannot throw on a machine that has not set it.
 */

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY must be set to at least 32 characters before secrets can be stored.",
    );
  }
  // Hashed to exactly 32 bytes, so the environment value can be any length.
  return createHash("sha256").update(raw).digest();
}

/** `iv:tag:ciphertext`, each base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    enc.toString("base64"),
  ].join(":");
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted setting");
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
