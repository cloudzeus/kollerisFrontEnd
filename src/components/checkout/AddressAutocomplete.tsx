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
  region: string;
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
}: {
  label: string;
  name: string;
  error?: string;
  required?: boolean;
  /** A signed-in customer's saved street. Seeds the field, never locks it. */
  defaultValue?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("checkout.AddressAutocomplete");
  const listId = useId();

  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState(defaultValue ?? "");

  useEffect(() => {
    if (query.trim().length < 3) {
      setItems([]);
      return;
    }
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
        setItems(data.suggestions ?? []);
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

  function choose(item: Suggestion) {
    const field = input.current;
    if (field) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(field, item.line1);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const form = field?.form ?? null;
    setSibling(form, "shipPostcode", item.postcode);
    setSibling(form, "shipCity", item.city);
    setSibling(form, "shipRegion", item.region);

    setQuery("");
    setItems([]);
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
        <span className="mt-1.5 block text-[11px] text-k-text-3">{t("voitheia")}</span>
      )}
    </label>
  );
}
