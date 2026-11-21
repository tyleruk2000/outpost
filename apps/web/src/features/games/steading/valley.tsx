/**
 * The valley, drawn as an estate plan: ground in flat washes with hatching, each building a
 * small plan box with its sign, and every route a line whose width is what it carries in a
 * day (dashed by hand, solid for a cart road, railed for track). Over the drawing lies a
 * grid of buttons, one a square, moved between with the arrow keys; each says what is
 * there. Nothing on the plan moves.
 */
import {
  type Building,
  distance,
  type Flows,
  KINDS,
  type KindId,
  MODES,
  type Route,
  STORE_REACH,
  type SteadingState,
  type TerrainId,
  terrainAt,
  VALLEY_HEIGHT,
  VALLEY_WIDTH,
  WELL_REACH,
  WHEEL_REACH,
  WORK_REACH,
} from "@outpost/shared/games/steading";
import {
  Anvil,
  Axe,
  BrickWall,
  Croissant,
  Droplet,
  Droplets,
  Fan,
  Flame,
  FlameKindling,
  House,
  Layers,
  type LucideIcon,
  Mountain,
  Pickaxe,
  ShipCargo,
  Shovel,
  Warehouse,
  Wheat,
  Zap,
} from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
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
};

const T = 10;
const FILL: Record<TerrainId, string> = {
  meadow: "var(--game-plan-meadow)",
  woods: "var(--game-plan-meadow)",
  rock: "var(--game-plan-rock)",
  clay: "var(--game-plan-clay)",
  river: "var(--game-plan-river)",
  hill: "var(--game-plan-fell)",
  coal: "var(--game-plan-fell)",
};

/** A number from a square, the same every time, for placing the marks of its ground. */
const jitter = (x: number, y: number, n: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

function Ground({ x, y, ground }: { x: number; y: number; ground: TerrainId }) {
  const ox = x * T;
  const oy = y * T;
  const marks = [];
  if (ground === "woods") {
    for (let i = 0; i < 3; i++) {
      const cx = ox + 2.5 + jitter(x, y, i) * 5;
      const cy = oy + 2.5 + jitter(x, y, i + 9) * 5;
      marks.push(
        <circle key={i} cx={cx} cy={cy} r={2.2} fill="var(--game-plan-woods)" stroke="var(--game-plan-woods-deep)" strokeWidth={0.45} />,
      );
    }
  } else if (ground === "rock") {
    for (let i = 1; i < 5; i++)
      marks.push(
        <line
          key={i}
          x1={ox + i * 2}
          y1={oy + 9}
          x2={ox + i * 2 + 2}
          y2={oy + 1}
          stroke="var(--game-plan-ink)"
          strokeWidth={0.3}
          opacity={0.55}
        />,
      );
  } else if (ground === "clay") {
    for (let i = 0; i < 6; i++)
      marks.push(
        <circle
          key={i}
          cx={ox + 1.5 + jitter(x, y, i) * 7}
          cy={oy + 1.5 + jitter(x, y, i + 3) * 7}
          r={0.45}
          fill="var(--game-plan-ink)"
          opacity={0.5}
        />,
      );
  } else if (ground === "river") {
    for (const dy of [3.2, 6.8])
      marks.push(
        <path key={dy} d={`M${ox} ${oy + dy} q2.5 -1 5 0 t5 0`} fill="none" stroke="var(--game-plan-river-line)" strokeWidth={0.4} />,
      );
  } else if (ground === "hill" || ground === "coal") {
    // Hill marks: low rounded brows, as an old plan draws a fell.
    for (const [dx, dy] of [
      [1.2, 4.2],
      [5, 3],
      [3, 7.6],
    ] as const)
      marks.push(
        <path
          key={`${dx}`}
          d={`M${ox + dx} ${oy + dy} q1.6 -2.4 3.2 0`}
          fill="none"
          stroke="var(--game-plan-ink)"
          strokeWidth={0.35}
          opacity={0.55}
        />,
      );
    if (ground === "coal")
      for (let i = 0; i < 4; i++)
        marks.push(
          <rect
            key={`c${i}`}
            x={ox + 1.5 + jitter(x, y, i) * 6}
            y={oy + 1.5 + jitter(x, y, i + 5) * 6}
            width={1.4}
            height={1.1}
            fill="var(--game-plan-coal)"
          />,
        );
  } else {
    if (jitter(x, y, 7) > 0.45) {
      const gx = ox + 2 + jitter(x, y, 1) * 6;
      const gy = oy + 3 + jitter(x, y, 5) * 5;
      marks.push(
        <path
          key="g"
          d={`M${gx} ${gy} l-0.5 -1 M${gx} ${gy} l0.5 -1`}
          stroke="var(--game-plan-woods-deep)"
          strokeWidth={0.3}
          opacity={0.4}
        />,
      );
    }
  }
  return (
    <g>
      <rect x={ox} y={oy} width={T} height={T} fill={FILL[ground]} />
      {marks}
    </g>
  );
}

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
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
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
        transform={`translate(${mx} ${my}) rotate(${angle})`}
        fill={colour}
        stroke="var(--game-plan-paper)"
        strokeWidth={0.25}
      />
    </g>
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
  if (b.kind === "wheel") return WHEEL_REACH;
  if (KINDS[b.kind].workers > 0) return WORK_REACH;
  return null;
}

export function Valley({
  state,
  flows,
  selected,
  onSelect,
}: {
  state: SteadingState;
  flows: Flows;
  selected: { x: number; y: number } | null;
  onSelect: (square: { x: number; y: number }) => void;
}) {
  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  const chosen = selected ? state.buildings.find((b) => b.x === selected.x && b.y === selected.y) : undefined;
  const reach = chosen ? reachOf(chosen) : null;
  const grid = useRef<HTMLFieldSetElement>(null);
  const focusAt = (x: number, y: number) => {
    const cell = grid.current?.querySelector<HTMLButtonElement>(`[data-square="${x},${y}"]`);
    cell?.focus();
  };
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, x: number, y: number) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const nx = Math.min(VALLEY_WIDTH - 1, Math.max(0, x + move[0]));
      const ny = Math.min(VALLEY_HEIGHT - 1, Math.max(0, y + move[1]));
      focusAt(nx, ny);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusAt(event.key === "Home" ? 0 : VALLEY_WIDTH - 1, y);
    }
  };
  const focusSquare = selected ?? { x: state.buildings[0]?.x ?? 0, y: state.buildings[0]?.y ?? 0 };

  const squares = [];
  for (let y = 0; y < VALLEY_HEIGHT; y++)
    for (let x = 0; x < VALLEY_WIDTH; x++) squares.push({ x, y, ground: terrainAt(x, y) ?? "meadow" });

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-panel border border-border", boardSurface)}
      style={{ aspectRatio: `${VALLEY_WIDTH} / ${VALLEY_HEIGHT}` }}
    >
      <svg viewBox={`0 0 ${VALLEY_WIDTH * T} ${VALLEY_HEIGHT * T}`} className="absolute inset-0 size-full" aria-hidden>
        <rect width={VALLEY_WIDTH * T} height={VALLEY_HEIGHT * T} fill="var(--game-plan-paper)" />
        {squares.map((square) => (
          <Ground key={`${square.x},${square.y}`} {...square} />
        ))}
        {/* A faint survey grid, so that squares can be counted. */}
        <path
          d={[
            ...Array.from({ length: VALLEY_WIDTH - 1 }, (_, i) => `M${(i + 1) * T} 0 V${VALLEY_HEIGHT * T}`),
            ...Array.from({ length: VALLEY_HEIGHT - 1 }, (_, i) => `M0 ${(i + 1) * T} H${VALLEY_WIDTH * T}`),
          ].join(" ")}
          stroke="var(--game-plan-ink)"
          strokeWidth={0.15}
          opacity={0.25}
        />
        {reach !== null && chosen ? (
          <rect
            x={Math.max(0, chosen.x - reach) * T + 0.4}
            y={Math.max(0, chosen.y - reach) * T + 0.4}
            width={(Math.min(VALLEY_WIDTH - 1, chosen.x + reach) - Math.max(0, chosen.x - reach) + 1) * T - 0.8}
            height={(Math.min(VALLEY_HEIGHT - 1, chosen.y + reach) - Math.max(0, chosen.y - reach) + 1) * T - 0.8}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={0.5}
            strokeDasharray="2 1.2"
          />
        ) : null}
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
        aria-label="The valley: a square for each place. Use the arrow keys to move between them."
        className="absolute inset-0 m-0 grid min-w-0 border-0 p-0"
        style={{ gridTemplateColumns: `repeat(${VALLEY_WIDTH}, 1fr)`, gridTemplateRows: `repeat(${VALLEY_HEIGHT}, 1fr)` }}
      >
        {squares.map(({ x, y }) => {
          const isSelected = selected?.x === x && selected?.y === y;
          return (
            <button
              key={`${x},${y}`}
              type="button"
              data-square={`${x},${y}`}
              tabIndex={focusSquare.x === x && focusSquare.y === y ? 0 : -1}
              aria-pressed={isSelected}
              aria-label={squareName(state, flows, x, y)}
              onClick={() => onSelect({ x, y })}
              onKeyDown={(event) => onKey(event, x, y)}
              className="outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-focus"
            />
          );
        })}
      </fieldset>
    </div>
  );
}

/** For the legend: whether any route of each kind is laid, so the legend shows what is on the plan. */
export const modesLaid = (state: SteadingState) => Object.keys(MODES).filter((mode) => state.routes.some((r) => r.mode === mode));

export { distance };
