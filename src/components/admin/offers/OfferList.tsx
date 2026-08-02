"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { actionDeleteOffer } from "@/app/admin/(protected)/offers/actions";
import { offerStatus } from "@/lib/banners/contract";
import { DISCOUNT_LABEL, SCOPE_LABEL, type OfferRow } from "@/lib/offers/offer-types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/**
 * The campaigns, at a glance.
 *
 * Status is derived from the dates rather than read from the switch: a campaign
 * turned on in March and ended in April is still `isActive` in the database and
 * invisible on the site, and the column that says "Ενεργή" about it is the one
 * that costs somebody an afternoon.
 */

const STATUS: Record<string, { label: string; className: string }> = {
  live: { label: "Ενεργή", className: "bg-k-green text-white" },
  scheduled: { label: "Προγραμματισμένη", className: "bg-k-amber text-white" },
  expired: { label: "Έληξε", className: "bg-k-surface-3 text-k-text-3" },
  off: { label: "Ανενεργή", className: "bg-k-surface-3 text-k-text-3" },
};

const dt = new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeZone: "Europe/Athens" });

/** What the campaign takes off, in the shortest honest phrase. */
function terms(offer: OfferRow): string {
  switch (offer.discount) {
    case "percent":
      return offer.discountValue ? `−${offer.discountValue}%` : DISCOUNT_LABEL.percent;
    case "amount":
      return offer.discountValue ? `−${offer.discountValue}€` : DISCOUNT_LABEL.amount;
    case "bogo":
      return `${offer.bogoBuy ?? 1} + ${offer.bogoFree ?? 1} δώρο`;
    default:
      return "—";
  }
}

function reach(offer: OfferRow): string {
  if (offer.scope === "brand") return offer.brandSlug || SCOPE_LABEL.brand;
  if (offer.scope === "category") return offer.categorySlug || SCOPE_LABEL.category;
  return `${offer.productSlugs.length} προϊόντα`;
}

export function OfferList({ offers }: { offers: OfferRow[] }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<OfferRow | null>(null);
  const [busy, start] = useTransition();

  function remove(offer: OfferRow) {
    setConfirm(null);
    start(async () => {
      await actionDeleteOffer(offer.id);
      toast.success(`Η «${offer.titleEl}» διαγράφηκε.`);
      router.refresh();
    });
  }

  if (offers.length === 0) {
    return (
      <div className="border border-dashed border-k-line bg-white px-6 py-12 text-center">
        <Tag className="mx-auto size-7 text-k-text-4" />
        <p className="mt-3 text-[13px] font-medium text-k-ink">Καμία προσφορά ακόμη</p>
        <p className="mx-auto mt-1 max-w-[52ch] text-[12px] leading-[1.6] text-k-text-3">
          Μια καμπάνια στήνεται σε τέσσερα βήματα — τι λέει, σε τι εφαρμόζεται, τι κόβει, πώς
          φαίνεται — και μετά μπαίνει σε όποιο banner θέλετε.
        </p>
        <Button asChild className="mt-4">
          <Link href="/admin/offers/new">Νέα προσφορά</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className={cn("border border-k-line bg-white", busy && "opacity-60")}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-k-line text-left">
              {["Προσφορά", "Εύρος", "Έκπτωση", "Περίοδος", "Κατάσταση", ""].map((h, i) => (
                <th
                  key={h || i}
                  className="px-3 py-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-k-text-4"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => {
              const status = offerStatus(offer);
              return (
                <tr key={offer.id} className="border-b border-k-line last:border-0">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/offers/${offer.id}`}
                      className="block truncate text-[12.5px] font-medium text-k-ink hover:underline"
                    >
                      {offer.titleEl}
                    </Link>
                    <span className="flex items-center gap-1.5">
                      {offer.badge && (
                        <span className="bg-k-red px-1 py-px text-[9.5px] font-semibold text-white">
                          {offer.badge}
                        </span>
                      )}
                      <span className="truncate font-mono text-[10.5px] text-k-text-4">
                        {offer.slug}
                      </span>
                      {/* Untranslated campaigns are invisible to half the shop. */}
                      {(!offer.titleEn.trim() || !offer.titleIt.trim()) && (
                        <span className="text-[10px] text-k-amber">χωρίς μετάφραση</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[11.5px] text-k-text-2">{reach(offer)}</td>
                  <td className="numeral px-3 py-2.5 text-[11.5px] text-k-ink">{terms(offer)}</td>
                  <td className="numeral px-3 py-2.5 text-[11.5px] text-k-text-2">
                    {offer.startsAt || offer.endsAt
                      ? `${offer.startsAt ? dt.format(offer.startsAt) : "—"} → ${offer.endsAt ? dt.format(offer.endsAt) : "—"}`
                      : "Χωρίς όρια"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-block px-1.5 py-0.5 text-[10.5px] font-medium",
                        STATUS[status].className,
                      )}
                    >
                      {STATUS[status].label}
                    </span>
                    {offer.maxTotal != null && (
                      <span className="numeral mt-0.5 block text-[10px] text-k-text-4">
                        {offer.usedCount}/{offer.maxTotal}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={`Ενέργειες για ${offer.titleEl}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/offers/${offer.id}`}>
                            <Pencil className="size-3.5" />
                            Επεξεργασία
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setTimeout(() => setConfirm(offer), 0)}
                        >
                          <Trash2 className="size-3.5" />
                          Διαγραφή
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή «{confirm?.titleEl}»;</AlertDialogTitle>
            <AlertDialogDescription>
              Όσα banners τη δείχνουν θα εμφανίζουν κενό κελί. Εναλλακτικά, απενεργοποιήστε την.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirm && remove(confirm)}
              className="bg-k-red hover:bg-k-red/90"
            >
              Διαγραφή
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
