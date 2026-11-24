/**
 * Who the supplies are for: the people (by age band, since needs differ), anyone with a
 * need of their own, pets, and how many days the household wants covered. Each figure
 * is an official planning figure that the person can change, and says whose it is.
 */
import {
  DEFAULT_HOUSEHOLD,
  ENERGY_SOURCE,
  type EnergyTable,
  FNNE_SOURCE,
  type Household,
  type HouseholdInput,
  memberNeeds,
  WATER_FIGURES,
  type WaterBasis,
} from "@outpost/shared";
import { UsersRound } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { LeaveGuard } from "@/components/leave-guard";
import { Notice, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { SAVE_BAR_ROOM } from "@/features/household-papers/save-bar";
import { draftToPerson, type MemberDraft, PeopleEditor, readFigure, toDraft } from "@/features/households/people-editor";
import { useHousehold } from "@/features/households/use-household";
import { useCatalogue } from "@/features/layers/data";
import { errorMessage } from "@/lib/api";
import { formatNumber, plural } from "@/lib/utils";
import { useSetHousehold } from "./data";
import { Stepper } from "./item-form";
import { amount } from "./words";

/** Which table the household's energy comes from, and why: said under the choice. */
export function energyTableLine(
  choice: TableChoice,
  basis: Household["energyBasis"],
  countryName?: string,
  /** Given when there are several households: the line names the one it is for. */
  householdName?: string,
): string {
  if (choice === "uk") return "The UK's figures, from Public Health England, for everyone without a figure of their own.";
  if (choice === "international")
    return "The international figures (UNHCR, UNICEF, WFP and WHO), for everyone without a figure of their own.";
  const table = basis?.table ?? "international";
  const words = table === "uk" ? "the UK's figures (Public Health England)" : "the international figures (UNHCR, UNICEF, WFP and WHO)";
  if (!basis?.country) {
    if (householdName)
      return `${householdName} has no home with a country yet, so ${words} are used. Set its home under Households, or choose here.`;
    return `No saved place has the home icon, so ${words} are used. Give a place the home icon on the map, or choose here.`;
  }
  return `${householdName ?? "Home"} is in ${countryName ?? basis.country}: ${words} are used.`;
}

const read = readFigure;

/** The energy table as the form holds it: "home" for none chosen, by Home's country. */
type TableChoice = EnergyTable | "home";

export function HouseholdView({ household }: { household: Household }) {
  const [days, setDays] = useState(String(household.daysWanted));
  const [tableChoice, setTableChoice] = useState<TableChoice>(household.energyTable ?? "home");
  const homeTable: EnergyTable = household.energyBasis?.table ?? "international";
  const energyTable: EnergyTable = tableChoice === "home" ? homeTable : tableChoice;
  // The current household's country (modules/households), named as the reference catalogue names it.
  const current = useHousehold().data;
  const countries = useCatalogue().data?.countries;
  const code = household.energyBasis?.country;
  const homeName = code ? countries?.find((country) => country.code === code)?.name : undefined;
  const several = current?.several ? current.household.name : undefined;
  const [basis, setBasis] = useState<WaterBasis>(household.waterBasis);
  const [drinking, setDrinking] = useState(String(household.drinkingLitres));
  const [allUses, setAllUses] = useState(String(household.allUsesLitres));
  const [members, setMembers] = useState<MemberDraft[]>(() => household.members.map(toDraft));
  const [problem, setProblem] = useState<string | null>(null);
  const save = useSetHousehold();
  // Changed since it was saved: the form as it is against the form as it came. The view is drawn again after a save.
  const form = JSON.stringify({ days, tableChoice, basis, drinking, allUses, members });
  const [saved] = useState(form);
  const dirty = form !== saved;

  const input = (): HouseholdInput | string => {
    const daysWanted = Number(days);
    if (!Number.isInteger(daysWanted) || daysWanted < 1 || daysWanted > 3650) return "Give the days wanted as a whole number, from 1.";
    const drink = read(drinking);
    const all = read(allUses);
    if (!drink || drink < 0.5) return "Give the water to drink a day in litres: 0.5 or more.";
    if (!all || all < 0.5) return "Give the water for all uses a day in litres: 0.5 or more.";
    const list: HouseholdInput["members"] = [];
    for (const member of members) {
      const person = draftToPerson(member);
      if (typeof person === "string") return person;
      list.push(person);
    }
    return {
      daysWanted,
      energyTable: tableChoice === "home" ? null : tableChoice,
      waterBasis: basis,
      drinkingLitres: drink,
      allUsesLitres: all,
      members: list,
    };
  };

  const preview = input();
  const needs =
    typeof preview === "string"
      ? null
      : memberNeeds({
          ...preview,
          energyBasis: household.energyBasis,
          members: preview.members.map((member, index) => ({ ...member, id: String(index) })),
          updatedAt: null,
        });
  const kcalTotal = needs ? needs.filter((need) => need.kind === "person").reduce((sum, need) => sum + (need.kcal ?? 0), 0) : 0;
  const waterTotal = needs ? needs.reduce((sum, need) => sum + ((basis === "all" ? need.allUses : need.drinking) ?? 0), 0) : 0;

  const submit = () => {
    const value = input();
    if (typeof value === "string") return setProblem(value);
    setProblem(null);
    save.mutate(value, {
      onSuccess: () => toast.success("Household saved. The days and the shopping list are worked out for it."),
      onError: (error) => setProblem(errorMessage(error)),
    });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      // What Tab reaches is scrolled clear of the bar with Save at the foot (WCAG 2.4.11).
      className={SAVE_BAR_ROOM}
    >
      <Notice className="mb-8">
        These are planning figures for a store of food and water, from official guidance, and not dietary advice. A baby, someone pregnant,
        breastfeeding, ill, or working hard, and anyone in hot weather needs more: give their own figure.
      </Notice>

      <Section title="How long to plan for">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Days wanted" hint="UK and US guidance both start at three days; many keep more.">
            {(ids) => <Stepper id={ids.id} describedBy={ids["aria-describedby"]} value={days} onChange={setDays} label="days wanted" />}
          </Field>
          <div className="grid gap-1.5">
            <span className="text-small font-medium text-ink">Water is worked out for</span>
            <Segmented<WaterBasis>
              label="Water is worked out for"
              value={basis}
              onChange={setBasis}
              options={[
                { value: "drinking", label: "Drinking" },
                { value: "all", label: "Drinking, cooking, washing" },
              ]}
              className="justify-self-start"
            />
          </div>
        </div>
      </Section>

      <Section title="Energy table">
        <div className="grid gap-1.5">
          <span className="text-small font-medium text-ink">Each person's energy a day comes from</span>
          <Segmented<TableChoice>
            label="Energy table"
            value={tableChoice}
            onChange={setTableChoice}
            options={[
              { value: "home", label: "By Home's country" },
              { value: "international", label: "International" },
              { value: "uk", label: "UK" },
            ]}
            className="justify-self-start"
          />
          <p className="max-w-[65ch] text-small text-ink-muted" data-testid="energy-table-line">
            {energyTableLine(tableChoice, household.energyBasis, homeName, several)}
          </p>
        </div>
      </Section>

      <PeopleEditor
        members={members}
        onChange={setMembers}
        energyTable={energyTable}
        drinking={read(drinking) ?? 0}
        allUses={read(allUses) ?? 0}
        description={
          <>
            {needs && needs.length > 0
              ? `A day: ${formatNumber(kcalTotal)} kcal for ${plural(needs.filter((need) => need.kind === "person").length, "person", "people")}, ${amount(waterTotal)} litres of water ${basis === "all" ? "for all uses" : "to drink"}.`
              : "Add each person, and any pets."}
            {several ? (
              <>
                {" "}
                These are {several}&rsquo;s people.{" "}
                <Link to="/prepare/households" className="text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2">
                  Add people to other households
                </Link>
                .
              </>
            ) : null}
          </>
        }
        actions={
          <Button asChild variant="ghost">
            <Link to="/prepare/households">
              <UsersRound />
              Households and people
            </Link>
          </Button>
        }
      />

      <Section title="Water for everyone without a figure of their own">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="To drink, litres a day"
            hint={`UK government (Be ready): ${WATER_FIGURES.drinking.litres} litres. WHO gives ${WATER_FIGURES.drinking.range.join(" to ")} for drinking and food.`}
          >
            {(ids) => (
              <Input
                {...ids}
                value={drinking}
                onChange={(event) => setDrinking(event.target.value)}
                inputMode="decimal"
                className="tabular max-w-32"
              />
            )}
          </Field>
          <Field
            label="Drinking, cooking and washing, litres a day"
            hint={`WHO technical note 9: ${WATER_FIGURES.allUses.range.join(" to ")} litres; ${WATER_FIGURES.allUses.litres} is the low end. FEMA asks for one US gallon (3.8 litres) for drinking and sanitation.`}
          >
            {(ids) => (
              <Input
                {...ids}
                value={allUses}
                onChange={(event) => setAllUses(event.target.value)}
                inputMode="decimal"
                className="tabular max-w-32"
              />
            )}
          </Field>
        </div>
        <details className="mt-4 text-small text-ink-muted">
          <summary className="cursor-pointer text-ink select-none">Where the figures come from</summary>
          <ul className="mt-2 grid list-disc gap-1.5 pl-5">
            <li>
              International energy: {FNNE_SOURCE}. Energy requirements for each year of age, for a developing-country profile at light
              activity; each age group here is the mean of the figures for the years it covers. “Not said” uses the table's own figure for
              both sexes. It is meant for anywhere, and gives a baby under one a figure.
            </li>
            <li>
              UK energy: {ENERGY_SOURCE}. Estimated average requirements, averaged over each age group; for ages 11 to 64 capped at 2,500
              kcal (males) and 2,000 kcal (females). There is no figure for a baby under one. “Not said” uses the mean of the two.
            </li>
            <li>
              Water to drink: UK government, “Be ready: get prepared for emergencies”: 3 litres per person per day for drinking, more for
              cooking and washing.
            </li>
            <li>
              Water for all uses: WHO, Technical notes on drinking-water, sanitation and hygiene in emergencies, note 9 (July 2013), table
              9.1, adapted from Sphere: 2.5 to 3 litres for survival, 2 to 6 for basic hygiene, 3 to 6 for basic cooking; 7.5 to 15 in all.
            </li>
            <li>
              FEMA (ready.gov/water, updated February 2021): one US gallon a day for drinking and sanitation; needs can double in very hot
              weather.
            </li>
            <li>Pets: no official figure was found that Outpost could quote, so a pet counts only with the figures you give.</li>
          </ul>
        </details>
      </Section>

      <LeaveGuard when={dirty && !save.isPending} what="the changes to the household" query />
      <div
        data-sticky-bottom
        className="sticky bottom-[var(--mobile-nav-height,calc(3.5rem+env(safe-area-inset-bottom)))] z-(--z-sticky) mt-8 flex flex-wrap items-center gap-3 border-t border-border bg-page py-3 md:bottom-0"
      >
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save household
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setDrinking(String(DEFAULT_HOUSEHOLD.drinkingLitres));
            setAllUses(String(DEFAULT_HOUSEHOLD.allUsesLitres));
          }}
        >
          Water figures as published
        </Button>
        {problem ? (
          <p role="alert" className="w-full text-small text-danger">
            {problem}
          </p>
        ) : null}
      </div>
    </form>
  );
}
