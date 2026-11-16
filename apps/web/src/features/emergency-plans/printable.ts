/**
 * A plan as it is read in an emergency: on the "use now" screen and on paper. Linked
 * contacts and places are put in as they are now; one deleted since is kept and said to
 * be missing, never dropped. Nothing here touches the page or the network.
 */
import {
  attributionsFor,
  dialable,
  type EmergencyPlan,
  neededOf,
  PLACE_ROLES,
  type PlanPhase,
  type PlanResolved,
  planKindLabel,
} from "@outpost/shared";

export interface ReadNumber {
  label: string;
  value: string;
  /** For a `tel:` link; null when it cannot be dialled as written. */
  dial: string | null;
}

export interface ReadContact {
  name: string;
  numbers: ReadNumber[];
  note: string;
  outOfArea: boolean;
  /** Linked from Contacts, and deleted there since. */
  missing: boolean;
}

export interface ReadPlace {
  role: string;
  name: string;
  note: string;
  /** "54.30000, -2.20000", from the saved place; null for one only described, or missing. */
  coords: string | null;
  /** Where the offline map opens on it. */
  mapPath: string | null;
  missing: boolean;
}

export interface ReadPerson {
  name: string;
  remember: string;
  medical: string;
  numbers: ReadNumber[];
  missing: boolean;
}

export interface Readable {
  name: string;
  kind: string;
  emergencyNumber: string;
  steps: Array<{ id: string; phase: PlanPhase; text: string }>;
  contacts: ReadContact[];
  places: ReadPlace[];
  people: ReadPerson[];
  comms: string[];
  where: Array<{ what: string; where: string }>;
  supplies: Array<{ name: string; amount: string }>;
  /** What must be printed with the official words the plan carries (licence statements), once each. */
  attributions: string[];
}

const number = (label: string, value: string): ReadNumber => ({ label, value, dial: dialable(value) });

/** "6 litres", "3 tins", "torch": a supply's amount for the household. */
export function amountText(needed: number | null, unit: string): string {
  if (needed === null) return unit.trim();
  const figure = Number.isInteger(needed) ? String(needed) : String(Math.round(needed * 10) / 10);
  return unit.trim() ? `${figure} ${unit.trim()}` : figure;
}

export function readableOf(plan: EmergencyPlan, resolved: PlanResolved, people?: number): Readable {
  const { body } = plan;
  const household = people ?? Math.max(1, body.people.length);
  return {
    name: plan.name,
    kind: plan.kindText.trim() || planKindLabel(plan.kind),
    emergencyNumber: plan.emergencyNumber,
    steps: body.steps.map((step) => ({ id: step.id, phase: step.phase, text: step.text })),
    contacts: body.contacts.map((contact) => {
      if (contact.contactId) {
        const now = resolved.contacts[contact.contactId];
        return {
          name: now?.displayName ?? contact.name,
          numbers: now ? now.phones.map((phone) => number(phone.label.trim() || "phone", phone.value)) : [],
          note: contact.note,
          outOfArea: contact.outOfArea,
          missing: now === null || now === undefined,
        };
      }
      return {
        name: contact.name,
        numbers: contact.phone.trim() ? [number("phone", contact.phone.trim())] : [],
        note: contact.note,
        outOfArea: contact.outOfArea,
        missing: false,
      };
    }),
    places: body.places.map((place) => {
      const role = PLACE_ROLES.find((each) => each.id === place.role)?.label ?? "";
      if (place.markerId) {
        const now = resolved.places[place.markerId];
        return {
          role,
          name: now?.name ?? place.name,
          note: place.note,
          coords: now ? `${now.lat.toFixed(5)}, ${now.lon.toFixed(5)}` : null,
          mapPath: now ? `/maps?lat=${now.lat.toFixed(5)}&lon=${now.lon.toFixed(5)}&z=15` : null,
          missing: !now,
        };
      }
      return { role, name: place.name, note: place.note, coords: null, mapPath: null, missing: false };
    }),
    people: body.people.map((person) => {
      const now = person.contactId ? resolved.contacts[person.contactId] : undefined;
      return {
        name: person.name || now?.displayName || "",
        remember: person.remember,
        medical: person.medical,
        numbers: now ? now.phones.map((phone) => number(phone.label.trim() || "phone", phone.value)) : [],
        missing: person.contactId !== null && !now,
      };
    }),
    comms: [
      body.comms.text.trim(),
      [body.comms.frequency.trim(), body.comms.schedule.trim()].filter(Boolean).join(", "),
      resolved.commPlan ? `Communication plan: ${resolved.commPlan.name}` : "",
    ].filter(Boolean),
    where: body.where.filter((item) => item.what.trim()).map((item) => ({ what: item.what.trim(), where: item.where.trim() })),
    supplies: body.supplies.map((supply) => ({
      name: supply.name,
      amount: amountText(neededOf(supply, household, body.days), supply.unit),
    })),
    attributions: attributionsFor([...body.steps, ...body.supplies, ...body.where].map((line) => line.origin)),
  };
}
