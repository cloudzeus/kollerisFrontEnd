"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AddressAutocomplete } from "@/components/checkout/AddressAutocomplete";
import { deleteAddress, makeDefault, saveAddress, type AddressState } from "@/lib/account/addresses";
import { upGreek } from "@/lib/greek";

/**
 * The address book, as a list with one form.
 *
 * A single form that switches between "new" and "editing this one" rather than
 * an inline form per row: twenty rows would otherwise mean twenty forms in the
 * DOM, all but one of them idle, and the browser would autofill whichever it
 * felt like.
 *
 * The form posts to a server action, so it works before hydration and its
 * validation is the same validation the action runs. Nothing here decides
 * whether an address is valid.
 */

export type Address = {
  id: string;
  label: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  /** Νομός. */
  region: string | null;
  /** Περιφέρεια. */
  adminRegion: string | null;
  isDefault: boolean;
};

export function AddressBook({ addresses }: { addresses: Address[] }) {
  const t = useTranslations("dieuthynseis.page");
  const [state, action, pending] = useActionState<AddressState, FormData>(saveAddress, {});
  const [editing, setEditing] = useState<Address | null>(null);
  const [open, setOpen] = useState(addresses.length === 0);
  const [, startTransition] = useTransition();

  // Remounts the form when the target changes, so the fields carry the right
  // values without a controlled input for each one.
  const formKey = editing?.id ?? "new";

  /*
   * Collapse once the save lands.
   *
   * The list above re-renders from the server, so leaving the form open showed
   * the address twice: saved in the list, and still sitting in the fields as
   * though it had not been. `state.ok` is set only by a successful action.
   */
  useEffect(() => {
    if (!state.ok) return;
    setEditing(null);
    setOpen(false);
  }, [state.ok]);

  const edit = (address: Address) => {
    setEditing(address);
    setOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      {addresses.length > 0 && (
        <ul className="flex flex-col gap-px border border-k-line bg-k-line">
          {addresses.map((address) => (
            <li key={address.id} className="bg-white px-4 py-4 lg:px-6 lg:py-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="text-[13px] font-semibold text-k-ink">
                      {address.label}
                    </span>
                    {address.isDefault && (
                      <span className="t-stat-label bg-k-ink px-2 py-1 text-white uppercase">
                        {upGreek(t("proepilogi"))}
                      </span>
                    )}
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-[1.6] text-k-text-2">
                    {address.firstName} {address.lastName}
                    <br />
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ""}
                    <br />
                    {address.postcode} {address.city}
                    {address.region ? `, ${address.region}` : ""}
                    {address.phone && (
                      <>
                        <br />
                        {address.phone}
                      </>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {!address.isDefault && (
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          await makeDefault(address.id);
                        })
                      }
                      className="t-btn-sm border border-k-line-2 px-3.5 py-2 text-k-text-2 transition-colors hover:border-k-ink hover:text-k-ink"
                    >
                      {upGreek(t("orise_proepilogi"))}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => edit(address)}
                    className="t-btn-sm border border-k-line-2 px-3.5 py-2 text-k-text-2 transition-colors hover:border-k-ink hover:text-k-ink"
                  >
                    {upGreek(t("epexergasia"))}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteAddress(address.id);
                      })
                    }
                    className="t-btn-sm border border-k-line-2 px-3.5 py-2 text-k-text-4 transition-colors hover:border-k-red hover:text-k-red"
                  >
                    {upGreek(t("diagrafi"))}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <div>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="t-btn-sm bg-k-ink px-6 py-3.5 text-white transition-colors hover:bg-k-red"
          >
            {upGreek(t("nea_dieuthynsi"))} +
          </button>
        </div>
      ) : (
        <form
          key={formKey}
          action={action}
          className="flex flex-col gap-4 border border-k-line bg-k-surface-2 p-5 lg:p-6"
        >
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <p className="t-eyebrow text-k-red">
            {upGreek(editing ? t("epexergasia_dieuthynsis") : t("nea_dieuthynsi"))}
          </p>

          {state.error && (
            <p role="alert" className="border-l-[3px] border-k-red bg-k-red/8 px-4 py-3 text-[12.5px] text-k-ink">
              {state.error}
            </p>
          )}

          <Field name="label" label={t("onomasia")} defaultValue={editing?.label} error={state.fieldErrors?.label} required placeholder={t("onomasia_paradeigma")} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="firstName" label={t("onoma")} defaultValue={editing?.firstName} error={state.fieldErrors?.firstName} required autoComplete="given-name" />
            <Field name="lastName" label={t("eponymo")} defaultValue={editing?.lastName} error={state.fieldErrors?.lastName} required autoComplete="family-name" />
          </div>

          {/*
            The same suggestion field as checkout, pointed at this form's names.
            ──────────────────────────────────────────────────────────────────
            This was a plain input, so the address book — the one screen whose
            entire job is entering an address — was the one place with no
            suggestions. Picking one now fills the four fields below it, which
            is the point: the postcode decides the ACS zone, and it is the field
            people leave blank or get wrong.
          */}
          <AddressAutocomplete
            name="line1"
            label={t("odos")}
            defaultValue={editing?.line1}
            error={state.fieldErrors?.line1}
            required
            fields={{
              postcode: "postcode",
              city: "city",
              region: "region",
              adminRegion: "adminRegion",
            }}
            help={t("odos_voitheia")}
          />
          <Field name="line2" label={t("orofos")} defaultValue={editing?.line2 ?? ""} autoComplete="address-line2" />

          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <Field name="postcode" label={t("tk")} defaultValue={editing?.postcode} error={state.fieldErrors?.postcode} required inputMode="numeric" autoComplete="postal-code" />
            <Field name="city" label={t("poli")} defaultValue={editing?.city} error={state.fieldErrors?.city} required autoComplete="address-level2" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="region" label={t("nomos")} defaultValue={editing?.region ?? ""} autoComplete="address-level1" />
            <Field name="adminRegion" label={t("perifereia")} defaultValue={editing?.adminRegion ?? ""} />
          </div>

          <Field name="phone" label={t("tilefono")} defaultValue={editing?.phone ?? ""} type="tel" autoComplete="tel" />

          <label className="flex items-center gap-2.5 text-[12.5px] text-k-text-2">
            <input
              type="checkbox"
              name="isDefault"
              defaultChecked={editing?.isDefault ?? addresses.length === 0}
              className="h-4 w-4 accent-k-red"
            />
            {t("na_einai_proepilogi")}
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={pending}
              className="t-btn-sm bg-k-ink px-6 py-3.5 text-white transition-colors hover:bg-k-red disabled:opacity-60"
            >
              {upGreek(pending ? t("apothikeysi_se_exelixi") : t("apothikeysi"))}
            </button>
            {addresses.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setOpen(false);
                }}
                className="t-btn-sm border-[1.5px] border-k-ink px-6 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
              >
                {upGreek(t("akyro"))}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

/** Label above, error below. Never a placeholder standing in for a label. */
function Field({
  name,
  label,
  error,
  required,
  ...rest
}: {
  name: string;
  label: string;
  error?: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="t-account-label mb-1.5 block text-k-text-4">
        {upGreek(label)}
        {required && <span className="ml-1 text-k-red">*</span>}
      </span>
      <input
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        className="h-11 w-full border border-k-line-2 bg-white px-3 text-[13.5px] text-k-ink outline-none focus:border-k-ink"
        {...rest}
      />
      {error && <span className="mt-1.5 block text-[11.5px] text-k-red">{error}</span>}
    </label>
  );
}
