import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import {
  allValues,
  Calculator,
  ChoiceField,
  convert,
  Formula,
  formatFigure,
  HowWorkedOut,
  Inputs,
  NumberField,
  type NumberSpec,
  Result,
  ToolScreen,
  u,
  useChoice,
  useNumber,
  useText,
} from "../kit";
import { ConcreteCalculator } from "./concrete";
import { readLengths } from "./cutting-list";
import {
  boardsByStock,
  cuttingPlan,
  fabricLossWatts,
  fixingsPerSheet,
  type HeatFlow,
  type Layer,
  roofPitch,
  type Shape,
  SURFACE_RESISTANCE,
  shapeArea,
  sheetsFor,
  uValue,
} from "./formulas";
import { BUILDING_SOURCES as S, TYPICAL_CONDUCTIVITY, TYPICAL_U_VALUES } from "./sources";

const CALCULATORS = [
  { id: "concrete", title: "Concrete and mortar" },
  { id: "area", title: "Area and volume" },
  { id: "roof", title: "Roof pitch" },
  { id: "cutting", title: "Cutting list" },
  { id: "u-value", title: "U-value of a wall or roof" },
  { id: "heat-loss", title: "Heat loss" },
  { id: "sheets", title: "Sheets and fixings" },
] as const;

export default function BuildingPage() {
  return (
    <ToolScreen
      title="Building"
      description="Concrete and mortar, areas and volumes, roof pitch, a cutting list, heat loss, and sheets and fixings."
      calculators={CALCULATORS}
      footer={
        <>
          Estimates for planning and buying materials. They are not a structural design or a Building Regulations calculation: anything that
          holds something up, or must meet the regulations, needs the standard's full method or a qualified person.
        </>
      }
    >
      <ConcreteCalculator />
      <AreaCalculator />
      <RoofCalculator />
      <CuttingCalculator />
      <UValueCalculator />
      <HeatLossCalculator />
      <SheetsCalculator />
    </ToolScreen>
  );
}

const area2 = (m2: number) => `${formatFigure(m2, { decimals: 2 })} m²`;

// ── Area and volume ─────────────────────────────────────────────────────────

const SHAPES = [
  { value: "rectangle", label: "Rectangle" },
  { value: "triangle", label: "Triangle" },
  { value: "circle", label: "Circle" },
  { value: "trapezium", label: "Trapezium" },
] as const satisfies ReadonlyArray<{ value: Shape; label: string }>;

const LABELS: Record<Shape, [string, string?, string?]> = {
  rectangle: ["Length", "Width"],
  triangle: ["Base", "Height"],
  circle: ["Diameter"],
  trapezium: ["One parallel side", "The other parallel side", "Distance between them"],
};

const arA: NumberSpec = { id: "building.area.a", label: "First", initial: 4, units: u.units.building, min: 0 };
const arB: NumberSpec = { id: "building.area.b", label: "Second", initial: 3, units: u.units.building, min: 0 };
const arC: NumberSpec = { id: "building.area.c", label: "Third", initial: 2, units: u.units.building, min: 0 };
const arDepth: NumberSpec = {
  id: "building.area.depth",
  label: "Depth or height, for a volume",
  initial: 0,
  units: u.units.building,
  min: 0,
  hint: "0 for an area only.",
};

function AreaCalculator() {
  const [shape, setShape] = useChoice<Shape>("building.area.shape", SHAPES, "rectangle");
  const labels = LABELS[shape];
  const a = useNumber({ ...arA, label: labels[0] });
  const b = useNumber({ ...arB, label: labels[1] ?? arB.label });
  const c = useNumber({ ...arC, label: labels[2] ?? arC.label });
  const depth = useNumber(arDepth);
  const needed = [a, ...(labels[1] ? [b] : []), ...(labels[2] ? [c] : []), depth];
  const values = allValues(...needed);
  const area = values ? shapeArea(shape, a.value!, b.value ?? 0, c.value ?? 0) : null;
  const volume = area !== null && depth.value ? area * depth.value : null;
  return (
    <Calculator
      id="area"
      title="Area and volume"
      intro="The area of a common shape, and the volume of a slab, a hole or a tank of that shape."
    >
      <Inputs>
        <ChoiceField label="Shape" value={shape} onChange={setShape} options={SHAPES} className="sm:col-span-2" />
        <NumberField input={a} />
        {labels[1] ? <NumberField input={b} /> : null}
        {labels[2] ? <NumberField input={c} /> : null}
        <NumberField input={depth} />
      </Inputs>
      <Result
        label={volume !== null ? "Volume" : "Area"}
        figure={volume !== null ? `${formatFigure(volume, { decimals: 3 })} m³` : area !== null ? area2(area) : null}
        keep={
          area !== null
            ? {
                title: `${SHAPES.find((item) => item.value === shape)!.label}: area${volume !== null ? " and volume" : ""}`,
                lines: [
                  `Area ${area2(area)} (${formatFigure(convert(area, u.m2, u.ft2), { decimals: 1 })} sq ft)`,
                  ...(volume !== null
                    ? [`Volume ${formatFigure(volume, { decimals: 3 })} m³ (${formatFigure(volume * 1000, { decimals: 0 })} litres)`]
                    : []),
                ],
              }
            : undefined
        }
      >
        {area !== null ? (
          <p>
            An area of {area2(area)} ({formatFigure(convert(area, u.m2, u.ft2), { decimals: 1 })} sq ft)
            {volume !== null
              ? `; a volume of ${formatFigure(volume * 1000, { decimals: 0 })} litres (${formatFigure(volume / 0.3048 ** 3, { decimals: 1 })} cubic feet)`
              : ""}
            .
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <ul className="grid gap-1">
            <li>Rectangle: length × width</li>
            <li>Triangle: base × height ÷ 2</li>
            <li>Circle: π × (diameter ÷ 2)²</li>
            <li>Trapezium: (one side + the other) ÷ 2 × the distance between them</li>
            <li>Volume: area × depth, for straight sides</li>
          </ul>
        }
        limits="Sloping sides, and the extra a real job needs for waste and uneven ground."
        sources={[S.geometry]}
      />
    </Calculator>
  );
}

// ── Roof pitch ──────────────────────────────────────────────────────────────

const rfRise: NumberSpec = {
  id: "building.roof.rise",
  label: "Rise",
  initial: 1.5,
  units: u.units.building,
  min: 0,
  hint: "Height from the wall plate to the ridge.",
};
const rfRun: NumberSpec = {
  id: "building.roof.run",
  label: "Run",
  initial: 3,
  units: u.units.building,
  above: 0,
  hint: "Horizontal distance from the wall to under the ridge: half the span of a symmetrical roof.",
};

function RoofCalculator() {
  const rise = useNumber(rfRise);
  const run = useNumber(rfRun);
  const values = allValues(rise, run);
  const pitch = values ? roofPitch(values[0], values[1]) : null;
  return (
    <Calculator id="roof" title="Roof pitch" intro="The pitch of a roof from its rise and run, and the length of a rafter along the slope.">
      <Inputs>
        <NumberField input={rise} />
        <NumberField input={run} />
      </Inputs>
      <Result
        label="Pitch"
        figure={pitch ? `${formatFigure(pitch.degrees, { decimals: 1 })}°` : null}
        keep={
          pitch
            ? {
                title: "Roof pitch",
                lines: [
                  `${formatFigure(pitch.degrees, { decimals: 1 })}°, ${formatFigure(pitch.inTwelve, { decimals: 1 })} in 12, ${formatFigure(pitch.percent, { decimals: 0 })}%`,
                  `Along the slope ${formatFigure(pitch.slopeLength, { decimals: 3 })} m, before any overhang`,
                ],
              }
            : undefined
        }
      >
        {pitch ? (
          <p>
            {formatFigure(pitch.inTwelve, { decimals: 1 })} in 12, or {formatFigure(pitch.percent, { decimals: 0 })}%. Along the slope it is{" "}
            {formatFigure(pitch.slopeLength, { decimals: 3 })} m from the wall to the ridge, before any overhang. A roof's plan area, not
            its slope, is what collects rain: the rainwater calculator on Water takes the plan area.
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={<Formula>pitch = arctan(rise ÷ run); along the slope = √(rise² + run²)</Formula>}
        limits="The thickness of the rafter and the ridge board, and the birdsmouth cut, which change the cut length of a real rafter. The smallest pitch a roof covering may be laid at is in its maker's instructions."
        sources={[S.geometry]}
      />
    </Calculator>
  );
}

// ── Cutting list ────────────────────────────────────────────────────────────

const LIST_UNITS = [u.m, u.mm, u.ft, u.inch] as const;
const LIST_UNIT_OPTIONS = LIST_UNITS.map((unit) => ({ value: unit.id, label: unit.symbol }));
const kerfSpec: NumberSpec = {
  id: "building.cutting.kerf",
  label: "Saw kerf",
  initial: 3,
  units: [u.mm],
  min: 0,
  max: 0.02,
  hint: "The width the blade removes. Measure a cut, or see the blade.",
};

function CuttingCalculator() {
  const [unitId, setUnit] = useChoice("building.cutting.unit", LIST_UNIT_OPTIONS, "m");
  const unit = LIST_UNITS.find((item) => item.id === unitId) ?? u.m;
  const [piecesText, setPieces] = useText("building.cutting.pieces", "1.8 x 4\n0.9 x 6\n2.1 x 2");
  const [stockText, setStock] = useText("building.cutting.stock", "2.4\n3.0\n3.6\n4.8");
  const kerf = useNumber(kerfSpec);
  const pieces = useMemo(() => readLengths(piecesText, unit.toBase), [piecesText, unit]);
  const stock = useMemo(() => readLengths(stockText, unit.toBase, 20), [stockText, unit]);
  const plan = pieces.ok && stock.ok && kerf.value !== null ? cuttingPlan(pieces.lengths, stock.lengths, kerf.value) : null;
  const show = (meters: number) => `${formatFigure(unit.fromBase(meters), { decimals: unit.id === "mm" ? 0 : 3 })} ${unit.symbol}`;
  const byStock = plan ? boardsByStock(plan) : [];
  const buy = byStock.map(({ stock, count }) => `${count} × ${show(stock)}`).join(", ");
  return (
    <Calculator
      id="cutting"
      title="Cutting list"
      intro="Which lengths of timber to buy for a list of pieces, and how to cut each, allowing for the saw's kerf."
    >
      <Inputs>
        <ChoiceField label="Lengths are in" value={unitId} onChange={setUnit} options={LIST_UNIT_OPTIONS} className="sm:col-span-2" />
        <Field label="Pieces you need" hint="One a line; 1.2 x 4 for four pieces of 1.2." error={pieces.ok ? undefined : pieces.error}>
          {(ids) => (
            <Textarea
              {...ids}
              rows={5}
              value={piecesText}
              onChange={(event) => setPieces(event.target.value)}
              className="font-mono text-small"
            />
          )}
        </Field>
        <Field label="Stock lengths on sale" hint="The lengths your merchant sells, one a line." error={stock.ok ? undefined : stock.error}>
          {(ids) => (
            <Textarea
              {...ids}
              rows={5}
              value={stockText}
              onChange={(event) => setStock(event.target.value)}
              className="font-mono text-small"
            />
          )}
        </Field>
        <NumberField input={kerf} />
      </Inputs>
      <Result
        label="Buy"
        figure={plan ? (plan.boards.length ? buy : "Nothing") : null}
        refusal={
          plan?.tooLong.length
            ? `${plan.tooLong.map(show).join(", ")} ${plan.tooLong.length === 1 ? "is" : "are"} longer than any stock length, so cannot be cut from one board. Add a longer length, or plan a joint.`
            : undefined
        }
        keep={
          plan && !plan.tooLong.length
            ? {
                title: "Cutting list",
                lines: [
                  `Buy ${buy}`,
                  ...plan.boards.map(
                    (board, index) =>
                      `Board ${index + 1} (${show(board.stock)}): ${board.pieces.map(show).join(", ")}; offcut ${show(board.offcut)}`,
                  ),
                ],
              }
            : undefined
        }
      >
        {plan ? (
          <ol className="mt-1 grid gap-1 text-small tabular">
            {plan.boards.map((board, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: boards have no identity beyond their place in the plan
              <li key={index}>
                <span className="font-semibold">
                  Board {index + 1}, {show(board.stock)}:
                </span>{" "}
                {board.pieces.map(show).join(" + ")} <span className="text-ink-muted">· offcut {show(board.offcut)}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <p>
            Pieces longest first. Each goes on the first board already started that has room for it; when none has, a new board is started
            of the shortest stock length the piece fits. Every cut takes one kerf, except where a piece uses up the end of a board. This is
            the method known as first fit decreasing: quick and usually close, but not guaranteed to use the fewest boards or the least
            money.
          </p>
        }
        limits="Defects and split ends to cut off, timber that is not quite its stated length, and the grain or knots in a particular piece. Buy a little over."
        sources={[S.ffd]}
      />
    </Calculator>
  );
}

// ── U-value ─────────────────────────────────────────────────────────────────

const FLOWS = [
  { value: "horizontal", label: "Wall (heat flows sideways)" },
  { value: "upwards", label: "Roof or ceiling (heat flows up)" },
  { value: "downwards", label: "Floor over a void (heat flows down)" },
] as const satisfies ReadonlyArray<{ value: HeatFlow; label: string }>;

interface LayerRow {
  name: string;
  mm: string;
  conductivity: string;
}

/** A shed wall, as an example, from the published conductivities listed under "How this is worked out". */
const DEFAULT_LAYERS: LayerRow[] = [
  { name: "OSB sheathing", mm: "11", conductivity: "0.13" },
  { name: "PIR insulation board", mm: "50", conductivity: "0.022" },
  { name: "Plywood lining", mm: "12", conductivity: "0.13" },
];

function readLayers(text: string): LayerRow[] {
  try {
    const parsed = JSON.parse(text) as LayerRow[];
    return Array.isArray(parsed)
      ? parsed.filter((row) => typeof row?.mm === "string" && typeof row?.conductivity === "string")
      : DEFAULT_LAYERS;
  } catch {
    return DEFAULT_LAYERS;
  }
}

function UValueCalculator() {
  const [flow, setFlow] = useChoice<HeatFlow>("building.uvalue.flow", FLOWS, "horizontal");
  const [stored, setStored] = useText("building.uvalue.layers", JSON.stringify(DEFAULT_LAYERS));
  const rows = readLayers(stored);
  const setRows = (next: LayerRow[]) => setStored(JSON.stringify(next));
  const parsed = rows.map((row) => {
    const mm = Number(row.mm);
    const k = Number(row.conductivity);
    const mmError = row.mm.trim() === "" || !(mm > 0) ? "Type a thickness more than 0." : undefined;
    const kError = row.conductivity.trim() === "" || !(k > 0) ? "Type a conductivity more than 0." : undefined;
    return { mmError, kError, layer: mmError || kError ? null : ({ thickness: mm / 1000, conductivity: k } satisfies Layer) };
  });
  const layers = parsed.every((row) => row.layer) ? parsed.map((row) => row.layer!) : null;
  const u = layers?.length ? uValue(layers, flow) : null;
  const surfaces = SURFACE_RESISTANCE[flow];
  return (
    <Calculator
      id="u-value"
      title="U-value of a wall or roof"
      intro="How readily heat passes through a build-up of plain layers, from each layer's thickness and thermal conductivity (the λ-value on the product's data sheet)."
    >
      <ChoiceField label="Element" value={flow} onChange={setFlow} options={FLOWS} />
      <ul className="mt-4 grid gap-3">
        {rows.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: layers are edited in place and have no other identity
          <li key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
            <Field label={`Layer ${index + 1}`} className="col-span-3 sm:col-span-1">
              {(ids) => (
                <input
                  {...ids}
                  value={row.name}
                  onChange={(event) => setRows(rows.map((item, at) => (at === index ? { ...item, name: event.target.value } : item)))}
                  placeholder="What it is"
                  className="h-9 w-full rounded-control border border-border-strong bg-page px-3 text-body text-ink focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 max-md:h-11"
                />
              )}
            </Field>
            <Field label="Thickness, mm" error={parsed[index]!.mmError}>
              {(ids) => (
                <input
                  {...ids}
                  inputMode="decimal"
                  value={row.mm}
                  onChange={(event) => setRows(rows.map((item, at) => (at === index ? { ...item, mm: event.target.value } : item)))}
                  className="h-9 w-full rounded-control border border-border-strong bg-page px-3 text-body text-ink tabular focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 aria-invalid:border-danger max-md:h-11"
                />
              )}
            </Field>
            <Field label="λ, W/mK" error={parsed[index]!.kError}>
              {(ids) => (
                <input
                  {...ids}
                  inputMode="decimal"
                  value={row.conductivity}
                  onChange={(event) =>
                    setRows(rows.map((item, at) => (at === index ? { ...item, conductivity: event.target.value } : item)))
                  }
                  className="h-9 w-full rounded-control border border-border-strong bg-page px-3 text-body text-ink tabular focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 aria-invalid:border-danger max-md:h-11"
                />
              )}
            </Field>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove layer ${index + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows(rows.filter((_, at) => at !== index))}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        size="sm"
        className="mt-3"
        disabled={rows.length >= 8}
        onClick={() => setRows([...rows, { name: "", mm: "", conductivity: "" }])}
      >
        <Plus aria-hidden /> Add a layer
      </Button>
      <Result
        label="U-value"
        figure={u !== null ? `${formatFigure(u, { decimals: 2 })} W/m²K` : null}
        keep={
          u !== null
            ? {
                title: "U-value estimate",
                lines: [
                  `${formatFigure(u, { decimals: 2 })} W/m²K (${FLOWS.find((item) => item.value === flow)!.label.toLowerCase()})`,
                  ...rows.map((row) => `${row.name || "Layer"}: ${row.mm} mm at λ ${row.conductivity} W/mK`),
                  "Simple sum of plain layers; no correction for bridging or fixings.",
                ],
              }
            : undefined
        }
      >
        {u !== null ? (
          <p>
            An estimate by the simple sum of the layers. Studs, joists and wall ties through the insulation make the real figure higher.
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>U = 1 ÷ (Rsi + Σ thickness ÷ λ + Rse)</Formula>
            <p>
              Surface resistances from BS EN ISO 6946 for this element: Rsi {surfaces.inside} and Rse {surfaces.outside} m²K/W.
            </p>
            <p className="font-semibold">Thermal conductivities, as published</p>
            <ul className="grid gap-0.5 text-ink-muted">
              {TYPICAL_CONDUCTIVITY.map((item) => (
                <li key={item.name}>
                  {item.name}: {item.value} W/mK ({item.source})
                </li>
              ))}
            </ul>
          </>
        }
        range="Plain, continuous layers. The product's own data sheet is the λ-value to use."
        limits="Thermal bridges (timber studs, joists, ties, fixings), air gaps and cavities, and the corrections in the full BS EN ISO 6946 method. This is an estimate, not a Building Regulations U-value calculation."
        sources={[S.iso6946, S.knauf, S.kingspan]}
      />
    </Calculator>
  );
}

// ── Heat loss ───────────────────────────────────────────────────────────────

const hlU: NumberSpec = { id: "building.heat.u", label: "U-value", initial: 0.3, suffix: "W/m²K", above: 0, max: 10 };
const hlArea: NumberSpec = { id: "building.heat.area", label: "Area", initial: 20, units: u.units.area, above: 0 };
const hlInside: NumberSpec = { id: "building.heat.inside", label: "Inside temperature", initial: 20, units: u.units.temperature };
const hlOutside: NumberSpec = { id: "building.heat.outside", label: "Outside temperature", initial: -2, units: u.units.temperature };

function HeatLossCalculator() {
  const typical = TYPICAL_U_VALUES.map((item) => ({
    value: item.id as string,
    label: `${item.name}: ${item.value}`,
    description: item.source,
  }));
  const uInput = useNumber(hlU);
  const area = useNumber(hlArea);
  const inside = useNumber(hlInside);
  const outside = useNumber(hlOutside);
  const values = allValues(uInput, area, inside, outside);
  const delta = values ? values[2] - values[3] : null;
  const watts = values && delta !== null ? fabricLossWatts(values[0], values[1], delta) : null;
  return (
    <Calculator
      id="heat-loss"
      title="Heat loss"
      intro="Heat lost through one wall, roof, floor or window, from its U-value, its area and the difference between the temperatures either side."
    >
      <Inputs>
        <ChoiceField
          label="Fill in a published U-value"
          value={TYPICAL_U_VALUES.find((item) => String(item.value) === uInput.text)?.id}
          onChange={(id) => {
            const item = TYPICAL_U_VALUES.find((entry) => entry.id === id);
            if (item) uInput.setText(String(item.value));
          }}
          options={typical}
          placeholder="Choose one, or type your own below"
          className="sm:col-span-2"
        />
        <NumberField input={uInput} />
        <NumberField input={area} />
        <NumberField input={inside} />
        <NumberField input={outside} />
      </Inputs>
      <Result
        label="Heat lost"
        figure={watts !== null ? `${formatFigure(watts, { decimals: 0 })} W` : null}
        refusal={delta !== null && delta <= 0 ? "Inside is not warmer than outside, so no heat is lost through it." : undefined}
        keep={
          watts !== null && values
            ? {
                title: "Heat loss estimate",
                lines: [
                  `${formatFigure(watts, { decimals: 0 })} W through ${formatFigure(values[1], { decimals: 1 })} m² at U = ${values[0]}, ${formatFigure(delta!, { decimals: 1 })} °C difference`,
                  `${formatFigure((watts * 24) / 1000, { decimals: 1 })} kWh a day if that difference held all day`,
                ],
              }
            : undefined
        }
      >
        {watts !== null && delta !== null ? (
          <p>
            While it is {formatFigure(delta, { decimals: 1 })} °C colder outside, {formatFigure(watts, { decimals: 0 })} watts of heating
            replaces what goes through it: {formatFigure((watts * 24) / 1000, { decimals: 1 })} kWh over a day at that difference.
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={<Formula>heat loss (W) = U × area × (inside − outside)</Formula>}
        range="One element at steady temperatures. Add each wall, window, roof and floor for a room."
        limits="Air leaking in and out (ventilation loss, often as large as the rest), thermal bridges at junctions, heat gained from the sun and from people, and ground floors, whose loss depends on the floor's size and shape. It is an estimate, not a heat-loss survey or a Building Regulations calculation."
        sources={[S.heatLoss, S.adl, S.rdsap]}
      />
    </Calculator>
  );
}

// ── Sheets and fixings ──────────────────────────────────────────────────────

const shArea: NumberSpec = { id: "building.sheets.area", label: "Area to cover", initial: 24, units: u.units.area, above: 0 };
const shWidth: NumberSpec = {
  id: "building.sheets.width",
  label: "Sheet width",
  initial: 1200,
  units: [u.mm, u.m, u.ft, u.inch],
  above: 0,
};
const shHeight: NumberSpec = {
  id: "building.sheets.height",
  label: "Sheet length",
  initial: 2400,
  units: [u.mm, u.m, u.ft, u.inch],
  above: 0,
};
const shWaste: NumberSpec = { id: "building.sheets.waste", label: "Allowance for cutting", initial: 10, suffix: "%", min: 0, max: 100 };
const shAcross: NumberSpec = {
  id: "building.sheets.across",
  label: "Fixing spacing across",
  initial: 600,
  units: [u.mm, u.inch],
  above: 0,
  hint: "Usually the spacing of the studs or joists behind.",
};
const shAlong: NumberSpec = {
  id: "building.sheets.along",
  label: "Fixing spacing along",
  initial: 300,
  units: [u.mm, u.inch],
  above: 0,
  hint: "From the sheet maker's fixing guide.",
};

function SheetsCalculator() {
  const area = useNumber(shArea);
  const width = useNumber(shWidth);
  const height = useNumber(shHeight);
  const waste = useNumber(shWaste);
  const across = useNumber(shAcross);
  const along = useNumber(shAlong);
  const values = allValues(area, width, height, waste, across, along);
  const sheets = values ? sheetsFor(values[0], values[1] * values[2], values[3]) : null;
  const perSheet = values ? fixingsPerSheet(values[1], values[2], values[4], values[5]) : null;
  return (
    <Calculator
      id="sheets"
      title="Sheets and fixings"
      intro="Sheets of plasterboard, plywood or OSB to cover an area, and screws or nails to fix them at the spacing their maker gives."
    >
      <Inputs>
        <NumberField input={area} />
        <NumberField input={waste} />
        <NumberField input={width} />
        <NumberField input={height} />
        <NumberField input={across} />
        <NumberField input={along} />
      </Inputs>
      <Result
        label="Sheets"
        figure={sheets !== null ? `${sheets} sheets` : null}
        keep={
          sheets !== null && perSheet !== null
            ? { title: "Sheets and fixings", lines: [`${sheets} sheets`, `About ${perSheet} fixings a sheet, ${sheets * perSheet} in all`] }
            : undefined
        }
      >
        {sheets !== null && perSheet !== null ? (
          <p>
            About {perSheet} fixings a sheet on that grid, {sheets * perSheet} in all. Buy a box more: some are dropped and some bend.
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>sheets = area × (1 + allowance) ÷ sheet area, rounded up</Formula>
            <Formula>fixings a sheet = (width ÷ spacing across, rounded up, + 1) × (length ÷ spacing along, rounded up, + 1)</Formula>
          </>
        }
        range="A rectangle of sheets on a regular grid of fixings, with a row at each edge."
        limits="Openings, offcuts too small to use, and fixing patterns that differ at edges and in the field. The spacing is the sheet maker's to give: this calculator does not choose it."
        sources={[S.geometry]}
      />
    </Calculator>
  );
}
