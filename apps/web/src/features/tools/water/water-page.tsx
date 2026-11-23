import { Notice } from "@/components/page";
import { Table, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { formatDate, plural } from "@/lib/utils";
import {
  allValues,
  Calculator,
  ChoiceField,
  Formula,
  formatFigure,
  formatRange,
  HowWorkedOut,
  Inputs,
  NumberField,
  type NumberSpec,
  Result,
  SourceList,
  ToolScreen,
  u,
  useChoice,
  useNumber,
} from "../kit";
import { SheetPdfActions, useSheetPdf } from "../kit/sheet-pdf";
import { boilAdvice, filterLife, rainYieldLitres, storageLitres } from "./formulas";
import {
  BLEACH_STEPS,
  BLEACH_TABLES,
  EFFECT_LEGEND,
  FILTER_EFFICIENCY,
  METHODS,
  PLANNING_FIGURES,
  RUNOFF,
  WATER_SOURCES as S,
  WHAT_NONE_REMOVE,
} from "./guidance";
import { PURIFICATION_TITLE, purificationDocument } from "./purification-sheet";

const CALCULATORS = [
  { id: "storage", title: "Water to store" },
  { id: "rain", title: "Rainwater from a roof" },
  { id: "filter", title: "Filter life" },
  { id: "purification", title: "Making water safe to drink" },
] as const;

export default function WaterPage() {
  return (
    <ToolScreen
      title="Water"
      description="How much water to store, how much rain a roof collects, how long a filter lasts, and how to make water safe to drink."
      calculators={CALCULATORS}
      footer={
        <>
          General information, quoted from the bodies named. If your water company or health authority gives instructions, such as a boil
          water notice, follow theirs.
        </>
      }
    >
      <StorageCalculator />
      <RainCalculator />
      <FilterCalculator />
      <Purification />
    </ToolScreen>
  );
}

const litres = (value: number) => `${formatFigure(value, { decimals: 0 })} litres`;

/** How long a store lasts at a daily use, given no more precisely than the yield it comes from. */
function lasts(lowLitres: number, highLitres: number, perDay: number): string {
  const precision = { significant: 2, decimals: 1 };
  const [low, high] = [lowLitres / perDay, highLitres / perDay];
  if (high < 1) return formatRange(low * 24, high * 24, "hours", precision);
  return formatRange(low, high, high === 1 ? "day" : "days", precision);
}

// ── Water to store ──────────────────────────────────────────────────────────

const stPeople: NumberSpec = {
  id: "water.storage.people",
  label: "People",
  initial: 2,
  suffix: "people",
  min: 1,
  integer: true,
  max: 1000,
};
const stDays: NumberSpec = { id: "water.storage.days", label: "Days", initial: 3, suffix: "days", min: 1, integer: true, max: 3650 };
const stOwn: NumberSpec = { id: "water.storage.own", label: "Your own figure, a person a day", initial: 5, units: u.units.water, above: 0 };

function StorageCalculator() {
  const options = [
    ...PLANNING_FIGURES.map((figure) => ({
      value: figure.id,
      label: `${figure.who}: ${formatRange(figure.litres[0], figure.litres[1], "litres", { decimals: 1 })}`,
      description: figure.covers,
    })),
    { value: "own", label: "My own figure" },
  ];
  const [figureId, setFigure] = useChoice("water.storage.figure", options, "uk");
  const people = useNumber(stPeople);
  const days = useNumber(stDays);
  const own = useNumber(stOwn);
  const figure = PLANNING_FIGURES.find((item) => item.id === figureId) ?? null;
  const values = allValues(people, days);
  const perDay: readonly [number, number] | null = figure ? figure.litres : own.value !== null ? [own.value, own.value] : null;
  const total = values && perDay ? [storageLitres(values[0], values[1], perDay[0]), storageLitres(values[0], values[1], perDay[1])] : null;
  const totalText = total ? formatRange(total[0]!, total[1]!, "litres", { decimals: 0 }) : "";
  return (
    <Calculator
      id="storage"
      title="Water to store"
      intro="How much water a household needs for a number of days. Official bodies give different figures for different things, so choose whose to use; all of them are listed below the answer."
    >
      <Inputs>
        <NumberField input={people} />
        <NumberField input={days} />
        <ChoiceField label="Whose planning figure" value={figureId} onChange={setFigure} options={options} className="sm:col-span-2" />
        {figure ? null : <NumberField input={own} />}
      </Inputs>
      <Result
        label="Water to store"
        figure={total ? totalText : null}
        keep={
          total && values
            ? {
                title: `Water to store for ${values[0]} ${values[0] === 1 ? "person" : "people"}, ${plural(values[1], "day")}`,
                lines: [`${totalText}${figure ? `, by the ${figure.who} figure (${figure.covers})` : ", by my own figure"}`],
              }
            : undefined
        }
      >
        {total && values ? (
          <>
            <p>
              {figure ? (
                <>
                  By the {figure.who} figure, which covers {figure.covers}; it recommends storing for {figure.days}.
                </>
              ) : (
                <>By your own figure.</>
              )}{" "}
              About {formatRange(total[0]! / u.ukGallon.toBase(1), total[1]! / u.ukGallon.toBase(1), "UK gallons", { decimals: 0 })}.
            </p>
            <Table label="The same household by each body's figure" className="mt-3">
              <caption className="pb-1 text-left text-ink-muted">The same household by each body's figure</caption>
              <tbody>
                {PLANNING_FIGURES.map((item) => (
                  <Tr key={item.id}>
                    <th scope="row" className="py-2.5 pr-3 text-left align-top font-medium text-ink">
                      {item.who}
                      <span className="block font-normal text-ink-muted">{item.covers}</span>
                    </th>
                    <Td numeric className="whitespace-nowrap">
                      {formatRange(
                        storageLitres(values[0], values[1], item.litres[0]),
                        storageLitres(values[0], values[1], item.litres[1]),
                        "litres",
                        { decimals: 0 },
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>water = people × days × litres a person a day</Formula>
            <ul className="grid gap-2">
              {PLANNING_FIGURES.map((item) => (
                <li key={item.id}>
                  <span className="font-semibold">{item.who}:</span> <q className="font-title">{item.quote.replace(/^“|”$/g, "")}</q>
                </li>
              ))}
            </ul>
            <p>
              A US gallon is 3.785 litres. The Sphere standards' own pages could not be read; WHO's note, adapted from Sphere, is used
              instead.
            </p>
          </>
        }
        range="Ordinary households in a temperate climate."
        limits="Hot weather, illness, pregnancy, babies, pets and heavy work, which all need more. The CDC adds “Consider storing more water than this for pregnant women, people who are sick, pets, or if you live in a hot climate.”"
        sources={[S.ukBeReady, S.cdcStorage, S.readyGov, S.whoTn9]}
      />
    </Calculator>
  );
}

// ── Rainwater ───────────────────────────────────────────────────────────────

const rnArea: NumberSpec = {
  id: "water.rain.area",
  label: "Roof area, in plan",
  initial: 50,
  units: u.units.area,
  above: 0,
  hint: "The footprint seen from above, not the area of the slope.",
};
const rnRain: NumberSpec = {
  id: "water.rain.rainfall",
  label: "Rainfall",
  initial: 10,
  units: u.units.rainfall,
  min: 0,
  hint: "Over one shower, a month or a year: the answer is for the same period.",
};
const rnOwnRunoff: NumberSpec = { id: "water.rain.runoff", label: "Your run-off coefficient", initial: 0.8, min: 0, max: 1 };
const rnFilter: NumberSpec = {
  id: "water.rain.filter",
  label: "Filter efficiency",
  initial: FILTER_EFFICIENCY,
  min: 0,
  max: 1,
  hint: "The share the gutter filter lets through. 0.9 is the figure the draft BS 8515 calls commonly used.",
};
const rnUse: NumberSpec = {
  id: "water.rain.use",
  label: "Water used a day",
  initial: "",
  units: u.units.water,
  above: 0,
  optional: true,
  hint: "To say how many days it lasts.",
};

function RainCalculator() {
  const options = [
    ...RUNOFF.map((item) => ({
      value: item.id,
      label: item.label,
      description: `${item.bs8515} (draft BS 8515); ${item.ciria} (CIRIA C753)`,
    })),
    { value: "own", label: "My own coefficient" },
  ];
  const [surfaceId, setSurface] = useChoice("water.rain.surface", options, "tiles");
  const surface = RUNOFF.find((item) => item.id === surfaceId) ?? null;
  const area = useNumber(rnArea);
  const rain = useNumber(rnRain);
  const ownRunoff = useNumber(rnOwnRunoff);
  const filter = useNumber(rnFilter);
  const use = useNumber(rnUse);
  const values = allValues(area, rain, filter);
  const coefficients = surface
    ? [Math.min(surface.bs8515, surface.ciria), Math.max(surface.bs8515, surface.ciria)]
    : ownRunoff.value !== null
      ? [ownRunoff.value, ownRunoff.value]
      : null;
  // Rainfall is held in metres by the units; the formula wants millimetres.
  const yields = values && coefficients ? coefficients.map((c) => rainYieldLitres(values[0], values[1] * 1000, c, values[2])) : null;
  const text = yields ? formatRange(yields[0]!, yields[1]!, "litres", { significant: 2, decimals: 0 }) : "";
  return (
    <Calculator
      id="rain"
      title="Rainwater from a roof"
      intro="How much rain a roof can collect, from its plan area, the rainfall and how much of the rain the surface lets run off."
    >
      <Inputs>
        <NumberField input={area} />
        <NumberField input={rain} />
        <ChoiceField label="Roof surface" value={surfaceId} onChange={setSurface} options={options} />
        {surface ? null : <NumberField input={ownRunoff} />}
        <NumberField input={filter} />
        <NumberField input={use} />
      </Inputs>
      <Result
        label="Rain collected"
        figure={yields ? text : null}
        keep={
          yields
            ? {
                title: "Rainwater from a roof",
                lines: [`${text} from ${formatFigure(values![0])} m² with ${formatFigure(values![1] * 1000)} mm of rain`],
              }
            : undefined
        }
      >
        {yields && surface ? (
          <p>
            The range is the two published coefficients for {surface.label.toLowerCase()}: {surface.bs8515} in the draft BS 8515 and{" "}
            {surface.ciria} in CIRIA C753.
            {use.value ? ` At ${litres(use.value)} a day that lasts ${lasts(yields[0]!, yields[1]!, use.value)}.` : ""}
          </p>
        ) : yields && use.value ? (
          <p>
            At {litres(use.value)} a day that lasts {lasts(yields[0]!, yields[1]!, use.value)}.
          </p>
        ) : null}
        {yields ? (
          <p className="mt-1 text-small text-ink-muted">
            Rainwater from a roof is not drinking water as it comes: treat it (see below) or use it for washing, flushing and the garden.
            Let the first rain after a dry spell run to waste.
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>litres = plan area (m²) × rainfall (mm) × run-off coefficient × filter efficiency</Formula>
            <p>
              One millimetre of rain on one square metre is one litre. This is the yield formula of the draft BS 8515 (YR = A × e × h × η);
              the standard multiplies a year's yield by 0.05 to size a tank, which is not done here. The draft says the coefficient and the
              filter efficiency together come to 0.7 to 0.8 in general.
            </p>
          </>
        }
        range="A roof draining to gutters and a filter in good order."
        limits="Evaporation on hot roofs, overflow when the tank is full, and blocked gutters. The draft BS 8515 read here is a 2008 draft for public comment, not the published standard, and the two published coefficients for tiles differ."
        sources={[S.bs8515, S.ciria]}
      />
    </Calculator>
  );
}

// ── Filter life ─────────────────────────────────────────────────────────────

const flRated: NumberSpec = {
  id: "water.filter.rated",
  label: "Rated capacity, from its label",
  initial: 1000,
  units: u.units.water,
  above: 0,
};
const flUsed: NumberSpec = { id: "water.filter.used", label: "Already filtered", initial: 0, units: u.units.water, min: 0 };
const flDaily: NumberSpec = { id: "water.filter.daily", label: "Filtered a day", initial: 8, units: u.units.water, above: 0 };
const flMonths: NumberSpec = {
  id: "water.filter.months",
  label: "Longest use the label allows",
  initial: "",
  suffix: "months",
  above: 0,
  optional: true,
  hint: "Some makers give a time limit as well as a volume.",
};

function FilterCalculator() {
  const rated = useNumber(flRated);
  const used = useNumber(flUsed);
  const daily = useNumber(flDaily);
  const months = useNumber(flMonths);
  const values = allValues(rated, used, daily);
  // A month as an average Gregorian month, 30.44 days.
  const life =
    values && months.error === null
      ? filterLife(values[0], values[1], values[2], months.value !== null ? months.value * 30.44 : null)
      : null;
  // Beyond a century the figures are surely mistyped, and a date that far off cannot be written.
  const tooLong = life !== null && life.days > 36_525;
  const date = life && !tooLong ? formatDate(Date.now() + life.days * 86_400_000) : "";
  return (
    <Calculator
      id="filter"
      title="Filter life"
      intro="When a water filter cartridge is due to be replaced, from the figures on its own label. Outpost keeps no list of filters: makers rate them differently, and the label is the authority."
    >
      <Inputs>
        <NumberField input={rated} />
        <NumberField input={used} />
        <NumberField input={daily} />
        <NumberField input={months} />
      </Inputs>
      <Result
        label="Replace it in"
        figure={life ? plural(Math.floor(life.days), "day") : null}
        refusal={
          values && values[1] >= values[0]
            ? "It has already filtered its rated capacity: replace it now."
            : tooLong
              ? "That is more than 100 years at this rate: check the figures above."
              : undefined
        }
        keep={
          life && !tooLong
            ? {
                title: "Water filter replacement",
                lines: [`Replace by ${date}, when the ${life.limit === "time" ? "label's time limit" : "rated capacity"} is reached`],
              }
            : undefined
        }
      >
        {life && !tooLong ? (
          <p>
            By {date}, when {life.limit === "time" ? "the time limit on the label comes" : "it has filtered its rated capacity"}. Replace it
            sooner if the flow slows, the taste changes or the maker's instructions say so.
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>days = (rated capacity − already filtered) ÷ litres a day; the sooner of that and the label's time limit</Formula>
            <p>A month is taken as 30.44 days, the average month.</p>
          </>
        }
        range="Water of the quality the filter is rated for."
        limits="Dirty or cloudy water clogs a filter long before its rating. What the filter removes is set by its type and certification (see below), not by this calculator."
        sources={[S.label]}
      />
    </Calculator>
  );
}

// ── Purification ────────────────────────────────────────────────────────────

const pfHeight: NumberSpec = {
  id: "water.boil.height",
  label: "Your height above sea level",
  initial: 0,
  units: u.units.height,
  min: -500,
  max: 9000,
};

function Purification() {
  const height = useNumber(pfHeight);
  const boil = height.value !== null ? boilAdvice(height.value) : null;
  const tables = BLEACH_TABLES.map((table) => ({ value: table.id, label: table.title }));
  const [tableId, setTable] = useChoice("water.bleach.table", tables, "epa-6");
  const table = BLEACH_TABLES.find((item) => item.id === tableId) ?? BLEACH_TABLES[0]!;
  const pdf = useSheetPdf(purificationDocument, {
    title: PURIFICATION_TITLE,
    kind: "Guidance",
    from: { what: "the water calculators", path: "/tools/water#purification" },
  });
  return (
    <Calculator
      id="purification"
      title="Making water safe to drink"
      intro="The treatments official bodies give, what each does and does not do, and the exact bleach tables. Quoted, not worked out: no dose here is more precise than its source."
    >
      <Notice tone="warning" title="Boiling or chemicals do not remove fuel, chemicals or heavy metals">
        {WHAT_NONE_REMOVE.map((item) => (
          <p key={item.who} className="mt-1">
            “{item.text}” ({item.who})
          </p>
        ))}
      </Notice>

      <h3 className="mt-6 text-lead font-semibold text-ink">Boiling</h3>
      <p className="mt-1 text-body text-ink">
        Boiling is the one method the CDC chart rates effective against every kind of germ, and it works in cloudy water.
      </p>
      <Inputs className="mt-3">
        <NumberField input={height} />
      </Inputs>
      <Result label="Keep it at a rolling boil for" figure={boil ? `${boil.minutes} ${boil.minutes === 1 ? "minute" : "minutes"}` : null}>
        {boil ? (
          <p>
            You are {boil.why}. UK and WHO guidance say only to bring it to a rolling boil; the longer US times add a margin. Let it cool
            naturally and keep it covered.
          </p>
        ) : null}
      </Result>

      <h3 className="mt-8 text-lead font-semibold text-ink">What each method does</h3>
      <p className="mt-1 text-small text-ink-muted">From the CDC's chart for backcountry and travel use, cell for cell. {EFFECT_LEGEND}</p>
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {METHODS.map((method) => (
          <li key={method.id} className="py-3">
            <p className="font-semibold text-ink">{method.name}</p>
            <dl className="mt-1 grid grid-cols-[fit-content(50%)_minmax(0,1fr)] break-words gap-x-3 gap-y-0.5 text-small">
              {(
                [
                  ["Bacteria", method.bacteria],
                  ["Viruses", method.viruses],
                  ["Giardia", method.giardia],
                  ["Cryptosporidium", method.cryptosporidium],
                ] as const
              ).map(([germ, effect]) => (
                <div key={germ} className="contents">
                  <dt className="text-ink-muted">{germ}</dt>
                  <dd
                    className={
                      effect.startsWith("Not") ? "font-semibold text-danger" : effect.startsWith("Somewhat") ? "text-warning" : "text-ink"
                    }
                  >
                    {effect}
                  </dd>
                </div>
              ))}
            </dl>
            {method.quotes.length ? (
              <ul className="mt-2 grid gap-1 text-small text-ink">
                {method.quotes.map((quote) => (
                  <li key={quote.text}>
                    <q className="font-title">{quote.text}</q> <span className="text-ink-muted">({quote.who})</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      <h3 className="mt-8 text-lead font-semibold text-ink">Household bleach</h3>
      <p className="mt-1 text-small text-ink-muted">
        The tables as the EPA and the CDC publish them, in US gallons and quarts (a US gallon is 3.785 litres, a quart a little under a
        litre). Find the strength on your bottle's label and use the table for it. No UK body was found that publishes its own table.
      </p>
      <ChoiceField label="Bleach strength" value={tableId} onChange={setTable} options={tables} className="mt-3 max-w-sm" />
      <Table label={table.title} className="mt-3">
        <caption className="pb-1 text-left font-semibold text-ink">{table.title}</caption>
        <TableHead>
          <Tr>
            <Th>Water</Th>
            <Th>Bleach to add</Th>
          </Tr>
        </TableHead>
        <tbody>
          {table.rows.map((row) => (
            <Tr key={row.water}>
              <Td className="tabular">{row.water}</Td>
              <Td className="tabular">{row.dose}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <ul className="mt-3 grid gap-1 text-small text-ink">
        {BLEACH_STEPS.map((step) => (
          <li key={step.text}>
            <q className="font-title">{step.text}</q> <span className="text-ink-muted">({step.who})</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 text-small">
        <SourceList sources={[table.source]} />
      </div>

      <h3 className="mt-8 text-lead font-semibold text-ink">Keep a copy</h3>
      <p className="mt-1 mb-3 text-small text-ink-muted">
        All of the above on a sheet to print and keep with your water, dated by when the guidance was read.
      </p>
      <SheetPdfActions made={pdf} />

      <HowWorkedOut
        formula={
          <p>
            Nothing on this part of the screen is worked out except which boiling time applies at your height. Where bodies differ, each is
            quoted: the EPA's three minutes start above 5,000 ft, the CDC's above 6,500 ft, and the EPA's page gives 5,000 ft as 1,000
            metres, which is not the same height (5,000 ft is about 1,524 m). The WHO and the UK's Drinking Water Inspectorate give no time,
            only a rolling boil. The CDC's two pages differ on chlorine dioxide and Cryptosporidium: both are quoted. Ready.gov (FEMA)
            advises against tablets that are not plain bleach; the EPA and the CDC accept them, following the maker's instructions.
          </p>
        }
        limits="Contamination by chemicals, fuel, metals, salt or radioactive material, which none of these remove. Toxins from algae."
        sources={[S.cdcBackcountry, S.cdcEmergency, S.cdcHiking, S.cdcYellowBook, S.epa, S.who, S.dwi, S.readyGov]}
      />
    </Calculator>
  );
}
