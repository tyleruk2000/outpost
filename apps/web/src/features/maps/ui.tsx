/** Small pieces of chrome the maps screen uses in several places. */
import type { MarkerColor, MarkerIcon } from "@outpost/shared";
import { MARKER_COLORS, MARKER_ICONS } from "@outpost/shared";
import { Check } from "lucide-react";
import { RadioGroup } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { floating } from "@/components/ui/menu";
import { Skeleton, Tooltip } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { MARKER_COLOR_NAMES, MARKER_HEX } from "./lib/palette";
import { BADGE, type DrawnIcon, GLYPH_ON, isDrawn, PLACE_GLYPHS, PLACE_ICON_NAMES } from "./lib/place-icons";

/** The project's floating surface, for things that sit over the map. */
export const mapSurface = cn(floating, "z-auto min-w-0 p-0");

/**
 * A card over the map: the one shell every such card uses, whichever tool it belongs to.
 *
 * A card's greatest height is not its own to choose. The place it is put in (`MapFurniture`)
 * gives the cards on a phone the lower three fifths of the clear map, and on a wide screen the
 * height between the search box and the readout; a card with more to say than fits scrolls
 * inside itself, under a title and a close button that stay where they are.
 */
export const mapCard = cn(
  mapSurface,
  "outpost-map-card scroll-quiet pointer-events-auto w-full max-w-[26rem] p-3.5",
  "min-h-[52px] shrink overflow-y-auto overscroll-contain",
);

/**
 * The first row of such a card: its title, and what closes or folds it. It stays in view while the rest scrolls.
 * It sticks at the card's own padding above its place (-top-3.5), at every width: a card that scrolls measures
 * the header from inside its padding, and at top-0 the header sat that much lower, over the first line.
 */
export const mapCardHeader =
  "sticky -top-3.5 z-[1] -mx-3.5 -mt-3.5 flex items-start justify-between gap-3 rounded-t-panel bg-raised px-3.5 pt-3.5";

/**
 * The row of buttons at the foot of a map card. On a phone the card scrolls in what room the
 * map leaves it, and this row stays in view at its foot, as the header stays at its head.
 */
export const mapCardFoot =
  "flex flex-wrap items-center gap-2 max-md:sticky max-md:-bottom-3.5 max-md:-mx-3.5 max-md:-mb-3.5 max-md:rounded-b-panel max-md:bg-raised max-md:px-3.5 max-md:pt-2 max-md:pb-3.5";

/** A group of icon buttons on one floating surface, stacked with hairlines between them. */
export function ControlGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(mapSurface, "flex flex-col divide-y divide-border overflow-hidden", className)} {...props} />;
}

/** One icon button in a control group. With `pressed` it is a toggle and shows its state. */
export function ControlButton({
  label,
  pressed,
  shortcut,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "aria-label" | "aria-pressed"> & { label: string; pressed?: boolean; shortcut?: string }) {
  return (
    <Tooltip label={label} shortcut={shortcut} side="left">
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          // 44 px on a phone whatever the size of the text: an icon is not words.
          "rounded-none text-ink focus-visible:-outline-offset-2 max-md:size-[44px] md:pointer-coarse:size-[44px]",
          pressed && "bg-primary-soft text-primary-soft-ink hover:bg-primary-soft",
          className,
        )}
        {...props}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

export function Fact({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border py-2 last:border-b-0">
      <dt className="shrink-0 text-small text-ink-muted">{label}</dt>
      <dd className={cn("tabular min-w-0 text-right text-small text-ink", mono && "font-mono text-[0.8125rem]")}>{children}</dd>
    </div>
  );
}

/** A dot in a marker colour. Decorative: the colour's name is always written beside it or on the control. */
export function ColorDot({ color, className }: { color: MarkerColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-3 shrink-0 rounded-full border border-page", className)}
      style={{ background: MARKER_HEX[color] }}
    />
  );
}

/** Choose one of the marker colours. Each swatch is named, and the chosen one carries a tick as well as a ring. */
export function ColorPicker({ value, onChange, label }: { value: MarkerColor; onChange: (color: MarkerColor) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <RadioGroup.Root
        aria-label={label}
        value={value}
        onValueChange={(next) => onChange(next as MarkerColor)}
        className="flex flex-wrap gap-1.5"
      >
        {MARKER_COLORS.map((color) => (
          <RadioGroup.Item
            key={color}
            value={color}
            aria-label={MARKER_COLOR_NAMES[color]}
            title={MARKER_COLOR_NAMES[color]}
            className="grid size-7 place-content-center rounded-full border-2 border-page shadow-[0_0_0_1px_var(--border-strong)] data-[state=checked]:shadow-[0_0_0_2px_var(--ink)] max-md:size-10 md:pointer-coarse:size-10"
            style={{ background: MARKER_HEX[color] }}
          >
            <RadioGroup.Indicator>
              <Check className="size-3.5 text-white" strokeWidth={3.5} />
            </RadioGroup.Indicator>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      <span className="text-small text-ink-muted">{MARKER_COLOR_NAMES[value]}</span>
    </div>
  );
}

/** The strokes of a place's icon, in the colour of the text around it. Decorative: its name is always written or spoken beside it. */
export function PlaceGlyph({ icon, className }: { icon: DrawnIcon; className?: string }) {
  const glyph = PLACE_GLYPHS[icon];
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={BADGE.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-[0.9375rem] shrink-0", className)}
    >
      {glyph.strokes.map((path) => (
        <path key={path} d={path} />
      ))}
      {glyph.fills?.map((path) => (
        <path key={path} d={path} fill="currentColor" stroke="none" />
      ))}
    </svg>
  );
}

/**
 * A saved place's marker as the lists show it, the same as on the map: the dot of a plain
 * pin, or the icon on a disc of the place's colour. It takes the same room either way, so
 * the names in a list line up. Decorative: the place's name is beside it, and its icon's
 * name is given to screen readers by whatever shows it.
 */
export function PlaceMark({ color, icon, className }: { color: MarkerColor; icon: MarkerIcon; className?: string }) {
  return (
    <span aria-hidden data-place-icon={icon} className={cn("grid size-[1.375rem] shrink-0 place-content-center", className)}>
      {isDrawn(icon) ? (
        <span
          className="grid size-[1.375rem] place-content-center rounded-full border border-page"
          style={{ background: MARKER_HEX[color], color: GLYPH_ON[color] }}
        >
          <PlaceGlyph icon={icon} />
        </span>
      ) : (
        <ColorDot color={color} />
      )}
    </span>
  );
}

/**
 * Choose a place's icon. Each is shown as it will be on the map, in the place's colour, and is
 * named for a screen reader; the chosen one carries a ring and its name is written beside the set.
 * The arrow keys move through them, as through any group of radio buttons.
 */
export function IconPicker({
  value,
  color,
  onChange,
  label,
}: {
  value: MarkerIcon;
  /** The place's colour: the icons are drawn on it. */
  color: MarkerColor;
  onChange: (icon: MarkerIcon) => void;
  label: string;
}) {
  return (
    <div className="grid gap-1.5">
      <RadioGroup.Root
        aria-label={label}
        value={value}
        onValueChange={(next) => onChange(next as MarkerIcon)}
        className="-m-1 flex flex-wrap"
      >
        {MARKER_ICONS.map((icon) => (
          <RadioGroup.Item
            key={icon}
            value={icon}
            aria-label={PLACE_ICON_NAMES[icon]}
            title={PLACE_ICON_NAMES[icon]}
            className="grid size-9 place-content-center rounded-control hover:bg-surface-strong data-[state=checked]:bg-surface-strong data-[state=checked]:shadow-[inset_0_0_0_2px_var(--ink)] max-md:size-11 md:pointer-coarse:size-11"
          >
            <PlaceMark color={color} icon={icon} />
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      <span className="text-small text-ink-muted">{PLACE_ICON_NAMES[value]}</span>
    </div>
  );
}

/** A quiet heading inside the side panel. */
export function PanelHeading({ children, actions, className }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    // Wraps: on a narrow phone with large text the heading and its button do not fit on one line.
    <div className={cn("flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1", className)}>
      <h3 className="text-body font-semibold text-ink">{children}</h3>
      {actions}
    </div>
  );
}

/** A tab of the panel while what it shows is on its way. */
/**
 * The rows of a side-panel list drawn at first, and added with each "Show more". The map
 * holds every place and route, but a list of hundreds is not drawn all at once.
 */
export const PANEL_ROWS = 50;

/** The last row of a list drawn a page at a time: how many are shown, and the button for more. */
export function ShowMoreRow({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Button size="sm" onClick={onMore}>
        Show more
      </Button>
      <span className="tabular text-small text-ink-muted">
        {shown} of {total} shown
      </span>
    </li>
  );
}

export function PanelLoading() {
  return (
    <div className="grid gap-3 p-4" aria-busy>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}
