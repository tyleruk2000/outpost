/** The controls and cards that float over the map: tools, zoom, the measuring card, the drawing card, the pin card, the card for moving a place. */
import {
  Car,
  Compass,
  Crosshair,
  Ellipsis,
  Grid2x2,
  Grid3x3,
  LocateFixed,
  Magnet,
  Minus,
  Mountain,
  Palette,
  PenLine,
  Plus,
  Printer,
  RadioReceiver,
  RadioTower,
  Redo2,
  Ruler,
  Satellite,
  Signpost,
  SunMoon,
  Undo2,
  Waypoints,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuCheckItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Spinner, Tooltip } from "@/components/ui/misc";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { LocateState } from "./hooks";
import type { ContourReach } from "./lib/contours";
import { formatPosition, type ReadoutFormat } from "./lib/coords";
import { formatBearing, formatDistance, formatDistanceWithMiles, type LatLon } from "./lib/geo";
import { MAP_STYLE_IDS, MAP_STYLES, type MapStyleId } from "./lib/map-styles";
import { measure } from "./lib/measure";
import { pressWord, touchScreen } from "./lib/press";
import { canRedo, canUndo, isFull, type RouteEdit } from "./lib/route-edit";
import { STRAIGHT_LINES } from "./panels/route-editor";
import { SunSection } from "./panels/sun";
import { Locator, PathLocators } from "./radio/locator";
import { ControlButton, ControlGroup, mapCard, mapCardFoot, mapCardHeader, mapSurface } from "./ui";

export type Tool = "browse" | "measure" | "add-place" | "draw" | "sight" | "print" | "resection";

/** A map pin with a plus: the "add a place" tool. Drawn here because the icon set has no exact match at this weight. */
function PinPlus() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 10c0 5-7 11.5-7 11.5S5 15 5 10a7 7 0 0 1 14 0Z" />
      <path d="M12 7v6M9 10h6" />
    </svg>
  );
}

/** Contour lines: rings of equal height round a hill. Drawn here because the icon set has none. */
function ContourRings() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 15.5C3 9 6.5 3.5 11.5 3.5c3 0 4 2.5 6 4.5 1.7 1.7 3.5 3 3.5 6 0 4-3.5 6.5-8.5 6.5C7 20.5 3 19.5 3 15.5Z" />
      <path d="M7.5 14.5c0-3.2 1.5-6 4-6 1.6 0 2.2 1.5 3.3 2.7.9 1 1.7 1.7 1.7 3.1 0 1.8-1.8 2.7-4.2 2.7-2.6 0-4.8-.5-4.8-2.5Z" />
    </svg>
  );
}

/**
 * Why contour lines that are switched on are not on screen, as the control's own name
 * and as the sentence said when it is pressed. The control never does nothing silently.
 */
export const CONTOUR_NOTES: Record<Exclude<ContourReach, "drawn">, { label: string; message: string }> = {
  "too-far-out": {
    label: "Contour lines: zoom in to see them",
    message: "Contour lines are on. They appear once the map is zoomed in closer.",
  },
  "no-terrain-here": {
    label: "Contour lines: no terrain is downloaded for this area",
    message: "Contour lines are on, but no terrain is downloaded for this part of the map. They are drawn wherever terrain is.",
  },
  "no-terrain": {
    label: "Contour lines: no terrain is downloaded yet",
    message: "Contour lines are drawn from terrain, and none is downloaded yet. Download a region with its terrain to see them.",
  },
};

/**
 * One thing the map's controls offer: a tool taken in hand, a layer switched on or off, or
 * something done once. Every place the controls are shown (the column beside the map, the
 * menu at the end of the search box on a phone) is drawn from one list of these, so a tool
 * added to the list is in all of them.
 */
export interface MapTool {
  id: string;
  /** Its name: the button's accessible name, its tooltip, and the words in the menu. */
  label: string;
  icon: ReactNode;
  /** In hand, or switched on. Left out for a thing that is only done (North up). */
  pressed?: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Which block of the column it stands in on a wide screen. */
  group: "view" | "record" | "tools" | "radio";
  /** A layer drawn over the map rather than a tool: listed under "Shown on the map" in the menu. */
  layer?: boolean;
  /** One of several to choose from (the map's style): pressing the button lists them; the menu shows them in a group of their own. */
  choices?: ReadonlyArray<{ value: string; label: string }>;
  value?: string;
  onChoose?: (value: string) => void;
}

export interface MapToolsInput {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  rotated: boolean;
  onResetNorth: () => void;
  /** Undefined when the browser has no geolocation at all. */
  locate: LocateState | undefined;
  onLocate: () => void;
  /** Undefined when no terrain is installed, so there is nothing to shade from. */
  hillshade: boolean | undefined;
  onHillshadeChange: (on: boolean) => void;
  /** Whether contour lines are asked for. They are drawn from the same terrain as the hill shading. */
  contours: boolean;
  /** Whether they can be drawn in the view on screen, and if not, why. */
  contourReach: ContourReach;
  onContoursChange: (on: boolean) => void;
  /** Whether the Maidenhead locator grid is drawn over the map. */
  locatorGrid: boolean;
  onLocatorGridChange: (on: boolean) => void;
  /** Whether the repeaters held on this device are drawn over the map; see features/repeaters. Left out, there is no button. */
  repeaters?: boolean;
  onRepeatersChange?: (on: boolean) => void;
  /** Whether day and night are drawn over the map; see grey-line/. Left out, there is no button. */
  greyLine?: boolean;
  onGreyLineChange?: (on: boolean) => void;
  /** Whether satellite imagery is drawn under the map; see imagery/. Left out, there is no button. */
  satellite?: boolean;
  /** What the button is called: it says when there is no imagery to draw, as contour lines' does. */
  satelliteLabel?: string;
  onSatelliteChange?: (on: boolean) => void;
  /** The map's style (lib/map-styles.ts). Left out, there is no button. */
  mapStyle?: MapStyleId;
  onMapStyleChange?: (style: MapStyleId) => void;
  /** Whether road numbers (M6, A591) are drawn. Left out, there is no button. */
  roadNumbers?: boolean;
  onRoadNumbersChange?: (on: boolean) => void;
  /** Whether lines pointing to magnetic north are drawn across the map; see magnetic/. Left out, there is no button. */
  magneticLines?: boolean;
  onMagneticLinesChange?: (on: boolean) => void;
  /** Whether the UTM grid is drawn over the map; see lib/use-utm-grid.ts. Left out, there is no button. */
  utmGrid?: boolean;
  onUtmGridChange?: (on: boolean) => void;
  /** Recording a track as it is walked; see recording/record-ui.tsx. Null where the browser cannot record at all. */
  record?: MapTool | null;
  /** The map could not be drawn; the controls that act on it have nothing to act on. */
  disabled: boolean;
}

/**
 * The map's tools and layers, in the order they are shown. The order is also the order
 * of giving way: where there is not room for all of them in the column on a phone, the
 * last ones are left to the menu.
 */
export function mapTools({
  tool,
  onToolChange,
  rotated,
  onResetNorth,
  locate,
  onLocate,
  hillshade,
  onHillshadeChange,
  contours,
  contourReach,
  onContoursChange,
  locatorGrid,
  onLocatorGridChange,
  repeaters,
  onRepeatersChange,
  greyLine,
  onGreyLineChange,
  satellite,
  satelliteLabel,
  onSatelliteChange,
  mapStyle,
  onMapStyleChange,
  roadNumbers,
  onRoadNumbersChange,
  magneticLines,
  onMagneticLinesChange,
  utmGrid,
  onUtmGridChange,
  record,
  disabled,
}: MapToolsInput): MapTool[] {
  const take = (id: Exclude<Tool, "browse">, label: string, icon: ReactNode, group: MapTool["group"]): MapTool => ({
    id,
    label,
    icon,
    group,
    pressed: tool === id,
    onPress: () => onToolChange(tool === id ? "browse" : id),
    disabled,
  });
  const tools: MapTool[] = [];
  if (rotated) tools.push({ id: "north", label: "North up", icon: <Compass />, group: "view", onPress: onResetNorth });
  if (locate !== undefined) {
    tools.push({
      id: "locate",
      label: locate === "off" ? "Show where I am" : locate === "waiting" ? "Finding your position. Stop" : "Stop showing where I am",
      icon: locate === "waiting" ? <Spinner className="text-current" label="Finding your position" /> : <LocateFixed />,
      group: "view",
      pressed: locate !== "off",
      onPress: onLocate,
      disabled,
    });
  }
  if (record) tools.push(record);
  tools.push(
    take("measure", "Measure a distance", <Ruler />, "tools"),
    take("draw", "Draw a route", <PenLine />, "tools"),
    take("add-place", touchScreen() ? "Save a place: then tap the map" : "Save a place: then click the map", <PinPlus />, "tools"),
  );
  if (hillshade !== undefined) {
    tools.push({
      id: "hillshade",
      label: "Hill shading",
      icon: <Mountain />,
      group: "tools",
      layer: true,
      pressed: hillshade,
      onPress: () => onHillshadeChange(!hillshade),
      disabled,
    });
  }
  // Always offered, terrain or not: pressed without any, it says what it needs.
  tools.push({
    id: "contours",
    label: contours && contourReach !== "drawn" ? CONTOUR_NOTES[contourReach].label : "Contour lines",
    icon: <ContourRings />,
    group: "tools",
    layer: true,
    pressed: contours,
    onPress: () => onContoursChange(!contours),
    disabled,
  });
  // Where you are from compass bearings to landmarks; resection/.
  tools.push(take("resection", "Find where you are from bearings", <Waypoints />, "tools"));
  // How the map itself is drawn: the standard map, or another style built from the same tiles (lib/map-styles.ts).
  if (onMapStyleChange) {
    const current = mapStyle ?? "standard";
    tools.push({
      id: "map-style",
      label: `Map style: ${MAP_STYLES[current].label}`,
      icon: <Palette />,
      group: "tools",
      layer: true,
      choices: MAP_STYLE_IDS.map((id) => ({ value: id, label: MAP_STYLES[id].label })),
      value: current,
      onChoose: (value) => onMapStyleChange(value as MapStyleId),
      // Pressing the button opens the list; this is for a caller that has nowhere to list them.
      onPress: () => {},
      disabled,
    });
  }
  // A paper map of part of this one; the tool itself is in print/.
  tools.push(take("print", "Print or save as PDF", <Printer />, "tools"));
  // Radio: the locator grid, the repeaters, and whether two points can see each other.
  tools.push({
    id: "locator-grid",
    label: "Maidenhead locator grid",
    icon: <Grid3x3 />,
    group: "radio",
    layer: true,
    pressed: locatorGrid,
    onPress: () => onLocatorGridChange(!locatorGrid),
    disabled,
  });
  if (onGreyLineChange) {
    tools.push({
      id: "grey-line",
      label: "Grey line (day and night)",
      icon: <SunMoon />,
      group: "radio",
      layer: true,
      pressed: greyLine ?? false,
      onPress: () => onGreyLineChange(!greyLine),
      disabled,
    });
  }
  if (onRepeatersChange) {
    tools.push({
      id: "repeaters",
      label: "Repeaters",
      icon: <RadioReceiver />,
      group: "radio",
      layer: true,
      pressed: repeaters ?? false,
      onPress: () => onRepeatersChange(!repeaters),
      disabled,
    });
  }
  // Pictures of the ground beneath the roads and names, with the other things drawn on the map. Offered with nothing
  // installed too: pressed, it says what to get. After the grey line, so that on a phone it gives way to the menu first.
  if (onSatelliteChange) {
    tools.push({
      id: "satellite",
      label: satelliteLabel ?? "Satellite imagery",
      icon: <Satellite />,
      group: "radio",
      layer: true,
      pressed: satellite ?? false,
      onPress: () => onSatelliteChange(!satellite),
      disabled,
    });
  }
  tools.push(take("sight", "Line of sight between two points", <RadioTower />, "radio"));
  // Last, so that on a phone they are the first to give way to the menu.
  if (onRoadNumbersChange) {
    tools.push({
      id: "road-numbers",
      label: "Road numbers",
      icon: <Signpost />,
      group: "tools",
      layer: true,
      pressed: roadNumbers ?? false,
      onPress: () => onRoadNumbersChange(!roadNumbers),
      disabled,
    });
  }
  if (onUtmGridChange) {
    tools.push({
      id: "utm-grid",
      label: "UTM grid",
      icon: <Grid2x2 />,
      group: "tools",
      layer: true,
      pressed: utmGrid ?? false,
      onPress: () => onUtmGridChange(!utmGrid),
      disabled,
    });
  }
  if (onMagneticLinesChange) {
    tools.push({
      id: "magnetic-lines",
      label: "Magnetic north lines",
      icon: <Magnet />,
      group: "tools",
      layer: true,
      pressed: magneticLines ?? false,
      onPress: () => onMagneticLinesChange(!magneticLines),
      disabled,
    });
  }
  return tools;
}

function ToolButton({ tool }: { tool: MapTool }) {
  if (tool.choices) {
    return (
      <Menu>
        <Tooltip label={tool.label} side="left">
          <MenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={tool.label}
              disabled={tool.disabled}
              className="rounded-none text-ink focus-visible:-outline-offset-2 max-md:size-[44px] md:pointer-coarse:size-[44px]"
            >
              {tool.icon}
            </Button>
          </MenuTrigger>
        </Tooltip>
        <MenuContent side="left" align="start">
          <ChoiceGroup tool={tool} />
        </MenuContent>
      </Menu>
    );
  }
  return (
    <ControlButton label={tool.label} pressed={tool.pressed} onClick={tool.onPress} disabled={tool.disabled}>
      {tool.icon}
    </ControlButton>
  );
}

/** The column of controls beside the map on a wide screen: zoom, then the tools in their blocks. */
export function MapControls({
  onZoomIn,
  onZoomOut,
  className,
  ...input
}: MapToolsInput & {
  onZoomIn: () => void;
  onZoomOut: () => void;
  className?: string;
}) {
  const tools = mapTools(input);
  const { disabled } = input;
  const block = (group: MapTool["group"]) => {
    const members = tools.filter((tool) => tool.group === group);
    return members.length > 0 ? (
      <ControlGroup className="shrink-0">
        {members.map((tool) => (
          <ToolButton key={tool.id} tool={tool} />
        ))}
      </ControlGroup>
    ) : null;
  };
  return (
    // On a short window (a laptop's 768 px, less the browser's bars) the column is taller than the map: it scrolls, so that
    // its last tools are not off the foot of the screen where no pointer can reach them. Its padding keeps the shadows. It
    // never gives its width to the search box: a box that scrolls may otherwise shrink to nothing (the largest text).
    <div
      className={cn(
        "scroll-quiet relative -mx-2 flex max-h-full shrink-0 flex-col gap-2 overflow-y-auto overscroll-contain px-2 pb-1",
        className,
      )}
    >
      <ControlGroup className="shrink-0">
        <ControlButton label="Zoom in" onClick={onZoomIn} disabled={disabled}>
          <Plus />
        </ControlButton>
        <ControlButton label="Zoom out" onClick={onZoomOut} disabled={disabled}>
          <Minus />
        </ControlButton>
      </ControlGroup>
      {block("view")}
      {block("record")}
      {block("tools")}
      {block("radio")}
    </div>
  );
}

/**
 * Which tools have an icon in the phone's column when there is room for `room` of them: the first
 * ones in the list, except that a tool in hand or a layer switched on keeps its icon, in place of
 * the last that is not, so that what is on can be seen and put down where it was taken up.
 */
export function shownInColumn(tools: MapTool[], room: number): MapTool[] {
  if (room >= tools.length) return tools;
  const kept = tools.slice(0, Math.max(0, room));
  for (const on of tools.slice(kept.length).filter((tool) => tool.pressed)) {
    const index = kept.findLastIndex((tool) => !tool.pressed);
    if (index < 0) break;
    kept.splice(index, 1);
    kept.push(on);
  }
  return tools.filter((tool) => kept.includes(tool));
}

/**
 * The same tools on a phone: one column under the end of the search box, holding as many
 * as there is room for, and at its foot a button marked "More" that opens the menu of
 * every tool by name. The column never runs into what is below it (a card, the readout,
 * the sheet). Touch screens zoom by pinching, so there are no zoom buttons here.
 */
export function MapToolColumn({ tools }: { tools: MapTool[] }) {
  const area = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(tools.length);
  useLayoutEffect(() => {
    const element = area.current;
    // Not laid out (a test without a browser): show them all.
    if (!element || element.offsetParent === null || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      // A button is 44 px under a finger (36 with a mouse, as a compact wide screen has it: measured, not assumed) and a
      // hairline; the group has a border of its own. Under it, 8 px, then "More".
      const reserved = (more.current?.offsetHeight ?? 56) + 8;
      const group = element.firstElementChild === more.current ? null : element.firstElementChild;
      const each = ((group?.firstElementChild as HTMLElement | null)?.offsetHeight || 44) + 1;
      setRoom(Math.max(0, Math.floor((element.clientHeight - reserved - 1) / each)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (more.current) observer.observe(more.current);
    return () => observer.disconnect();
  }, []);
  const shown = shownInColumn(tools, room);
  return (
    <div ref={area} className="flex min-h-[56px] flex-1 flex-col items-end gap-[8px]">
      {shown.length > 0 ? (
        <ControlGroup className="pointer-events-auto shrink-0">
          {shown.map((tool) => (
            <ToolButton key={tool.id} tool={tool} />
          ))}
        </ControlGroup>
      ) : null}
      <div ref={more} className="shrink-0">
        <MapMenu tools={tools} />
      </div>
    </div>
  );
}

/** The choices of a tool that has them, as a group in a menu with the tool's name over it. */
function ChoiceGroup({ tool }: { tool: MapTool }) {
  const heading = tool.label.split(":")[0];
  return (
    <>
      <MenuLabel className="text-ink-muted">{heading}</MenuLabel>
      <MenuRadioGroup value={tool.value} onValueChange={(value) => tool.onChoose?.(value)} aria-label={heading}>
        {tool.choices?.map((choice) => (
          <MenuRadioItem
            key={choice.value}
            value={choice.value}
            disabled={tool.disabled}
            className="max-md:min-h-11 md:pointer-coarse:min-h-11"
          >
            {choice.label}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </>
  );
}

/**
 * Every tool and layer of the map by name, behind the button marked "More" at the foot of
 * the column on a phone. An icon in the column says nothing to a finger that cannot hover
 * over it; this says what each one is, and holds the ones the column has no room for.
 */
export function MapMenu({ tools }: { tools: MapTool[] }) {
  const entry = (tool: MapTool) => {
    const words = (
      <span className="flex items-center gap-2.5">
        {tool.icon}
        {tool.label}
      </span>
    );
    return tool.pressed === undefined ? (
      <MenuItem key={tool.id} disabled={tool.disabled} onSelect={tool.onPress} className="max-md:min-h-11 md:pointer-coarse:min-h-11">
        {words}
      </MenuItem>
    ) : (
      <MenuCheckItem
        key={tool.id}
        checked={tool.pressed}
        disabled={tool.disabled}
        onCheckedChange={tool.onPress}
        className="max-md:min-h-11 md:pointer-coarse:min-h-11"
      >
        {words}
      </MenuCheckItem>
    );
  };
  const layers = tools.filter((tool) => tool.layer && !tool.choices);
  const choosers = tools.filter((tool) => tool.choices);
  return (
    <Menu>
      <MenuTrigger asChild>
        {/* Words as well as an icon: three dots alone at the end of the search box were found only by chance. 44 px
            wide, in pixels like the icons above it; as tall as its two lines need, so larger text is not cut off. */}
        {/* The name starts with the word that shows, so that a person who says "More" to a voice control is understood. */}
        <button
          type="button"
          aria-label="More map tools"
          className={cn(
            mapSurface,
            "pointer-events-auto flex min-h-[52px] min-w-[44px] flex-col items-center justify-center gap-0.5 px-1 py-1 text-micro font-semibold text-ink",
            "hover:bg-surface-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus data-[state=open]:bg-primary-soft",
          )}
        >
          <Ellipsis aria-hidden className="size-5" />
          <span aria-hidden>More</span>
        </button>
      </MenuTrigger>
      {/* As wide as the room to the left of the button at most (the screen less the button, its inset and the gap): on a
          320 px phone a fixed width ran 33 px off the screen. Worked out from the screen, not from the room the menu
          library measures, which changed with the width it set and looped. */}
      <MenuContent
        side="left"
        align="end"
        className="scroll-quiet max-h-(--radix-dropdown-menu-content-available-height) w-[min(19rem,calc(100vw-76px))] overflow-y-auto"
      >
        <MenuLabel className="text-ink-muted">Tools</MenuLabel>
        {tools.filter((tool) => !tool.layer && !tool.choices).map(entry)}
        {layers.length > 0 ? (
          <>
            <MenuSeparator />
            <MenuLabel className="text-ink-muted">Shown on the map</MenuLabel>
            {layers.map(entry)}
          </>
        ) : null}
        {choosers.map((tool) => (
          <MenuGroup key={tool.id}>
            <MenuSeparator />
            <ChoiceGroup tool={tool} />
          </MenuGroup>
        ))}
      </MenuContent>
    </Menu>
  );
}

/**
 * A card that floats above the bottom of the map, for the tool or thing in hand. Where
 * it sits and how tall it may be are not its own business: see `MapFurniture`.
 */
export function MapCard({
  title,
  titleHidden,
  onClose,
  closeLabel,
  action,
  focusOnOpen,
  children,
  className,
}: {
  title: ReactNode;
  /**
   * The card takes the keyboard when it opens: for a card opened from somewhere that has just gone (a search result
   * chosen from the list), so that focus is not dropped on the page and the card is read out (WCAG 2.4.3).
   */
  focusOnOpen?: boolean;
  /** A button beside the close button, such as one that folds the card. */
  action?: ReactNode;
  /**
   * The title is said to a screen reader but not written: for the card of a tool that has taken
   * over the sheet on a phone, where the sheet's own first line is the tool's title. One title, not two.
   */
  titleHidden?: boolean;
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const card = useRef<HTMLElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as the card opens
  useEffect(() => {
    if (focusOnOpen) card.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      ref={card}
      // Named by its title when it takes the keyboard, so that what has it is said.
      aria-labelledby={focusOnOpen ? titleId : undefined}
      tabIndex={focusOnOpen ? -1 : undefined}
      className={cn(mapCard, focusOnOpen && "focus:outline-none focus-visible:outline-2 focus-visible:outline-focus", className)}
    >
      <div className={mapCardHeader}>
        <h2 id={titleId} className={cn("min-w-0 text-body font-semibold text-ink", titleHidden && "sr-only")}>
          {title}
        </h2>
        {action || onClose ? (
          <div className="flex shrink-0 items-start gap-1">
            {action}
            {onClose ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={closeLabel ?? "Close"}
                onClick={onClose}
                className="-mt-1 -mr-1.5 max-w-none"
              >
                <X />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function MeasureCard({
  points,
  onAddAtCentre,
  onUndo,
  onClear,
  onDone,
  onSaveAsRoute,
  onSight,
}: {
  points: LatLon[];
  /** Adds the centre of the map as the next point: the way to measure without pointing at the map. */
  onAddAtCentre?: () => void;
  onUndo: () => void;
  onClear: () => void;
  onDone: () => void;
  /** Keeps the measured path: opens it in the drawing tool, to be named and saved as a route. */
  onSaveAsRoute: () => void;
  /** Checks line of sight between the first point and the last. */
  onSight?: () => void;
}) {
  const result = measure(points);
  const list = useRef<HTMLOListElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keep the newest leg in view as points are added
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [points.length]);

  return (
    <MapCard title="Measure" onClose={onDone} closeLabel="Stop measuring">
      {/* Always in the page, so that each point set is said as it is set: a live region that arrives already full is not. */}
      <div aria-live="polite" aria-atomic>
        {points.length === 0 ? (
          <p className="mt-1 text-small text-ink-muted">
            {pressWord()} the map to set the first point, then each point after it.{touchScreen() ? "" : " Press Escape to stop."}
          </p>
        ) : points.length === 1 ? (
          <p className="mt-1 text-small text-ink-muted">First point set. {pressWord()} the next one.</p>
        ) : (
          <p className="tabular mt-1 text-lead font-semibold text-ink">{formatDistanceWithMiles(result.totalMeters)}</p>
        )}
      </div>
      {points.length >= 2 ? (
        <>
          <p className="tabular text-small text-ink-muted">
            {result.legs.length === 1 ? "One leg" : `${result.legs.length} legs`}, last leg heading {formatBearing(result.lastBearing ?? 0)}
          </p>
          <PathLocators points={points} />
          {result.legs.length > 1 ? (
            <ol
              ref={list}
              className="scroll-quiet mt-2 max-h-28 divide-y divide-border overflow-y-auto border-y border-border"
              aria-label="Legs"
            >
              {result.legs.map((leg, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: legs are identified by their order
                <li key={index} className="tabular flex items-baseline justify-between gap-4 py-1.5 text-small">
                  <span className="text-ink-muted">
                    Leg {index + 1}, {formatBearing(leg.bearing)}
                  </span>
                  <span className="text-ink">
                    {formatDistance(leg.meters)}
                    <span className="ml-3 inline-block min-w-[4.5rem] text-right text-ink-muted">{formatDistance(leg.totalMeters)}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {onAddAtCentre ? (
          <Button size="sm" onClick={onAddAtCentre}>
            <Crosshair /> Add the centre of the map
          </Button>
        ) : null}
        <Button size="sm" onClick={onUndo} disabled={points.length === 0}>
          <Undo2 /> Undo last point
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear} disabled={points.length === 0}>
          Clear
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} className="ml-auto">
          Done
        </Button>
      </div>
      {points.length >= 2 ? (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
          <Button size="sm" onClick={onSaveAsRoute}>
            <PenLine /> Save as a route
          </Button>
          {onSight ? (
            <Button size="sm" onClick={onSight}>
              <RadioTower /> Check line of sight
            </Button>
          ) : null}
        </div>
      ) : null}
    </MapCard>
  );
}

/**
 * The drawing tool's card over the map, for when its panel is out of sight: on a phone
 * with the sheet lowered so the map can be tapped, or on a desktop with the panel
 * closed. It shows the length so far and holds the few things needed while placing
 * points; naming and saving happen in the panel, which "Name and save" brings up.
 */
export function DrawCard({
  edit,
  reshaping,
  onUndo,
  onRedo,
  onAddAtCentre,
  onOpenPanel,
  onClose,
}: {
  edit: RouteEdit;
  /** True when the shape of a saved route is being changed, false for a new route. */
  reshaping: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAddAtCentre: () => void;
  onOpenPanel: () => void;
  onClose: () => void;
}) {
  const { points } = edit;
  const total = measure(points).totalMeters;
  return (
    <MapCard title={reshaping ? "Edit shape" : "Draw a route"} onClose={onClose} closeLabel="Stop drawing">
      {points.length === 0 ? (
        <p className="mt-1 text-small text-ink-muted">
          {pressWord()} the map to place the first point. {STRAIGHT_LINES}
        </p>
      ) : (
        <>
          <p className="tabular mt-1 text-lead font-semibold text-ink" aria-live="polite" aria-atomic>
            {points.length < 2 ? "0 m" : formatDistanceWithMiles(total)}
          </p>
          <p className="tabular text-small text-ink-muted">
            {points.length === 1 ? "First point placed. Place the next one." : `${points.length} points. Drag a point to move it.`}
          </p>
        </>
      )}
      {/* One row wherever it fits: on a phone this card shares the screen with the map being drawn on. */}
      <div className={cn(mapCardFoot, "mt-3")}>
        <Button size="icon" aria-label="Undo" title="Undo" onClick={onUndo} disabled={!canUndo(edit)}>
          <Undo2 />
        </Button>
        <Button size="icon" aria-label="Redo" title="Redo" onClick={onRedo} disabled={!canRedo(edit)}>
          <Redo2 />
        </Button>
        <Button
          size="icon"
          aria-label="Add a point at the centre of the map"
          title="Add a point at the centre of the map"
          onClick={onAddAtCentre}
          disabled={isFull(edit)}
        >
          <Crosshair />
        </Button>
        <Button variant="primary" onClick={onOpenPanel} className="ml-auto">
          {reshaping ? "Review and save" : "Name and save"}
        </Button>
      </div>
    </MapCard>
  );
}

/**
 * Moving a saved place without opening it: the place has become a pin that can be
 * dragged or stepped with the arrow keys, and nothing is kept until "Save new position".
 */
export function MoveCard({
  name,
  movedMeters,
  saving,
  onSave,
  onCancel,
}: {
  name: string;
  /** How far the pin now is from where the place is saved. */
  movedMeters: number;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const moved = movedMeters >= 1;
  return (
    <MapCard title={`Move “${name}”`} onClose={onCancel} closeLabel="Cancel the move">
      <p className="tabular mt-1 text-small text-ink-muted" aria-live="polite" aria-atomic>
        {moved ? (
          `Moved ${formatDistance(movedMeters)} from where it is saved. Not kept until you save.`
        ) : (
          <>
            Drag the pin to where the place should be.
            {/* Left out on a phone, where the card shares a small screen with the map and there are no arrow keys. */}
            <span className="max-md:hidden"> From the keyboard, the arrow keys move it and Shift moves it further.</span>
          </>
        )}
      </p>
      <div className={cn(mapCardFoot, "mt-3")}>
        <Button variant="primary" onClick={onSave} loading={saving} disabled={!moved}>
          Save new position
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </MapCard>
  );
}

/** A found position that has not been saved: what it is, where it is, its sun times, and the one thing to do with it. */
export function PinCard({
  title,
  detail,
  position,
  format,
  sunOpen,
  closeLabel = "Remove this pin",
  focusOnOpen,
  onSave,
  onRoadRoute,
  onClose,
}: {
  title: string;
  detail?: string;
  position: LatLon;
  format: ReadoutFormat;
  /** The sun times start unfolded: they are what was asked for. */
  sunOpen?: boolean;
  closeLabel?: string;
  /** Takes the keyboard as it opens: see `MapCard`. */
  focusOnOpen?: boolean;
  onSave: () => void;
  /** Opens Road route with this point as where to go: a place found is most often somewhere to get to. */
  onRoadRoute?: () => void;
  onClose: () => void;
}) {
  const coordinates = formatPosition(position.lat, position.lon, format).text;
  return (
    <MapCard title={<span className="font-title">{title}</span>} onClose={onClose} closeLabel={closeLabel} focusOnOpen={focusOnOpen}>
      {detail ? <p className="text-small text-ink-muted">{detail}</p> : null}
      <button
        type="button"
        onClick={async () => {
          if (await copyText(coordinates)) toast.success(`Copied ${coordinates}`);
        }}
        title="Copy"
        aria-label={`Copy coordinates ${coordinates}`}
        className="tabular mt-1 min-h-6 rounded-[3px] font-mono text-[0.8125rem] text-ink underline decoration-border-strong decoration-dotted underline-offset-4 hover:decoration-ink"
      >
        {coordinates}
      </button>
      {/* Already the locator when that is the format coordinates are shown in. */}
      {format === "maidenhead" ? null : <Locator position={position} className="mt-1 block" />}
      <SunSection position={position} defaultOpen={sunOpen} contained className="mt-2 border-t border-border pt-1" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={onSave}>
          Save this place
        </Button>
        {onRoadRoute ? (
          <Button size="sm" onClick={onRoadRoute}>
            <Car aria-hidden /> Directions to here
          </Button>
        ) : null}
      </div>
    </MapCard>
  );
}

/** The short menu on a right-click or a long press. */
export function ContextMenu({
  point,
  bounds,
  coordinates,
  locator,
  place,
  onSave,
  onMeasure,
  onDraw,
  onRoadRoute,
  onSun,
  onRange,
  onWalk,
  onReach,
  onClose,
}: {
  point: { x: number; y: number };
  /** Size of the map area, to keep the menu inside it. */
  bounds: { width: number; height: number };
  coordinates: string;
  /** The Maidenhead locator of the point, when the coordinates are not one already. */
  locator?: string;
  /** The saved place under the point, when there is one: it can be moved from here. */
  place?: { name: string; onMove: () => void };
  onSave: () => void;
  onMeasure: () => void;
  onDraw: () => void;
  /** Starts a road route from or to the point (road-route/). */
  onRoadRoute?: (role: "from" | "to") => void;
  /** Drops a pin there with its sunrise and sunset times open. */
  onSun: () => void;
  /** Shows how far a radio there could reach over the terrain (maps/radio/point-range.tsx). */
  onRange?: () => void;
  /** Shows the ground reachable on foot from there in a set time (maps/walk/walk-reach.tsx). */
  onWalk?: () => void;
  /** Shows the areas reachable from there, up to 2 hours by car or bicycle and 8 on foot (maps/reach/reach-tool.tsx). */
  onReach?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The latest `onClose`, read when it is called: the page passes a new one each time it draws itself, and the effect
  // below runs once, when the menu opens. Run again on each drawing, it took the focus back to the first item from
  // whichever item the person had moved to (and Enter then saved a place).
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close.current();
    };
    window.addEventListener("keydown", onKey, true);
    // Registered a moment later, so the press that opened the menu does not close it.
    const timer = window.setTimeout(() => window.addEventListener("pointerdown", onPointer, true), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);

  // Its own height as drawn, before it is seen: its rows are taller under a finger and with larger text than any sum
  // of them here could know, and a menu opened low on a tablet ran off the foot of the map.
  const [drawn, setDrawn] = useState<number | null>(null);
  useLayoutEffect(() => setDrawn(ref.current?.offsetHeight || null), []);
  const width = 232;
  const height =
    drawn ??
    (place ? 254 : 218) + (locator ? 18 : 0) + (onRange ? 36 : 0) + (onWalk ? 36 : 0) + (onReach ? 36 : 0) + (onRoadRoute ? 72 : 0);
  const left = Math.max(8, Math.min(point.x, bounds.width - width - 8));
  const top = Math.max(8, Math.min(point.y, bounds.height - height - 8));
  const item =
    "flex w-full items-center rounded-[4px] px-2.5 py-1.5 text-left text-small text-ink hover:bg-surface-strong focus-visible:bg-surface-strong max-md:py-2.5 md:pointer-coarse:py-2.5";

  return (
    <div ref={ref} role="menu" aria-label="At this point" className={cn(mapSurface, "absolute z-30 p-1")} style={{ left, top, width }}>
      <p className={cn("tabular truncate px-2.5 pt-1.5 font-mono text-micro text-ink-muted", locator ? "pb-0" : "pb-1")}>{coordinates}</p>
      {locator ? <p className="tabular truncate px-2.5 pb-1 text-micro text-ink-muted">Locator {locator}</p> : null}
      {place ? (
        <button type="button" role="menuitem" className={item} onClick={place.onMove}>
          <span className="truncate">Move “{place.name}”</span>
        </button>
      ) : null}
      <button type="button" role="menuitem" className={item} onClick={onSave}>
        Save a place here
      </button>
      <button type="button" role="menuitem" className={item} onClick={onMeasure}>
        Measure from here
      </button>
      <button type="button" role="menuitem" className={item} onClick={onDraw}>
        Draw a route from here
      </button>
      {onRoadRoute ? (
        <>
          <button type="button" role="menuitem" className={item} onClick={() => onRoadRoute("from")}>
            Directions from here
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => onRoadRoute("to")}>
            Directions to here
          </button>
        </>
      ) : null}
      {onReach ? (
        <button type="button" role="menuitem" className={item} onClick={onReach}>
          Reachable from here
        </button>
      ) : null}
      <button type="button" role="menuitem" className={item} onClick={onSun}>
        Sun times here
      </button>
      {onRange ? (
        <button type="button" role="menuitem" className={item} onClick={onRange}>
          Estimated radio range from here
        </button>
      ) : null}
      {onWalk ? (
        <button type="button" role="menuitem" className={item} onClick={onWalk}>
          How far on foot from here
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={async () => {
          if (await copyText(coordinates)) toast.success(`Copied ${coordinates}`);
          onClose();
        }}
      >
        Copy coordinates
      </button>
    </div>
  );
}
