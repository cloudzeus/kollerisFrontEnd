"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutTemplate, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { actionDeleteTemplate } from "@/app/admin/(protected)/banners/actions";
import { cellStyle, type GridTemplateView } from "@/lib/banners/contract";
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
 * The saved layouts.
 *
 * Each card is the layout itself at thumbnail size. A template's identity is
 * its shape, and a list of names with "12×6" beside them tells nobody which one
 * they meant.
 */

export function TemplateList({
  templates,
  usage,
}: {
  templates: GridTemplateView[];
  /** templateId → how many banners are drawn on it. */
  usage: Record<string, number>;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<GridTemplateView | null>(null);
  const [pending, start] = useTransition();

  function remove(t: GridTemplateView) {
    setConfirm(null);
    start(async () => {
      const result = await actionDeleteTemplate(t.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Το «${t.name}» διαγράφηκε.`);
      router.refresh();
    });
  }

  if (templates.length === 0) {
    return (
      <div className="border border-dashed border-k-line bg-white px-6 py-12 text-center">
        <LayoutTemplate className="mx-auto size-7 text-k-text-4" />
        <p className="mt-3 text-[13px] font-medium text-k-ink">Κανένα πλέγμα ακόμη</p>
        <p className="mx-auto mt-1 max-w-[46ch] text-[12px] leading-[1.6] text-k-text-3">
          Το πλέγμα ορίζει πώς χωρίζεται ο χώρος του banner. Σχεδιάζεται μία φορά και το
          χρησιμοποιούν όσα banners θέλετε.
        </p>
        <Button asChild className="mt-4">
          <Link href="/admin/banners/templates/new">Σχεδιασμός πλέγματος</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => {
          const used = usage[t.id] ?? 0;
          return (
            <li key={t.id} className={cn("border border-k-line bg-white", pending && "opacity-60")}>
              <Link
                href={`/admin/banners/templates/${t.id}`}
                className="block border-b border-k-line bg-k-surface-2 p-3 transition-colors hover:bg-k-surface-3"
              >
                <span
                  className="grid w-full gap-1"
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
              </Link>

              <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <Link
                    href={`/admin/banners/templates/${t.id}`}
                    className="block truncate text-[13px] font-medium text-k-ink hover:underline"
                  >
                    {t.name}
                  </Link>
                  <p className="numeral mt-0.5 text-[11px] text-k-text-3">
                    {t.columns}×{t.rows} · {t.cells.length}{" "}
                    {t.cells.length === 1 ? "κελί" : "κελιά"}
                    {t.aspect ? ` · ${t.aspect}` : ""}
                    {used > 0 ? ` · ${used} banner${used === 1 ? "" : "s"}` : ""}
                  </p>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Ενέργειες για ${t.name}`}>
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/banners/templates/${t.id}`}>
                        <Pencil className="size-3.5" />
                        Επεξεργασία
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setTimeout(() => setConfirm(t), 0)}
                    >
                      <Trash2 className="size-3.5" />
                      Διαγραφή
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          );
        })}
      </ul>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή «{confirm?.name}»;</AlertDialogTitle>
            <AlertDialogDescription>
              {usage[confirm?.id ?? ""] ? (
                <>
                  Το πλέγμα χρησιμοποιείται από {usage[confirm!.id]} banner
                  {usage[confirm!.id] === 1 ? "" : "s"} και δεν μπορεί να διαγραφεί. Διαγράψτε πρώτα
                  τα banners.
                </>
              ) : (
                "Το πλέγμα θα διαγραφεί οριστικά. Δεν χρησιμοποιείται από κανένα banner."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirm && remove(confirm)}
              disabled={Boolean(usage[confirm?.id ?? ""])}
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
