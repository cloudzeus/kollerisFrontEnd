"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import NextImage from "next/image";
import {
  AlertTriangle,
  Check,
  Copy,
  Film,
  ImageIcon,
  Loader2,
  Scissors,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  actionAssetUsage,
  actionDeleteAsset,
  actionListAssets,
  actionRemoveBackground,
} from "@/app/admin/(protected)/media/actions";
import { uploadFiles } from "@/lib/media/upload-client";
import { fileSize, type MediaAssetView, type MediaKind } from "@/lib/media/library-types";
import type { AssetUsage } from "@/lib/media/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Η βιβλιοθήκη αρχείων.
 *
 * Μέχρι τώρα τα αρχεία υπήρχαν μόνο μέσα από τον επιλογέα ενός banner: για να
 * δει κανείς τι έχει ανέβει, έπρεπε να ανοίξει ένα banner, ένα κελί και έναν
 * διάλογο. Ό,τι ανέβηκε λάθος έμενε εκεί για πάντα, και τίποτα δεν έλεγε ποιο
 * αρχείο χρησιμοποιείται πουθενά.
 *
 * Δύο πράγματα κάνει αυτή η σελίδα που ο επιλογέας δεν μπορεί:
 *
 *   ΧΡΗΣΗ — κάθε πλακίδιο λέει σε πόσα σημεία εμφανίζεται. Χωρίς αυτό, η
 *   διαγραφή είναι στοίχημα: το αρχείο φεύγει από το CDN και το banner μένει
 *   με ένα κενό ορθογώνιο, χωρίς σφάλμα πουθενά.
 *
 *   ΔΙΑΣΤΑΣΕΙΣ — γράφονται πάνω στο πλακίδιο, γιατί εκεί κρύβεται το λάθος που
 *   κοστίζει: ένα κατακόρυφο 1080×1350 του Instagram μέσα σε οριζόντιο κελί
 *   χάνει το ένα τρίτο του καρέ, και το κείμενο που είναι ψημένο μέσα του
 *   εξαφανίζεται.
 */

const TABS: Array<{ id: "all" | MediaKind; label: string }> = [
  { id: "all", label: "Όλα" },
  { id: "image", label: "Εικόνες" },
  { id: "video", label: "Βίντεο" },
];

export function MediaLibrary({ initial }: { initial: MediaAssetView[] }) {
  const [assets, setAssets] = useState(initial);
  const [usage, setUsage] = useState<Record<string, AssetUsage[]>>({});
  const [kind, setKind] = useState<"all" | MediaKind>("all");
  const [query, setQuery] = useState("");
  const [busy, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ asset: MediaAssetView; usage: AssetUsage[] } | null>(
    null,
  );
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(
    (k: "all" | MediaKind, q: string) => {
      start(async () => {
        const rows = await actionListAssets({ kind: k === "all" ? undefined : k, query: q });
        setAssets(rows);
      });
    },
    [start],
  );

  // Η αναζήτηση περιμένει το δάχτυλο να σταματήσει· ένα ερώτημα ανά πλήκτρο
  // επιστρέφει και εκτός σειράς, οπότε η λίστα θα αναβόσβηνε.
  useEffect(() => {
    const t = setTimeout(() => refresh(kind, query), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [kind, query, refresh]);

  /*
   * Η χρήση ζητιέται ΜΕΤΑ τη λίστα, σε μία κλήση για όλα.
   * ─────────────────────────────────────────────────────────────────────────
   * Είναι πλήρης σάρωση των banners, οπότε δεν έχει θέση στο κρίσιμο μονοπάτι:
   * τα πλακίδια εμφανίζονται αμέσως και το σήμα χρήσης προσγειώνεται πάνω τους.
   */
  useEffect(() => {
    if (assets.length === 0) return;
    let alive = true;
    actionAssetUsage(assets.map((a) => a.url)).then((u) => alive && setUsage(u));
    return () => {
      alive = false;
    };
  }, [assets]);

  async function accept(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    const outcome = await uploadFiles(files, { folder: "library" });
    setUploading(false);
    for (const error of outcome.failed) toast.error(error);
    if (outcome.added.length) {
      setAssets((current) => [...outcome.added.map((a) => a.asset), ...current]);
      toast.success(
        outcome.added.length === 1 ? "Ανέβηκε." : `Ανέβηκαν ${outcome.added.length} αρχεία.`,
      );
    }
  }

  function copy(url: string) {
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(url);
        setTimeout(() => setCopied((c) => (c === url ? null : c)), 1600);
      },
      () => toast.error("Δεν έγινε αντιγραφή."),
    );
  }

  function remove(asset: MediaAssetView, force = false) {
    start(async () => {
      const result = await actionDeleteAsset(asset.id, force);
      if (result.ok) {
        setAssets((c) => c.filter((a) => a.id !== asset.id));
        setConfirm(null);
        toast.success("Διαγράφηκε.");
        return;
      }
      // Χρησιμοποιείται κάπου: αντί για σφάλμα, δείχνουμε ΠΟΥ και ρωτάμε.
      if (result.usage?.length) {
        setConfirm({ asset, usage: result.usage });
        return;
      }
      toast.error(result.error);
    });
  }

  function cutout(asset: MediaAssetView) {
    start(async () => {
      const result = await actionRemoveBackground(asset.url, asset.name);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAssets((c) => [result.asset, ...c]);
      toast.success("Το αντίγραφο χωρίς φόντο μπήκε στη βιβλιοθήκη.");
    });
  }

  const counts = useMemo(
    () => ({
      total: assets.length,
      unused: assets.filter((a) => !usage[a.url]?.length).length,
    }),
    [assets, usage],
  );

  return (
    <div className="space-y-4">
      {/* ── Γραμμή εργαλείων ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border border-k-line">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setKind(tab.id)}
              aria-pressed={kind === tab.id}
              className={cn(
                "px-3 py-1.5 text-[12px] transition-colors",
                kind === tab.id
                  ? "bg-k-ink text-white"
                  : "text-k-text-2 hover:bg-k-surface-2 hover:text-k-ink",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-k-text-4" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αναζήτηση με όνομα αρχείου…"
            className="pl-8"
          />
        </div>

        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            void accept([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          Ανέβασμα
        </Button>
      </div>

      <p className="text-[11.5px] text-k-text-3">
        <span className="numeral">{counts.total}</span> αρχεία
        {counts.unused > 0 && (
          <>
            {" · "}
            <span className="numeral">{counts.unused}</span> δεν χρησιμοποιούνται πουθενά
          </>
        )}
      </p>

      {/* ── Το πλέγμα, που είναι και ζώνη απόθεσης ── */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          void accept([...e.dataTransfer.files]);
        }}
        className={cn(
          "min-h-[16rem] border border-dashed p-3 transition-colors",
          dropping ? "border-k-ink bg-k-ink/5" : "border-k-line",
        )}
      >
        {busy && assets.length === 0 ? (
          <p className="py-16 text-center text-[12.5px] text-k-text-3">Φόρτωση…</p>
        ) : assets.length === 0 ? (
          <p className="py-16 text-center text-[12.5px] text-k-text-3">
            {query ? "Κανένα αρχείο με αυτό το όνομα." : "Σύρετε αρχεία εδώ, ή πατήστε «Ανέβασμα»."}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {assets.map((asset) => {
              const used = usage[asset.url] ?? [];
              return (
                <li key={asset.id} className="group border border-k-line bg-white">
                  <div className="relative aspect-[4/3] bg-k-surface-3">
                    {asset.kind === "video" ? (
                      <video
                        src={asset.url}
                        muted
                        loop
                        playsInline
                        // Παίζει μόνο όταν το κοιτάς: τέσσερα ταυτόχρονα βίντεο
                        // σε μια σελίδα είναι θόρυβος και δίκτυο.
                        onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                        onMouseLeave={(e) => e.currentTarget.pause()}
                        className="size-full object-contain"
                      />
                    ) : (
                      <NextImage
                        src={asset.url}
                        alt=""
                        fill
                        unoptimized
                        sizes="(min-width:1280px) 20vw, (min-width:640px) 40vw, 90vw"
                        className="object-contain"
                      />
                    )}

                    <span className="absolute left-1.5 top-1.5 flex items-center gap-1 bg-k-ink/80 px-1.5 py-0.5 text-[10px] text-white">
                      {asset.kind === "video" ? (
                        <Film className="size-2.5" />
                      ) : (
                        <ImageIcon className="size-2.5" />
                      )}
                      {asset.width && asset.height ? (
                        <span className="numeral">
                          {asset.width}×{asset.height}
                        </span>
                      ) : (
                        asset.kind
                      )}
                    </span>

                    {/* Το σήμα χρήσης — ο λόγος που η σελίδα υπάρχει. */}
                    <span
                      className={cn(
                        "absolute right-1.5 top-1.5 px-1.5 py-0.5 text-[10px]",
                        used.length
                          ? "bg-k-green/90 text-white"
                          : "bg-k-surface-2 text-k-text-3",
                      )}
                      title={used.map((u) => u.name).join(", ") || undefined}
                    >
                      {used.length ? `σε ${used.length}` : "αχρησιμοποίητο"}
                    </span>
                  </div>

                  <div className="space-y-1.5 p-2">
                    <p className="truncate text-[11.5px] font-medium text-k-ink" title={asset.name}>
                      {asset.name}
                    </p>
                    <p className="numeral text-[10.5px] text-k-text-4">{fileSize(asset.bytes)}</p>

                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copy(asset.url)}
                        className="h-7 flex-1 px-2 text-[11px]"
                      >
                        {copied === asset.url ? (
                          <Check className="size-3 text-k-green" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        {copied === asset.url ? "OK" : "URL"}
                      </Button>
                      {asset.kind === "image" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cutout(asset)}
                          disabled={busy}
                          title="Αντίγραφο χωρίς φόντο"
                          className="h-7 px-2"
                        >
                          <Scissors className="size-3" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => remove(asset)}
                        disabled={busy}
                        title="Διαγραφή"
                        className="h-7 px-2 text-k-text-3 hover:text-k-red"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Διαγραφή αρχείου που χρησιμοποιείται ── */}
      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-k-amber" />
              Χρησιμοποιείται αυτή τη στιγμή
            </DialogTitle>
            <DialogDescription>
              Η διαγραφή το βγάζει και από το CDN. Τα παρακάτω θα δείχνουν κενό — χωρίς μήνυμα
              λάθους, απλώς κενό.
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-[40vh] space-y-1 overflow-y-auto border border-k-line p-2">
            {confirm?.usage.map((u) => (
              <li key={`${u.kind}-${u.id}`} className="text-[12px] text-k-ink">
                <span className="text-k-text-4">{u.kind === "banner" ? "Banner" : "Widget"} · </span>
                {u.name}
              </li>
            ))}
          </ul>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Ακύρωση
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => confirm && remove(confirm.asset, true)}
            >
              Διαγραφή έτσι κι αλλιώς
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
