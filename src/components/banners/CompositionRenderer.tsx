import Image from "next/image";
import {
  COLOR_VALUE,
  FONT_STACK,
  layerStyle,
  type BadgeLayer,
  type ButtonLayer,
  type CellComposition,
  type ImageLayer,
  type Layer,
  type LocalisedText,
  type ShapeLayer,
  type TextLayer,
} from "@/lib/banners/contract";
import { applyTokens, type ResolvedCell } from "@/lib/banners/resolve-tokens";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/**
 * One cell's composition, rendered.
 *
 * A pure component — no data access, no `server-only` — because the same code
 * has to draw the storefront, the editor canvas and the preset thumbnails. A
 * preview built from a second implementation is a promise about the real one
 * that nothing keeps.
 *
 * The cell is a size container, so every layer's position and type size are
 * expressed against the cell itself. That is what makes a composition dragged
 * at 900px hold together at 375px without a second layout.
 */

const OVERLAY: Record<string, string> = {
  none: "",
  light: "linear-gradient(180deg,transparent 20%,rgba(16,16,18,.55) 100%)",
  medium: "linear-gradient(180deg,rgba(16,16,18,.15) 0%,rgba(16,16,18,.72) 100%)",
  strong: "linear-gradient(180deg,rgba(16,16,18,.45) 0%,rgba(16,16,18,.88) 100%)",
};

const BADGE_TONE: Record<BadgeLayer["tone"], string> = {
  ink: "bg-k-ink text-white",
  red: "bg-k-red text-white",
  amber: "bg-k-amber text-white",
  green: "bg-k-green text-white",
  white: "bg-white text-k-ink",
};

const localised = (text: LocalisedText, locale: Locale): string =>
  (text[locale] || text.el || "").trim();

export function CompositionRenderer({
  composition,
  resolved,
  locale,
  className,
}: {
  composition: CellComposition;
  resolved: ResolvedCell | undefined;
  locale: Locale;
  className?: string;
}) {
  const bg = composition.background;
  const tokens = resolved?.tokens ?? {};
  // `{image}` means the bound entity's own picture; anything else is a URL
  // somebody picked from the media library.
  const bgImage = applyTokens(bg.image, tokens).startsWith("{") ? "" : applyTokens(bg.image, tokens);

  return (
    <div
      className={cn("relative isolate size-full overflow-hidden", className)}
      style={{ containerType: "size", backgroundColor: COLOR_VALUE[bg.color] }}
    >
      {/* ── Φόντο: πάντα σε πλήρη κάλυψη ── */}
      {bg.kind === "video" && bg.video ? (
        <video
          src={bg.video}
          poster={bg.poster || undefined}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 -z-10 size-full object-cover"
          style={{
            objectPosition: `${bg.focus.x}% ${bg.focus.y}%`,
            transform: bg.scale !== 100 ? `scale(${bg.scale / 100})` : undefined,
          }}
        />
      ) : bg.kind === "image" && bgImage ? (
        <Image
          src={bgImage}
          alt=""
          fill
          sizes="(min-width:1024px) 60vw, 100vw"
          unoptimized
          className={cn("-z-10 object-cover", bg.kenBurns && "banner-ken-burns")}
          style={{
            objectPosition: `${bg.focus.x}% ${bg.focus.y}%`,
            transform: bg.scale !== 100 ? `scale(${bg.scale / 100})` : undefined,
          }}
        />
      ) : null}

      {bg.kind !== "none" && bg.overlay !== "none" && (
        <div
          className="absolute inset-0 -z-10"
          style={{ backgroundImage: OVERLAY[bg.overlay] }}
          aria-hidden
        />
      )}

      {composition.layers.map((layer) =>
        layer.hidden ? null : (
          <LayerView key={layer.id} layer={layer} tokens={tokens} locale={locale} />
        ),
      )}
    </div>
  );
}

function LayerView({
  layer,
  tokens,
  locale,
}: {
  layer: Layer;
  tokens: Record<string, string>;
  locale: Locale;
}) {
  // Read by the one motion island per banner rather than by a client component
  // per layer: the text stays server-rendered and the JavaScript is one script
  // for the whole grid.
  const motion =
    layer.anim.preset === "none"
      ? {}
      : {
          "data-anim": layer.anim.preset,
          "data-anim-delay": layer.anim.delay,
          "data-anim-duration": layer.anim.duration,
        };

  const style = layerStyle(layer);

  switch (layer.kind) {
    case "shape":
      return <ShapeView layer={layer} style={style} motion={motion} />;
    case "image":
      return <PictureView layer={layer} tokens={tokens} style={style} motion={motion} />;
    case "badge":
      return <BadgeView layer={layer} tokens={tokens} locale={locale} style={style} motion={motion} />;
    case "button":
      return <ButtonView layer={layer} tokens={tokens} locale={locale} style={style} motion={motion} />;
    default:
      return <TextView layer={layer} tokens={tokens} locale={locale} style={style} motion={motion} />;
  }
}

type Motion = Record<string, unknown>;

function ShapeView({
  layer,
  style,
  motion,
}: {
  layer: ShapeLayer;
  style: React.CSSProperties;
  motion: Motion;
}) {
  return (
    <div
      {...motion}
      aria-hidden
      style={{
        ...style,
        backgroundColor: COLOR_VALUE[layer.color],
        opacity: layer.opacity / 100,
      }}
    />
  );
}

function PictureView({
  layer,
  tokens,
  style,
  motion,
}: {
  layer: ImageLayer;
  tokens: Record<string, string>;
  style: React.CSSProperties;
  motion: Motion;
}) {
  const src = applyTokens(layer.src, tokens);
  // An unresolved `{image}` — an unbound cell, a product without photography —
  // draws nothing rather than a broken-image box.
  if (!src || src.startsWith("{")) return null;
  return (
    <div {...motion} style={{ ...style, opacity: layer.opacity / 100 }}>
      <Image
        src={src}
        alt=""
        fill
        sizes="(min-width:1024px) 40vw, 80vw"
        unoptimized
        className={layer.fit === "cover" ? "object-cover" : "object-contain"}
      />
    </div>
  );
}

function TextView({
  layer,
  tokens,
  locale,
  style,
  motion,
}: {
  layer: TextLayer;
  tokens: Record<string, string>;
  locale: Locale;
  style: React.CSSProperties;
  motion: Motion;
}) {
  const value = applyTokens(localised(layer.text, locale), tokens);
  if (!value) return null;

  return (
    <div
      {...motion}
      style={{
        ...style,
        display: "flex",
        flexDirection: "column",
        justifyContent:
          layer.style.valign === "center"
            ? "center"
            : layer.style.valign === "end"
              ? "flex-end"
              : "flex-start",
        textTransform: layer.style.uppercase ? "uppercase" : "none",
        textWrap: "balance",
      }}
    >
      <span>{value}</span>
    </div>
  );
}

function BadgeView({
  layer,
  tokens,
  locale,
  style,
  motion,
}: {
  layer: BadgeLayer;
  tokens: Record<string, string>;
  locale: Locale;
  style: React.CSSProperties;
  motion: Motion;
}) {
  const value = applyTokens(localised(layer.text, locale), tokens);
  // An offer with no badge should leave no empty coloured square behind.
  if (!value) return null;

  return (
    <div
      {...motion}
      className={cn("flex items-center justify-center px-[2.5cqw]", BADGE_TONE[layer.tone])}
      style={{
        ...style,
        // A badge sizes to its word. The drawn width is a floor, not a cage:
        // "-30%" clipped to "-3…" is worse than a badge slightly wider than the
        // box somebody dragged.
        width: "max-content",
        minWidth: `${layer.frame.w}%`,
        maxWidth: "100%",
        whiteSpace: "nowrap",
        textTransform: layer.style.uppercase ? "uppercase" : "none",
        lineHeight: 1,
      }}
    >
      {value}
    </div>
  );
}

function ButtonView({
  layer,
  tokens,
  locale,
  style,
  motion,
}: {
  layer: ButtonLayer;
  tokens: Record<string, string>;
  locale: Locale;
  style: React.CSSProperties;
  motion: Motion;
}) {
  const value = applyTokens(localised(layer.text, locale), tokens);
  if (!value) return null;

  const onDark = layer.style.color === "white";

  return (
    <div
      {...motion}
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        textTransform: layer.style.uppercase ? "uppercase" : "none",
        color: COLOR_VALUE[layer.style.color],
        fontFamily: FONT_STACK[layer.style.font],
      }}
    >
      <span
        className={cn(
          "inline-flex w-fit max-w-full items-center gap-[1.5cqw] whitespace-nowrap transition-colors",
          layer.variant === "underline" && "border-b-[.25cqw] border-k-red pb-[0.6cqw]",
          layer.variant === "solid" &&
            cn("px-[3cqw] py-[1.6cqw]", onDark ? "bg-white text-k-ink" : "bg-k-red text-white"),
          layer.variant === "outline" && "border-[.2cqw] border-current px-[3cqw] py-[1.6cqw]",
        )}
      >
        {value}
        {layer.variant === "underline" && <span aria-hidden>→</span>}
      </span>
    </div>
  );
}
