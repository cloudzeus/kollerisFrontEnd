"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Image from "next/image";
import { useOptimistic, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { removeCartLine, updateCartLine } from "@/lib/cart/actions";
import type { CartLineView } from "@/lib/cart/options";
import { formatPrice } from "@/lib/format";
import { upGreek } from "@/lib/greek";

/**
 * One cart line.
 *
 * The quantity number is optimistic so +/- feels instant, but every *amount*
 * comes from the server render. Doing optimistic maths on totals is where VAT
 * and the free-shipping threshold go wrong: the bar would cross at a number the
 * server then disagrees with. The spec calls this out explicitly.
 */
export function CartLineRow({ line }: { line: CartLineView }) {
  const locale = useLocale();
  const t = useTranslations("cart.CartLineRow");
  const [pending, startTransition] = useTransition();
  const [optimisticQty, setOptimisticQty] = useOptimistic(line.quantity);

  const setQuantity = (next: number) => {
    if (next < 0 || next > 999) return;
    startTransition(async () => {
      setOptimisticQty(next);
      await updateCartLine({ lineId: line.id, quantity: next });
    });
  };

  const remove = () => {
    startTransition(async () => {
      setOptimisticQty(0);
      await removeCartLine(line.id);
    });
  };

  const ctx = { vatRate: line.vatRate };

  return (
    <div
      /*
       * Δύο πλάτη στηλών, όχι ένα.
       * ───────────────────────────────────────────────────────────────────
       * Το καλάθι είναι στήλη ~670px δίπλα στη σύνοψη, όχι ολόκληρη οθόνη. Με
       * σταθερές στήλες 150/150/140 χρειάζονταν 572px και έμεναν 17 για το
       * όνομα — γι' αυτό έπεφταν τα γράμματα το ένα πάνω στο άλλο.
       *
       * Στα 600px της ΓΡΑΜΜΗΣ μπαίνει η στενή εκδοχή (366px στηλών, ~240 για
       * το όνομα)· στα 900 η άνετη. Στοίβα μόνο κάτω από 600, δηλαδή στο
       * κινητό — γιατί μια στοιβαγμένη γραμμή πιάνει τετραπλάσιο ύψος και ένα
       * καλάθι με δέκα κωδικούς γίνεται σελίδα που δεν τελειώνει.
       */
      className={`grid gap-3.5 border-b border-k-line px-4 py-4 transition-opacity @[600px]:grid-cols-[minmax(0,1fr)_110px_112px_104px_40px] @[600px]:items-center @[600px]:gap-4 @[600px]:px-5 @[600px]:py-4 @[900px]:grid-cols-[minmax(0,1fr)_150px_150px_140px_52px] @[900px]:gap-5 @[900px]:px-10 @[900px]:py-[22px] ${
        pending ? "opacity-60" : ""
      }`}
    >
      {/* Product */}
      <div className="flex min-w-0 gap-3.5 @[900px]:gap-[18px]">
        {/* Πάνω-αριστερά στην εικόνα — ίδια θέση με την κάρτα του καταλόγου,
            ώστε το μάτι να ψάχνει ένα σημείο και όχι δύο. Το κείμενο της
            καμπάνιας μένει δίπλα στο όνομα, όπου έχει πλάτος. */}
        <span className="relative flex h-16 w-16 shrink-0 items-center justify-center border border-k-line bg-k-surface-2 p-1.5 @[600px]:h-[68px] @[600px]:w-[68px] @[900px]:h-24 @[900px]:w-24 @[900px]:p-2">
          {line.discountPercent > 0 && (
            <span className="t-badge absolute top-0 left-0 z-10 bg-k-red-600 px-1.5 py-[3px] text-white">
              −{line.discountPercent.toString().replace(".", ",")}%
            </span>
          )}
          {line.image ? (
            <Image
              src={line.image}
              alt={line.name}
              width={96}
              height={96}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="t-brand-count text-k-text-5">—</span>
          )}
        </span>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="flex items-baseline gap-2.5">
            <span className="t-card-brand text-k-red">{line.brandName ?? "—"}</span>
            <span className="t-card-sku text-k-text-4">{line.sku}</span>
          </span>

          {/* Το `title` και όχι δικό μας tooltip: το όνομα κόβεται στις δύο
              σειρές, και ο μόνος λόγος να δεις το υπόλοιπο είναι να
              επιβεβαιώσεις ότι είναι το σωστό προϊόν — μια στιγμιαία ματιά,
              όχι στοιχείο διεπαφής. Το native το κάνει σε κάθε συσκευή με
              ποντίκι, χωρίς κώδικα και χωρίς να μπλέκεται με το scroll. */}
          <Link
            href={`/proion/${line.slug}`}
            title={line.name}
            className="line-clamp-2 text-[13.5px] leading-[1.4] font-semibold text-k-ink hover:text-k-red"
          >
            {line.name}
          </Link>

          {/*
            Η καμπάνια ανήκει στο προϊόν, όχι στη στήλη τιμής.
            ──────────────────────────────────────────────────────────────
            Στη στήλη τιμής — 110px — ο τίτλος τυλιγόταν σε τρεις σειρές και
            έσπρωχνε τη γραμμή στο ύψος τεσσάρων. Εδώ έχει το πλάτος του
            ονόματος, και μιλάει για το ίδιο πράγμα με αυτό.

            Το σήμα κρατά μόνο το ποσοστό: ένα σήμα είναι ετικέτα, όχι πρόταση.
            Ο τίτλος δίπλα του σε κανονικό κείμενο, γιατί «−20%» χωρίς αιτία
            μοιάζει με λάθος τιμοκαταλόγου.
          */}
          {/* Μία σειρά, με την κουκκίδα σταθερή: το «ΑΜΕΣΑ ΔΙΑΘΕΣΙΜΟ · 8 ΤΕΜ.»
              τυλιγόταν και η κουκκίδα έμενε μόνη της στην προηγούμενη. */}
          <span
            className={`t-card-stock flex min-w-0 items-center gap-[7px] ${
              line.inStock ? "text-k-green" : "text-k-amber"
            }`}
          >
            <span className="rounded-pill block h-1.5 w-1.5 shrink-0 bg-current" />
            <span
              className="truncate"
              title={
                line.inStock
                  ? `${upGreek(t("amesa_diathesimo"))} · ${line.availableQty} ${upGreek(t("tem"))}`
                  : upGreek(t("katopin_paraggelias"))
              }
            >
              {line.inStock
                ? `${upGreek(t("amesa_diathesimo"))} · ${line.availableQty} ${upGreek(t("tem"))}`
                : upGreek(t("katopin_paraggelias"))}
            </span>
          </span>

          {/* Only shown when the basket actually exceeds stock. */}
          {line.overStock && (
            <span className="t-badge self-start bg-k-amber px-2 py-1 text-white">
              {upGreek(t("diathesima_ta_ypoloipa_katopin_paraggelias", { availableQty: line.availableQty }))}
            </span>
          )}
        </div>
      </div>

      {/* Unit price */}
      <div className="min-w-0 @[600px]:text-right">
        <span className="t-account-label mb-1 block text-k-text-4 @[600px]:hidden">
          {upGreek(t("timi_monadas"))}
        </span>
        {line.discountPercent > 0 ? (
          <span className="t-card-was block whitespace-nowrap text-k-text-5 line-through">
            {formatPrice(line.unitNet, locale, ctx)}
          </span>
        ) : (
          line.unitListNet != null && (
            <span className="t-card-was block whitespace-nowrap text-k-text-5 line-through">
              {formatPrice(line.unitListNet, locale, ctx)}
            </span>
          )
        )}
        <span className="block font-mono text-[15px] font-semibold whitespace-nowrap text-k-ink">
          {formatPrice(line.unitNetFinal, locale, ctx)}
        </span>
        {/*
          Το «ΜΕ ΦΠΑ» λέγεται μία φορά, στην επικεφαλίδα.
          ────────────────────────────────────────────────────────────────
          Ανά γραμμή ήταν τρίτη σειρά μέσα σε στήλη 110px, την ίδια για κάθε
          προϊόν. Σε καλάθι με δέκα κωδικούς είναι δέκα φορές η ίδια
          πληροφορία και δέκα σειρές ύψους. Στη στοίβα του κινητού μένει,
          γιατί εκεί δεν υπάρχει επικεφαλίδα να το πει.
        */}
        <span className="t-card-vat mt-0.5 block text-k-text-5 @[600px]:hidden">
          {upGreek(t("me_fpa", { vatRate: line.vatRate }))}
        </span>
      </div>

      {/* Quantity */}
      <div className="flex items-center justify-between gap-4 @[600px]:justify-center">
        <span className="t-account-label text-k-text-4 @[600px]:hidden">
          {upGreek(t("posotita"))}
        </span>
        <div className="flex border border-k-line-2">
          <button
            type="button"
            onClick={() => setQuantity(optimisticQty - 1)}
            disabled={optimisticQty <= 1}
            aria-label={t("meiosi_posotitas")}
            className="h-11 w-[38px] border-0 bg-white text-[17px] text-k-ink disabled:text-k-text-5"
          >
            −
          </button>
          <span
            aria-live="polite"
            className="flex h-11 w-11 items-center justify-center border-x border-k-line-2 font-mono text-sm font-semibold text-k-ink"
          >
            {optimisticQty}
          </span>
          <button
            type="button"
            onClick={() => setQuantity(optimisticQty + 1)}
            aria-label={t("ayxisi_posotitas")}
            className="h-11 w-[38px] border-0 bg-white text-[17px] text-k-ink"
          >
            +
          </button>
        </div>
      </div>

      {/* Line total */}
      <div className="flex min-w-0 items-center justify-between @[600px]:block @[600px]:text-right">
        <span className="t-account-label text-k-text-4 @[600px]:hidden">{upGreek(t("synolo"))}</span>
        <span className="font-mono text-[19px] font-semibold whitespace-nowrap text-k-ink">
          {formatPrice(line.unitNetFinal * optimisticQty, locale, ctx)}
        </span>
      </div>

      {/* Remove */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={remove}
          aria-label={t("afairesi", { name: line.name })}
          className="flex h-11 w-11 items-center justify-center border border-k-line bg-white text-k-text-4 transition-colors hover:border-k-red hover:text-k-red"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
