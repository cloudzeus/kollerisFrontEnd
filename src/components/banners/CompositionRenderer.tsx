import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { FitText } from "@/components/banners/FitText";
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
  type TickerLayer,
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
  interactive = true,
}: {
  composition: CellComposition;
  resolved: ResolvedCell | undefined;
  locale: Locale;
  className?: string;
  /**
   * Whether links render as links.
   *
   * Off inside the admin. The localised `Link` needs next-intl's provider, and
   * `/admin` sits outside the locale tree on purpose — rendering one there
   * throws "No intl context found" and takes the editor down with it. Nothing
   * in an editing canvas wants to be navigable anyway.
   */
  interactive?: boolean;
}) {
  const bg = composition.background;
  const tokens = resolved?.tokens ?? {};
  // `{image}` means the bound entity's own picture; anything else is a URL
  // somebody picked from the media library.
  const bgImage = applyTokens(bg.image, tokens).startsWith("{") ? "" : applyTokens(bg.image, tokens);

  return (
    <div
      className={cn("bn-clip relative isolate size-full overflow-hidden", className)}
      style={{ containerType: "size", backgroundColor: COLOR_VALUE[bg.color] }}
    >
      {/* ── Φόντο ──
          «Πάντα σε πλήρη κάλυψη» ήταν λάθος για το βίντεο. Το object-cover
          γεμίζει το κελί κόβοντας ό,τι περισσεύει, και το κελί σπάνια έχει
          την αναλογία του υλικού — ένα βίντεο προϊόντος έχανε το θέμα του
          μόλις άλλαζε το ύψος του banner. Το «Ολόκληρο» το δείχνει ακέραιο. */}
      {bg.kind === "video" && bg.video ? (
        <video
          src={bg.video}
          poster={bg.poster || undefined}
          autoPlay
          muted
          loop
          playsInline
          className={cn(
            "absolute inset-0 -z-10 size-full",
            bg.fit === "contain" ? "object-contain" : "object-cover",
          )}
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
          className={cn(
            "-z-10",
            bg.fit === "contain" ? "object-contain" : "object-cover",
            bg.kenBurns && "banner-ken-burns",
          )}
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
          <LayerView
            key={layer.id}
            layer={layer}
            tokens={tokens}
            items={resolved?.items}
            locale={locale}
            interactive={interactive}
          />
        ),
      )}
    </div>
  );
}

function LayerView({
  layer,
  tokens,
  items,
  locale,
  interactive,
}: {
  layer: Layer;
  tokens: Record<string, string>;
  items: ResolvedCell["items"];
  locale: Locale;
  interactive: boolean;
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
    case "ticker":
      return <TickerView layer={layer} items={items} style={style} motion={motion} />;
    case "shape":
      return <ShapeView layer={layer} style={style} motion={motion} />;
    case "image":
      return <PictureView layer={layer} tokens={tokens} style={style} motion={motion} />;
    case "badge":
      return <BadgeView layer={layer} tokens={tokens} locale={locale} style={style} motion={motion} />;
    case "button":
      return (
        <ButtonView
          layer={layer}
          tokens={tokens}
          locale={locale}
          style={style}
          motion={motion}
          interactive={interactive}
        />
      );
    default:
      return <TextView layer={layer} tokens={tokens} locale={locale} style={style} motion={motion} />;
  }
}

type Motion = Record<string, unknown>;

/**
 * The product set, one at a time.
 *
 * Every slide is in the markup, with the first marked active. That is what a
 * crawler reads and what a visitor sees if the script never runs — a perfectly
 * good product tile rather than an empty box — and the cycling is one attribute
 * for the motion island to find.
 *
 * No links inside: the cell is already a link, and nesting one inside another
 * is invalid markup that browsers resolve by guessing.
 */
function TickerView({
  layer,
  items,
  style,
  motion,
}: {
  layer: TickerLayer;
  items: ResolvedCell["items"];
  style: React.CSSProperties;
  motion: Motion;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div
      {...motion}
      data-ticker
      data-interval={layer.interval}
      data-effect={layer.effect}
      style={style}
      className="banner-ticker"
    >
      {items.map((item, index) => (
        <div key={item.slug} className="banner-slide" data-active={index === 0 ? "" : undefined}>
          {item.image && (
            <Image
              src={item.image}
              alt={item.name}
              fill
              sizes="(min-width:1024px) 30vw, 60vw"
              unoptimized
              className={cn(
                layer.fit === "cover" ? "object-cover" : "object-contain",
                (layer.showName || layer.showPrice) && "pb-[14%]",
              )}
            />
          )}

          {(layer.showName || layer.showPrice) && (
            <div className="banner-slide-caption">
              {layer.showName && <span className="truncate">{item.name}</span>}
              {layer.showPrice && item.price && (
                <span className="numeral shrink-0 font-semibold">{item.price}</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

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
        /* Οι σύντομοι ρόλοι δεν σπάνε ποτέ γραμμή: μια τιμή μοιρασμένη σε
           «337,71» και «€» δεν είναι τιμή. Συρρικνώνονται αντί να σπάσουν. */
        whiteSpace:
          layer.style.role === "price" ||
          layer.style.role === "compare" ||
          layer.style.role === "eyebrow"
            ? "nowrap"
            : undefined,
      }}
    >
      <FitText>{value}</FitText>
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
  interactive,
}: {
  layer: ButtonLayer;
  tokens: Record<string, string>;
  locale: Locale;
  style: React.CSSProperties;
  motion: Motion;
  interactive: boolean;
}) {
  const value = applyTokens(localised(layer.text, locale), tokens);
  if (!value) return null;

  const onDark = layer.style.color === "white";

  const box: React.CSSProperties = {
    ...style,
    display: "flex",
    alignItems: "center",
    textTransform: layer.style.uppercase ? "uppercase" : "none",
    color: COLOR_VALUE[layer.style.color],
    fontFamily: FONT_STACK[layer.style.font],
  };

  const label = (
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
  );

  // Written out twice rather than through a polymorphic component: `Link` and
  // `div` take different props, and the version that satisfies both types is
  // less readable than the branch.
  if (layer.href && interactive) {
    return (
      <Link {...motion} href={layer.href} style={box}>
        {label}
      </Link>
    );
  }

  return (
    <div {...motion} style={box}>
      {label}
    </div>
  );
}

/**
 * Does anything inside this cell carry its own destination?
 *
 * If so the cell cannot be a link: an anchor inside an anchor is invalid markup
 * that browsers resolve by guessing, and the guess is rarely what the operator
 * drew. The buttons become the links and the rest of the cell is decoration.
 */
export function hasOwnLinks(composition: CellComposition): boolean {
  return composition.layers.some(
    (layer) => !layer.hidden && layer.kind === "button" && Boolean(layer.href),
  );
}
