import { beforeAll, describe, expect, it } from "vitest";

/**
 * The encryption behind stored secrets.
 *
 * These test the crypto in isolation, without a database: the properties that
 * matter are that a stored secret is not readable, that tampering with it fails
 * loudly rather than decrypting to something else, and that two encryptions of
 * the same value differ — a stored payment key that is recognisable by its
 * ciphertext is only half hidden.
 */

let encrypt: (s: string) => string;
let decrypt: (s: string) => string;

beforeAll(async () => {
  process.env.SETTINGS_ENCRYPTION_KEY = "a-test-key-of-at-least-thirty-two-characters";
  const mod = await import("../crypto");
  encrypt = mod.encryptSecret;
  decrypt = mod.decryptSecret;
});

describe("secret storage", () => {
  const SECRET = "Xk2mQ9vT4pL7wRc0bN5hJ8dF3sYaGe";

  it("round-trips", () => {
    expect(decrypt(encrypt(SECRET))).toBe(SECRET);
  });

  it("does not leave the plaintext anywhere in the stored value", () => {
    const stored = encrypt(SECRET);
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toContain(SECRET.slice(0, 8));
  });

  it("produces a different ciphertext every time", () => {
    // Same value, same key — a shared IV would make identical secrets
    // recognisable as identical in the table.
    expect(encrypt(SECRET)).not.toBe(encrypt(SECRET));
  });

  it("refuses a tampered ciphertext instead of decrypting it to something else", () => {
    const [iv, tag, data] = encrypt(SECRET).split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 0xff;
    expect(() => decrypt([iv, tag, flipped.toString("base64")].join(":"))).toThrow();
  });

  it("refuses a value encrypted under a different key", () => {
    const stored = encrypt(SECRET);
    process.env.SETTINGS_ENCRYPTION_KEY = "a-completely-different-key-thirty-two-plus";
    expect(() => decrypt(stored)).toThrow();
    process.env.SETTINGS_ENCRYPTION_KEY = "a-test-key-of-at-least-thirty-two-characters";
  });

  it("refuses to encrypt at all without a long enough key", () => {
    const saved = process.env.SETTINGS_ENCRYPTION_KEY;
    process.env.SETTINGS_ENCRYPTION_KEY = "short";
    expect(() => encrypt(SECRET)).toThrow(/SETTINGS_ENCRYPTION_KEY/);
    process.env.SETTINGS_ENCRYPTION_KEY = saved;
  });
});
