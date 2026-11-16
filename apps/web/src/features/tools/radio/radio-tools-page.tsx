import { HF_BANDS, maxSightDistanceMeters, REPEATER_BANDS } from "@outpost/shared";
import { Link } from "react-router";
import {
  allValues,
  Calculator,
  ChoiceField,
  Formula,
  formatDuration,
  formatFigure,
  HowWorkedOut,
  Inputs,
  NumberField,
  type NumberSpec,
  Result,
  ToolScreen,
  type Unit,
  u,
  useChoice,
  useNumber,
} from "../kit";
import { CABLES, type CableId } from "./coax-data";
import {
  type AntennaKind,
  antennaLengths,
  averageCurrent,
  batteryHours,
  cableLoss,
  dbmFromSUnits,
  dbmToWatts,
  freeSpaceLossDb,
  lossPer100m,
  radioHorizonMeters,
  S9_DBM,
  sMeterReading,
  wattsToDbm,
} from "./formulas";
import { RADIO_SOURCES as S } from "./sources";

const CALCULATORS = [
  { id: "antenna", title: "Antenna lengths" },
  { id: "path-loss", title: "Free-space path loss" },
  { id: "horizon", title: "Radio horizon" },
  { id: "coax", title: "Cable loss" },
  { id: "levels", title: "Watts, dBm and S-units" },
  { id: "battery", title: "Battery life" },
] as const;

export default function RadioToolsPage() {
  return (
    <ToolScreen
      title="Radio calculators"
      description="Antenna lengths, path loss, the radio horizon, cable loss, power levels and battery life, worked out as you type."
      calculators={CALCULATORS}
      footer={
        <>
          These are the textbook sums. A real antenna is trimmed to resonance where it is put up, and a real path has ground, buildings and
          weather in it. Nothing here says which frequencies you may transmit on: that is set by your licence.
        </>
      }
    >
      <AntennaCalculator />
      <PathLossCalculator />
      <HorizonCalculator />
      <CoaxCalculator />
      <LevelsCalculator />
      <BatteryCalculator />
    </ToolScreen>
  );
}

// ── Antenna lengths ─────────────────────────────────────────────────────────

const ANTENNA_KINDS = [
  { value: "dipole", label: "Half-wave dipole" },
  { value: "efhw", label: "End-fed half-wave" },
  { value: "quarter", label: "Quarter-wave vertical" },
] as const satisfies ReadonlyArray<{ value: AntennaKind; label: string }>;

/** Bands a frequency can be filled in from: the HF bands with Outpost's frequency near their middle, and VHF and UHF bands at their middle. */
const BAND_FILL = [
  ...HF_BANDS.map((band) => ({ value: band.id, label: band.label, mhz: band.mhz })),
  ...REPEATER_BANDS.filter((band) => ["6m", "4m", "2m", "70cm"].includes(band.id)).map((band) => ({
    value: band.id,
    label: band.name,
    mhz: Math.round(((band.fromMHz + band.toMHz) / 2) * 1000) / 1000,
  })),
];

const antennaFrequency: NumberSpec = { id: "radio.antenna.mhz", label: "Frequency", initial: 7.1, units: [u.mhz], above: 0, max: 3000 };
const antennaFactor: NumberSpec = {
  id: "radio.antenna.factor",
  label: "Velocity and end-effect factor",
  initial: 0.95,
  min: 0.5,
  max: 1,
  hint: "0.95 is the usual starting point for bare wire. Insulated wire is often a little shorter still.",
};

function feetAndInches(meters: number): string {
  const inches = meters / 0.0254;
  const feet = Math.floor(inches / 12);
  const rest = Math.round(inches - feet * 12);
  return rest === 12 ? `${feet + 1} ft 0 in` : `${feet} ft ${rest} in`;
}

function AntennaCalculator() {
  const [kind, setKind] = useChoice<AntennaKind>("radio.antenna.kind", ANTENNA_KINDS, "dipole");
  const frequency = useNumber(antennaFrequency);
  const factor = useNumber(antennaFactor);
  const values = allValues(frequency, factor);
  const result = values ? antennaLengths(kind, values[0], values[1]) : null;
  const kindLabel = ANTENNA_KINDS.find((item) => item.value === kind)!.label.toLowerCase();
  const metres = (value: number) => `${formatFigure(value, { decimals: 2 })} m`;
  return (
    <Calculator
      id="antenna"
      title="Antenna lengths"
      intro="Where to cut the wire for a dipole, an end-fed half-wave or a quarter-wave vertical."
    >
      <Inputs>
        <ChoiceField label="Antenna" value={kind} onChange={setKind} options={ANTENNA_KINDS} />
        <ChoiceField
          label="Fill in a band"
          value={BAND_FILL.find((band) => String(band.mhz) === frequency.text)?.value}
          placeholder="Choose a band"
          onChange={(id) => {
            const band = BAND_FILL.find((item) => item.value === id);
            if (band) frequency.setText(String(band.mhz));
          }}
          options={BAND_FILL.map(({ value, label, mhz }) => ({ value, label: `${label}, ${formatFigure(mhz, { decimals: 3 })} MHz` }))}
          hint="Puts a frequency near the middle of the band in below. Type your own to cut for the part of the band you use."
        />
        <NumberField input={frequency} />
        <NumberField input={factor} />
      </Inputs>
      <Result
        label={kind === "dipole" ? "Each leg" : "Length of wire"}
        figure={result ? (result.leg !== null ? metres(result.leg) : metres(result.total)) : null}
        keep={
          result && values
            ? {
                title: `${ANTENNA_KINDS.find((item) => item.value === kind)!.label} for ${formatFigure(values[0], { decimals: 4 })} MHz`,
                lines: [
                  `Total length ${metres(result.total)} (${feetAndInches(result.total)})`,
                  ...(result.leg !== null ? [`Each leg ${metres(result.leg)} (${feetAndInches(result.leg)})`] : []),
                  `Factor ${values[1]}. Cut long and trim to resonance.`,
                ],
              }
            : undefined
        }
      >
        {result ? (
          <>
            <p>
              {result.leg !== null ? (
                <>
                  Two legs of {metres(result.leg)} ({feetAndInches(result.leg)}), {metres(result.total)} ({feetAndInches(result.total)}) tip
                  to tip.
                </>
              ) : (
                <>
                  A {kindLabel} of {metres(result.total)} ({feetAndInches(result.total)}).
                </>
              )}{" "}
              The free-space wavelength is {metres(result.wavelength)}.
            </p>
            <p className="mt-1 text-small text-ink-muted">
              Cut a little long and trim to resonance with an SWR meter or an analyser where the antenna will hang: height, nearby objects
              and the wire change it.
              {kind === "efhw" ? " An end-fed half-wave needs an impedance-matching transformer at its feed point." : ""}
              {kind === "quarter" ? " A quarter-wave vertical works against a ground plane or radials." : ""}
            </p>
          </>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>length = factor × c ÷ (2 × f) for a half wave, factor × c ÷ (4 × f) for a quarter wave</Formula>
            <p>
              c is the speed of light, 299,792,458 m/s, and f the frequency. With the factor at 0.95 a half wave comes to 142.4 ÷ f metres,
              f in MHz: close to the ARRL's 468 ÷ f feet (a factor of 0.951) and the RSGB's 143 ÷ f metres (0.954). The ARRL suggests adding
              about six inches before trimming. A dipole is cut into two equal legs either side of the feed point.
            </p>
          </>
        }
        range="Thin wire antennas well clear of the ground. The factor is adjustable because insulation, wire thickness and surroundings all shorten the resonant length."
        limits="The effect of height above ground, nearby objects and the feed line, which is why every antenna is trimmed in place."
        sources={[S.arrlDipole]}
      />
    </Calculator>
  );
}

// ── Free-space path loss ────────────────────────────────────────────────────

const plFrequency: NumberSpec = {
  id: "radio.fspl.mhz",
  label: "Frequency",
  initial: 145,
  units: [u.mhz, u.ghz, u.khz],
  above: 0,
  max: 300_000,
};
const plDistance: NumberSpec = { id: "radio.fspl.distance", label: "Distance", initial: 10, units: u.units.distance, above: 0 };
const plPower: NumberSpec = {
  id: "radio.fspl.power",
  label: "Transmitter power (optional sum)",
  initial: 5,
  units: [u.watt, u.mw],
  above: 0,
  hint: "With antennas of no gain at both ends, for the level at the receiver.",
};

function PathLossCalculator() {
  const frequency = useNumber(plFrequency);
  const distance = useNumber(plDistance);
  const power = useNumber(plPower);
  const values = allValues(frequency, distance);
  const loss = values ? freeSpaceLossDb(values[0], values[1] / 1000) : null;
  const received = loss !== null && power.value !== null ? wattsToDbm(power.value) - loss : null;
  const convention = values && values[0] > 30 ? "vhf" : "hf";
  return (
    <Calculator id="path-loss" title="Free-space path loss" intro="How much weaker a signal gets over a distance with nothing in the way.">
      <Inputs>
        <NumberField input={frequency} />
        <NumberField input={distance} />
        <NumberField input={power} />
      </Inputs>
      <Result
        label="Path loss"
        figure={loss !== null ? `${formatFigure(loss, { decimals: 1 })} dB` : null}
        keep={
          loss !== null && values
            ? {
                title: `Free-space path loss, ${formatFigure(values[0], { decimals: 4 })} MHz over ${formatFigure(values[1] / 1000, { decimals: 2 })} km`,
                lines: [
                  `${formatFigure(loss, { decimals: 1 })} dB`,
                  ...(received !== null
                    ? [`Received ${formatFigure(received, { decimals: 1 })} dBm, ${sMeterReading(received, convention)}`]
                    : []),
                ],
              }
            : undefined
        }
      >
        {received !== null ? (
          <p>
            From {formatFigure(power.value!, { decimals: 3 })} W the receiver would see about {formatFigure(received, { decimals: 0 })} dBm,{" "}
            {sMeterReading(received, convention)} on the {convention === "hf" ? "HF" : "VHF and up"} S-meter convention, before cable losses
            and antenna gains.
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>L = 20 log₁₀(4πd ÷ λ) = 32.45 + 20 log₁₀ f + 20 log₁₀ d</Formula>
            <p>f in MHz, d in km. ITU-R P.525 writes the constant as 32.4; worked out from 4π ÷ c it is 32.45, which is used here.</p>
          </>
        }
        range="Line of sight with nothing between the antennas and nothing reflecting: space, or a clear path well above the ground."
        limits="The ground, hills, buildings, trees and the atmosphere, which on a real path usually add a great deal of loss. For a path over real terrain use the map's line of sight tool."
        sources={[S.itu525]}
      />
    </Calculator>
  );
}

// ── Radio horizon ───────────────────────────────────────────────────────────

const hzA: NumberSpec = { id: "radio.horizon.a", label: "Height of your antenna", initial: 10, units: u.units.height, min: 0, max: 40_000 };
const hzB: NumberSpec = {
  id: "radio.horizon.b",
  label: "Height of the other antenna",
  initial: 2,
  units: u.units.height,
  min: 0,
  max: 40_000,
  hint: "0 for the furthest point on the ground you can reach.",
};

function HorizonCalculator() {
  const a = useNumber(hzA);
  const b = useNumber(hzB);
  const values = allValues(a, b);
  const km = (meters: number) => `${formatFigure(meters / 1000, { decimals: 1 })} km`;
  const miles = (meters: number) => `${formatFigure(meters / 1609.344, { decimals: 1 })} miles`;
  const total = values ? maxSightDistanceMeters(values[0], values[1]) : null;
  return (
    <Calculator
      id="horizon"
      title="Radio horizon"
      intro="How far apart two antennas can be and still see each other over a smooth earth: the sea, or flat land with nothing on it."
    >
      <Inputs>
        <NumberField input={a} />
        <NumberField input={b} />
      </Inputs>
      <Result
        label="Furthest line of sight"
        figure={total !== null ? km(total) : null}
        keep={
          total !== null && values
            ? {
                title: `Radio horizon, antennas ${formatFigure(values[0])} m and ${formatFigure(values[1])} m up`,
                lines: [`${km(total)} (${miles(total)}) over a smooth earth, k = 4/3`],
              }
            : undefined
        }
      >
        {values && total !== null ? (
          <p>
            {miles(total)}. Your own horizon is {km(radioHorizonMeters(values[0]))} away, the other's {km(radioHorizonMeters(values[1]))}.
            Hills and buildings shorten this; height on a hill lengthens it.{" "}
            <Link to="/maps" className="text-primary underline underline-offset-2">
              Line of sight over real terrain is on the map
            </Link>{" "}
            (the tool “Line of sight between two points”).
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>d = √(2 k R h₁) + √(2 k R h₂)</Formula>
            <p>
              R is the Earth's mean radius, 6,371 km, and k = 4/3 the effective-radius factor ITU-R P.834 gives for a standard atmosphere,
              in which a ray bends gently back towards the ground. That comes to about 4.12 √h km for h in metres (worked out here, not
              quoted). This is the same sum Outpost's map uses to limit a line of sight check.
            </p>
          </>
        }
        range="VHF and above, over a smooth earth, in a standard atmosphere."
        limits="Terrain, buildings and the Fresnel zone; ducting and other unusual weather that carries signals much further; HF, which travels by the ionosphere and the ground wave."
        sources={[S.ituHorizon]}
      />
    </Calculator>
  );
}

// ── Cable loss ──────────────────────────────────────────────────────────────

const coaxFrequency: NumberSpec = { id: "radio.coax.mhz", label: "Frequency", initial: 145, units: [u.mhz], above: 0 };
const coaxLength: NumberSpec = { id: "radio.coax.length", label: "Length of cable", initial: 20, units: u.units.length, above: 0 };
const coaxPower: NumberSpec = { id: "radio.coax.power", label: "Power into the cable", initial: 50, units: [u.watt], above: 0 };
const coaxOwn: NumberSpec = {
  id: "radio.coax.own",
  label: "Your cable's loss per 100 m",
  initial: 10,
  suffix: "dB",
  min: 0,
  hint: "From the maker's data sheet, at the frequency above.",
};

function CoaxCalculator() {
  const options = [...CABLES.map((cable) => ({ value: cable.id, label: cable.name })), { value: "own" as const, label: "My own figure" }];
  const [cableId, setCable] = useChoice<CableId | "own">("radio.coax.cable", options, CABLES[0]!.id);
  const frequency = useNumber(coaxFrequency);
  const length = useNumber(coaxLength);
  const power = useNumber(coaxPower);
  const own = useNumber(coaxOwn);
  const cable = CABLES.find((item) => item.id === cableId) ?? null;
  const per100 = cable ? (frequency.value !== null ? lossPer100m(cable.table, frequency.value) : null) : own.value;
  const outside = cable !== null && frequency.value !== null && per100 === null;
  const loss = per100 !== null && length.value !== null ? cableLoss(per100, length.value) : null;
  const delivered = loss && power.value !== null ? power.value * loss.delivered : null;
  const first = cable?.table[0];
  const last = cable?.table[cable.table.length - 1];
  return (
    <Calculator
      id="coax"
      title="Cable loss"
      intro="How much of the power reaches the antenna through a length of coaxial cable, from the maker's published figures."
    >
      <Inputs>
        <ChoiceField label="Cable" value={cableId} onChange={setCable} options={options} className="sm:col-span-2" />
        {cable ? null : <NumberField input={own} />}
        <NumberField input={frequency} />
        <NumberField input={length} />
        <NumberField input={power} />
      </Inputs>
      <Result
        label="Loss in the cable"
        figure={loss ? `${formatFigure(loss.lossDb, { decimals: 1 })} dB` : null}
        refusal={
          outside && first && last
            ? `The maker's figures for ${cable!.name} run from ${formatFigure(first[0])} to ${formatFigure(last[0])} MHz. This does not guess outside them: type your own figure instead.`
            : undefined
        }
        keep={
          loss && delivered !== null
            ? {
                title: `Cable loss, ${formatFigure(length.value!, { decimals: 1 })} m of ${cable?.name ?? "cable"} at ${formatFigure(frequency.value!, { decimals: 3 })} MHz`,
                lines: [
                  `${formatFigure(loss.lossDb, { decimals: 1 })} dB: ${formatFigure(delivered, { decimals: 1 })} W of ${formatFigure(power.value!)} W reaches the far end`,
                ],
              }
            : undefined
        }
      >
        {loss && delivered !== null && per100 !== null ? (
          <p>
            {formatFigure(delivered, { decimals: 1 })} W of {formatFigure(power.value!)} W reaches the far end (
            {formatFigure(loss.delivered * 100, { decimals: 0 })}%), at {formatFigure(per100, { decimals: 1 })} dB per 100 m. The same loss
            applies to signals you receive.
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>loss (dB) = loss per 100 m × length ÷ 100; power out = power in × 10^(−loss ÷ 10)</Formula>
            <p>
              Between the frequencies a data sheet lists, the loss is read on a straight line between the two nearest figures on logarithmic
              scales, since cable loss rises close to the square root of frequency.
            </p>
            {cable ? (
              <table className="mt-2 w-full max-w-sm text-left tabular">
                <caption className="text-left font-semibold">{cable.name}, as published</caption>
                <thead>
                  <tr className="text-ink-muted">
                    <th className="py-1 font-medium">MHz</th>
                    <th className="py-1 font-medium">dB per 100 m</th>
                  </tr>
                </thead>
                <tbody>
                  {cable.table.map(([mhz, db]) => (
                    <tr key={mhz} className="border-t border-border">
                      <td className="py-1">{formatFigure(mhz, { decimals: 1 })}</td>
                      <td className="py-1">{formatFigure(db, { decimals: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {cable?.note ? <p className="mt-1">{cable.note}</p> : null}
          </>
        }
        range="A matched cable (a low SWR) in good condition, at the frequencies its data sheet covers."
        limits="Extra loss from a high SWR, connectors, water in the cable and age. Other makers' cables of the same type name can differ: their own sheet is the one to use."
        sources={cable ? [cable.source] : [S.ownFigure]}
      />
    </Calculator>
  );
}

// ── Watts, dBm and S-units ──────────────────────────────────────────────────

type Scale = "w" | "dbm" | "dbw" | "s-hf" | "s-vhf";
const SCALES = [
  { value: "w", label: "Watts" },
  { value: "dbm", label: "dBm" },
  { value: "dbw", label: "dBW" },
  { value: "s-hf", label: "S-units, HF (below 30 MHz)" },
  { value: "s-vhf", label: "S-units, VHF and up (above 30 MHz)" },
] as const satisfies ReadonlyArray<{ value: Scale; label: string }>;

const levelSpec: NumberSpec = { id: "radio.levels.value", label: "Level", initial: 100, hint: "For S-units, type 9 for S9, or 9.5." };
const overS9Spec: NumberSpec = { id: "radio.levels.over", label: "Decibels over S9", initial: 0, min: 0, suffix: "dB" };

function formatWatts(watts: number): string {
  if (watts >= 1) return `${formatFigure(watts, { decimals: 2, significant: 4 })} W`;
  if (watts >= 1e-3) return `${formatFigure(watts * 1e3, { decimals: 2, significant: 3 })} mW`;
  if (watts >= 1e-6) return `${formatFigure(watts * 1e6, { decimals: 2, significant: 3 })} µW`;
  if (watts >= 1e-9) return `${formatFigure(watts * 1e9, { decimals: 2, significant: 3 })} nW`;
  if (watts >= 1e-12) return `${formatFigure(watts * 1e12, { decimals: 2, significant: 3 })} pW`;
  return `${watts.toExponential(2)} W`;
}

function LevelsCalculator() {
  const [scale, setScale] = useChoice<Scale>("radio.levels.scale", SCALES, "w");
  const level = useNumber(levelSpec);
  const over = useNumber(overS9Spec);
  const isS = scale === "s-hf" || scale === "s-vhf";
  let dbm: number | null = null;
  let refusal: string | undefined;
  if (level.value !== null) {
    if (scale === "w") {
      if (level.value > 0) dbm = wattsToDbm(level.value);
      else refusal = "A power in watts must be more than 0.";
    } else if (scale === "dbm") dbm = level.value;
    else if (scale === "dbw") dbm = level.value + 30;
    else if (level.value < 0 || level.value > 9) refusal = "S-units run from 0 to 9; above S9 a reading is given as decibels over S9.";
    else if (over.value !== null) dbm = dbmFromSUnits(level.value, scale === "s-hf" ? "hf" : "vhf", level.value === 9 ? over.value : 0);
  }
  const rows: Array<[string, string]> =
    dbm !== null
      ? [
          ["Watts", formatWatts(dbmToWatts(dbm))],
          ["dBm", `${formatFigure(dbm, { decimals: 1 })} dBm`],
          ["dBW", `${formatFigure(dbm - 30, { decimals: 1 })} dBW`],
          ["S-meter, HF", sMeterReading(dbm, "hf")],
          ["S-meter, VHF and up", sMeterReading(dbm, "vhf")],
        ]
      : [];
  return (
    <Calculator id="levels" title="Watts, dBm and S-units" intro="A power or a signal level in each of the ways it is written.">
      <Inputs>
        <ChoiceField label="Type it as" value={scale} onChange={setScale} options={SCALES} />
        <NumberField input={level} />
        {isS && level.value === 9 ? <NumberField input={over} /> : null}
      </Inputs>
      <Result
        label="The same level"
        figure={dbm !== null ? `${formatFigure(dbm, { decimals: 1 })} dBm` : null}
        refusal={refusal}
        keep={
          dbm !== null ? { title: "A radio level, written each way", lines: rows.map(([name, value]) => `${name}: ${value}`) } : undefined
        }
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular">
          {rows.map(([name, value]) => (
            <div key={name} className="contents">
              <dt className="text-ink-muted">{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>dBm = 10 log₁₀(power in mW); dBW = dBm − 30</Formula>
            <Formula>
              S9 = {S9_DBM.hf} dBm below 30 MHz, {S9_DBM.vhf} dBm above; 6 dB per S-unit
            </Formula>
            <p>
              Levels are the power available at the receiver's input. The recommendation's current text puts the change at 30 MHz; its own
              background note, and older copies, say the −93 dBm level was confirmed for 144 MHz and above, with nothing stated between 30
              and 144 MHz.
            </p>
          </>
        }
        range="The S-unit scale is defined from S1 to S9; above S9 a reading is decibels over S9."
        limits="Real S-meters: few follow the recommendation closely, especially at the low end, so a reading on a radio is a rough guide."
        sources={[S.iaruR1]}
      />
    </Calculator>
  );
}

// ── Battery life ────────────────────────────────────────────────────────────

const mAh: Unit = { id: "mah", symbol: "mAh", name: "milliamp hours", toBase: (v) => v, fromBase: (v) => v };
const Ah: Unit = { id: "ah", symbol: "Ah", name: "amp hours", toBase: (v) => v * 1000, fromBase: (v) => v / 1000 };
const mA: Unit = { id: "ma", symbol: "mA", name: "milliamps", toBase: (v) => v, fromBase: (v) => v };
const A: Unit = { id: "a", symbol: "A", name: "amps", toBase: (v) => v * 1000, fromBase: (v) => v / 1000 };

const batCapacity: NumberSpec = { id: "radio.battery.capacity", label: "Battery capacity", initial: 2000, units: [mAh, Ah], above: 0 };
const batUsable: NumberSpec = {
  id: "radio.battery.usable",
  label: "Share of it you can use",
  initial: 80,
  suffix: "%",
  above: 0,
  max: 100,
  hint: "Less in the cold, and as a battery ages. 80% is a cautious working figure, not a property of the battery.",
};
const batTx: NumberSpec = { id: "radio.battery.tx", label: "Current on transmit", initial: 1500, units: [mA, A], min: 0 };
const batRx: NumberSpec = { id: "radio.battery.rx", label: "Current receiving a signal", initial: 150, units: [mA, A], min: 0 };
const batSb: NumberSpec = { id: "radio.battery.standby", label: "Current on standby (squelched)", initial: 50, units: [mA, A], min: 0 };
const batTxPct: NumberSpec = { id: "radio.battery.txpct", label: "Time transmitting", initial: 5, suffix: "%", min: 0, max: 100 };
const batRxPct: NumberSpec = { id: "radio.battery.rxpct", label: "Time receiving", initial: 5, suffix: "%", min: 0, max: 100 };

function BatteryCalculator() {
  const capacity = useNumber(batCapacity);
  const usable = useNumber(batUsable);
  const tx = useNumber(batTx);
  const rx = useNumber(batRx);
  const sb = useNumber(batSb);
  const txPct = useNumber(batTxPct);
  const rxPct = useNumber(batRxPct);
  const values = allValues(capacity, usable, tx, rx, sb, txPct, rxPct);
  let hours: number | null = null;
  let refusal: string | undefined;
  let average = 0;
  if (values) {
    const [cap, use, t, r, s, tp, rp] = values;
    if (tp + rp > 100) refusal = "Transmitting and receiving together cannot take more than 100% of the time.";
    else {
      average = averageCurrent(
        { transmit: t, receive: r, standby: s },
        { transmitPercent: tp, receivePercent: rp, standbyPercent: 100 - tp - rp },
      );
      if (average <= 0) refusal = "With no current drawn the battery would last for ever: type the radio's currents from its manual.";
      else hours = batteryHours(cap, use, average);
    }
  }
  return (
    <Calculator
      id="battery"
      title="Battery life"
      intro="How long a radio runs on a battery, from the currents in its manual and how much of the time it spends transmitting, receiving and waiting."
    >
      <Inputs>
        <NumberField input={capacity} />
        <NumberField input={usable} />
        <NumberField input={tx} />
        <NumberField input={rx} />
        <NumberField input={sb} />
        <NumberField input={txPct} />
        <NumberField input={rxPct} />
      </Inputs>
      <Result
        label="Running time"
        figure={hours !== null ? formatDuration(hours * 60) : null}
        refusal={refusal}
        keep={
          hours !== null && values
            ? {
                title: "Radio battery life",
                lines: [
                  `${formatDuration(hours * 60)} at an average of ${formatFigure(average, { decimals: 0 })} mA`,
                  `Duty cycle ${values[5]}% transmit, ${values[6]}% receive, ${formatFigure(100 - values[5] - values[6])}% standby`,
                ],
              }
            : undefined
        }
      >
        {hours !== null && values ? (
          <p>
            The radio draws {formatFigure(average, { decimals: 0 })} mA on average, with {formatFigure(100 - values[5] - values[6])}% of the
            time on standby. A common planning cycle is 5% transmit, 5% receive and 90% standby; a net you talk on a lot is far more.
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>average current = Itx × tx% + Irx × rx% + Istandby × standby%</Formula>
            <Formula>hours = capacity × usable share ÷ average current</Formula>
          </>
        }
        range="A battery whose capacity holds at the currents drawn."
        limits="Capacity falls at high currents and in the cold, and a radio may cut out before the battery is flat. For a power system with solar and several loads, see the power tools."
        sources={[S.batteryArithmetic]}
      />
    </Calculator>
  );
}
