/** Words for households, shared by the Households screens, the switcher and the Home line. */
import type { HouseholdDto, HouseholdHolds, HouseholdKind, HouseholdPosition, PersonDto } from "@outpost/shared";
import { plural, timeAgo } from "@/lib/utils";

export const KIND_LABEL: Record<HouseholdKind, string> = { fixed: "Fixed", portable: "Portable" };
export const KIND_ABOUT: Record<HouseholdKind, string> = {
  fixed: "A home that stays put: its home is a saved place.",
  portable: "A caravan, a car or a group on the move: its home is wherever you last said it is.",
};

/** A position in words: its name, else its coordinates. */
export function positionName(position: Pick<HouseholdPosition, "name" | "lat" | "lon">): string {
  return position.name?.trim() || `${position.lat.toFixed(4)}, ${position.lon.toFixed(4)}`;
}

/** Where a household is, in a few words: "Home: Fell Cottage", "Here: Keswick, as of 3 hours ago". */
export function whereWords(household: HouseholdDto): string {
  if (household.kind === "portable") {
    if (!household.here) return "Where it is now has not been set";
    return `Where it is now: ${positionName(household.here)}, as of ${timeAgo(household.here.at)}`;
  }
  if (household.home) return `Home: ${household.home.name}`;
  return "No home place chosen";
}

export const peopleWords = (count: number) => (count === 0 ? "Nobody yet" : plural(count, "person or pet", "people and pets"));

/** "Also in Caravan and Gran's" for a person in this household and others. */
export function alsoInWords(person: Pick<PersonDto, "householdIds">, households: HouseholdDto[], except?: string): string | null {
  const names = person.householdIds
    .filter((id) => id !== except)
    .map((id) => households.find((household) => household.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  return names.length === 0 ? null : `Also in ${listWords(names)}`;
}

/** "A", "A and B", "A, B and C". */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Which households a person is in, in words: "In Home and Caravan", "In no household". */
export function inWords(person: Pick<PersonDto, "householdIds">, households: HouseholdDto[]): string {
  const names = person.householdIds
    .map((id) => households.find((household) => household.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  return names.length === 0 ? "In no household" : `In ${listWords(names)}`;
}

/** What removing a household takes with it, as a list of phrases; and what it leaves. */
export function holdsWords(holds: HouseholdHolds): { goes: string[]; stays: string | null } {
  const goes = [
    holds.supplies > 0 ? plural(holds.supplies, "row of supplies", "rows of supplies") : null,
    holds.shoppingLines > 0 ? `a shopping list of ${plural(holds.shoppingLines, "line")}` : null,
    holds.emergencyPlans > 0 ? plural(holds.emergencyPlans, "emergency plan") : null,
    holds.logEntries > 0 ? plural(holds.logEntries, "entry in the log of events", "entries in the log of events") : null,
    holds.routineChecks > 0 ? plural(holds.routineChecks, "routine check") : null,
    holds.sowings > 0 ? plural(holds.sowings, "sowing") : null,
    holds.powerPlans > 0 ? plural(holds.powerPlans, "power plan") : null,
    holds.medicalSheets > 0
      ? plural(holds.medicalSheets, "medical sheet for nobody in particular", "medical sheets for nobody in particular")
      : null,
    holds.papers > 0 ? "its supplies settings, keeping in touch plan, household book and garden setting" : null,
    holds.positions > 0 ? plural(holds.positions, "place it has been", "places it has been") : null,
  ].filter((part): part is string => part !== null);
  let stays: string | null = null;
  if (holds.people > 0) {
    stays =
      holds.peopleOnlyHere > 0
        ? `Nobody is removed from the People list. ${plural(holds.peopleOnlyHere, "person or pet", "people and pets")} will be in no household afterwards${
            holds.theirMedicalSheets > 0 ? `, with ${plural(holds.theirMedicalSheets, "medical sheet")} kept` : ""
          }.`
        : "Nobody is removed from the People list: everyone in it is in another household too.";
  }
  return { goes, stays };
}
