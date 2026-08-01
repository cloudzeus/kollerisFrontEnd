import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  WIDGETS_BY_TYPE,
  ZONES_BY_ID,
  fieldsFor,
  type WidgetInstance,
} from "@/lib/zones/registry";

/**
 * Reading and writing zone contents.
 *
 * Every zone loads in one query per request. A page can render several zones,
 * and a query each would put the homepage back on a round-trip per region.
 *
 * Validation on write is against the widget type's field list, which is the
 * only schema these props have. It rejects unknown fields rather than storing
 * them: a prop the component never reads is invisible in the admin and forever
 * confusing in the database.
 */

const loadAll = cache(async (): Promise<Map<string, WidgetInstance[]>> => {
  const rows = await prisma.zoneWidget.findMany({ orderBy: [{ zone: "asc" }, { order: "asc" }] });
  const map = new Map<string, WidgetInstance[]>();
  for (const row of rows) {
    const list = map.get(row.zone) ?? [];
    list.push({
      id: row.id,
      zone: row.zone,
      type: row.type,
      order: row.order,
      enabled: row.enabled,
      props: (row.props ?? {}) as Record<string, unknown>,
    });
    map.set(row.zone, list);
  }
  return map;
});

/** What the storefront renders: enabled widgets, in order, known types only. */
export async function getZone(zoneId: string): Promise<WidgetInstance[]> {
  const all = await loadAll();
  return (all.get(zoneId) ?? []).filter((w) => w.enabled && WIDGETS_BY_TYPE.has(w.type));
}

/** What the admin edits: everything, including disabled widgets. */
export async function getZoneForAdmin(zoneId: string): Promise<WidgetInstance[]> {
  const all = await loadAll();
  return all.get(zoneId) ?? [];
}

type Result = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Validates props against the widget definition.
 *
 * Localised fields arrive as `{el: "…"}` maps; everything else as a plain
 * string or boolean. Anything not in the field list is dropped rather than
 * stored, and a missing required field is an error rather than an empty render
 * somebody discovers on the live homepage.
 */
function clean(type: string, props: Record<string, unknown>): Result & { props?: Record<string, unknown> } {
  const def = WIDGETS_BY_TYPE.get(type);
  if (!def) return { ok: false, error: `Άγνωστο widget: ${type}` };

  const out: Record<string, unknown> = {};

  // `fieldsFor`, not `def.fields`: badge, animation and background are shared
  // across every widget type and live outside the type's own field list.
  // Iterating the type's fields alone silently dropped every one of them on
  // save — the form collected them and nothing was ever stored.
  for (const field of fieldsFor(type)) {
    const value = props[field.name];

    if (field.kind === "boolean") {
      out[field.name] = value === true;
      continue;
    }

    if (field.localised) {
      const map = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      const cleaned: Record<string, string> = {};
      for (const [locale, text] of Object.entries(map)) {
        if (typeof text === "string" && text.trim()) cleaned[locale] = text.trim();
      }
      if (field.required && !Object.keys(cleaned).length) {
        return { ok: false, error: `${def.label}: το «${field.label}» είναι υποχρεωτικό` };
      }
      out[field.name] = cleaned;
      continue;
    }

    const text = typeof value === "string" ? value.trim() : "";
    if (field.required && !text) {
      return { ok: false, error: `${def.label}: το «${field.label}» είναι υποχρεωτικό` };
    }
    out[field.name] = text;
  }

  return { ok: true, props: out };
}

export async function addWidget(
  zoneId: string,
  type: string,
  actor: string,
): Promise<Result> {
  const zone = ZONES_BY_ID.get(zoneId);
  if (!zone) return { ok: false, error: `Άγνωστη ζώνη: ${zoneId}` };
  if (!zone.accepts.includes(type)) {
    return { ok: false, error: `Το «${type}» δεν ταιριάζει σε αυτή τη ζώνη` };
  }

  const existing = await prisma.zoneWidget.count({ where: { zone: zoneId } });
  if (zone.max != null && existing >= zone.max) {
    return {
      ok: false,
      error: `Η ζώνη χωράει ${zone.max} ${zone.max === 1 ? "widget" : "widgets"}. Αφαιρέστε ένα πρώτα.`,
    };
  }

  // Defaults from the registry, so a new widget renders something rather than
  // appearing as an empty box nobody can tell is broken or just new.
  const props: Record<string, unknown> = {};
  for (const field of fieldsFor(type)) {
    if (field.default !== undefined) props[field.name] = field.default;
    else if (field.kind === "boolean") props[field.name] = false;
    else if (field.localised) props[field.name] = {};
    else props[field.name] = "";
  }

  const row = await prisma.zoneWidget.create({
    data: { zone: zoneId, type, order: existing, props: props as never, updatedBy: actor.slice(0, 120) },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

export async function updateWidget(
  id: string,
  props: Record<string, unknown>,
  actor: string,
): Promise<Result> {
  const row = await prisma.zoneWidget.findUnique({ where: { id }, select: { type: true } });
  if (!row) return { ok: false, error: "Το widget δεν βρέθηκε" };

  const validated = clean(row.type, props);
  if (!validated.ok) return validated;

  await prisma.zoneWidget.update({
    where: { id },
    data: { props: validated.props as never, updatedBy: actor.slice(0, 120) },
  });
  return { ok: true };
}

export async function setWidgetEnabled(id: string, enabled: boolean, actor: string): Promise<Result> {
  await prisma.zoneWidget.update({
    where: { id },
    data: { enabled, updatedBy: actor.slice(0, 120) },
  });
  return { ok: true };
}

export async function removeWidget(id: string): Promise<Result> {
  await prisma.zoneWidget.delete({ where: { id } });
  return { ok: true };
}

/** Reorder after a drag. Ids arrive in their new order. */
export async function reorderZone(zoneId: string, ids: string[], actor: string): Promise<Result> {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.zoneWidget.update({
        where: { id },
        data: { order: index, updatedBy: actor.slice(0, 120) },
      }),
    ),
  );
  return { ok: true };
}
