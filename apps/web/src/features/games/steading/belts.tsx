/**
 * Belts: laying one square by square (each square chosen on the plan carries on from the
 * last, and a square further along the same row or column fills in the straight run), and
 * the panel for a belt square already laid.
 */
import {
  BELT_TIERS,
  BELTS,
  type BeltDir,
  type BeltSquare,
  type BeltTier,
  beltCost,
  beltLines,
  beltProblem,
  type Flows,
  GOODS,
  peopleOf,
  STEP,
  type SteadingState,
  terrainAt,
} from "@outpost/shared/games/steading";
import { Undo2 } from "lucide-react";
import { Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/misc";
import type { Act } from "./panels";
import { amount, amountsWords, capital, lowerName } from "./words";

const WAYS = ["n", "e", "s", "w"] as const;
const WAY_NAMES: Record<BeltDir, string> = { n: "north", e: "east", s: "south", w: "west", x: "a junction" };

const wayTo = (a: { x: number; y: number }, b: { x: number; y: number }): (typeof WAYS)[number] | null => {
  for (const way of WAYS) if (a.x + STEP[way].dx === b.x && a.y + STEP[way].dy === b.y) return way;
  return null;
};

/** The way a first square should lead: away from a building beside it, if there is one. */
function firstWay(state: SteadingState, square: { x: number; y: number }): (typeof WAYS)[number] {
  for (const way of WAYS) {
    const from = { x: square.x - STEP[way].dx, y: square.y - STEP[way].dy };
    if (state.buildings.some((b) => b.x === from.x && b.y === from.y)) return way;
  }
  return "e";
}

/**
 * The belt being laid, carried on to a square chosen on the plan: the square next to the
 * last one, a straight run to a square further along its row or column, or an L (along
 * the row, then the column) to any other. A building chosen next to the end turns the end
 * to lead into it.
 */
export function extendDraft(state: SteadingState, draft: BeltSquare[], square: { x: number; y: number }): BeltSquare[] {
  const last = draft.at(-1);
  if (!last) return [{ ...square, dir: firstWay(state, square) }];
  if (last.x === square.x && last.y === square.y) return draft;
  const into = state.buildings.find((b) => b.x === square.x && b.y === square.y);
  if (into) {
    const way = wayTo(last, square);
    return way ? [...draft.slice(0, -1), { ...last, dir: last.dir === "x" ? "x" : way }] : draft;
  }
  const path: { x: number; y: number }[] = [];
  let at = { x: last.x, y: last.y };
  while (at.x !== square.x) {
    at = { x: at.x + Math.sign(square.x - at.x), y: at.y };
    path.push(at);
  }
  while (at.y !== square.y) {
    at = { x: at.x, y: at.y + Math.sign(square.y - at.y) };
    path.push(at);
  }
  const out = [...draft];
  let prev = last;
  for (const step of path) {
    if (out.some((sq) => sq.x === step.x && sq.y === step.y)) break;
    const way = wayTo(prev, step) as (typeof WAYS)[number];
    out[out.length - 1] = { ...prev, dir: prev.dir === "x" ? "x" : way };
    const next = { ...step, dir: way } as BeltSquare;
    out.push(next);
    prev = next;
  }
  return out;
}

/** The panel while a belt is being laid. */
export function BeltTool({
  state,
  draft,
  tier,
  busy,
  onTier,
  onChange,
  onCancel,
  act,
}: {
  state: SteadingState;
  draft: BeltSquare[];
  tier: BeltTier;
  busy: boolean;
  onTier: (tier: BeltTier) => void;
  onChange: (draft: BeltSquare[]) => void;
  onCancel: () => void;
  act: Act;
}) {
  const { problem, cost, back } = draft.length ? beltProblem(state, tier, draft) : { problem: null, cost: {}, back: {} };
  // What the belt would join, worked out on the settlement as it would be.
  const keys = new Set(draft.map((sq) => `${sq.x},${sq.y}`));
  const would = { ...state, belts: [...state.belts.filter((b) => !keys.has(`${b.x},${b.y}`)), ...draft.map((sq) => ({ ...sq, tier }))] };
  const joins = draft.length ? beltLines(would).filter((line) => line.squares.some((sq) => keys.has(`${sq.x},${sq.y}`))) : [];
  const name = (id: number) => {
    const b = state.buildings.find((c) => c.id === id);
    return b ? lowerName(b) : "building";
  };
  const last = draft.at(-1);
  const people = peopleOf(state);
  return (
    <section aria-labelledby="steading-belt-tool" className="grid gap-3">
      <h2 id="steading-belt-tool" className="font-title text-lead text-ink">
        Laying a belt
      </h2>
      <p className="text-small text-ink-muted">
        Choose squares on the plan, one after another: each carries on from the last, and a square further along fills in the run. A belt
        takes from the building its first square leads away from and carries into the building its last square leads into.
      </p>
      <Field label="Belt">
        {(ids) => (
          <Select
            {...ids}
            value={tier}
            onChange={(next) => onTier(next as BeltTier)}
            options={BELT_TIERS.map((t) => ({
              value: t,
              label: BELTS[t].name,
              description: `${BELTS[t].carries} a day, ${amountsWords(BELTS[t].perSquare)} a square${BELTS[t].unlockAt ? `, once ${BELTS[t].unlockAt} people live here` : ""}`,
              disabled: people < BELTS[t].unlockAt,
            }))}
          />
        )}
      </Field>
      {draft.length === 0 ? (
        <p className="text-body text-ink">Choose the first square, next to the building it takes from.</p>
      ) : (
        <>
          <p className="tabular text-body text-ink">
            {draft.length} {draft.length === 1 ? "square" : "squares"}, the last heading {WAY_NAMES[last?.dir ?? "e"]}.{" "}
            {joins.length
              ? joins.map((line) => `From the ${name(line.from)} into the ${name(line.to)}.`).join(" ")
              : "It joins nothing yet: lead it away from a building and into another."}
          </p>
          {last ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-small text-ink-muted">Turn the last square:</span>
              {(["n", "e", "s", "w", "x"] as const).map((dir) => (
                <Button
                  key={dir}
                  size="sm"
                  variant={last.dir === dir ? "soft" : "ghost"}
                  aria-pressed={last.dir === dir}
                  onClick={() => onChange([...draft.slice(0, -1), { ...last, dir }])}
                >
                  {capital(WAY_NAMES[dir])}
                </Button>
              ))}
            </div>
          ) : null}
          <p className="text-small text-ink-muted">
            {problem ??
              `Costs ${amountsWords(cost)}${Object.keys(back).length ? `, less ${amountsWords(back)} back for belt it replaces` : ""}.`}
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={busy || draft.length === 0 || problem !== null}
          onClick={() => act({ type: "belts", tier, squares: draft })}
        >
          Lay {draft.length || ""} {draft.length === 1 ? "square" : "squares"}
        </Button>
        <Button size="sm" variant="ghost" disabled={draft.length === 0} onClick={() => onChange(draft.slice(0, -1))}>
          <Undo2 aria-hidden />
          Undo last
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

/** The panel for a belt square already laid. */
export function BeltDetail({
  state,
  flows,
  square,
  busy,
  act,
}: {
  state: SteadingState;
  flows: Flows;
  square: { x: number; y: number };
  busy: boolean;
  act: Act;
}) {
  const belt = state.belts.find((b) => b.x === square.x && b.y === square.y);
  if (!belt) return null;
  const carries = flows.beltSquares[`${square.x},${square.y}`] ?? 0;
  const through = flows.belts.filter((line) => line.squares.some((sq) => sq.x === square.x && sq.y === square.y));
  const name = (id: number) => {
    const b = state.buildings.find((c) => c.id === id);
    return b ? lowerName(b) : "building";
  };
  const upgrade = belt.tier === "roller" && peopleOf(state) >= BELTS.chain.unlockAt;
  const lay = (dir: BeltDir, tier: BeltTier = belt.tier) => act({ type: "belts", tier, squares: [{ x: belt.x, y: belt.y, dir }] });
  return (
    <div className="grid gap-4">
      <p className="text-small text-ink-muted">
        {BELTS[belt.tier].name}: carries {BELTS[belt.tier].carries} a day{belt.dir === "x" ? " each way across" : ""}. What it carries goes
        on to the next square{belt.dir === "x" ? ", straight on through this junction" : ` to the ${WAY_NAMES[belt.dir]}`}.
      </p>
      <p className="tabular text-body text-ink">
        {carries > 0 ? `Carrying ${amount(carries)} of ${BELTS[belt.tier].carries} a day.` : "Carrying nothing."}
      </p>
      {through.length ? (
        <Rows>
          {through.map((line) => (
            <li key={`${line.squares[0]?.x},${line.squares[0]?.y}-${line.good}`} className="tabular py-2 text-small text-ink">
              {capital(line.good ? GOODS[line.good].name : "nothing")} from the {name(line.from)} into the {name(line.to)}:{" "}
              {amount(line.carries)} a day, {line.squares.length} squares
            </li>
          ))}
        </Rows>
      ) : (
        <p className="text-small text-ink-muted">
          It joins no line: a line starts on a square leading away from a building and ends leading into one that takes what is sent.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-small text-ink-muted">Turn it:</span>
        {(["n", "e", "s", "w", "x"] as const).map((dir) => (
          <Button
            key={dir}
            size="sm"
            variant={belt.dir === dir ? "soft" : "ghost"}
            aria-pressed={belt.dir === dir}
            disabled={busy || belt.dir === dir}
            onClick={() => lay(dir)}
          >
            {capital(WAY_NAMES[dir])}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {upgrade ? (
          <Button size="sm" disabled={busy} onClick={() => lay(belt.dir, "chain")}>
            Make it a chain belt ({amountsWords(beltCost("chain", belt.dir))})
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="danger-ghost"
          disabled={busy}
          onClick={() => act({ type: "removeBelts", squares: [{ x: belt.x, y: belt.y }] })}
        >
          Take it up
        </Button>
      </div>
    </div>
  );
}

/** Whether a square can take a belt (open ground with nothing built on it). */
export const beltable = (state: SteadingState, square: { x: number; y: number }) =>
  terrainAt(state.map, square.x, square.y) === "meadow" && !state.buildings.some((b) => b.x === square.x && b.y === square.y);
