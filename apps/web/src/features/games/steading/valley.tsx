/**
 * The land, drawn as an estate plan: ground in flat washes with hatching, each building a
 * small plan box with its sign, every route a line whose width is what it carries in a day
 * (dashed by hand, solid for a cart road, railed for track), and belts as bands with their
 * load running along them (still under reduced motion).
 *
 * A generated map is 48 squares each way, so the plan is a window on it: drag to move it,
 * pinch or use the wheel to zoom, or the buttons beside it. Over the drawing lies a grid of
 * buttons, one for each square in view, moved between with the arrow keys (the window
 * follows), + and − to zoom; each says what is there. The ground is drawn once as a few
 * long paths, so moving the window redraws almost nothing.
 */
import {
  type BeltSquare,
  type Building,
  type Flows,
  groundOf,
  KINDS,
  type KindId,
  MODES,
  type Route,
  STORE_REACH,
  type SteadingMap,
  type SteadingState,
  TERRAIN_IDS,
  type TerrainId,
  WELL_REACH,
  WORK_REACH,
} from "@outpost/shared/games/steading";
import {
  Anvil,
  Axe,
  BatteryCharging,
  BatteryFull,
  BrickWall,
  Croissant,
  Drill,
  Droplet,
  Droplets,
  Fan,
  Flame,
  FlameKindling,
  Fuel,
  House,
  Layers,
  LocateFixed,
  type LucideIcon,
  Mountain,
  Pickaxe,
  ShipCargo,
  Shovel,
  SolarPanel,
  Warehouse,
  Wheat,
  Wind,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { type KeyboardEvent, memo, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { boardSurface } from "../kit/frame";
import { heldUp, squareName } from "./words";

export const KIND_ICONS: Record<KindId, LucideIcon> = {
  storehouse: Warehouse,
  house: House,
  well: Droplet,
  woodcutter: Axe,
  quarry: Pickaxe,
  claypit: Shovel,
  field: Wheat,
  woodyard: FlameKindling,
  sawmill: Layers,
  kiln: BrickWall,
  mill: Fan,
  bakery: Croissant,
  landing: ShipCargo,
  coalpit: Mountain,
  smelter: Flame,
  smithy: Anvil,
  wheel: Zap,
  waterworks: Droplets,
  mine: Drill,
  solar: SolarPanel,
  turbine: Wind,
  generator: Fuel,
  leadbank: BatteryFull,
  lithiumbank: BatteryCharging,
};

const T = 10;

/** The fill of each ground; open ground takes its land's colour. */
function fillOf(ground: TerrainId, map: SteadingMap): string {
  if (ground === "meadow" || ground === "woods")
    return map.land === "desert" ? "var(--game-plan-sand)" : map.land === "snow" ? "var(--game-plan-snow)" : "var(--game-plan-meadow)";
  if (ground === "rock") return "var(--game-plan-rock)";
  if (ground === "clay") return "var(--game-plan-clay)";
  if (ground === "river") return "var(--game-plan-river)";
  if (ground === "water") return "var(--game-plan-water)";
  return "var(--game-plan-fell)";
}

/** A number from a square, the same every time, for placing the marks of its ground. */
const jitter = (x: number, y: number, n: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** The whole ground as a few long paths: one fill a kind of ground, and one path a kind of mark. */
export const GroundLayer = memo(function GroundLayer({ map }: { map: SteadingMap }) {
  const paths = useMemo(() => {
    const g = groundOf(map);
    const fills = new Map<string, string[]>();
    const trees: string[] = [];
    const hatch: string[] = [];
    const dots: string[] = [];
    const waves: string[] = [];
    const brows: string[] = [];
    const coal: string[] = [];
    const ore: string[] = [];
    const grass: string[] = [];
    const dense = g.width > 20;
    for (let y = 0; y < g.height; y++)
      for (let x = 0; x < g.width; x++) {
        const ground = TERRAIN_IDS[g.tiles[y * g.width + x] as number] as TerrainId;
        const ox = x * T;
        const oy = y * T;
        const fill = fillOf(ground, map);
        const list = fills.get(fill) ?? [];
        list.push(`M${ox} ${oy}h${T}v${T}h${-T}z`);
        fills.set(fill, list);
        if (ground === "woods") {
          for (let i = 0; i < (dense ? 2 : 3); i++)
            trees.push(circle(ox + 2.5 + jitter(x, y, i) * 5, oy + 2.5 + jitter(x, y, i + 9) * 5, 2.2));
        } else if (ground === "rock") {
          for (let i = 1; i < 5; i++) hatch.push(`M${ox + i * 2} ${oy + 9}L${ox + i * 2 + 2} ${oy + 1}`);
        } else if (ground === "clay") {
          for (let i = 0; i < (dense ? 4 : 6); i++)
            dots.push(circle(ox + 1.5 + jitter(x, y, i) * 7, oy + 1.5 + jitter(x, y, i + 3) * 7, 0.45));
        } else if (ground === "river" || ground === "water") {
          for (const dy of ground === "river" ? [3.2, 6.8] : [5]) waves.push(`M${ox} ${oy + dy}q2.5 -1 5 0t5 0`);
        } else if (ground === "hill" || ground === "coal" || ground === "ore") {
          for (const [dx, dy] of [
            [1.2, 4.2],
            [5, 3],
            [3, 7.6],
          ] as const)
            brows.push(`M${ox + dx} ${oy + dy}q1.6 -2.4 3.2 0`);
          if (ground === "coal")
            for (let i = 0; i < 4; i++) coal.push(`M${ox + 1.5 + jitter(x, y, i) * 6} ${oy + 1.5 + jitter(x, y, i + 5) * 6}h1.4v1.1h-1.4z`);
          if (ground === "ore")
            for (let i = 0; i < 4; i++) {
              const cx = ox + 2 + jitter(x, y, i) * 6;
              const cy = oy + 2 + jitter(x, y, i + 5) * 6;
              ore.push(`M${cx} ${cy - 0.9}l0.8 0.9l-0.8 0.9l-0.8 -0.9z`);
            }
        } else if (jitter(x, y, 7) > 0.45) {
          const gx = ox + 2 + jitter(x, y, 1) * 6;
          const gy = oy + 3 + jitter(x, y, 5) * 5;
          grass.push(`M${gx} ${gy}l-0.5 -1M${gx} ${gy}l0.5 -1`);
        }
      }
    return {
      fills: [...fills.entries()].map(([fill, d]) => ({ fill, d: d.join("") })),
      trees,
      hatch,
      dots,
      waves,
      brows,
      coal,
      ore,
      grass,
    };
  }, [map]);
  return (
    <g>
      {paths.fills.map(({ fill, d }) => (
        <path key={fill} d={d} fill={fill} />
      ))}
      <path d={paths.grass.join("")} stroke="var(--game-plan-woods-deep)" strokeWidth={0.3} opacity={0.4} fill="none" />
      <path d={paths.trees.join("")} fill="var(--game-plan-woods)" stroke="var(--game-plan-woods-deep)" strokeWidth={0.45} />
      <path d={paths.hatch.join("")} stroke="var(--game-plan-ink)" strokeWidth={0.3} opacity={0.55} fill="none" />
      <path d={paths.dots.join("")} fill="var(--game-plan-ink)" opacity={0.5} />
      <path d={paths.waves.join("")} fill="none" stroke="var(--game-plan-river-line)" strokeWidth={0.4} />
      <path d={paths.brows.join("")} fill="none" stroke="var(--game-plan-ink)" strokeWidth={0.35} opacity={0.55} />
      <path d={paths.coal.join("")} fill="var(--game-plan-coal)" />
      <path d={paths.ore.join("")} fill="var(--game-plan-ore)" />
    </g>
  );
});

/** A route's line: width by what it carries, its kind by its dash, an arrow halfway for its direction. */
function RouteLine({ route, from, to, carries }: { route: Route; from: Building; to: Building; carries: number }) {
  const ax = from.x * T + T / 2;
  const ay = from.y * T + T / 2;
  const bx = to.x * T + T / 2;
  const by = to.y * T + T / 2;
  const idle = carries <= 1e-6;
  const width = idle ? 0.45 : 0.6 + Math.min(4.4, (2.4 * carries) / 40);
  const colour = idle ? "var(--game-plan-route-idle)" : "var(--game-plan-route)";
  const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  const head = Math.max(1.6, width * 0.9);
  return (
    <g>
      <line
        x1={ax}
        y1={ay}
        x2={bx}
        y2={by}
        stroke={colour}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={route.mode === "hand" ? `${Math.max(1.2, width)} ${Math.max(1.2, width)}` : undefined}
      />
      {route.mode === "track" ? <line x1={ax} y1={ay} x2={bx} y2={by} stroke="var(--game-plan-paper)" strokeWidth={width * 0.35} /> : null}
      <path
        d={`M${head} 0 L${-head} ${head * 0.8} L${-head} ${-head * 0.8} Z`}
        transform={`translate(${(ax + bx) / 2} ${(ay + by) / 2}) rotate(${angle})`}
        fill={colour}
        stroke="var(--game-plan-paper)"
        strokeWidth={0.25}
      />
    </g>
  );
}

const ANGLE = { n: -90, e: 0, s: 90, w: 180 } as const;

/** A belt square: a band with a chevron for its way, or a cross for a junction; a chain belt is drawn darker and edged. */
function BeltMark({ belt, draft }: { belt: BeltSquare & { tier?: string }; draft?: boolean }) {
  const cx = belt.x * T + T / 2;
  const cy = belt.y * T + T / 2;
  const colour = draft ? "var(--primary)" : "var(--game-plan-belt)";
  const edge = belt.tier === "chain" ? "var(--game-plan-ink)" : "none";
  if (belt.dir === "x")
    return (
      <g opacity={draft ? 0.75 : 1}>
        <rect x={cx - 5} y={cy - 2.2} width={10} height={4.4} fill={colour} stroke={edge} strokeWidth={0.3} />
        <rect x={cx - 2.2} y={cy - 5} width={4.4} height={10} fill={colour} stroke={edge} strokeWidth={0.3} />
      </g>
    );
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${ANGLE[belt.dir]})`} opacity={draft ? 0.75 : 1}>
      <rect x={-5} y={-2.2} width={10} height={4.4} fill={colour} stroke={edge} strokeWidth={0.3} />
      <path d="M-1.2 -1.4L0.6 0L-1.2 1.4" fill="none" stroke="var(--game-plan-paper)" strokeWidth={0.5} />
    </g>
  );
}

/** What a belt line carries, drawn as dashes running along it, faster the more it carries. */
function BeltRun({ squares, to, carries }: { squares: { x: number; y: number }[]; to: Building | undefined; carries: number }) {
  if (carries <= 1e-6 || squares.length === 0) return null;
  const points = squares.map((sq) => `${sq.x * T + T / 2},${sq.y * T + T / 2}`);
  if (to) points.push(`${to.x * T + T / 2},${to.y * T + T / 2}`);
  const seconds = Math.max(0.6, Math.min(6, 120 / carries));
  return (
    <polyline
      className="steading-belt"
      points={points.join(" ")}
      fill="none"
      stroke="var(--game-plan-belt-flow)"
      strokeWidth={0.6 + Math.min(1.8, carries / 60)}
      strokeLinecap="round"
      strokeDasharray="1.2 2.8"
      style={{ animationDuration: `${seconds}s` }}
    />
  );
}

function BuildingMark({ building, held, selected }: { building: Building; held: boolean; selected: boolean }) {
  const Icon = KIND_ICONS[building.kind];
  const ox = building.x * T;
  const oy = building.y * T;
  const empty = building.kind === "house" && !building.occupied;
  return (
    <g opacity={building.paused ? 0.55 : 1}>
      <rect
        x={ox + 1.2}
        y={oy + 1.2}
        width={7.6}
        height={7.6}
        rx={1.1}
        fill={empty ? "var(--game-plan-waiting)" : "var(--game-plan-roof)"}
        stroke={selected ? "var(--primary)" : "var(--game-plan-ink)"}
        strokeWidth={selected ? 0.9 : 0.45}
        strokeDasharray={empty ? "1.2 0.8" : undefined}
      />
      <Icon x={ox + 2.4} y={oy + 2.4} width={5.2} height={5.2} color="var(--game-plan-ink)" strokeWidth={2} aria-hidden />
      {held ? (
        <path d={`M${ox + 8.8} ${oy + 1.2} l-3 0 l3 3 Z`} fill="var(--game-plan-route)" stroke="var(--game-plan-ink)" strokeWidth={0.3} />
      ) : null}
      {building.paused ? <line x1={ox + 2} y1={oy + 8} x2={ox + 8} y2={oy + 2} stroke="var(--game-plan-ink)" strokeWidth={0.5} /> : null}
    </g>
  );
}

/** How far the chosen building's reach goes, drawn as a dashed square round it. */
function reachOf(b: Building): number | null {
  if (b.kind === "storehouse" || b.kind === "house") return STORE_REACH;
  if (b.kind === "well") return WELL_REACH;
  if (KINDS[b.kind].workers > 0) return WORK_REACH;
  return null;
}

interface View {
  /** The square at the window's top left, and how many squares it shows across. */
  x: number;
  y: number;
  across: number;
}

const MIN_ACROSS = 6;

function startView(state: SteadingState): View {
  const g = groundOf(state.map);
  if (g.width <= 16) return { x: 0, y: 0, across: g.width };
  const across = 14;
  const home = state.buildings[0] ?? { x: g.start.x, y: g.start.y };
  return clampView({ x: home.x - across / 2 + 0.5, y: home.y - across / 2 + 1, across }, g.width, g.height);
}

function clampView(view: View, width: number, height: number, tall = width <= 16 ? height / width : 1): View {
  const across = Math.max(Math.min(MIN_ACROSS, width), Math.min(width, view.across));
  const down = across * tall;
  return {
    across,
    x: Math.max(0, Math.min(width - across, view.x)),
    y: Math.max(0, Math.min(Math.max(0, height - down), view.y)),
  };
}

export function Valley({
  state,
  flows,
  selected,
  onSelect,
  draft,
}: {
  state: SteadingState;
  flows: Flows;
  selected: { x: number; y: number } | null;
  onSelect: (square: { x: number; y: number }) => void;
  /** A belt being laid, drawn over the plan before it is laid. */
  draft?: BeltSquare[];
}) {
  const ground = groundOf(state.map);
  const { width, height } = ground;
  // Ashgill is taller than it is wide and is shown whole; a generated map is a square window.
  const tall = width <= 16 ? height / width : 1;
  const [view, setView] = useState<View>(() => startView(state));
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLFieldSetElement>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; startDistance: number; startAcross: number }>({
    moved: false,
    startDistance: 0,
    startAcross: 0,
  });
  const mapKey = state.map.legacy ? "ashgill" : `${state.map.land}:${state.map.seed}`;

  // A new settlement (another land or seed) starts with the window on its storehouse.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the map itself changes
  useEffect(() => setView(startView(state)), [mapKey]);

  const set = (next: View) => setView(clampView(next, width, height, tall));
  const zoom = (factor: number, about?: { x: number; y: number }) => {
    const across = Math.max(MIN_ACROSS, Math.min(width, view.across * factor));
    const ax = about?.x ?? view.x + view.across / 2;
    const ay = about?.y ?? view.y + (view.across * tall) / 2;
    set({ across, x: ax - ((ax - view.x) * across) / view.across, y: ay - ((ay - view.y) * across) / view.across });
  };

  // The wheel zooms about the pointer; it needs a listener that may stop the page scrolling.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-bound with the view it zooms
  useEffect(() => {
    const el = box.current;
    if (!el || width <= 16) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const at = {
        x: view.x + ((event.clientX - rect.left) / rect.width) * view.across,
        y: view.y + ((event.clientY - rect.top) / rect.width) * view.across,
      };
      zoom(event.deltaY > 0 ? 1.15 : 1 / 1.15, at);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [view, width]);

  useEffect(() => {
    if (!focusTarget) return;
    const cell = grid.current?.querySelector<HTMLButtonElement>(`[data-square="${focusTarget}"]`);
    if (cell) {
      cell.focus();
      setFocusTarget(null);
    }
  }, [focusTarget]);

  const pxPerSquare = () => (box.current?.getBoundingClientRect().width || 1) / view.across;
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) gesture.current = { moved: false, startDistance: 0, startAcross: view.across };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        moved: true,
        startDistance: Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0)),
        startAcross: view.across,
      };
    }
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(event.pointerId);
    if (!last || width <= 16) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
      if (gesture.current.startDistance > 0 && d > 0) {
        const across = gesture.current.startAcross * (gesture.current.startDistance / d);
        zoom(across / view.across);
      }
      return;
    }
    if (!gesture.current.moved && Math.hypot(dx, dy) < 4) return;
    gesture.current.moved = true;
    const per = pxPerSquare();
    set({ ...view, x: view.x - dx / per, y: view.y - dy / per });
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size > 0 || gesture.current.moved) return;
    // A tap: the square under it (each square's button carries its place).
    const square = (event.target as HTMLElement).closest?.("[data-square]")?.getAttribute("data-square");
    if (!square) return;
    const [x, y] = square.split(",").map(Number);
    onSelect({ x: x ?? 0, y: y ?? 0 });
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, x: number, y: number) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[event.key];
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(1 / 1.4, { x: x + 0.5, y: y + 0.5 });
      setFocusTarget(`${x},${y}`);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoom(1.4, { x: x + 0.5, y: y + 0.5 });
      setFocusTarget(`${x},${y}`);
      return;
    }
    let target: [number, number] | null = null;
    if (move) target = [x + move[0], y + move[1]];
    else if (event.key === "Home") target = [0, y];
    else if (event.key === "End") target = [width - 1, y];
    if (!target) return;
    event.preventDefault();
    const nx = Math.min(width - 1, Math.max(0, target[0]));
    const ny = Math.min(height - 1, Math.max(0, target[1]));
    // Keep the square in view, a square in from the edge where the map allows.
    const down = view.across * tall;
    let { x: vx, y: vy } = view;
    if (nx < vx + 1) vx = nx - 1;
    if (nx > vx + view.across - 2) vx = nx - view.across + 2;
    if (ny < vy + 1) vy = ny - 1;
    if (ny > vy + down - 2) vy = ny - down + 2;
    if (vx !== view.x || vy !== view.y) set({ ...view, x: vx, y: vy });
    setFocusTarget(`${nx},${ny}`);
  };

  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  const chosen = selected ? state.buildings.find((b) => b.x === selected.x && b.y === selected.y) : undefined;
  const reach = chosen ? reachOf(chosen) : null;
  const focusSquare = selected ?? { x: state.buildings[0]?.x ?? 0, y: state.buildings[0]?.y ?? 0 };
  const down = view.across * tall;
  const x0 = Math.max(0, Math.floor(view.x));
  const y0 = Math.max(0, Math.floor(view.y));
  const x1 = Math.min(width - 1, Math.ceil(view.x + view.across) - 1);
  const y1 = Math.min(height - 1, Math.ceil(view.y + down) - 1);
  const inView = (x: number, y: number) => x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1;
  // The square that takes Tab stays in the grid even when it has been moved out of view.
  const tabSquare = inView(focusSquare.x, focusSquare.y) ? focusSquare : { x: x0, y: y0 };
  const squares: { x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) squares.push({ x, y });
  const big = width > 16;

  return (
    <div className="grid gap-2">
      <div
        ref={box}
        className={cn("relative w-full overflow-hidden rounded-panel border border-border", boardSurface, big && "touch-none")}
        style={{ aspectRatio: `1 / ${tall}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(event) => pointers.current.delete(event.pointerId)}
      >
        <svg viewBox={`${view.x * T} ${view.y * T} ${view.across * T} ${down * T}`} className="absolute inset-0 size-full" aria-hidden>
          <style>
            {
              "@keyframes steading-belt{to{stroke-dashoffset:-4}}.steading-belt{animation:steading-belt 2s linear infinite}@media (prefers-reduced-motion: reduce){.steading-belt{animation:none}}"
            }
          </style>
          <rect width={width * T} height={height * T} fill="var(--game-plan-paper)" />
          <GroundLayer map={state.map} />
          {/* A faint survey grid, so that squares can be counted. */}
          <path
            d={[
              ...Array.from({ length: width - 1 }, (_, i) => `M${(i + 1) * T} 0V${height * T}`),
              ...Array.from({ length: height - 1 }, (_, i) => `M0 ${(i + 1) * T}H${width * T}`),
            ].join("")}
            stroke="var(--game-plan-ink)"
            strokeWidth={0.15}
            opacity={0.25}
          />
          {reach !== null && chosen ? (
            <rect
              x={Math.max(0, chosen.x - reach) * T + 0.4}
              y={Math.max(0, chosen.y - reach) * T + 0.4}
              width={(Math.min(width - 1, chosen.x + reach) - Math.max(0, chosen.x - reach) + 1) * T - 0.8}
              height={(Math.min(height - 1, chosen.y + reach) - Math.max(0, chosen.y - reach) + 1) * T - 0.8}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={0.5}
              strokeDasharray="2 1.2"
            />
          ) : null}
          {state.belts.map((belt) => (
            <BeltMark key={`${belt.x},${belt.y}`} belt={belt} />
          ))}
          {flows.belts.map((line) => (
            <BeltRun
              key={`${line.squares[0]?.x},${line.squares[0]?.y}-${line.good}`}
              squares={line.squares}
              to={byId.get(line.to)}
              carries={line.carries}
            />
          ))}
          {draft?.map((sq) => (
            <BeltMark key={`d${sq.x},${sq.y}`} belt={sq} draft />
          ))}
          {state.routes.map((route) => {
            const from = byId.get(route.from);
            const to = byId.get(route.to);
            return from && to ? <RouteLine key={route.id} route={route} from={from} to={to} carries={flows.routes[route.id] ?? 0} /> : null;
          })}
          {state.buildings.map((b) => (
            <BuildingMark
              key={b.id}
              building={b}
              held={KINDS[b.kind].stage < 9 && heldUp(flows.buildings[b.id]?.limit ?? { kind: "full" })}
              selected={chosen?.id === b.id}
            />
          ))}
          {selected && !chosen ? (
            <rect
              x={selected.x * T + 0.5}
              y={selected.y * T + 0.5}
              width={T - 1}
              height={T - 1}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={0.9}
              rx={1}
            />
          ) : null}
        </svg>
        <fieldset
          ref={grid}
          aria-label={`The land, ${width} squares by ${height}: a square for each place in view. Use the arrow keys to move between them, and + and − to zoom.`}
          className="absolute inset-0 m-0 min-w-0 border-0 p-0"
        >
          {squares.map(({ x, y }) => {
            const isSelected = selected?.x === x && selected?.y === y;
            return (
              <button
                key={`${x},${y}`}
                type="button"
                data-square={`${x},${y}`}
                tabIndex={tabSquare.x === x && tabSquare.y === y ? 0 : -1}
                aria-pressed={isSelected}
                aria-label={squareName(state, flows, x, y)}
                // A press by key is a click with no pointer; a tap is taken from the pointer, so that a drag is not a press.
                onClick={(event) => {
                  if (event.detail === 0) onSelect({ x, y });
                }}
                onKeyDown={(event) => onKey(event, x, y)}
                className="absolute outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-focus"
                style={{
                  left: `${((x - view.x) / view.across) * 100}%`,
                  top: `${((y - view.y) / down) * 100}%`,
                  width: `${100 / view.across}%`,
                  height: `${100 / down}%`,
                }}
              />
            );
          })}
        </fieldset>
      </div>
      {big ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="icon-sm"
            variant="secondary"
            aria-label="Zoom in"
            onClick={() => zoom(1 / 1.4)}
            disabled={view.across <= MIN_ACROSS}
          >
            <ZoomIn />
          </Button>
          <Button size="icon-sm" variant="secondary" aria-label="Zoom out" onClick={() => zoom(1.4)} disabled={view.across >= width}>
            <ZoomOut />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setView(startView(state))}>
            <LocateFixed aria-hidden />
            Back to the storehouse
          </Button>
          <p className="tabular text-small text-ink-muted">
            {Math.round(view.across)} of {width} squares across · drag to move, pinch or scroll to zoom
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** For the legend: whether any route of each kind is laid, so the legend shows what is on the plan. */
export const modesLaid = (state: SteadingState) => Object.keys(MODES).filter((mode) => state.routes.some((r) => r.mode === mode));
