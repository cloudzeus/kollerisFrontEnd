import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { SETTINGS, SETTINGS_BY_KEY, type SettingView } from "@/lib/settings/registry";
import { decryptSecret as decrypt, encryptSecret as encrypt } from "@/lib/settings/crypto";

/**
 * Reading and writing runtime configuration.
 *
 * ── Where a value comes from ──────────────────────────────────────────────
 * A saved row wins. `.env` answers only when nothing has been saved, so it seeds
 * the first deployment and then steps aside. The alternative — environment
 * always wins — produces the worst possible failure: an operator changes a
 * setting, the UI confirms it, and nothing happens.
 *
 * ── Secrets ───────────────────────────────────────────────────────────────
 * AES-256-GCM, key derived from `SETTINGS_ENCRYPTION_KEY`. Encrypted values
 * never leave the server: `listForAdmin` returns a four-character hint and
 * nothing else. An admin session that is stolen must not hand over the payment
 * credentials with it, and an admin who can already spend money still has no
 * reason to be able to read the key.
 *
 * GCM rather than CBC because it authenticates: a ciphertext tampered with in
 * the database fails to decrypt instead of decrypting to something else.
 */

type Row = { key: string; value: string; isSecret: boolean; hint: string | null; updatedBy: string | null; updatedAt: Date };

/** All rows, once per request. Settings are read by many call sites per render. */
const loadRows = cache(async (): Promise<Map<string, Row>> => {
  const rows = await prisma.setting.findMany();
  return new Map(rows.map((r) => [r.key, r as Row]));
});

/**
 * The value in force for one key, decrypted if it is a secret.
 *
 * Returns null rather than throwing when a secret cannot be decrypted — a
 * rotated encryption key must degrade to "not configured", not to a crash on
 * every page.
 */
export async function getSetting(key: string): Promise<string | null> {
  const def = SETTINGS_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown setting: ${key}`);

  const row = (await loadRows()).get(key);
  if (row) {
    if (!row.isSecret) return row.value;
    try {
      return decrypt(row.value);
    } catch (error) {
      console.error(`[settings] could not decrypt ${key}`, error);
      return null;
    }
  }
  return process.env[def.envVar] ?? null;
}

export async function getSettingNumber(key: string): Promise<number | null> {
  const raw = await getSetting(key);
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Everything the settings screen may display.
 *
 * Secret VALUES are deliberately absent from the return type, so no future edit
 * can leak one by adding a field to the page.
 */
export async function listForAdmin(): Promise<SettingView[]> {
  const rows = await loadRows();
  return SETTINGS.map((def) => {
    const row = rows.get(def.key);
    if (!row) {
      const env = process.env[def.envVar] ?? null;
      return {
        key: def.key,
        value: def.secret ? null : env,
        hint: def.secret && env ? `••••${env.slice(-4)}` : null,
        fromEnv: env != null,
        updatedBy: null,
        updatedAt: null,
      };
    }
    return {
      key: def.key,
      value: row.isSecret ? null : row.value,
      hint: row.hint ? `••••${row.hint}` : null,
      fromEnv: false,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

/**
 * Write one setting.
 *
 * An empty string CLEARS the row rather than storing emptiness, so a setting can
 * be handed back to the environment. For a secret, empty means "leave it alone"
 * instead — the field renders blank on every load, and treating that as a
 * deletion would wipe the payment key the first time someone saved the form
 * without touching it.
 */
export async function setSetting(
  key: string,
  rawValue: string,
  actor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const def = SETTINGS_BY_KEY.get(key);
  if (!def) return { ok: false, error: `Unknown setting: ${key}` };

  const value = rawValue.trim();

  if (value === "") {
    if (def.secret) return { ok: true }; // blank means "unchanged", not "delete"
    await prisma.setting.deleteMany({ where: { key } });
    return { ok: true };
  }

  if (def.kind === "number" && !Number.isFinite(Number(value))) {
    return { ok: false, error: `${def.label}: περιμένει αριθμό` };
  }
  if (def.kind === "select" && !def.options?.some((o) => o.value === value)) {
    return { ok: false, error: `${def.label}: μη έγκυρη επιλογή` };
  }

  const stored = def.secret ? encrypt(value) : value;
  const data = {
    value: stored,
    isSecret: def.secret === true,
    hint: def.secret ? value.slice(-4) : null,
    updatedBy: actor.slice(0, 120),
  };

  await prisma.setting.upsert({ where: { key }, create: { key, ...data }, update: data });
  return { ok: true };
}
