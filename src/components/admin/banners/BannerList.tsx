"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, LayoutTemplate, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  actionCreateBanner,
  actionDeleteBanner,
  actionDuplicateBanner,
} from "@/app/admin/(protected)/banners/actions";
import { cellStyle, type GridTemplateView } from "@/lib/banners/contract";
import { ZONES } from "@/lib/zones/registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * Saved banners.
 *
 * The state and the placements are the two columns that matter: one says
 * whether what you see in the editor is what the site shows, the other says
 * where "the site" is. A banner placed nowhere is called out rather than left
 * looking finished.
 */

export type BannerRow = {
  id: string;
  name: string;
  templateName: string;
  state: "empty" | "draft" | "published" | "modified";
  placements: string[];
  updatedAt: Date;
};

const STATE: Record<BannerRow["state"], { label: string; className: string }> = {
  empty: { label: "Κενό", className: "bg-k-surface-3 text-k-text-3" },
  draft: { label: "Πρόχειρο", className: "bg-k-amber text-white" },
  published: { label: "Δημοσιευμένο", className: "bg-k-green text-white" },
  modified: { label: "Μη δημοσιευμένες αλλαγές", className: "bg-k-amber text-white" },
};

const dt = new Intl.DateTimeFormat("el-GR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Athens",
});

export function BannerList({
  banners,
  templates,
}: {
  banners: BannerRow[];
  templates: GridTemplateView[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [confirm, setConfirm] = useState<BannerRow | null>(null);
  const [busy, start] = useTransition();

  function create() {
    start(async () => {
      const result = await actionCreateBanner(name, templateId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCreating(false);
      setName("");
      router.push(`/admin/banners/${result.id}`);
    });
  }

  /*
   * Αντίγραφο, και αμέσως μέσα του.
   * ───────────────────────────────────────────────────────────────────────────
   * Ο λόγος που κάποιος βγάζει αντίγραφο είναι για να το αλλάξει· να μείνει
   * στη λίστα και να ψάξει ποια από τις δύο σειρές είναι η καινούργια είναι
   * ένα βήμα που δεν χρειάζεται να υπάρχει.
   */
  function duplicate(b: BannerRow) {
    start(async () => {
      const result = await actionDuplicateBanner(b.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Το αντίγραφο δημιουργήθηκε ως πρόχειρο, χωρίς θέσεις.");
      router.push(`/admin/banners/${result.id}`);
    });
  }

  function remove(b: BannerRow) {
    setConfirm(null);
    start(async () => {
      const result = await actionDeleteBanner(b.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Το «${b.name}» διαγράφηκε.`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setCreating(true)} disabled={templates.length === 0}>
          <Plus className="size-3.5" />
          Νέο banner
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="border border-dashed border-k-line bg-white px-6 py-12 text-center">
          <LayoutTemplate className="mx-auto size-7 text-k-text-4" />
          <p className="mt-3 text-[13px] font-medium text-k-ink">Χρειάζεται πρώτα ένα πλέγμα</p>
          <p className="mx-auto mt-1 max-w-[48ch] text-[12px] leading-[1.6] text-k-text-3">
            Ένα banner σχεδιάζεται πάνω σε πλέγμα — πρώτα ορίζετε πώς χωρίζεται ο χώρος, μετά τι
            μπαίνει σε κάθε κελί.
          </p>
          <Button asChild className="mt-4">
            <Link href="/admin/banners/templates/new">Σχεδιασμός πλέγματος</Link>
          </Button>
        </div>
      ) : banners.length === 0 ? (
        <div className="border border-dashed border-k-line bg-white px-6 py-12 text-center">
          <p className="text-[13px] font-medium text-k-ink">Κανένα banner ακόμη</p>
          <p className="mx-auto mt-1 max-w-[48ch] text-[12px] leading-[1.6] text-k-text-3">
            Διαλέξτε ένα πλέγμα και γεμίστε τα κελιά του με προϊόντα, προσφορές ή δικό σας κείμενο.
          </p>
        </div>
      ) : (
        <div className={cn("border border-k-line bg-white", busy && "opacity-60")}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-k-line text-left">
                {["Banner", "Πλέγμα", "Τοποθέτηση", "Κατάσταση", "Ενημερώθηκε", ""].map((h, i) => (
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
              {banners.map((b) => (
                <tr key={b.id} className="border-b border-k-line last:border-0">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/banners/${b.id}`}
                      className="text-[12.5px] font-medium text-k-ink hover:underline"
                    >
                      {b.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-[11.5px] text-k-text-3">{b.templateName}</td>
                  <td className="px-3 py-2.5 text-[11.5px]">
                    {b.placements.length === 0 ? (
                      <span className="text-k-text-4">Πουθενά</span>
                    ) : (
                      <span className="text-k-text-2">
                        {b.placements
                          .map((z) => ZONES.find((def) => def.id === z)?.label ?? z)
                          .join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-block px-1.5 py-0.5 text-[10.5px] font-medium",
                        STATE[b.state].className,
                      )}
                    >
                      {STATE[b.state].label}
                    </span>
                  </td>
                  <td className="numeral px-3 py-2.5 text-[11px] text-k-text-3">
                    {dt.format(b.updatedAt)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={`Ενέργειες για ${b.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/banners/${b.id}`}>
                            <Pencil className="size-3.5" />
                            Επεξεργασία
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => duplicate(b)}>
                          <Copy className="size-3.5" />
                          Δημιουργία αντιγράφου
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setTimeout(() => setConfirm(b), 0)}
                        >
                          <Trash2 className="size-3.5" />
                          Διαγραφή
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Νέο banner ── */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-[34rem]">
          <DialogHeader>
            <DialogTitle>Νέο banner</DialogTitle>
            <DialogDescription>
              Το πλέγμα ορίζει τη διάταξη. Μπορεί να αλλάξει αργότερα μόνο σχεδιάζοντας νέο.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bn-new-name" className="text-[11.5px]">
                Όνομα
              </Label>
              <Input
                id="bn-new-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="π.χ. Αρχική — καλοκαίρι"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11.5px]">Πλέγμα</Label>
              <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      className={cn(
                        "w-full space-y-1 border p-1.5 text-left transition-colors",
                        templateId === t.id ? "border-k-ink" : "border-k-line hover:border-k-ink",
                      )}
                    >
                      <span
                        className="grid w-full gap-px bg-k-surface-2"
                        style={{
                          aspectRatio: t.aspect ?? "16/7",
                          gridTemplateColumns: `repeat(${t.columns}, minmax(0,1fr))`,
                          gridTemplateRows: `repeat(${t.rows}, minmax(0,1fr))`,
                        }}
                        aria-hidden
                      >
                        {t.cells.map((c) => (
                          <span key={c.id} style={cellStyle(c)} className="bg-k-ink/15" />
                        ))}
                      </span>
                      <span className="block truncate text-[11px] text-k-text-2">{t.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Άκυρο
            </Button>
            <Button onClick={create} disabled={busy || !name.trim() || !templateId}>
              Δημιουργία
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή «{confirm?.name}»;</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && confirm.placements.length > 0
                ? `Είναι τοποθετημένο σε ${confirm.placements.length} ${confirm.placements.length === 1 ? "ζώνη" : "ζώνες"} και θα εξαφανιστεί από το site αμέσως.`
                : "Δεν είναι τοποθετημένο πουθενά. Η διαγραφή δεν επηρεάζει το site."}
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
