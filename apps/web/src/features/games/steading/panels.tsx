/**
 * What sits beside and under the valley: the panel for the square in hand (what can be
 * built there, or what the building on it is doing, with its routes), the list of every
 * building, the ledger of stocks and their rates, the households and what a day takes,
 * the landing's trade, and the milestones. Lists with hairlines, in the app's own chrome.
 */
import {
  ARRAY_KWP,
  BANKS,
  type Building,
  buildable,
  CONTRACT_IDS,
  CONTRACTS,
  type ContractId,
  costOf,
  destinationsFor,
  distance,
  type Flows,
  GENERATOR_KW,
  GOOD_IDS,
  GOODS,
  type GoodId,
  HOUSE_NEEDS,
  heatNeed,
  houseTakes,
  isBank,
  isWorkplace,
  KINDS,
  type KindId,
  KWH_PER_BUNDLE,
  LANDS,
  MILESTONE_IDS,
  MILESTONE_NAMES,
  MODE_IDS,
  MODES,
  type ModeId,
  NEED_SOURCES,
  peopleOf,
  recipeOf,
  routeCost,
  routeLength,
  routeProblem,
  STORE_REACH,
  type SteadingAction,
  type SteadingState,
  storeCap,
  TANK_LITRES,
  terrainAt,
  UNLOCK_STEPS,
  WELL_REACH,
  WHEEL_KWH,
  wellLitres,
  YARD_CAP,
} from "@outpost/shared/games/steading";
import { X } from "lucide-react";
import { type ReactNode, type Ref, useState } from "react";
import { Disclosure, Joined, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/misc";
import { Table } from "@/components/ui/table";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { BeltDetail } from "./belts";
import { KIND_ICONS } from "./valley";
import {
  amount,
  amountsWords,
  capital,
  groundName,
  held,
  houseShort,
  kindName,
  limitShort,
  limitWords,
  lowerName,
  placeName,
  waitWords,
} from "./words";

export type Act = (action: SteadingAction) => void;

export function Heading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-title text-lead text-ink">
      {children}
    </h2>
  );
}

const GROUND_WORDS: Record<string, string> = {
  woods: "A woodcutter on the meadow beside it fells timber here.",
  rock: "A quarry on the meadow beside it cuts stone.",
  clay: "A clay pit on the meadow beside it digs clay.",
  river: "A landing, a water wheel or the waterworks stand on the meadow beside it.",
  hill: "Open fell: nothing is built up here but a wind turbine.",
  coal: "A coal pit on the open ground beside it digs coal, once 12 people live here.",
  ore: "An ore mine on the open ground beside it digs iron ore, once 12 people live here.",
  water: "Still water: a landing stands beside it.",
};

/** The panel for the square in hand. */
export function SquarePanel({
  ref,
  state,
  flows,
  square,
  busy,
  act,
  onClose,
  onStartBelt,
}: {
  ref?: Ref<HTMLElement>;
  state: SteadingState;
  flows: Flows;
  square: { x: number; y: number };
  busy: boolean;
  act: Act;
  onClose: () => void;
  /** Starts laying a belt from this square. */
  onStartBelt: (square: { x: number; y: number }) => void;
}) {
  const building = state.buildings.find((b) => b.x === square.x && b.y === square.y);
  const belt = state.belts.find((b) => b.x === square.x && b.y === square.y);
  const ground = terrainAt(state.map, square.x, square.y) ?? "meadow";
  const title = building
    ? kindName(building)
    : belt
      ? belt.dir === "x"
        ? "Belt junction"
        : "Belt"
      : capital(groundName(state, square.x, square.y));
  return (
    <section ref={ref} aria-labelledby="steading-square" className="scroll-mt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading id="steading-square">{title}</Heading>
          <p className="tabular text-small text-ink-muted">
            Column {square.x + 1}, row {square.y + 1}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="mt-3">
        {building ? (
          <BuildingDetail state={state} flows={flows} building={building} busy={busy} act={act} />
        ) : belt ? (
          <BeltDetail state={state} flows={flows} square={square} busy={busy} act={act} />
        ) : ground === "meadow" || ground === "hill" ? (
          <div className="grid gap-4">
            {ground === "hill" ? <p className="text-small text-ink">{GROUND_WORDS.hill}</p> : null}
            <BuildHere state={state} square={square} busy={busy} act={act} />
            {ground === "meadow" ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
                <Button size="sm" onClick={() => onStartBelt(square)}>
                  Lay a belt from here
                </Button>
                <p className="min-w-0 flex-1 basis-48 text-small text-ink-muted">
                  A belt carries what a building makes, square by square, into another building.
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-small text-ink">{GROUND_WORDS[ground]}</p>
        )}
      </div>
    </section>
  );
}

function recipeWords(kind: KindId, state: SteadingState): string {
  const def = KINDS[kind];
  const recipe = recipeOf({ id: 0, kind, x: 0, y: 0, paused: false, yard: {} }, state);
  const inputs = Object.keys(recipe.inputs).length ? `${amountsWords(recipe.inputs)} → ` : "";
  const outputs = Object.keys(recipe.outputs).length ? amountsWords(recipe.outputs) : null;
  const land = LANDS[state.map.land];
  const month = new Date(state.clock).getUTCMonth();
  if (kind === "well") return `${formatNumber(wellLitres(state))} litres of water a day for houses within ${WELL_REACH} squares`;
  if (kind === "wheel") return `${WHEEL_KWH} kWh a day, day and night, on the settlement's line`;
  if (kind === "solar")
    return `${ARRAY_KWP} kW peak: ${amount(ARRAY_KWP * (land.solarKwhPerKwp[month] ?? 0))} kWh a day this month, by day only`;
  if (kind === "turbine") return `${amount(land.turbineKwh[month] ?? 0)} kWh a day this month, day and night`;
  if (kind === "generator") return `${GENERATOR_KW} kW on diesel, when the batteries are flat`;
  if (isBank(kind)) {
    const bank = BANKS[kind];
    return `${formatNumber(bank.volts)} V, ${formatNumber(bank.ampHours)} Ah, ${amount(bank.kwh)} kWh (${amount(bank.kwh * bank.usable)} used)`;
  }
  if (kind === "landing") return "trades with the barge";
  if (kind === "house" || kind === "storehouse" || kind === "waterworks") return def.about.replace(/\.$/, "").toLowerCase();
  return `${inputs}${outputs} a day`;
}

function BuildHere({ state, square, busy, act }: { state: SteadingState; square: { x: number; y: number }; busy: boolean; act: Act }) {
  const people = peopleOf(state);
  const options = buildable(state, square.x, square.y);
  const open = options.filter(
    ({ kind }) =>
      KINDS[kind].unlockAt <= people && !/beside|stands on|Buildings stand/.test(options.find((o) => o.kind === kind)?.problem ?? ""),
  );
  const next = UNLOCK_STEPS.find((step) => step > people);
  const later = (Object.keys(KINDS) as KindId[]).filter((kind) => KINDS[kind].unlockAt === next);
  return (
    <div className="grid gap-3">
      <p className="text-small text-ink-muted">What can stand on this square. Everything it costs comes back if it is taken down.</p>
      <Rows>
        {open.map(({ kind, problem }) => {
          const Icon = KIND_ICONS[kind];
          const def = KINDS[kind];
          return (
            <li key={kind} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-2.5">
              <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-body text-ink">{def.name}</p>
                <p className="text-small text-ink-muted">
                  <Joined
                    parts={[
                      recipeWords(kind, state),
                      def.workers ? `${def.workers} ${def.workers === 1 ? "worker" : "workers"}` : null,
                      Object.keys(costOf(state, kind)).length ? `costs ${amountsWords(costOf(state, kind))}` : "free",
                    ]}
                  />
                </p>
                {problem ? <p className="text-small text-ink-muted">{problem}</p> : null}
              </div>
              <Button size="sm" disabled={busy || problem !== null} onClick={() => act({ type: "build", kind, x: square.x, y: square.y })}>
                Build
              </Button>
            </li>
          );
        })}
      </Rows>
      {next !== undefined && later.length ? (
        <p className="text-small text-ink-muted">
          Once {next} people live here: {later.map((kind) => KINDS[kind].name.toLowerCase()).join(", ")}
          {next >= 40 ? ", and track" : ""}.
        </p>
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 py-1.5 text-small max-sm:grid-cols-1">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular text-ink">{children}</dd>
    </div>
  );
}

function BuildingDetail({
  state,
  flows,
  building,
  busy,
  act,
}: {
  state: SteadingState;
  flows: Flows;
  building: Building;
  busy: boolean;
  act: Act;
}) {
  const def = KINDS[building.kind];
  const flow = flows.buildings[building.id];
  const [removing, setRemoving] = useState(false);
  const work = isWorkplace(building.kind);
  const routesOut = state.routes.filter((r) => r.from === building.id);
  const routesIn = state.routes.filter((r) => r.to === building.id);
  const yard = Object.entries(building.yard).filter(([, n]) => (n ?? 0) >= 1) as [GoodId, number][];
  const recipe = recipeOf(building, state);
  const back = { ...costOf(state, building.kind) };
  if (building.tank) back.diesel = (back.diesel ?? 0) + building.tank / 20;
  for (const [good, n] of yard) back[good] = (back[good] ?? 0) + Math.floor(n);
  const removable =
    !(building.kind === "house" && building.occupied) &&
    !(building.kind === "storehouse" && state.buildings.filter((b) => b.kind === "storehouse").length === 1);

  return (
    <div className="grid gap-4">
      <p className="text-small text-ink-muted">{def.about}</p>
      {work && flow ? <p className="text-body text-ink">{limitWords(building, flow)}</p> : null}
      {building.kind === "house" ? <p className="text-body text-ink">{capital(houseShort(building, flows))}.</p> : null}
      <dl className="divide-y divide-border border-y border-border">
        {work && flow ? (
          <>
            {def.workers ? (
              <Fact label="Workers">
                {flow.staff} of {def.workers}
              </Fact>
            ) : null}
            {Object.keys(recipe.inputs).length ? <Fact label="Uses a day">{amountsWords(flow.uses)}</Fact> : null}
            <Fact label="Makes a day">
              {amountsWords(flow.makes)}
              {amountsWords(flow.makes) !== amountsWords(recipe.outputs) && Object.keys(recipe.outputs).length
                ? ` (at full pace ${amountsWords(recipe.outputs)})`
                : ""}
            </Fact>
            {def.powered ? (
              <Fact label="Power">
                {flow.power > 0
                  ? `${amount(flow.power)} kWh a day from the line`
                  : "None from the line just now: it works at its plain pace"}
              </Fact>
            ) : null}
            <Fact label="Yard">
              {yard.length ? `${amountsWords(Object.fromEntries(yard), held)} of ${YARD_CAP} each` : `Empty; holds ${YARD_CAP} of each`}
            </Fact>
          </>
        ) : null}
        {building.kind === "house" && building.occupied ? (
          <Fact label="A day">
            {formatNumber(HOUSE_NEEDS.litres)} litres of water, {amount(houseTakes(state).bread)} loaves,{" "}
            {amount(houseTakes(state).firewood)} bundles of firewood{flow?.power ? `, ${amount(flow.power)} kWh of electricity` : ""}
          </Fact>
        ) : null}
        {["solar", "turbine", "wheel", "generator"].includes(building.kind) ? (
          <Fact label="Makes now">{flow?.power ? `${amount(flow.power)} kWh a day` : recipeWords(building.kind, state)}</Fact>
        ) : null}
        {building.kind === "generator" ? (
          <Fact label="Tank">
            {amount(building.tank ?? 0)} of {TANK_LITRES} litres
          </Fact>
        ) : null}
        {isBank(building.kind) ? <Fact label="Rated">{recipeWords(building.kind, state)}</Fact> : null}
        {building.kind === "storehouse" ? (
          <Fact label="Holds">
            {formatNumber(storeCap(state))} of each good, for all the storehouses; serves houses within {STORE_REACH} squares
          </Fact>
        ) : null}
        <Fact label="Cost">
          {Object.keys(costOf(state, building.kind)).length ? amountsWords(costOf(state, building.kind)) : "Nothing"}
        </Fact>
      </dl>

      {building.kind === "landing" ? <ContractPicker building={building} busy={busy} act={act} /> : null}

      {work && Object.keys(recipe.outputs).length ? (
        <div className="grid gap-2">
          <h3 className="text-body font-semibold text-ink">Routes out</h3>
          {routesOut.length ? (
            <Rows>
              {routesOut.map((route, index) => (
                <RouteRow key={route.id} state={state} flows={flows} routeId={route.id} first={index === 0} busy={busy} act={act} />
              ))}
            </Rows>
          ) : (
            <p className="text-small text-ink-muted">None yet: what it makes waits in its yard until the yard is full.</p>
          )}
          {(Object.keys(recipe.outputs) as GoodId[]).map((good) => (
            <NewRoute key={good} state={state} from={building} good={good} busy={busy} act={act} />
          ))}
        </div>
      ) : null}
      {routesIn.length ? (
        <div className="grid gap-2">
          <h3 className="text-body font-semibold text-ink">Routes in</h3>
          <Rows>
            {routesIn.map((route) => {
              const from = state.buildings.find((b) => b.id === route.from);
              return (
                <li key={route.id} className="tabular py-2 text-small text-ink">
                  {capital(GOODS[route.good].name)} from the {from ? placeName(from) : "building"}: {amount(flows.routes[route.id] ?? 0)} a
                  day, {MODES[route.mode].name.toLowerCase()}
                </li>
              );
            })}
          </Rows>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {building.kind === "generator" ? (
          <Button
            size="sm"
            disabled={busy || state.stock.diesel < 1 || (building.tank ?? 0) > TANK_LITRES - 20}
            onClick={() => act({ type: "fillTank", id: building.id })}
          >
            Fill the tank from the store
          </Button>
        ) : null}
        {work ? (
          <Button size="sm" disabled={busy} onClick={() => act({ type: "pause", id: building.id, paused: !building.paused })}>
            {building.paused ? "Back to work" : "Rest it"}
          </Button>
        ) : null}
        {yard.length ? (
          <Button size="sm" disabled={busy} onClick={() => act({ type: "clearYard", id: building.id })}>
            Carry the yard to the store
          </Button>
        ) : null}
        {removable ? (
          <Button size="sm" variant="danger-ghost" disabled={busy} onClick={() => setRemoving(true)}>
            Take it down
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Take down the ${lowerName(building)}?`}
        description={`Its routes are taken up too. Everything it and its routes cost${yard.length ? ", and what is in its yard," : ""} goes back to the store: ${amountsWords(back, held)}.`}
        confirmLabel="Take it down"
        onConfirm={() => {
          act({ type: "remove", id: building.id });
          setRemoving(false);
        }}
      />
    </div>
  );
}

function RouteRow({
  state,
  flows,
  routeId,
  first,
  busy,
  act,
}: {
  state: SteadingState;
  flows: Flows;
  routeId: number;
  first: boolean;
  busy: boolean;
  act: Act;
}) {
  const route = state.routes.find((r) => r.id === routeId);
  if (!route) return null;
  const to = state.buildings.find((b) => b.id === route.to);
  const length = routeLength(state, route);
  const carries = flows.routes[route.id] ?? 0;
  const people = peopleOf(state);
  const modes = MODE_IDS.filter((mode) => mode !== route.mode && length <= MODES[mode].reach && people >= MODES[mode].unlockAt);
  return (
    <li className="grid gap-2 py-2.5">
      <p className="tabular text-small text-ink">
        {capital(GOODS[route.good].name)} to the {to ? placeName(to) : "building"}
        <span className="text-ink-muted">
          {" "}
          · {MODES[route.mode].name.toLowerCase()}, {length} {length === 1 ? "square" : "squares"} · carries {amount(carries)} of{" "}
          {MODES[route.mode].carries} a day
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {!first ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ type: "routeFirst", id: route.id })}>
            Fill this first
          </Button>
        ) : null}
        {modes.map((mode) => (
          <Button key={mode} size="sm" variant="ghost" disabled={busy} onClick={() => act({ type: "changeRoute", id: route.id, mode })}>
            Make it {MODES[mode].name.toLowerCase()}
            {Object.keys(MODES[mode].perSquare).length ? ` (${amountsWords(routeCost(mode, length))})` : ""}
          </Button>
        ))}
        <Button size="sm" variant="danger-ghost" disabled={busy} onClick={() => act({ type: "removeRoute", id: route.id })}>
          Take it up
        </Button>
      </div>
    </li>
  );
}

function NewRoute({ state, from, good, busy, act }: { state: SteadingState; from: Building; good: GoodId; busy: boolean; act: Act }) {
  const every = destinationsFor(state, from.id, good);
  const destinations = every.filter((b) => !state.routes.some((r) => r.from === from.id && r.to === b.id && r.good === good));
  const [to, setTo] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<ModeId>("hand");
  const target = destinations.find((b) => String(b.id) === to) ?? destinations[0];
  if (!target)
    return (
      <p className="text-small text-ink-muted">
        {every.length
          ? `Every place that takes its ${GOODS[good].name} has a route from it already.`
          : `Nothing here takes its ${GOODS[good].name} yet.`}
      </p>
    );
  const length = distance(from, target);
  const problem = routeProblem(state, from.id, target.id, good, mode);
  const cost = routeCost(mode, length);
  return (
    <form
      className="grid gap-2 rounded-panel bg-surface p-3"
      onSubmit={(event) => {
        event.preventDefault();
        act({ type: "route", from: from.id, to: target.id, good, mode });
      }}
    >
      <p className="text-small font-medium text-ink">Send its {GOODS[good].name} to…</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="To">
          {(ids) => (
            <Select
              {...ids}
              value={String(target.id)}
              onChange={setTo}
              options={destinations.map((b) => ({
                value: String(b.id),
                label: `${kindName(b)}, ${distance(from, b)} ${distance(from, b) === 1 ? "square" : "squares"} away`,
              }))}
            />
          )}
        </Field>
        <Field label="Carried">
          {(ids) => (
            <Select
              {...ids}
              value={mode}
              onChange={setMode}
              options={MODE_IDS.map((m) => ({
                value: m,
                label: MODES[m].name,
                description: `${MODES[m].carries} a day, up to ${MODES[m].reach} squares${Object.keys(MODES[m].perSquare).length ? `, ${amountsWords(MODES[m].perSquare)} a square` : ", free"}`,
                disabled: peopleOf(state) < MODES[m].unlockAt,
              }))}
            />
          )}
        </Field>
      </div>
      <p className="text-small text-ink-muted">
        {problem ?? (Object.keys(cost).length ? `Costs ${amountsWords(cost)}.` : "Costs nothing.")}
      </p>
      <div>
        <Button type="submit" size="sm" variant="primary" disabled={busy || problem !== null}>
          Lay the route
        </Button>
      </div>
    </form>
  );
}

function ContractPicker({ building, busy, act }: { building: Building; busy: boolean; act: Act }) {
  const value = building.contract ?? "none";
  return (
    <Field label="What the barge takes and brings, each day">
      {(ids) => (
        <Select
          {...ids}
          value={value}
          disabled={busy}
          onChange={(next) => act({ type: "contract", id: building.id, contract: next === "none" ? null : (next as ContractId) })}
          options={[
            { value: "none", label: "Nothing yet" },
            ...CONTRACT_IDS.map((id) => ({
              value: id,
              label: CONTRACTS[id].name,
              description: `${amountsWords(CONTRACTS[id].inputs)} for ${amountsWords(CONTRACTS[id].outputs)} a day`,
            })),
          ]}
        />
      )}
    </Field>
  );
}

/** Every building, as a list: the same as the plan, for reading and for choosing one. */
export function BuildingList({
  state,
  flows,
  onChoose,
}: {
  state: SteadingState;
  flows: Flows;
  onChoose: (square: { x: number; y: number }) => void;
}) {
  return (
    <section aria-labelledby="steading-buildings" className="grid gap-2">
      <Heading id="steading-buildings">Buildings</Heading>
      <Rows>
        {state.buildings.map((b) => {
          const Icon = KIND_ICONS[b.kind];
          const flow = flows.buildings[b.id];
          const words =
            b.kind === "house"
              ? houseShort(b, flows)
              : isWorkplace(b.kind) && flow
                ? `${limitShort(flow.limit)}${Object.keys(flow.makes).length ? `, ${amountsWords(flow.makes)} a day` : ""}`
                : null;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onChoose({ x: b.x, y: b.y })}
                className="flex min-h-11 w-full items-start gap-3 py-2 text-left hover:bg-surface md:min-h-9"
              >
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 text-small">
                  <span className="text-ink">{kindName(b)}</span>
                  <span className="text-ink-muted">
                    {" "}
                    · {b.x + 1}, {b.y + 1}
                    {words ? ` · ${words}` : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </Rows>
    </section>
  );
}

/** Every stock, its room, and how fast it grows: the settlement's ledger. */
export function Ledger({ state, flows }: { state: SteadingState; flows: Flows }) {
  const cap = storeCap(state);
  const rows = GOOD_IDS.filter((good) => state.stock[good] >= 1 || state.made[good] > 0 || flows.store[good].inflow > 0);
  return (
    <section aria-labelledby="steading-ledger" className="grid gap-2">
      <Heading id="steading-ledger">Ledger</Heading>
      <p className="text-small text-ink-muted">
        In the storehouses, out of {formatNumber(cap)} of each. Stock is kept for building and trade; workshops work only from what is sent
        to them along routes, so nothing in store is ever used up by itself.
      </p>
      <Table label="Ledger" className="tabular">
        <thead className="text-left text-ink-muted">
          <tr className="border-b border-border">
            <th scope="col" className="py-1.5 pr-3 font-normal">
              Good
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-normal">
              In store
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-normal">
              Kept a day
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-normal">
              To households
            </th>
            <th scope="col" className="py-1.5 text-right font-normal">
              Made in all
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((good) => (
            <tr key={good}>
              <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
                {capital(GOODS[good].name)}
              </th>
              <td className="py-1.5 pr-3 text-right text-ink">
                {held(state.stock[good])}
                {state.stock[good] >= cap - 1e-6 ? <span className="text-ink-muted"> full</span> : null}
              </td>
              <td className="py-1.5 pr-3 text-right text-ink">
                {flows.store[good].toStock > 0 ? `+${amount(flows.store[good].toStock)}` : "–"}
              </td>
              <td className="py-1.5 pr-3 text-right text-ink">
                {flows.store[good].toHouses > 0 ? amount(flows.store[good].toHouses) : "–"}
              </td>
              <td className="py-1.5 text-right text-ink">{held(state.made[good])}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {rows.length === 0 ? <p className="text-small text-ink-muted">Nothing in store yet.</p> : null}
    </section>
  );
}

function NeedRow({ what, need, supply, unit, none }: { what: string; need: number; supply: number; unit: string; none?: string }) {
  const short = need - supply > 1e-6;
  return (
    <tr>
      <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
        {what}
      </th>
      <td className="py-1.5 pr-3 text-right text-ink">
        {amount(need)} {unit}
      </td>
      <td className="py-1.5 pr-3 text-right text-ink">
        {amount(supply)} {unit}
      </td>
      <td className={cn("py-1.5 text-right", short ? "text-ink" : "text-ink-muted")}>
        {need === 0 ? "–" : none && supply === 0 ? none : short ? `short ${amount(need - supply)}` : "enough"}
      </td>
    </tr>
  );
}

/** The households: how many, what they wait for, and what a day takes, with the real figures and where they come from. */
export function Households({ state, flows }: { state: SteadingState; flows: Flows }) {
  const h = flows.households;
  const takes = houseTakes(state);
  const heat = heatNeed(state);
  return (
    <section aria-labelledby="steading-households" className="grid gap-2">
      <Heading id="steading-households">Households</Heading>
      <p className="text-body text-ink">
        {formatNumber(h.people)} people in {h.occupied} {h.occupied === 1 ? "house" : "houses"}
        {h.waiting.length ? `; ${h.waiting.length} ${h.waiting.length === 1 ? "house waits" : "houses wait"} for a household` : ""}.
      </p>
      {h.waiting.length ? (
        <ul className="grid list-disc gap-1 pl-5 text-small text-ink">
          {h.waiting.map((w) => {
            const house = state.buildings.find((b) => b.id === w.id);
            return (
              <li key={w.id}>
                {house ? capital(placeName(house)) : "A house"}: waiting for {waitWords(w.for)}.
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="text-small text-ink-muted">
        A household of four uses in a day {formatNumber(HOUSE_NEEDS.litres)} litres of water, {formatNumber(HOUSE_NEEDS.kcal)} kcal of food
        ({amount(takes.bread)} loaves), {amount(heat)} kWh of heat ({amount(takes.firewood * 10)} kg of dry logs) and{" "}
        {amount(HOUSE_NEEDS.electricityKwh)} kWh of electricity. Those are real figures
        {state.map.legacy || state.map.land === "valley" ? "" : ", the heat scaled for this land's cold"}; here a settlement day passes in
        an hour.
      </p>
      <Table label="What the households need in a day, and what reaches them" className="tabular">
        <thead className="text-left text-ink-muted">
          <tr className="border-b border-border">
            <th scope="col" className="py-1.5 pr-3 font-normal">
              A day
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-normal">
              Needed
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-normal">
              Reaching them
            </th>
            <th scope="col" className="py-1.5 text-right font-normal">
              <span className="sr-only">Enough or short</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <NeedRow what="Water" need={h.water.need} supply={h.water.supply} unit="litres" />
          <NeedRow what="Food" need={h.food.need} supply={h.food.supply} unit="kcal" />
          <NeedRow what="Heat" need={h.heat.need} supply={h.heat.supply} unit="kWh" />
          <NeedRow
            what="Electricity"
            need={h.electricity.need}
            supply={h.electricity.supply}
            unit="kWh"
            none={state.buildings.some((b) => ["wheel", "solar", "turbine", "generator"].includes(b.kind)) ? undefined : "no power yet"}
          />
        </tbody>
      </Table>
      <p className="text-small text-ink-muted">
        A household already here stays, whatever runs short; a shortage only keeps a new house waiting. Electricity is for light and is not
        needed to move in: the line lights the houses first, then runs the workshops' machines.
      </p>
      <Disclosure summary="Where the figures come from">
        <ul className="grid list-disc gap-1.5 pl-5 text-small text-ink">
          {NEED_SOURCES.map((source) => (
            <li key={source.what}>
              {source.what}: {source.says} {source.from}.
            </li>
          ))}
          <li>
            A bundle of firewood is 10 kg, so {formatNumber(KWH_PER_BUNDLE)} kWh. The heat is what a typical household's gas gives, as if
            from wood; a stove and a boiler are not equally efficient, and the game does not count the difference.
          </li>
          <li>
            On another land the heat follows the cold (the game's rule): two thirds of it goes up and down with the land's heating degree
            days against the river valley's, the third for hot water and cooking stays the same. Here a household needs {amount(heat)} kWh a
            day.
          </li>
          <li>Everything else is made up for the game: how fast things are made, what they cost, how far people walk, and the trade.</li>
        </ul>
      </Disclosure>
    </section>
  );
}

/** The landing's trade: the credit the barge keeps for the settlement, and buying and selling from the store. */
export function Trade({ state, busy, act }: { state: SteadingState; busy: boolean; act: Act }) {
  const landing = state.buildings.some((b) => b.kind === "landing");
  const [sellGood, setSellGood] = useState<GoodId>("planks");
  const [sellCount, setSellCount] = useState("10");
  const buyable = GOOD_IDS.filter((good) => GOODS[good].buys !== null);
  const [buyGood, setBuyGood] = useState<GoodId>("ore");
  const [buyCount, setBuyCount] = useState("1");
  const count = (text: string) => {
    const n = Number.parseInt(text, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return (
    <section aria-labelledby="steading-trade" className="grid gap-2">
      <Heading id="steading-trade">Trade</Heading>
      {!landing ? (
        <p className="text-small text-ink-muted">
          Once 12 people live here, a landing on the river or the shore lets the barge take a surplus and bring what the land lacks: ore
          where there is none, diesel, solar panels and battery cells.
        </p>
      ) : (
        <>
          <p className="text-body text-ink">The landing holds {formatNumber(Math.floor(state.credit))} credit for the settlement.</p>
          <p className="text-small text-ink-muted">
            The barge buys anything at a fixed price and sells coal, ore, iron, tools, diesel, solar panels and battery cells. A trade
            chosen at the landing runs every day along its routes; a sale here is from the store, once.
          </p>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              act({ type: "sell", good: sellGood, count: count(sellCount) });
            }}
          >
            <Field label="Sell" className="w-40">
              {(ids) => (
                <Select
                  {...ids}
                  value={sellGood}
                  onChange={setSellGood}
                  options={GOOD_IDS.map((good) => ({
                    value: good,
                    label: capital(GOODS[good].name),
                    description: `${held(state.stock[good])} in store, ${GOODS[good].sells} credit each`,
                  }))}
                />
              )}
            </Field>
            <Field label="How many" className="w-28">
              {(ids) => <Input {...ids} inputMode="numeric" value={sellCount} onChange={(event) => setSellCount(event.target.value)} />}
            </Field>
            <Button type="submit" disabled={busy || count(sellCount) === 0}>
              Sell for {formatNumber(count(sellCount) * GOODS[sellGood].sells)}
            </Button>
          </form>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              act({ type: "buy", good: buyGood, count: count(buyCount) });
            }}
          >
            <Field label="Buy" className="w-40">
              {(ids) => (
                <Select
                  {...ids}
                  value={buyGood}
                  onChange={setBuyGood}
                  options={buyable.map((good) => ({
                    value: good,
                    label: capital(GOODS[good].name),
                    description: `${GOODS[good].buys} credit each`,
                  }))}
                />
              )}
            </Field>
            <Field label="How many" className="w-28">
              {(ids) => <Input {...ids} inputMode="numeric" value={buyCount} onChange={(event) => setBuyCount(event.target.value)} />}
            </Field>
            <Button type="submit" disabled={busy || count(buyCount) === 0}>
              Buy for {formatNumber(count(buyCount) * (GOODS[buyGood].buys ?? 0))}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}

export function Milestones({ state }: { state: SteadingState }) {
  const reached = MILESTONE_IDS.filter((id) => state.milestones[id] !== undefined);
  return (
    <section aria-labelledby="steading-milestones" className="grid gap-2">
      <Heading id="steading-milestones">Milestones</Heading>
      <p className="text-small text-ink-muted">Founded {formatDate(state.startedAt)}.</p>
      {reached.length ? (
        <Rows>
          {reached.map((id) => (
            <li key={id} className="flex flex-wrap justify-between gap-x-3 py-1.5 text-small">
              <span className="text-ink">{MILESTONE_NAMES[id]}</span>
              <span className="tabular text-ink-muted">{formatDate(state.milestones[id] as number)}</span>
            </li>
          ))}
        </Rows>
      ) : (
        <p className="text-small text-ink-muted">None yet. The first comes when a new household moves in.</p>
      )}
    </section>
  );
}
