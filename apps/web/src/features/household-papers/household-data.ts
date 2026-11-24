/**
 * Everything the grab cards and the binder are made from, read once under each owner's
 * own keys: the household (Supplies), medical sheets (and those opened on this device),
 * every emergency plan, the contacts marked for emergencies, the communication plan and
 * the saved places, and the current household with its home (all of it the current
 * household's: docs/development/households.md). And the pure functions that turn it into a
 * card's lines.
 */
import {
  type CommsResponse,
  type ContactDto,
  type EmergencyPlanResponse,
  type MedicalSheet,
  PACE_LEVELS,
  type PaceStep,
  paceMeansLabel,
} from "@outpost/shared";
import { RADIO_FREQUENCIES } from "@outpost/shared/radio-frequencies-data";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useEmergencyContacts } from "@/features/contacts/contacts-data";
import { planKeys, useMarkers, usePlans, useSupplies } from "@/features/emergency-plans/data";
import { readableOf } from "@/features/emergency-plans/printable";
import { api } from "@/lib/api";
import { frequencyText } from "./comms-words";
import { useComms, useContactsById, useMedicalSheets } from "./data";
import type { GrabHousehold, GrabPerson } from "./grab-cards";
import { useOpenedSheets } from "./medical-crypto";
import { type ContactsNow, contactIdsOf, reach, recordOf } from "./medical-words";
import { kitWords, type PaperHousehold, usePaperHousehold } from "./paper-household";

export interface PaperPerson {
  /** The household member, or null for someone with a sheet who is not in the household. */
  memberId: string | null;
  name: string;
  sheet: MedicalSheet | null;
}

export function useHouseholdSources() {
  const supplies = useSupplies();
  const sheets = useMedicalSheets();
  const opened = useOpenedSheets();
  const plans = usePlans();
  const markers = useMarkers();
  const emergency = useEmergencyContacts();
  const comms = useComms();
  const household = usePaperHousehold();
  const details = useQueries({
    queries: (plans.data ?? []).map((plan) => ({
      queryKey: planKeys.one(plan.id),
      queryFn: () => api.get<EmergencyPlanResponse>(`/api/emergency-plans/${plan.id}`),
    })),
  });
  const planData = details.map((query) => query.data).filter((data): data is EmergencyPlanResponse => data !== undefined);
  const planMark = planData.map((data) => `${data.plan.id}:${data.plan.updatedAt}`).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by each plan's version
  const fullPlans = useMemo(() => planData, [planMark]);

  const people: PaperPerson[] = useMemo(() => {
    const members = (supplies.data?.household.members ?? []).filter((member) => member.kind === "person");
    const list = sheets.data?.sheets ?? [];
    const listed = members.map((member) => ({
      memberId: member.id,
      name: member.name || "Unnamed",
      sheet: list.find((sheet) => sheet.memberId === member.id) ?? null,
    }));
    const others = list
      .filter((sheet) => !members.some((member) => member.id === sheet.memberId))
      .map((sheet) => ({ memberId: null, name: sheet.name, sheet }));
    return [...listed, ...others];
  }, [supplies.data, sheets.data]);

  const travel = useMemo(
    () => ({
      people: (supplies.data?.household.members ?? []).map((member) => member.name || "Unnamed"),
      kit: kitWords(supplies.data ?? null),
    }),
    [supplies.data],
  );

  const ids = people.flatMap((person) => contactIdsOf(person.sheet ? recordOf(person.sheet, opened) : null));
  const contacts = useContactsById(ids);
  const pending =
    supplies.isPending ||
    household.isPending ||
    sheets.isPending ||
    plans.isPending ||
    markers.isPending ||
    emergency.isPending ||
    comms.isPending ||
    details.some((query) => query.isPending);
  const error =
    supplies.error ??
    household.error ??
    sheets.error ??
    plans.error ??
    markers.error ??
    emergency.error ??
    comms.error ??
    details.find((query) => query.error)?.error ??
    null;
  return {
    pending,
    error,
    retry: () => {
      void supplies.refetch();
      void sheets.refetch();
      void plans.refetch();
      void markers.refetch();
      void emergency.refetch();
      void comms.refetch();
    },
    people,
    opened,
    contacts,
    plans: fullPlans,
    markers: markers.data ?? [],
    emergencyContacts: emergency.data ?? [],
    comms: comms.data ?? null,
    supplies: supplies.data ?? null,
    /** The household the papers are for. */
    which: household.which,
    /** A portable household's people and kit, for where a fixed one's home is printed. */
    travel,
  };
}

/** "Phone call: Ana, then Mesh radio message, then Radio channel: PMR446 ... channel 3" for each situation's first three steps. */
export function commsLines(comms: CommsResponse | null): string[] {
  if (!comms) return [];
  return comms.plan.situations
    .map((situation) => {
      const ordered: PaceStep[] = PACE_LEVELS.flatMap((level) => situation.steps.filter((step) => step.level === level.id)).slice(0, 3);
      if (ordered.length === 0) return "";
      const words = ordered.map((step) => {
        if (step.means === "radio" && step.frequency) return frequencyText(step.frequency, RADIO_FREQUENCIES) ?? paceMeansLabel(step.means);
        return [paceMeansLabel(step.means), step.when].filter(Boolean).join(" ");
      });
      return `${situation.name}: ${words.join(", then ")}`;
    })
    .filter(Boolean);
}

/**
 * The household's part of every card. A fixed household's home is printed with its grid
 * references; a portable household's position would be out of date on a card, so its
 * people and kit are printed instead.
 */
export function grabHousehold(
  plans: EmergencyPlanResponse[],
  emergency: ContactDto[],
  which: Pick<PaperHousehold, "name" | "kind" | "home"> | null,
  comms: CommsResponse | null,
  travel: { people: string[]; kit: string | null } = { people: [], kit: null },
): GrabHousehold {
  const readable = plans.map((data) => readableOf(data.plan, data.resolved));
  const places: string[] = [];
  for (const plan of readable)
    for (const place of plan.places)
      if (!place.missing && place.role !== "Another place") {
        const line = `${place.role.replace(/^If /, "if ").replace(/^i/, "I")}: ${place.name}`;
        if (!places.includes(line)) places.push(line);
      }
  const contacts: GrabHousehold["contacts"] = [];
  const add = (label: string, phone: string | undefined) => {
    if (phone && !contacts.some((entry) => entry.phone === phone)) contacts.push({ label, phone });
  };
  for (const plan of readable)
    for (const contact of plan.contacts.filter((each) => each.outOfArea && !each.missing))
      add(`${contact.name} (out of area)`, contact.numbers[0]?.value);
  for (const contact of emergency) add(contact.displayName, contact.phones[0]?.value);
  for (const plan of readable)
    for (const contact of plan.contacts.filter((each) => !each.missing)) add(contact.name, contact.numbers[0]?.value);
  const home = which?.home ?? null;
  const portable = which?.kind === "portable";
  return {
    // Never guessed: a plan with no number gives the card none, and the card says so.
    emergencyNumber: plans.find((each) => each.plan.emergencyNumber.trim())?.plan.emergencyNumber ?? "",
    contacts,
    places,
    comms: commsLines(comms),
    home: home && !portable ? { name: home.name || "Home", lat: home.lat, lon: home.lon } : null,
    travelling: portable && which ? { household: which.name, people: travel.people, kit: travel.kit } : null,
  };
}

/** One person's part of their card, from their sheet as this device can read it. */
export function grabPerson(person: PaperPerson, opened: ReturnType<typeof useOpenedSheets>, contacts: ContactsNow): GrabPerson {
  const record = person.sheet ? recordOf(person.sheet, opened) : null;
  if (!record)
    return {
      name: person.name,
      bloodGroup: "",
      allergies: [],
      needs: [],
      medicines: [],
      contacts: [],
      sheetLocked: person.sheet?.encrypted ?? false,
    };
  const kin = record.nextOfKin.map((entry) => {
    const now = reach(entry, contacts);
    return { label: [now.name, entry.relation ? `(${entry.relation})` : ""].filter(Boolean).join(" "), phone: now.phone };
  });
  const gp = reach(record.gp, contacts);
  return {
    name: person.name,
    bloodGroup: record.bloodGroup.trim(),
    allergies: record.allergies.map((line) => (line.reaction ? `${line.what} (${line.reaction})` : line.what)),
    needs: [...record.conditions.map((line) => (line.note ? `${line.what}: ${line.note}` : line.what)), record.notes.trim()].filter(
      Boolean,
    ),
    medicines: record.medicines.map((line) => [line.name, line.dose, line.when].filter(Boolean).join(" ")),
    contacts: [...kin, ...(gp.phone ? [{ label: gp.name ? `Doctor: ${gp.name}` : "Doctor", phone: gp.phone }] : [])],
    sheetLocked: false,
  };
}
