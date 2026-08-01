"use client";

import { useEffect, useState } from "react";
import { Laptop, Smartphone, Tablet } from "lucide-react";
import { BannerRenderer } from "@/components/banners/BannerRenderer";
import type { BannerContent, GridTemplateView } from "@/lib/banners/contract";
import type { ResolvedCell } from "@/lib/banners/resolve-tokens";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The banner at three widths.
 *
 * Rendered by the same `BannerRenderer` the storefront uses, against the
 * editor's in-memory draft. A preview built from a second implementation is a
 * promise about the real one that nothing keeps.
 *
 * Each viewport is a real width — 1440 / 768 / 390 — scaled down only for
 * display. That is why the banner's responsive rules are container queries
 * rather than media queries: a media query would read the desktop window this
 * modal is open in and show the desktop layout at all three settings, which is
 * the one thing a responsive preview must not do.
 */

const VIEWPORTS = [
  { id: "desktop", label: "Υπολογιστής", width: 1440, icon: Laptop },
  { id: "tablet", label: "Tablet", width: 768, icon: Tablet },
  { id: "mobile", label: "Κινητό", width: 390, icon: Smartphone },
] as const;

export function PreviewModal({
  open,
  onOpenChange,
  template,
  content,
  resolved,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: GridTemplateView;
  content: BannerContent;
  resolved: Map<string, ResolvedCell>;
  footer?: React.ReactNode;
}) {
  const [viewport, setViewport] = useState<(typeof VIEWPORTS)[number]["id"]>("desktop");
  const width = VIEWPORTS.find((v) => v.id === viewport)!.width;

  // The two nodes are held in state rather than in refs: the dialog mounts its
  // content in a portal, and an effect keyed on `open` can run before those
  // refs are populated — which left the preview measured at zero and therefore
  // invisible. A callback ref fires exactly when the node attaches, so the
  // measurement cannot be early.
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);

  // The scaled element keeps its unscaled layout box, so the stage has to be
  // told how tall the result actually is.
  useEffect(() => {
    if (!stage || !frame) return;

    const measure = () => {
      const available = stage.clientWidth;
      if (available === 0) return;
      const next = Math.min(1, available / width);
      setScale(next);
      setHeight(frame.offsetHeight * next);
    };

    measure();
    // The dialog animates in, so the first measurement can land on a stage that
    // is not at its final size yet. One more after the animation settles.
    const raf = requestAnimationFrame(measure);
    const timer = setTimeout(measure, 200);

    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(stage);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [stage, frame, width, resolved]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,80rem)] overflow-y-auto sm:max-w-none">
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <DialogTitle>Προεπισκόπηση</DialogTitle>
          <div className="flex border border-k-line">
            {VIEWPORTS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setViewport(v.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] transition-colors",
                  viewport === v.id
                    ? "bg-k-ink text-white"
                    : "text-k-text-2 hover:bg-k-surface-2 hover:text-k-ink",
                )}
                aria-pressed={viewport === v.id}
              >
                <v.icon className="size-3.5" />
                {v.label}
                <span className="numeral text-[10px] opacity-70">{v.width}</span>
              </button>
            ))}
          </div>
        </DialogHeader>

        <div ref={setStage} className="overflow-hidden bg-k-surface-2 p-4">
          {/* Hidden until measured: an unscaled 1440 frame for one frame reads
              as a broken layout rather than as a preview still loading. */}
          <div
            style={{ height: height || undefined, width: width * scale }}
            className={cn("mx-auto transition-opacity", height === 0 && "opacity-0")}
          >
            <div
              ref={setFrame}
              style={{
                width,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
              className="bg-white shadow-sm"
            >
              <BannerRenderer
                template={template}
                content={content}
                resolved={resolved}
                locale="el"
                interactive={false}
              />
            </div>
          </div>
        </div>

        {footer && <div className="flex justify-end gap-2">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}
