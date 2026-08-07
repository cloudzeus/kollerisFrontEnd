"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { upGreek } from "@/lib/greek";

/**
 * The street field, with suggestions.
 *
 * Picking a suggestion fills the postcode and the city too, which is the whole
 * point: the postcode decides the ACS zone and therefore the shipping price, and
 * it is the field customers get wrong or leave blank. Typing three characters of
 * a street is easier than remembering five digits.
 *
 * Suggestions come from our own route, never from the browser to the geocoder,
 * so the key stays on the server.
 *
 * The field is a plain uncontrolled input underneath. It has to keep working
 * when the geocoder is slow, rate-limited or down, and when JavaScript never
 * arrives: whatever is typed is what gets submitted.
 */

type Suggestion = {
  label: string;
  line1: string;
  city: string;
  postcode: string;
  /** Νομός. */
  region: string;
  /** Περιφέρεια. */
  adminRegion: string;
};

/**
 * Which sibling inputs a chosen suggestion fills.
 *
 * A parameter rather than the checkout's own field names, because the same
 * street field belongs on any address form and the account's address book
 * calls these `postcode`, `city`, `region`. Hard-coded names made the component
 * usable on exactly one form — which is why the address book had no suggestions
 * at all, and typing a street there filled nothing.
 */
export type AddressFieldNames = {
  postcode: string;
  city: string;
  /** Νομός. */
  region: string;
  /** Περιφέρεια. Omit on a form that has no such field. */
  adminRegion?: string;
};

/** Stable identity, so the derived list does not change reference each render. */
const EMPTY: Suggestion[] = [];

const CHECKOUT_FIELDS: AddressFieldNames = {
  postcode: "shipPostcode",
  city: "shipCity",
  region: "shipRegion",
  adminRegion: "shipAdminRegion",
};

/** Writes a value into a sibling field the way React will notice. */
function setSibling(form: HTMLFormElement | null, name: string, value: string) {
  if (!form || !value) return;
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement)) return;
  // Assigning `.value` directly is invisible to React's synthetic events, so
  // anything listening for a change would miss it. The native setter plus a
  // bubbling event is what a real keystroke looks like.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

export function AddressAutocomplete({
  label,
  name,
  error,
  required,
  defaultValue,
  fields = CHECKOUT_FIELDS,
  help,
}: {
  label: string;
  name: string;
  error?: string;
  required?: boolean;
  /** A signed-in customer's saved street. Seeds the field, never locks it. */
  defaultValue?: string;
  /** The sibling inputs a chosen suggestion fills. */
  fields?: AddressFieldNames;
  /** Overrides the checkout's own hint, for a form with different wording. */
  help?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("checkout.AddressAutocomplete");
  const listId = useId();

  const input = useRef<HTMLInputElement>(null);
  const [fetched, setFetched] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState("");

  useEffect(() => {
    /*
     * Nothing is looked up until somebody types.
     *
     * `query` starts empty even when the field is prefilled, and that is
     * deliberate: seeding it with a saved address made this effect fire on
     * mount, so a returning customer's own street was sent to the geocoder and
     * a suggestion list opened over a form they had not touched.
     *
     * Below three characters it simply returns. What was fetched for a longer
     * prefix stays in state and is not shown — see `items` — rather than being
     * cleared here, which would be a setState in an effect body and a render
     * cascade for a list nobody can see.
     */
    if (query.trim().length < 3) return;
    // Debounced, and the previous request is abandoned rather than raced: two
    // in flight can land out of order and show suggestions for a prefix the
    // customer has already typed past.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/address/suggest?q=${encodeURIComponent(query)}&locale=${locale}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { suggestions?: Suggestion[] };
        setFetched(data.suggestions ?? []);
        setOpen((data.suggestions ?? []).length > 0);
        setActive(-1);
      } catch {
        // Aborted or offline. The field still accepts what was typed.
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, locale]);

  /*
   * What is actually offered.
   *
   * Derived rather than stored: a query shorter than three characters has no
   * suggestions by definition, and deriving that says so once instead of
   * needing every path that shortens the query to remember to clear the list.
   */
  const items = query.trim().length < 3 ? EMPTY : fetched;

  function choose(item: Suggestion) {
    const field = input.current;
    if (field) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(field, item.line1);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const form = field?.form ?? null;
    setSibling(form, fields.postcode, item.postcode);
    setSibling(form, fields.city, item.city);
    setSibling(form, fields.region, item.region);
    if (fields.adminRegion) setSibling(form, fields.adminRegion, item.adminRegion);

    setQuery("");
    setFetched(EMPTY);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + items.length) % items.length);
    } else if (event.key === "Enter" && active >= 0) {
      // Only when a suggestion is highlighted, so Enter still submits the form
      // for anyone typing their address in full.
      event.preventDefault();
      choose(items[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <label className="relative block">
      <span className="t-account-label mb-1.5 block text-k-text-4">
        {upGreek(label)}
        {required && <span className="ml-1 text-k-red">*</span>}
      </span>

      <input
        ref={input}
        name={name}
        type="text"
        // Uncontrolled, so this is what actually puts a saved street on screen.
        // Seeding state alone did not: nothing rendered `query` into the input,
        // so a prefilled address was invisible and submitted empty.
        defaultValue={defaultValue}
        required={required}
        autoComplete="address-line1"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        // A click on a suggestion blurs the input first, so closing has to wait
        // for the click to land.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onFocus={() => setOpen(items.length > 0)}
        className="h-11 w-full border border-k-line-2 bg-white px-3 text-[13.5px] text-k-ink outline-none focus:border-k-ink"
      />

      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-20 mt-px max-h-64 overflow-y-auto border border-k-ink bg-white shadow-[0_12px_28px_rgba(0,0,0,0.12)]"
        >
          {items.map((item, index) => (
            <li
              key={`${item.line1}-${item.postcode}-${index}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(item)}
              onMouseEnter={() => setActive(index)}
              className={`cursor-pointer px-3 py-2.5 text-[12.5px] leading-[1.45] ${
                index === active ? "bg-k-ink text-white" : "text-k-ink hover:bg-k-surface-2"
              }`}
            >
              <span className="block">{item.line1}</span>
              <span
                className={`block text-[11px] ${index === active ? "text-white/60" : "text-k-text-3"}`}
              >
                {[item.postcode, item.city].filter(Boolean).join(" ")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <span className="mt-1.5 block text-[11.5px] text-k-red">{error}</span>
      ) : (
        <span className="mt-1.5 block text-[11px] text-k-text-3">{help ?? t("voitheia")}</span>
      )}
    </label>
  );
}
