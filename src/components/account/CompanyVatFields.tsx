"use client";

import { useState, useTransition } from "react";
import { lookupCompanyByVat } from "@/lib/account/actions";
import { isValidAfm, normaliseAfm, type VatCompany } from "@/lib/account/vat";
import { upGreek } from "@/lib/greek";

/**
 * ΑΦΜ + the company fields it fills in.
 *
 * Used in two places that need exactly the same behaviour: the invoice block at
 * checkout and B2B registration. One component so the two cannot drift.
 *
 * The lookup runs through a server action, so the HDCtool bearer never reaches
 * the browser and this app exposes no endpoint that would let anyone walk the
 * AADE registry.
 *
 * Everything the lookup fills stays EDITABLE. The registry holds the
 * headquarters address and the registered name; a customer invoicing a branch,
 * or trading under a different name, must be able to correct it — and the
 * server re-validates whatever is submitted regardless.
 */
export function CompanyVatFields({
  required = false,
  fieldErrors,
  names = {
    afm: "vatNumber",
    name: "companyName",
    doy: "taxOffice",
    trade: "companyTrade",
    address: "billLine1",
    city: "billCity",
    postcode: "billPostcode",
  },
  showAddress = false,
}: {
  required?: boolean;
  fieldErrors?: Record<string, string | undefined>;
  names?: {
    afm: string;
    name: string;
    doy: string;
    trade: string;
    address: string;
    city: string;
    postcode: string;
  };
  /** Checkout keeps the billing address separate; registration asks for it here. */
  showAddress?: boolean;
}) {
  const [afm, setAfm] = useState("");
  const [company, setCompany] = useState<VatCompany | null>(null);
  const [status, setStatus] = useState<
    null | "invalid" | "not_found" | "unavailable" | "kolleris" | "aade"
  >(null);
  const [pending, startTransition] = useTransition();

  const digits = normaliseAfm(afm);
  const canLookup = isValidAfm(digits);

  const lookup = () => {
    if (!canLookup || pending) return;
    startTransition(async () => {
      const result = await lookupCompanyByVat({ afm: digits });
      if (result.found) {
        setCompany(result.company);
        setStatus(result.source);
      } else {
        setCompany(null);
        setStatus(result.reason);
      }
    });
  };

  /*
   * `key` is what makes the prefill work. These are uncontrolled inputs so the
   * customer can type freely; remounting them when a new company arrives is how
   * a fresh `defaultValue` takes effect without turning the whole block into
   * controlled state that fights every keystroke.
   */
  const fillKey = company?.afm ?? "empty";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block">
          <span className="t-account-label mb-1.5 block text-k-text-4">
            {upGreek("ΑΦΜ")}
            {required && <span className="ml-1 text-k-red">*</span>}
          </span>
          <span className="flex">
            <input
              name={names.afm}
              value={afm}
              onChange={(e) => {
                setAfm(e.target.value);
                setStatus(null);
              }}
              onKeyDown={(e) => {
                // Enter inside a checkout form would submit the order.
                if (e.key === "Enter") {
                  e.preventDefault();
                  lookup();
                }
              }}
              inputMode="numeric"
              autoComplete="off"
              placeholder="π.χ. 099095556"
              required={required}
              aria-invalid={fieldErrors?.[names.afm] || status === "invalid" ? true : undefined}
              aria-describedby="vat-status"
              className={`t-input h-12 min-w-0 flex-1 border border-r-0 px-3.5 text-k-ink outline-none focus:border-k-ink ${
                fieldErrors?.[names.afm] || status === "invalid"
                  ? "border-k-red"
                  : "border-k-line-2"
              }`}
            />
            <button
              type="button"
              onClick={lookup}
              disabled={!canLookup || pending}
              className="t-btn-sm h-12 shrink-0 bg-k-ink px-4 text-white transition-colors hover:bg-k-red disabled:cursor-not-allowed disabled:opacity-40 lg:px-6"
            >
              {pending ? "…" : upGreek("Αναζήτηση")}
            </button>
          </span>
        </label>

        <p id="vat-status" aria-live="polite" className="mt-1.5 text-[11px] leading-[1.5]">
          {status === "kolleris" && (
            <span className="flex items-center gap-1.5 text-k-green">
              <span aria-hidden className="block h-1.5 w-1.5 bg-current" />
              Σας βρήκαμε στους πελάτες μας — τα στοιχεία συμπληρώθηκαν.
            </span>
          )}
          {status === "aade" && (
            <span className="flex items-center gap-1.5 text-k-green">
              <span aria-hidden className="block h-1.5 w-1.5 bg-current" />
              Στοιχεία από το μητρώο ΑΑΔΕ — ελέγξτε τα και διορθώστε αν χρειάζεται.
            </span>
          )}
          {status === "not_found" && (
            <span className="text-k-amber">
              Το ΑΦΜ δεν βρέθηκε στο μητρώο. Συμπληρώστε τα στοιχεία χειροκίνητα.
            </span>
          )}
          {status === "unavailable" && (
            <span className="text-k-amber">
              Το μητρώο δεν απαντά αυτή τη στιγμή. Συμπληρώστε τα στοιχεία χειροκίνητα —
              η παραγγελία δεν επηρεάζεται.
            </span>
          )}
          {status === "invalid" && (
            <span className="text-k-red">Το ΑΦΜ δεν είναι έγκυρο (9 ψηφία).</span>
          )}
          {status === null && !canLookup && digits.length > 0 && (
            <span className="text-k-text-4">9 ψηφία — χωρίς EL μπροστά.</span>
          )}
          {status === null && digits.length === 0 && (
            <span className="text-k-text-4">
              Γράψτε το ΑΦΜ και πατήστε «Αναζήτηση» — συμπληρώνουμε τα υπόλοιπα από την ΑΑΔΕ.
            </span>
          )}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Filled
          key={`${fillKey}-name`}
          label="Επωνυμία"
          name={names.name}
          defaultValue={company?.name ?? ""}
          required={required}
          error={fieldErrors?.[names.name]}
        />
        <Filled
          key={`${fillKey}-doy`}
          label="ΔΟΥ"
          name={names.doy}
          defaultValue={company?.doy ?? ""}
          error={fieldErrors?.[names.doy]}
        />
        <Filled
          key={`${fillKey}-trade`}
          label="Δραστηριότητα"
          name={names.trade}
          defaultValue={company?.profession ?? ""}
          error={fieldErrors?.[names.trade]}
          className="sm:col-span-2"
        />

        {showAddress && (
          <>
            <Filled
              key={`${fillKey}-address`}
              label="Διεύθυνση έδρας"
              name={names.address}
              defaultValue={company?.address ?? ""}
              error={fieldErrors?.[names.address]}
              className="sm:col-span-2"
            />
            <Filled
              key={`${fillKey}-city`}
              label="Πόλη"
              name={names.city}
              defaultValue={company?.city ?? ""}
              error={fieldErrors?.[names.city]}
            />
            <Filled
              key={`${fillKey}-postcode`}
              label="Τ.Κ."
              name={names.postcode}
              defaultValue={company?.zip ?? ""}
              error={fieldErrors?.[names.postcode]}
            />
          </>
        )}
      </div>

      {company?.trdr && (
        // Carried into the order so the ERP push reuses the existing TRDR
        // instead of creating a second customer record for the same ΑΦΜ.
        <input type="hidden" name="erpTrdr" value={company.trdr} />
      )}
    </div>
  );
}

function Filled({
  label,
  name,
  defaultValue,
  required,
  error,
  className = "",
}: {
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
  error?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="t-account-label mb-1.5 block text-k-text-4">
        {upGreek(label)}
        {required && <span className="ml-1 text-k-red">*</span>}
      </span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        className={`t-input h-12 w-full border px-3.5 text-k-ink outline-none focus:border-k-ink ${
          error ? "border-k-red" : "border-k-line-2"
        }`}
      />
      {error && <span className="mt-1 block text-[11px] text-k-red">{error}</span>}
    </label>
  );
}
