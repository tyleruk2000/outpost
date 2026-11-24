/**
 * Rations, under Tools: a day's energy for each person, how long food lasts, what to store
 * for a number of days, and a common stock shared out by need. The sums are the shared
 * package's (`rations.ts`), on the UK figures Supplies uses or the international ones;
 * "Use my household" and "Use my supplies" fill it from Supplies so the two agree: the
 * current household's people and stock (docs/development/households.md).
 *
 * A planning aid. Reduced rations are where a calculator could do harm, so every reduced
 * figure keeps children, older people, and pregnant, breastfeeding and ill people on their
 * full need, as the bodies quoted describe, and the screen says who must not be put on a
 * reduced ration by a calculator.
 */
import {
  ageOfBand,
  balanceOf,
  daysAtLevels,
  type FoodSearchResponse,
  localDay,
  type PersonNeed,
  personNeed,
  planFoods,
  RATION_QUOTES,
  RATION_SOURCES,
  type RationBasis,
  type RationFood,
  type RationPerson,
  readEnergyNote,
  runsOutOn,
  STAPLES,
  type StapleId,
  type SuppliesResponse,
  shareByNeed,
  supplyOutlook,
} from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Users, Warehouse } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Checkbox, Select } from "@/components/ui/misc";
import { Table, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { useHousehold } from "@/features/households/use-household";
import type { PrintPaper } from "@/features/print-kit";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { deviceRegion, isUkRegion } from "@/lib/region";
import { formatDate, plural } from "@/lib/utils";
import {
  Calculator,
  ChoiceField,
  Formula,
  formatFigure,
  HowWorkedOut,
  Inputs,
  NumberField,
  type NumberSpec,
  Result,
  type Source,
  ToolScreen,
  useChoice,
  useNumber,
} from "../kit";
import { readPref, writePref } from "../kit/device-pref";
import { SheetPdfActions, useSheetPdf } from "../kit/sheet-pdf";
import { rationDocument } from "./sheet";

const CALCULATORS = [
  { id: "need", title: "A day's energy" },
  { id: "lasts", title: "How long food lasts" },
  { id: "store", title: "Food to store" },
  { id: "share", title: "Sharing out a stock" },
] as const;

const S = RATION_SOURCES;
const sources = (...keys: Array<keyof typeof RATION_SOURCES>): Source[] => keys.map((key) => S[key]);
const kcal = (value: number) => `${formatFigure(value, { decimals: 0 })} kcal`;
const kg = (grams: number) =>
  grams >= 1000
    ? `${formatFigure(grams / 1000, { significant: 3, decimals: 1 })} kg`
    : `${formatFigure(grams, { significant: 2, decimals: 0 })} g`;
const days = (value: number) => `${formatFigure(value, { significant: 2, decimals: 1 })} ${value === 1 ? "day" : "days"}`;
const dayWords = (iso: string) => formatDate(Date.parse(`${iso}T12:00:00Z`));

export const WHO_NOT_REDUCED =
  "Children, older people, women who are pregnant or breastfeeding, and anyone who is ill should not be put on a reduced ration by a calculator. Their needs are kept in full in every figure here; for anything else, ask a doctor, midwife or health visitor.";

// ── The household, kept on this device ──

let nextId = 0;
const newPerson = (over: Partial<RationPerson> = {}): RationPerson => ({
  id: `p${Date.now().toString(36)}${(nextId++).toString(36)}`,
  name: "",
  age: 30,
  sex: "unstated",
  pregnant: false,
  breastfeeding: false,
  ill: false,
  ownKcal: null,
  ...over,
});

function readPeople(): RationPerson[] {
  try {
    const parsed = JSON.parse(readPref("rations.people") ?? "null") as RationPerson[] | null;
    if (Array.isArray(parsed) && parsed.length > 0)
      return parsed.filter((entry) => typeof entry?.age === "number").map((entry) => newPerson(entry));
  } catch {
    // Nothing usable remembered.
  }
  return [newPerson({ name: "Adult 1", sex: "male" }), newPerson({ name: "Adult 2", sex: "female" })];
}

function usePeople(): [RationPerson[], (next: RationPerson[]) => void] {
  const [people, setPeople] = useState(readPeople);
  return [
    people,
    (next) => {
      setPeople(next);
      writePref("rations.people", JSON.stringify(next));
    },
  ];
}

/** The household as Supplies holds it, people only: the youngest age of each band, and any figure given there. */
function fromSupplies(data: SuppliesResponse): RationPerson[] {
  return data.household.members
    .filter((member) => member.kind === "person")
    .map((member, index) =>
      newPerson({
        name: member.name || `Person ${index + 1}`,
        age: ageOfBand(member.band),
        sex: member.sex ?? "unstated",
        ownKcal: member.kcalPerDay,
      }),
    );
}

/** What Supplies holds as food: its energy, worked out as Supplies does, and protein and fat where the USDA figure is known. */
interface SuppliesFood {
  kcal: number;
  items: number;
  uncounted: number;
  foods: Array<{ food: RationFood; grams: number }>;
  /** Items whose protein and fat are known (a USDA figure and a weight). */
  balanced: number;
}

async function readSuppliesFood(data: SuppliesResponse): Promise<SuppliesFood> {
  const outlook = supplyOutlook(data.items, data.household, localDay());
  const food = data.items.filter((item) => item.category === "food" && item.quantity > 0);
  const notes = food.map((item) => ({ item, note: readEnergyNote(item.notes) }));
  const ids = [...new Set(notes.flatMap(({ note }) => (note ? [note.fdcId] : [])))].slice(0, 200);
  const found = ids.length > 0 ? await api.get<FoodSearchResponse>("/api/supplies/foods/by-id", { ids: ids.join(",") }) : { matches: [] };
  const byId = new Map(found.matches.map((match) => [match.fdcId, match]));
  const foods: SuppliesFood["foods"] = [];
  for (const { item, note } of notes) {
    const match = note ? byId.get(note.fdcId) : undefined;
    if (!match || item.gramsPerUnit === null || item.kcalPer100g === null) continue;
    foods.push({
      food: { label: item.name, kcalPer100g: item.kcalPer100g, proteinG: match.proteinG, fatG: match.fatG },
      grams: item.gramsPerUnit * item.quantity,
    });
  }
  return {
    kcal: outlook.food.counted,
    items: outlook.food.items,
    uncounted: outlook.food.leftOut.length,
    foods,
    balanced: foods.length,
  };
}

// ── The screen ──

export default function RationsPage() {
  const client = useQueryClient();
  // With several households, Supplies' people are the current household's: say which.
  const current = useHousehold().data;
  const householdName = current?.several ? current.household.name : null;
  const [people, setPeople] = usePeople();
  const bases = [
    { value: "uk", label: "UK figures for each person", description: "Public Health England by age and sex, with SACN's additions" },
    {
      value: "international",
      label: "International figures for each person",
      description: "UNHCR, UNICEF, WFP and WHO (2002) by age and sex, with an allowance for cold",
    },
    { value: "sphere", label: "Sphere planning figure for everyone", description: "2,100 kcal a person a day, with an allowance for cold" },
  ] as const;
  const [basis, setBasis] = useChoice<RationBasis>(
    "rations.basis",
    bases,
    // The UK's figures first in the UK only; everywhere else the international ones (UNHCR, UNICEF, WFP, WHO).
    isUkRegion(deviceRegion()) ? "uk" : "international",
  );
  const cold = useNumber(coldSpec);
  const needs = useMemo(() => people.map((person) => personNeed(person, basis, cold.value)), [people, basis, cold.value]);
  const perDay = needs.reduce((sum, need) => sum + (need.kcal ?? 0), 0);
  const [loading, setLoading] = useState<"household" | "food" | null>(null);
  const [supplies, setSupplies] = useState<SuppliesFood | null>(null);

  const supplyData = () =>
    client.fetchQuery({ queryKey: ["supplies", "stock"], queryFn: () => api.get<SuppliesResponse>("/api/supplies") });
  const readHousehold = async () => {
    setLoading("household");
    try {
      const found = fromSupplies(await supplyData());
      if (found.length === 0)
        notify.error(
          householdName
            ? `Supplies has nobody in ${householdName} yet. Add people under Prepare › Households, or here.`
            : "Supplies has nobody in its household yet. Add people under Prepare › Households, or here.",
        );
      else {
        setPeople(found);
        toast.success(`${plural(found.length, "person", "people")} from ${householdName ?? "Supplies"}`);
      }
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setLoading(null);
    }
  };
  const readSupplies = async () => {
    setLoading("food");
    try {
      setSupplies(await readSuppliesFood(await supplyData()));
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setLoading(null);
    }
  };

  return (
    <ToolScreen
      title="Rations"
      description="How much energy a household needs a day, how long the food you have lasts, what to store, and how to share a stock by need."
      calculators={CALCULATORS}
      footer={
        <>
          A planning aid, worked out from the figures of the bodies named, read on {dayWords(S.sphere.read)}. It gives no medical or dietary
          advice. {WHO_NOT_REDUCED}
        </>
      }
    >
      <Notice tone="warning" title="Who must not be put on a reduced ration by a calculator" className="mb-2">
        {WHO_NOT_REDUCED}
      </Notice>
      <NeedCalculator
        people={people}
        setPeople={setPeople}
        needs={needs}
        perDay={perDay}
        bases={bases}
        basis={basis}
        setBasis={setBasis}
        cold={cold}
        onHousehold={readHousehold}
        loading={loading === "household"}
      />
      <LastsCalculator needs={needs} supplies={supplies} onSupplies={readSupplies} loading={loading === "food"} />
      <StoreCalculator perDay={perDay} people={people.length} />
      <ShareCalculator needs={needs} supplies={supplies} onSupplies={readSupplies} loading={loading === "food"} />
    </ToolScreen>
  );
}

const coldSpec: NumberSpec = {
  id: "rations.cold",
  label: "Mean daily temperature where you are",
  initial: "",
  suffix: "°C",
  min: -60,
  max: 50,
  optional: true,
  hint: "Leave empty indoors or in a mild place. Used with the international and Sphere figures.",
};

function NeedCalculator({
  people,
  setPeople,
  needs,
  perDay,
  bases,
  basis,
  setBasis,
  cold,
  onHousehold,
  loading,
}: {
  people: RationPerson[];
  setPeople: (next: RationPerson[]) => void;
  needs: PersonNeed[];
  perDay: number;
  bases: ReadonlyArray<{ value: RationBasis; label: string; description: string }>;
  basis: RationBasis;
  setBasis: (next: RationBasis) => void;
  cold: ReturnType<typeof useNumber>;
  onHousehold: () => void;
  loading: boolean;
}) {
  const change = (id: string, patch: Partial<RationPerson>) =>
    setPeople(people.map((person) => (person.id === id ? { ...person, ...patch } : person)));
  const missing = needs.filter((need) => need.kcal === null);
  return (
    <Calculator
      id="need"
      title="A day's energy"
      intro="Who is to be fed, and the energy each needs a day by the figures you choose. Every other calculator on this screen uses this household."
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onHousehold} loading={loading}>
          <Users aria-hidden /> Use my household from Supplies
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPeople([...people, newPerson({ name: `Person ${people.length + 1}` })])}>
          <Plus aria-hidden /> Add a person
        </Button>
      </div>
      <ul className="divide-y divide-border border-y border-border" aria-label="People">
        {people.map((person) => (
          <li key={person.id} className="grid gap-3 py-3 sm:grid-cols-[1fr_6rem_9rem_auto] sm:items-end">
            <Field label="Name" optional>
              {(ids) => (
                <Input {...ids} value={person.name} maxLength={60} onChange={(event) => change(person.id, { name: event.target.value })} />
              )}
            </Field>
            <Field label="Age">
              {(ids) => (
                <Input
                  {...ids}
                  inputMode="numeric"
                  value={String(person.age)}
                  onChange={(event) => {
                    const age = Number.parseInt(event.target.value, 10);
                    change(person.id, { age: Number.isFinite(age) ? Math.max(0, Math.min(120, age)) : 0 });
                  }}
                />
              )}
            </Field>
            <Field label="Sex">
              {(ids) => (
                <Select
                  {...ids}
                  value={person.sex}
                  onChange={(value) => change(person.id, { sex: value as RationPerson["sex"] })}
                  options={[
                    { value: "female", label: "Female" },
                    { value: "male", label: "Male" },
                    { value: "unstated", label: "Not given" },
                  ]}
                />
              )}
            </Field>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Take ${person.name || "this person"} off the list`}
              onClick={() => setPeople(people.filter((entry) => entry.id !== person.id))}
            >
              <Trash2 aria-hidden />
            </Button>
            <div className="flex flex-wrap gap-x-5 gap-y-1 sm:col-span-4">
              {person.sex !== "male"
                ? (
                    [
                      ["pregnant", "Pregnant"],
                      ["breastfeeding", "Breastfeeding"],
                    ] as const
                  ).map(([key, label]) => (
                    <Tick
                      key={key}
                      id={`${person.id}-${key}`}
                      label={label}
                      checked={person[key]}
                      onChange={(on) => change(person.id, { [key]: on })}
                    />
                  ))
                : null}
              <Tick id={`${person.id}-ill`} label="Ill" checked={person.ill} onChange={(on) => change(person.id, { ill: on })} />
            </div>
            <Field
              label="Their own figure a day"
              optional
              hint="For heavy work, a baby, or a figure a doctor gave. Used instead of the table."
              className="sm:col-span-4"
            >
              {(ids) => (
                <Input
                  {...ids}
                  inputMode="numeric"
                  value={person.ownKcal === null ? "" : String(person.ownKcal)}
                  placeholder="kcal"
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    change(person.id, { ownKcal: Number.isFinite(value) && value > 0 ? Math.min(value, 10_000) : null });
                  }}
                />
              )}
            </Field>
          </li>
        ))}
      </ul>
      <Inputs className="mt-4">
        <ChoiceField label="Whose figures" value={basis} onChange={setBasis} options={bases} className="sm:col-span-2" />
        {basis !== "uk" ? <NumberField input={cold} /> : null}
      </Inputs>
      <Result
        label="A day's energy for the household"
        figure={people.length > 0 ? kcal(perDay) : null}
        refusal={people.length === 0 ? "Add a person, or use the household from Supplies." : undefined}
        keep={{
          title: "A day's energy for the household",
          lines: needs.map((need) => `${need.name || "Someone"}: ${need.kcal === null ? "no figure" : kcal(need.kcal)}`),
        }}
      >
        {missing.length > 0 ? (
          <p>
            Not counted: {missing.map((need) => need.name || "someone").join(", ")}. The UK table has no figure under one year; give their
            own figure.
          </p>
        ) : null}
        <Table label="Each person's figure and what it is made of" className="mt-3 tabular">
          <tbody>
            {needs.map((need) => (
              <Tr key={need.id}>
                <th scope="row" className="py-2.5 pr-3 text-left align-top font-medium text-ink">
                  {need.name || "Someone"}
                  {need.protected ? (
                    <span className="block font-normal text-ink-muted">Kept on a full ration: {need.why.join(", ")}</span>
                  ) : null}
                </th>
                <Td className="text-ink-muted">
                  {need.parts.map((part) => `${part.label} ${formatFigure(part.kcal, { decimals: 0 })}`).join(" + ")}
                </Td>
                <Td numeric className="whitespace-nowrap">
                  {need.kcal === null ? "No figure" : kcal(need.kcal)}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>household = Σ (figure for age and sex + additions), or the person's own figure</Formula>
            <p>
              <span className="font-semibold">UK:</span> Public Health England's estimated average requirements by age band and sex, as
              Supplies uses (the average of the two where sex is not given). SACN adds 191 kcal a day in the last three months of pregnancy
              only, and 330 kcal a day in the first six months of breastfeeding. No UK figure for cold was found, so none is added.
            </p>
            <p>
              <span className="font-semibold">International:</span> annex 1 of Food and Nutrition Needs in Emergencies, with 285 kcal for
              pregnancy and 500 for breastfeeding, and its rule for cold: <q>{RATION_QUOTES.fnneCold}</q>, by whole 5° steps as its box
              gives them (15 °C +100 to 0 °C +400). Its box stops at 0 °C; colder is given +400 and said to be beyond it.
            </p>
            <p>
              <span className="font-semibold">Sphere:</span> <q>{RATION_QUOTES.spherePlanning}</q>. Sphere says its figures{" "}
              <q>{RATION_QUOTES.sphereNotIndividual}</q>: it is for a population, so a household of very young children is over-provided by
              it.
            </p>
            <p>
              Heavy work: neither body gives a figure. The 2002 guidance says only that where a population <q>{RATION_QUOTES.fnneWork}</q>.
              Give such a person their own figure.
            </p>
          </>
        }
        range="Healthy people at a light activity level (the international figures are for adults of 60 and 52 kg). A household from Supplies is read at the youngest age of each band."
        limits="Illness, recovery from malnutrition, growth spurts, very active children, and any individual's own needs. These are averages for planning, not what any one person needs."
        sources={sources("phe", "sacn", "fnne", "sphere")}
      />
    </Calculator>
  );
}

function Tick({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex min-h-11 items-center gap-2 md:min-h-8 md:pointer-coarse:min-h-11">
      <Checkbox id={id} checked={checked} onCheckedChange={(on) => onChange(on === true)} />
      <label htmlFor={id} className="flex items-center self-stretch pr-1 text-small text-ink">
        {label}
      </label>
    </div>
  );
}

// ── How long it lasts ──

const storeSpec: NumberSpec = {
  id: "rations.lasts.kcal",
  label: "Energy in the food you have",
  initial: 60_000,
  suffix: "kcal",
  min: 0,
  max: 1e9,
};

/** What there is to eat: a figure typed, staples by weight, or what Supplies holds. */
function useStore(id: string, supplies: SuppliesFood | null) {
  const options = [
    { value: "kcal", label: "A figure in kcal" },
    { value: "staples", label: "Staple foods by weight" },
    { value: "supplies", label: "What Supplies holds" },
  ] as const;
  const [from, setFrom] = useChoice<"kcal" | "staples" | "supplies">(`${id}.from`, options, "kcal");
  const typed = useNumber({ ...storeSpec, id: `${id}.kcal` });
  const [weights, setWeights] = useState<Partial<Record<StapleId, string>>>(() => {
    try {
      return JSON.parse(readPref(`${id}.weights`) ?? "{}") as Partial<Record<StapleId, string>>;
    } catch {
      return {};
    }
  });
  const setWeight = (staple: StapleId, text: string) => {
    const next = { ...weights, [staple]: text };
    setWeights(next);
    writePref(`${id}.weights`, JSON.stringify(next));
  };
  const staples = STAPLES.flatMap((food) => {
    const value = Number((weights[food.id] ?? "").replace(",", "."));
    return Number.isFinite(value) && value > 0 ? [{ food: food as RationFood, grams: value * 1000 }] : [];
  });
  const total =
    from === "kcal"
      ? typed.value
      : from === "staples"
        ? staples.reduce((sum, line) => sum + (line.food.kcalPer100g * line.grams) / 100, 0)
        : (supplies?.kcal ?? null);
  const foods = from === "staples" ? staples : from === "supplies" ? (supplies?.foods ?? []) : [];
  return { options, from, setFrom, typed, weights, setWeight, total, foods };
}

function StoreInputs({
  store,
  supplies,
  onSupplies,
  loading,
}: {
  store: ReturnType<typeof useStore>;
  supplies: SuppliesFood | null;
  onSupplies: () => void;
  loading: boolean;
}) {
  return (
    <div className="grid gap-4">
      <ChoiceField label="What you have" value={store.from} onChange={store.setFrom} options={store.options} />
      {store.from === "kcal" ? <NumberField input={store.typed} /> : null}
      {store.from === "staples" ? (
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 text-small font-medium text-ink">Kilograms of each, as stored (dry weight)</legend>
          {STAPLES.map((food) => (
            <div key={food.id} className="flex items-center gap-2 text-small text-ink">
              <Input
                inputMode="decimal"
                className="w-20 shrink-0 tabular"
                value={store.weights[food.id] ?? ""}
                placeholder="0"
                aria-label={`${food.label}, kilograms`}
                onChange={(event) => store.setWeight(food.id, event.target.value)}
              />
              <span aria-hidden>{food.label}</span>
            </div>
          ))}
        </fieldset>
      ) : null}
      {store.from === "supplies" ? (
        <div className="grid gap-2">
          <Button size="sm" className="justify-self-start" onClick={onSupplies} loading={loading}>
            <Warehouse aria-hidden /> {supplies ? "Read Supplies again" : "Use my supplies"}
          </Button>
          {supplies ? (
            <p className="text-small text-ink-muted">
              {kcal(supplies.kcal)} in {plural(supplies.items, "food item")}, counted as Supplies counts it (nothing past its use-by).
              {supplies.uncounted > 0
                ? ` ${plural(supplies.uncounted, "item")} with no energy figure ${supplies.uncounted === 1 ? "is" : "are"} not counted.`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LastsCalculator({
  needs,
  supplies,
  onSupplies,
  loading,
}: {
  needs: PersonNeed[];
  supplies: SuppliesFood | null;
  onSupplies: () => void;
  loading: boolean;
}) {
  const store = useStore("rations.lasts", supplies);
  const today = localDay();
  const levels = store.total !== null ? daysAtLevels(store.total, needs) : null;
  const balance = store.foods.length > 0 ? balanceOf(store.foods) : null;
  const nobodyReduced = levels ? levels.every((level) => !level.anyoneReduced) : false;
  const refusal =
    store.from === "supplies" && !supplies
      ? "Press Use my supplies to read what Supplies holds."
      : levels && levels[0]!.days === null
        ? "There is nobody with an energy figure in the household above."
        : undefined;
  return (
    <Calculator
      id="lasts"
      title="How long food lasts"
      intro="How many days the food you have lasts the household above, at its full need and, for those who may be put on less, at three quarters and half."
    >
      <StoreInputs store={store} supplies={supplies} onSupplies={onSupplies} loading={loading} />
      <Result
        label="The food lasts, at the full need"
        figure={levels && levels[0]!.days !== null ? days(levels[0]!.days) : null}
        refusal={refusal}
        keep={
          levels
            ? {
                title: `How long ${kcal(store.total ?? 0)} of food lasts`,
                lines: levels.map(
                  (level) =>
                    `${level.id === "full" ? "Full need" : level.id === "half" ? "Half for those who may be reduced" : "Three quarters for those who may be reduced"}: ${level.days === null ? "-" : `${days(level.days)}, to ${dayWords(runsOutOn(today, level.days))}`}`,
                ),
              }
            : undefined
        }
      >
        {levels ? (
          <>
            <div className="mt-2">
              <Table label="Days at each level" className="tabular">
                <TableHead>
                  <Tr>
                    <Th>Eaten at</Th>
                    <Th numeric>A day</Th>
                    <Th numeric>Lasts</Th>
                    <Th>Last day covered</Th>
                  </Tr>
                </TableHead>
                <tbody>
                  {levels.map((level) => (
                    <Tr key={level.id}>
                      <th scope="row" className="py-2.5 pr-3 text-left align-top font-medium text-ink">
                        {level.id === "full" ? "Full need" : level.id === "half" ? "Half" : "Three quarters"}
                      </th>
                      <Td numeric className="whitespace-nowrap">
                        {kcal(level.perDay)}
                      </Td>
                      <Td numeric className="whitespace-nowrap">
                        {level.days === null ? "—" : days(level.days)}
                      </Td>
                      <Td>{level.days === null ? "—" : dayWords(runsOutOn(today, level.days))}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <p className="mt-2">
              {nobodyReduced
                ? "Everyone in the household is kept on a full ration, so the reduced rows are the same as the full one."
                : "At three quarters and half, those kept on a full ration still have all of their need; only the others are reduced."}{" "}
              Today counts as the first day.
            </p>
            {balance ? <BalanceWords balance={balance} /> : null}
          </>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>days = energy held ÷ (Σ full need of those kept on full + Σ need × level of the others)</Formula>
            <p>
              No body named publishes three quarters or half as a safe ration, nor a figure below which a ration must not go: these rows are
              arithmetic, to show how much longer food would stretch, not a recommendation. The ways of reducing are the bodies' own. Sphere
              lists <q>{RATION_QUOTES.sphereReduce}</q>. The 2002 guidance warns <q>{RATION_QUOTES.fnneAcrossTheBoard}</q> and gives as a
              response <q>{RATION_QUOTES.fnneSafetyNet}</q>, naming <q>{RATION_QUOTES.fnneVulnerable}</q>.
            </p>
            <p>
              Staple foods are counted from USDA FoodData Central figures for the dry food; Supplies' own figures are used for what it
              holds.
            </p>
          </>
        }
        range="Food eaten as planned, none spoiled or shared beyond the household. Supplies' count leaves out food past its use-by."
        limits="Water, which the Water calculators work out; cooking fuel; food that spoils before its turn (Supplies' own outlook allows for that). A long time on a reduced ration harms health."
        sources={sources("sphere", "fnne", "usda")}
      />
    </Calculator>
  );
}

function BalanceWords({ balance }: { balance: ReturnType<typeof balanceOf> }) {
  const pct = (share: number) => `${formatFigure(share * 100, { decimals: 0 })}%`;
  return (
    <div className="mt-2 grid gap-1">
      {balance.proteinShare !== null && balance.fatShare !== null ? (
        <p>
          Protein gives about {pct(balance.proteinShare)} of the energy and fat {pct(balance.fatShare)}; Sphere plans 10 to 12% from protein
          and 17% from fat.
          {balance.proteinShare < 0.1 ? " That is short of protein: add pulses, milk powder, fish or meat." : ""}
          {balance.fatShare < 0.17 ? " It is short of fat: oil is the densest store of energy." : ""}
        </p>
      ) : (
        <p className="text-ink-muted">Protein and fat are not known for every food, so the balance is not given.</p>
      )}
      {balance.oneFood ? (
        <Notice tone="warning">
          Nearly all the energy (more than four fifths) comes from one food, {balance.oneFood}. A ration of one food lacks protein, fat and
          vitamins however much energy it holds; plan several.
        </Notice>
      ) : null}
    </div>
  );
}

// ── Food to store ──

const storeDays: NumberSpec = { id: "rations.store.days", label: "Days", initial: 14, suffix: "days", min: 1, max: 3650, integer: true };
const DEFAULT_SHARES: Partial<Record<StapleId, string>> = {
  rice: "40",
  lentils: "20",
  oats: "15",
  oil: "10",
  "milk-powder": "10",
  sugar: "5",
};

function StoreCalculator({ perDay, people }: { perDay: number; people: number }) {
  const length = useNumber(storeDays);
  const [shares, setShares] = useState<Partial<Record<StapleId, string>>>(() => {
    try {
      return { ...DEFAULT_SHARES, ...(JSON.parse(readPref("rations.store.shares") ?? "{}") as object) };
    } catch {
      return DEFAULT_SHARES;
    }
  });
  const setShare = (id: StapleId, text: string) => {
    const next = { ...shares, [id]: text };
    setShares(next);
    writePref("rations.store.shares", JSON.stringify(next));
  };
  const total = length.value !== null ? perDay * length.value : null;
  const chosen = STAPLES.map((food) => ({ food: food as RationFood, share: Number((shares[food.id] ?? "").replace(",", ".")) || 0 }));
  const lines = total !== null ? planFoods(total, chosen) : [];
  const grams = lines.reduce((sum, line) => sum + line.grams, 0);
  const balance =
    lines.length > 0
      ? balanceOf(lines.map((line) => ({ food: chosen.find((entry) => entry.food.label === line.label)!.food, grams: line.grams })))
      : null;
  return (
    <Calculator
      id="store"
      title="Food to store"
      intro="The energy the household above needs for a number of days, made up of the staples you choose, by weight."
    >
      <Inputs>
        <NumberField input={length} />
      </Inputs>
      <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 text-small font-medium text-ink">Share of the energy from each, in parts</legend>
        {STAPLES.map((food) => (
          <div key={food.id} className="flex items-center gap-2 text-small text-ink">
            <Input
              inputMode="decimal"
              className="w-20 shrink-0 tabular"
              value={shares[food.id] ?? ""}
              placeholder="0"
              aria-label={`${food.label}, parts of the energy`}
              onChange={(event) => setShare(food.id, event.target.value)}
            />
            <span aria-hidden>{food.label}</span>
          </div>
        ))}
      </fieldset>
      <Result
        label="Food to store"
        figure={total !== null && lines.length > 0 && perDay > 0 ? `${kg(grams)} of food` : null}
        refusal={
          perDay === 0
            ? "There is nobody with an energy figure in the household above."
            : lines.length === 0 && total !== null
              ? "Give a share to at least one food."
              : undefined
        }
        keep={
          total !== null
            ? {
                title: `Food to store for ${plural(people, "person", "people")}, ${plural(length.value ?? 0, "day")}`,
                lines: [`${kcal(total)} in all`, ...lines.map((line) => `${line.label}: ${kg(line.grams)}`)],
              }
            : undefined
        }
      >
        {total !== null ? (
          <>
            <p>
              {kcal(total)} in all: {kcal(perDay)} a day for {plural(length.value ?? 0, "day")}.
            </p>
            <Table label="Each food by weight" className="mt-2 tabular">
              <tbody>
                {lines.map((line) => (
                  <Tr key={line.label}>
                    <th scope="row" className="py-2.5 pr-3 text-left align-top font-medium text-ink">
                      {line.label}
                    </th>
                    <Td className="text-ink-muted">{formatFigure(line.share * 100, { decimals: 0 })}% of the energy</Td>
                    <Td numeric className="whitespace-nowrap">
                      {kg(line.grams)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {balance ? <BalanceWords balance={balance} /> : null}
          </>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>grams of a food = household kcal a day × days × its share ÷ its kcal per 100 g × 100</Formula>
            <p>
              Protein and fat are compared with Sphere's appendix 6, which gives 53 g of protein (10% of the energy) and 40 g of fat (17%)
              for 2,100 kcal; the same proportion is used for the energy here. The UK's Be ready campaign asks for{" "}
              <q>{RATION_QUOTES.beReady}</q> and gives no figure for energy.
            </p>
          </>
        }
        range="The dry foods as they are stored, by USDA's figures for each: a packet's own label may differ."
        limits="How much room the food takes: no figure for the bulk of each food is held, so only the weight is given. Water to cook rice, pulses and oats; vitamins and minerals; what the household will eat."
        sources={sources("usda", "sphere", "beReady")}
      />
    </Calculator>
  );
}

// ── Sharing a stock ──

const shareDays: NumberSpec = {
  id: "rations.share.days",
  label: "Days it must last",
  initial: 7,
  suffix: "days",
  min: 1,
  max: 3650,
  integer: true,
};

function ShareCalculator({
  needs,
  supplies,
  onSupplies,
  loading,
}: {
  needs: PersonNeed[];
  supplies: SuppliesFood | null;
  onSupplies: () => void;
  loading: boolean;
}) {
  const store = useStore("rations.share", supplies);
  const length = useNumber(shareDays);
  const shared = store.total !== null && length.value !== null ? shareByNeed(store.total, length.value, needs) : null;
  const short = shared ? shared.lines.some((line) => line.ofNeed < 1) : false;
  const total = store.total;
  const days = length.value;
  const title = `Rations: sharing ${kcal(total ?? 0)} over ${plural(days ?? 0, "day")}`;
  const make = useCallback(
    (paper: PrintPaper) =>
      rationDocument({
        title,
        needs,
        shared: shareByNeed(total ?? 0, days ?? 0, needs),
        whoNot: WHO_NOT_REDUCED,
        days: days ?? 0,
        storeKcal: total ?? 0,
        made: new Date(`${S.sphere.read}T00:00:00Z`),
        paper,
      }),
    [title, needs, total, days],
  );
  const canMake = total !== null && days !== null && needs.length > 0 && (shared?.lines.length ?? 0) > 0;
  const pdf = useSheetPdf(canMake ? make : null, {
    title,
    kind: "Rations",
    from: { what: "the ration calculator", path: "/tools/rations#share" },
  });
  return (
    <Calculator
      id="share"
      title="Sharing out a stock"
      intro="A stock shared among the household above so that it lasts a number of days: by each person's need, not in equal parts, with those kept on a full ration given theirs first."
    >
      <StoreInputs store={store} supplies={supplies} onSupplies={onSupplies} loading={loading} />
      <Inputs className="mt-4">
        <NumberField input={length} />
      </Inputs>
      <Result
        label="A day from the stock"
        figure={shared && shared.lines.length > 0 ? kcal(shared.perDay) : null}
        refusal={
          store.from === "supplies" && !supplies
            ? "Press Use my supplies to read what Supplies holds."
            : shared && shared.lines.length === 0
              ? "There is nobody with an energy figure in the household above."
              : undefined
        }
        keep={
          shared
            ? { title: "A stock shared by need", lines: shared.lines.map((line) => `${line.name || "Someone"}: ${kcal(line.kcal)} a day`) }
            : undefined
        }
      >
        {shared ? (
          <>
            <Table label="Each person's daily amount" className="mt-2 tabular">
              <tbody>
                {shared.lines.map((line) => (
                  <Tr key={line.id}>
                    <th scope="row" className="py-2.5 pr-3 text-left align-top font-medium text-ink">
                      {line.name || "Someone"}
                    </th>
                    <Td>{kcal(line.kcal)} a day</Td>
                    <Td numeric className="text-ink-muted">
                      {formatFigure(line.ofNeed * 100, { decimals: 0 })}% of their need
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <p className="mt-2">
              {short
                ? "The stock does not cover everyone's full need for that long. Those kept on a full ration are given theirs first; that is a plan for the stock, not a safe diet for the others."
                : "The stock covers everyone's full need for that long."}
            </p>
          </>
        ) : null}
      </Result>
      <SheetPdfActions made={canMake ? pdf : null} />
      <HowWorkedOut
        formula={
          <>
            <Formula>
              a day = stock ÷ days; those kept on full get min(1, a day ÷ their needs) of their need; the rest share what is left by need
            </Formula>
            <p>
              Shared by need rather than equally, following the 2002 guidance's <q>{RATION_QUOTES.fnneSafetyNet}</q> Nobody is given more
              than their need; what is over is left in the stock.
            </p>
          </>
        }
        range="One stock for the whole time, eaten evenly day by day."
        limits="Which foods each person gets (a child may not manage beans, a baby needs milk); food that spoils first."
        sources={sources("fnne", "sphere")}
      />
    </Calculator>
  );
}
