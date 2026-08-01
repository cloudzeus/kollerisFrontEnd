"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  actionDeleteOffer,
  actionSaveOffer,
} from "@/app/admin/(protected)/offers/actions";
import { offerStatus, type OfferView } from "@/lib/banners/contract";
import { MediaField } from "@/components/admin/MediaPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
 * Campaigns.
 *
 * An offer is written once here and bound by slug from any number of banner
 * cells, so its title, badge and destination are edited in one place rather
 * than retyped into every banner that shows it.
 *
 * The status column is derived from the dates, not from the switch: a campaign
 * turned on in March and ended in April is still "active" in the database and
 * invisible on the site, which is exactly the confusion this screen exists to
 * prevent.
 */

const STATUS: Record<string, { label: string; className: string }> = {
  live: { label: "Ενεργή", className: "bg-k-green text-white" },
  scheduled: { label: "Προγραμματισμένη", className: "bg-k-amber text-white" },
  expired: { label: "Έληξε", className: "bg-k-surface-3 text-k-text-3" },
  off: { label: "Ανενεργή", className: "bg-k-surface-3 text-k-text-3" },
};

const dt = new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeZone: "Europe/Athens" });

/** `datetime-local` speaks local wall-clock time with no zone; Date does not. */
function toLocalInput(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Greek titles need transliteration before they can be a slug at all. */
const GREEK: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k",
  λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t",
  υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o", ά: "a", έ: "e", ή: "i", ί: "i", ό: "o",
  ύ: "y", ώ: "o", ϊ: "i", ϋ: "y", ΐ: "i", ΰ: "y",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => GREEK[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

type Draft = {
  id?: string;
  slug: string;
  title: string;
  badge: string;
  href: string;
  image: string;
  imageWide: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  /** False once the slug has been typed, so editing the title stops rewriting it. */
  slugAuto: boolean;
};

const blank = (): Draft => ({
  slug: "",
  title: "",
  badge: "",
  href: "/katalogos",
  image: "",
  imageWide: "",
  startsAt: "",
  endsAt: "",
  isActive: true,
  slugAuto: true,
});

const toDraft = (o: OfferView): Draft => ({
  id: o.id,
  slug: o.slug,
  title: o.title,
  badge: o.badge ?? "",
  href: o.href,
  image: o.image ?? "",
  imageWide: o.imageWide ?? "",
  startsAt: toLocalInput(o.startsAt),
  endsAt: toLocalInput(o.endsAt),
  isActive: o.isActive,
  slugAuto: false,
});

export function OfferManager({ offers }: { offers: OfferView[] }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<OfferView | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  function save() {
    if (!draft) return;
    start(async () => {
      const result = await actionSaveOffer({
        id: draft.id,
        slug: draft.slug,
        title: draft.title,
        badge: draft.badge,
        href: draft.href,
        image: draft.image,
        imageWide: draft.imageWide,
        startsAt: draft.startsAt || null,
        endsAt: draft.endsAt || null,
        isActive: draft.isActive,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(draft.id ? "Η προσφορά ενημερώθηκε." : "Η προσφορά δημιουργήθηκε.");
      setDraft(null);
    });
  }

  function remove(o: OfferView) {
    setConfirm(null);
    start(async () => {
      const result = await actionDeleteOffer(o.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Η «${o.title}» διαγράφηκε.`);
    });
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setDraft(blank())}>
          <Plus className="size-3.5" />
          Νέα προσφορά
        </Button>
      </div>

      {offers.length === 0 ? (
        <div className="border border-dashed border-k-line bg-white px-6 py-12 text-center">
          <Tag className="mx-auto size-7 text-k-text-4" />
          <p className="mt-3 text-[13px] font-medium text-k-ink">Καμία προσφορά ακόμη</p>
          <p className="mx-auto mt-1 max-w-[52ch] text-[12px] leading-[1.6] text-k-text-3">
            Μια προσφορά γράφεται εδώ μία φορά — τίτλος, badge, σύνδεσμος, εικόνες — και μετά
            συνδέεται σε όσα banners θέλετε.
          </p>
        </div>
      ) : (
        <div className={cn("border border-k-line bg-white", pending && "opacity-60")}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-k-line text-left">
                {["Προσφορά", "Slug", "Περίοδος", "Κατάσταση", ""].map((h, i) => (
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
              {offers.map((o) => {
                const status = offerStatus(o);
                return (
                  <tr key={o.id} className="border-b border-k-line last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {o.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={o.image}
                            alt=""
                            className="size-8 shrink-0 border border-k-line object-contain"
                          />
                        ) : (
                          <span className="grid size-8 shrink-0 place-items-center border border-k-line bg-k-surface-2">
                            <Tag className="size-3 text-k-text-5" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-medium text-k-ink">{o.title}</p>
                          <p className="truncate text-[11px] text-k-text-3">{o.href}</p>
                        </div>
                        {o.badge && (
                          <span className="shrink-0 bg-k-red px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {o.badge}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-k-text-3">{o.slug}</td>
                    <td className="numeral px-3 py-2.5 text-[11.5px] text-k-text-2">
                      {o.startsAt || o.endsAt
                        ? `${o.startsAt ? dt.format(o.startsAt) : "—"} → ${o.endsAt ? dt.format(o.endsAt) : "—"}`
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
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`Ενέργειες για ${o.title}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setTimeout(() => setDraft(toDraft(o)), 0)}>
                            <Pencil className="size-3.5" />
                            Επεξεργασία
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setTimeout(() => setConfirm(o), 0)}
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
      )}

      {/* ── Φόρμα ── */}
      <Sheet open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[30rem]">
          <SheetHeader>
            <SheetTitle>{draft?.id ? "Επεξεργασία προσφοράς" : "Νέα προσφορά"}</SheetTitle>
            <SheetDescription>
              Ο τίτλος, το badge και ο σύνδεσμος εμφανίζονται σε κάθε banner που τη δείχνει.
            </SheetDescription>
          </SheetHeader>

          {draft && (
            <div className="space-y-4 px-4">
              <div className="space-y-1.5">
                <Label htmlFor="of-title" className="text-[11.5px]">
                  Τίτλος
                </Label>
                <Input
                  id="of-title"
                  value={draft.title}
                  onChange={(e) =>
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            title: e.target.value,
                            slug: d.slugAuto ? slugify(e.target.value) : d.slug,
                          }
                        : d,
                    )
                  }
                  maxLength={160}
                  placeholder="π.χ. Καλοκαιρινές τιμές σε FACOM"
                />
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="of-slug" className="text-[11.5px]">
                    Slug
                  </Label>
                  <Input
                    id="of-slug"
                    value={draft.slug}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, slug: slugify(e.target.value), slugAuto: false } : d,
                      )
                    }
                    className="font-mono text-[12px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="of-badge" className="text-[11.5px]">
                    Badge
                  </Label>
                  <Input
                    id="of-badge"
                    value={draft.badge}
                    onChange={(e) => set("badge", e.target.value)}
                    maxLength={40}
                    placeholder="-30%"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="of-href" className="text-[11.5px]">
                  Σύνδεσμος
                </Label>
                <Input
                  id="of-href"
                  value={draft.href}
                  onChange={(e) => set("href", e.target.value)}
                  maxLength={255}
                  placeholder="/katalogos?brand=facom"
                />
                <p className="text-[11px] text-k-text-4">
                  Πού πηγαίνει ο επισκέπτης. Κάθε banner που δείχνει την προσφορά οδηγεί εδώ.
                </p>
              </div>

              {/* Two crops, because a cell three units wide and one tall cannot
                  use the same artwork as a square one. Each banner cell picks. */}
              <div className="space-y-3 border-t border-k-line pt-3">
                <div className="space-y-1.5">
                  <Label className="text-[11.5px]">Εικόνα</Label>
                  <MediaField
                    label="Εικόνα προσφοράς"
                    value={draft.image}
                    onChange={(url) => set("image", url)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11.5px]">Εικόνα πλατιά</Label>
                  <MediaField
                    label="Πλατιά εικόνα προσφοράς"
                    value={draft.imageWide}
                    onChange={(url) => set("imageWide", url)}
                  />
                  <p className="text-[11px] text-k-text-4">
                    Για φαρδιά κελιά. Αν λείπει, χρησιμοποιείται η κανονική.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-k-line pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="of-from" className="text-[11.5px]">
                    Έναρξη
                  </Label>
                  <Input
                    id="of-from"
                    type="datetime-local"
                    value={draft.startsAt}
                    onChange={(e) => set("startsAt", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="of-to" className="text-[11.5px]">
                    Λήξη
                  </Label>
                  <Input
                    id="of-to"
                    type="datetime-local"
                    value={draft.endsAt}
                    onChange={(e) => set("endsAt", e.target.value)}
                  />
                </div>
              </div>

              <label className="flex items-center justify-between border border-k-line px-3 py-2.5">
                <span className="text-[12.5px] text-k-ink">Ενεργή</span>
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(v) => set("isActive", v)}
                  aria-label="Ενεργή"
                />
              </label>
              <p className="-mt-2 text-[11px] leading-[1.5] text-k-text-4">
                Ο διακόπτης μπορεί μόνο να την κρύψει. Οι ημερομηνίες αποφασίζουν πότε εμφανίζεται.
              </p>
            </div>
          )}

          <SheetFooter>
            <Button onClick={save} disabled={pending}>
              Αποθήκευση
            </Button>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Άκυρο
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή «{confirm?.title}»;</AlertDialogTitle>
            <AlertDialogDescription>
              Όσα banners τη δείχνουν θα εμφανίζουν κενό κελί στη θέση της. Εναλλακτικά,
              απενεργοποιήστε την για να τη διατηρήσετε.
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
