/**
 * The people (and pets) of a household as a form edits them: name, age band, sex for the
 * energy table, and any figures of their own. Prepare › Households edits a household's
 * people with it, and Supplies' Household tab edits the current household's with the same
 * rows. It only holds drafts; whoever mounts it saves them.
 */
import {
  type AgeBand,
  ENERGY_BANDS,
  type EnergyTable,
  type HouseholdMember,
  type MemberSex,
  type PersonInput,
  tableKcal,
} from "@outpost/shared";
import { PawPrint, Trash2, UserPlus } from "lucide-react";
import type { ReactNode } from "react";
import { Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented, Select } from "@/components/ui/misc";
import { amount } from "@/features/supplies/words";
import { formatNumber, localId } from "@/lib/utils";

/** A person as the form holds them: numbers as typed. */
export interface MemberDraft {
  key: string;
  id?: string;
  kind: "person" | "pet";
  name: string;
  band: AgeBand;
  sex: MemberSex;
  kcal: string;
  drinking: string;
  allUses: string;
  note: string;
}

const typed = (value: number | null) => (value === null ? "" : String(value));

export const toDraft = (member: HouseholdMember): MemberDraft => ({
  key: member.id,
  id: member.id,
  kind: member.kind,
  name: member.name,
  band: member.band ?? "19-64",
  sex: member.sex ?? "unstated",
  kcal: typed(member.kcalPerDay),
  drinking: typed(member.drinkingLitres),
  allUses: typed(member.allUsesLitres),
  note: member.note,
});

export const newDraft = (kind: "person" | "pet"): MemberDraft => ({
  key: localId(),
  kind,
  name: "",
  band: "19-64",
  sex: "unstated",
  kcal: "",
  drinking: "",
  allUses: "",
  note: "",
});

/** A figure as typed: null when empty, undefined when it is not a number of zero or more. */
export const readFigure = (value: string): number | null | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

/** The person as it is saved, or what is wrong with it in words. */
export function draftToPerson(draft: MemberDraft): (PersonInput & { id?: string }) | string {
  const kcal = readFigure(draft.kcal);
  const drinking = readFigure(draft.drinking);
  const allUses = readFigure(draft.allUses);
  const who = draft.name.trim() || (draft.kind === "pet" ? "a pet" : "a person");
  if (kcal === undefined || drinking === undefined || allUses === undefined) return `A figure for ${who} is not a number.`;
  return {
    id: draft.id,
    kind: draft.kind,
    name: draft.name.trim(),
    band: draft.kind === "person" ? draft.band : null,
    sex: draft.kind === "person" ? draft.sex : null,
    kcalPerDay: kcal,
    drinkingLitres: drinking,
    allUsesLitres: allUses,
    note: draft.note.trim(),
  };
}

/** What a draft is called where it has no name yet: "Person 2", "Pet 1". */
export const draftLabel = (draft: MemberDraft, index: number) =>
  draft.name.trim() || (draft.kind === "pet" ? `Pet ${index + 1}` : `Person ${index + 1}`);

export function PeopleEditor({
  members,
  onChange,
  energyTable,
  drinking,
  allUses,
  title = "Who it is for",
  description,
  actions,
  listLabel = "Household",
  removeLabel = (label) => `Remove ${label}`,
  under,
  empty = "Nobody yet. The days of food and water are worked out once someone is added.",
  headingLevel = 2,
}: {
  members: MemberDraft[];
  onChange: (update: (list: MemberDraft[]) => MemberDraft[]) => void;
  /** The table each person's energy a day comes from, for the figure shown as a hint. */
  energyTable: EnergyTable;
  /** The household's usual water figures a day, for the hints. */
  drinking: number;
  allUses: number;
  title?: ReactNode;
  description?: ReactNode;
  /** More buttons beside "Add a person" and "Add a pet". */
  actions?: ReactNode;
  listLabel?: string;
  /** The words of the remove button, for a screen reader: "Take Ann out of Caravan". */
  removeLabel?: (label: string) => string;
  /** A line under a person's row: "Also in Caravan". */
  under?: (draft: MemberDraft) => ReactNode;
  empty?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const change = (key: string, patch: Partial<MemberDraft>) =>
    onChange((list) => list.map((member) => (member.key === key ? { ...member, ...patch } : member)));
  const add = (kind: "person" | "pet") => onChange((list) => [...list, newDraft(kind)]);

  return (
    <Section
      title={title}
      level={headingLevel}
      description={description}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => add("person")}>
            <UserPlus />
            Add a person
          </Button>
          <Button onClick={() => add("pet")}>
            <PawPrint />
            Add a pet
          </Button>
          {actions}
        </div>
      }
    >
      {members.length === 0 ? (
        <p className="border-y border-border py-4 text-body text-ink-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border" aria-label={listLabel}>
          {members.map((member, index) => {
            const label = draftLabel(member, index);
            const table = member.kind === "person" ? tableKcal(member.band, member.sex, energyTable) : null;
            const note = under?.(member);
            return (
              <li key={member.key} className="grid gap-3 py-4">
                <div className="flex flex-wrap items-end justify-end gap-2">
                  <Field label={member.kind === "pet" ? "Pet's name" : "Name"} optional className="min-w-[min(100%,10rem)] flex-1">
                    {(ids) => (
                      <Input
                        {...ids}
                        value={member.name}
                        onChange={(event) => change(member.key, { name: event.target.value })}
                        maxLength={80}
                      />
                    )}
                  </Field>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={removeLabel(label)}
                    onClick={() => onChange((list) => list.filter((entry) => entry.key !== member.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {note ? <p className="-mt-1 text-small text-ink-muted">{note}</p> : null}
                {member.kind === "person" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Age">
                      {(ids) => (
                        <Select<AgeBand>
                          {...ids}
                          value={member.band}
                          onChange={(band) => change(member.key, { band })}
                          options={ENERGY_BANDS.map((band) => ({ value: band.id, label: band.label }))}
                        />
                      )}
                    </Field>
                    <div className="grid gap-1.5">
                      <span className="text-small font-medium text-ink">Sex, for the energy table</span>
                      <Segmented<MemberSex>
                        label={`Sex of ${label}`}
                        value={member.sex}
                        onChange={(sex) => change(member.key, { sex })}
                        options={[
                          { value: "female", label: "Female" },
                          { value: "male", label: "Male" },
                          { value: "unstated", label: "Not said" },
                        ]}
                        className="justify-self-start"
                      />
                    </div>
                  </div>
                ) : null}
                <div className="grid grid-cols-3 gap-3">
                  <Field
                    label="kcal a day"
                    hint={
                      member.kind === "pet"
                        ? "From the food or your vet"
                        : table === null
                          ? "None in the table: give one"
                          : `Table: ${formatNumber(table)}`
                    }
                  >
                    {(ids) => (
                      <Input
                        {...ids}
                        value={member.kcal}
                        onChange={(event) => change(member.key, { kcal: event.target.value })}
                        inputMode="decimal"
                        placeholder={table === null ? "" : String(table)}
                        className="tabular"
                      />
                    )}
                  </Field>
                  <Field label="Litres to drink" hint={member.kind === "pet" ? "From your vet" : `Usual: ${amount(drinking)}`}>
                    {(ids) => (
                      <Input
                        {...ids}
                        value={member.drinking}
                        onChange={(event) => change(member.key, { drinking: event.target.value })}
                        inputMode="decimal"
                        className="tabular"
                      />
                    )}
                  </Field>
                  <Field label="Litres, all uses" hint={member.kind === "pet" ? "Same as drinking if empty" : `Usual: ${amount(allUses)}`}>
                    {(ids) => (
                      <Input
                        {...ids}
                        value={member.allUses}
                        onChange={(event) => change(member.key, { allUses: event.target.value })}
                        inputMode="decimal"
                        className="tabular"
                      />
                    )}
                  </Field>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
