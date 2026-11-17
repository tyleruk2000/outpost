/**
 * Concrete and mortar mixed by volume, by the mixes a UK cement maker publishes. The
 * materials are given as loose volumes and as buckets, not bags of cement: no maker's or
 * standard's figure was found for how much concrete a bag of cement makes.
 */
import {
  allValues,
  Calculator,
  ChoiceField,
  Formula,
  formatFigure,
  HowWorkedOut,
  Inputs,
  NumberField,
  type NumberSpec,
  Result,
  u,
  useChoice,
  useNumber,
} from "../kit";
import { BUILDING_SOURCES as S } from "./sources";

export interface Mix {
  id: string;
  label: string;
  /** What each part is, in order. */
  materials: readonly string[];
  /** Parts by volume. A range where the maker gives one (1 : 3 to 1 : 4): the low and the high ends. */
  parts: readonly (readonly number[])[];
  kind: "concrete" | "mortar";
  use: string;
}

/** Hanson General Purpose Cement technical data sheet (February 2020). */
export const MIXES: readonly Mix[] = [
  {
    id: "gp",
    label: "General purpose concrete, 1 : 2 : 3",
    materials: ["cement", "concrete sand", "4/20 mm aggregate"],
    parts: [[1, 2, 3]],
    kind: "concrete",
    use: "General purpose concrete by volume.",
  },
  {
    id: "ballast",
    label: "General purpose concrete with ballast, 1 : 4",
    materials: ["cement", "ballast (combined sand and aggregate)"],
    parts: [[1, 4]],
    kind: "concrete",
    use: "General purpose concrete by volume, with combined sand and coarse aggregate.",
  },
  {
    id: "m-i",
    label: "Mortar designation (i), 1 : 3",
    materials: ["cement", "building sand"],
    parts: [[1, 3]],
    kind: "mortar",
    use: "Class M12; severe exposure.",
  },
  {
    id: "m-ii",
    label: "Mortar designation (ii), 1 : 3 to 1 : 4",
    materials: ["cement", "building sand"],
    parts: [
      [1, 3],
      [1, 4],
    ],
    kind: "mortar",
    use: "Class M6; severe exposure.",
  },
  {
    id: "m-iii",
    label: "Mortar designation (iii), 1 : 5 to 1 : 6",
    materials: ["cement", "building sand"],
    parts: [
      [1, 5],
      [1, 6],
    ],
    kind: "mortar",
    use: "Class M4; moderate exposure. The usual mortar for general brickwork.",
  },
  {
    id: "m-iv",
    label: "Mortar designation (iv), 1 : 7 to 1 : 8",
    materials: ["cement", "building sand"],
    parts: [
      [1, 7],
      [1, 8],
    ],
    kind: "mortar",
    use: "Class M2; passive exposure.",
  },
];

/**
 * Loose volumes of each material for a volume of finished mix: the volume, plus the
 * allowance, times the bulking factor, shared out in the proportions of the mix.
 */
export function mixMaterials(volume: number, allowancePercent: number, bulking: number, parts: readonly number[]): number[] {
  const loose = volume * (1 + allowancePercent / 100) * bulking;
  const total = parts.reduce((sum, part) => sum + part, 0);
  return parts.map((part) => (loose * part) / total);
}

const volumeSpec: NumberSpec = {
  id: "building.concrete.volume",
  label: "Volume of mix needed",
  initial: 0.5,
  units: [u.m3, u.litre],
  above: 0,
  hint: "Length × width × depth: the area and volume calculator below works it out.",
};
const allowanceSpec: NumberSpec = {
  id: "building.concrete.allowance",
  label: "Allowance for waste",
  initial: 10,
  suffix: "%",
  min: 0,
  max: 100,
};
const bulkingSpec: NumberSpec = {
  id: "building.concrete.bulking",
  label: "Loose materials for each volume of mix",
  initial: 1.5,
  min: 1,
  max: 2,
  hint: "A builder's rule of thumb, not a published figure: see how this is worked out.",
};
const bucketSpec: NumberSpec = {
  id: "building.concrete.bucket",
  label: "Your bucket holds",
  initial: 10,
  units: [u.litre],
  above: 0,
  hint: "Measure it with a jug.",
};

const MIX_OPTIONS = MIXES.map((mix) => ({ value: mix.id, label: mix.label, description: mix.use }));

export function ConcreteCalculator() {
  const [mixId, setMix] = useChoice("building.concrete.mix", MIX_OPTIONS, "gp");
  const mix = MIXES.find((item) => item.id === mixId) ?? MIXES[0]!;
  const volume = useNumber(volumeSpec);
  const allowance = useNumber(allowanceSpec);
  const bulking = useNumber(bulkingSpec);
  const bucket = useNumber(bucketSpec);
  const values = allValues(volume, allowance, bulking, bucket);
  // Litres in, cubic metres out.
  const ends = values ? mix.parts.map((parts) => mixMaterials(values[0] / 1000, values[1], values[2], parts)) : null;
  const range = (index: number, to: (m3: number) => number, decimals: number) => {
    if (!ends) return "";
    const low = formatFigure(to(Math.min(...ends.map((end) => end[index]!))), { decimals });
    const high = formatFigure(to(Math.max(...ends.map((end) => end[index]!))), { decimals });
    return low === high ? low : `${low} to ${high}`;
  };
  const lines = ends
    ? mix.materials.map(
        (material, index) =>
          `${material}: ${range(index, (m3) => m3, 3)} m³, about ${range(index, (m3) => Math.ceil((m3 * 1000) / values![3]), 0)} buckets of ${formatFigure(values![3])} litres`,
      )
    : [];
  return (
    <Calculator
      id="concrete"
      title="Concrete and mortar"
      intro="How much cement, sand and aggregate to mix by volume for a job, by the mixes on a UK cement maker's data sheet."
    >
      <Inputs>
        <ChoiceField label="Mix" value={mixId} onChange={setMix} options={MIX_OPTIONS} className="sm:col-span-2" />
        <NumberField input={volume} />
        <NumberField input={allowance} />
        <NumberField input={bulking} />
        <NumberField input={bucket} />
      </Inputs>
      <Result
        label="Mix, by volume"
        figure={ends ? mix.parts.map((parts) => parts.join(" : ")).join(" to ") : null}
        keep={ends ? { title: `${mix.label}: materials for ${formatFigure(values![0] / 1000, { decimals: 3 })} m³`, lines } : undefined}
      >
        {ends ? (
          <ul className="mt-1 grid gap-1">
            {lines.map((line) => (
              <li key={line} className="tabular">
                {line.charAt(0).toUpperCase() + line.slice(1)}
              </li>
            ))}
          </ul>
        ) : null}
        {ends ? (
          <p className="mt-2 text-small text-ink-muted">
            {mix.use} Cement comes in 25 kg bags; the bag's own label or the maker's sheet says what it makes.
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>loose materials = volume × (1 + allowance) × factor, shared in the mix's proportions</Formula>
            <p>
              The mixes and their uses are from Hanson's General Purpose Cement data sheet, which also says that small amounts of
              air-entraining mortar plasticiser may be needed in mortar. Loose materials make less finished mix than their own volume,
              because the sand fills the gaps between the stones and the cement the gaps in the sand. Builders allow about 1.5 times the
              volume; Outpost found no standard or maker that publishes the figure, so it is yours to change. Buckets are rounded up.
            </p>
          </>
        }
        range="Small jobs mixed by hand or in a small mixer, measured by volume."
        limits="Strength: a mix by volume is not a designed or BS 8500 concrete, and anything structural needs one. Water, which is added to a workable mix. Damp sand, which bulks and takes up more room than dry."
        sources={[S.hanson]}
      />
    </Calculator>
  );
}
