/**
 * The communication plan in words: each step as it is read on screen and on paper, and
 * a page for each person. Links are named as they are now; one deleted since is said to
 * be missing, never dropped. Channels come from Outpost's own list of frequencies.
 * Nothing here touches the page or the network.
 */
import {
  type CommsPerson,
  type CommsPlan,
  type CommsResolved,
  type FrequencyEntry,
  formatKhz,
  megahertz,
  PACE_LEVELS,
  type PaceFrequency,
  type PaceStep,
  paceMeansLabel,
} from "@outpost/shared";
import type { Block } from "@/features/propagation/plans/document";

/** The screen of the household check-in (outpost-7s31), when this version of Outpost has it. */
export const CHECK_IN_PATH = "/prepare/check-in";

/** The kinds of the list of frequencies a household transmits on itself. */
export const TRANSMIT_KINDS = new Set(["licence-free", "amateur"]);

/** One frequency of an entry as a choice: its channel name, or its frequency. */
export const channelKey = (frequency: FrequencyEntry["frequencies"][number]): string => frequency.channel ?? String(frequency.khz);

/** "PMR446, analogue walkie-talkies (Europe), channel 3, 446.03125 MHz", or null when the entry is not in this version's list. */
export function frequencyText(choice: PaceFrequency, entries: readonly FrequencyEntry[]): string | null {
  const entry = entries.find((each) => each.id === choice.entryId);
  if (!entry) return null;
  const frequency = entry.frequencies.find((each) => channelKey(each) === choice.channel) ?? entry.frequencies[0];
  if (!frequency) return entry.name;
  const channel = frequency.channel ? `channel ${frequency.channel}, ` : "";
  return `${entry.name}, ${channel}${formatKhz(frequency.khz)}`;
}

/** What a step says: the means, who or where, and when. */
export function stepText(
  step: PaceStep,
  resolved: CommsResolved,
  entries: readonly FrequencyEntry[],
): { text: string; missing: string | null } {
  const parts: string[] = [];
  let missing: string | null = null;
  if (step.contactId) {
    const contact = resolved.contacts[step.contactId];
    if (contact) parts.push([contact.displayName, contact.phones[0]?.value].filter(Boolean).join(", "));
    else if (contact === null) missing = "the contact is no longer in Contacts";
  }
  if (step.means === "radio" && step.frequency) {
    const text = frequencyText(step.frequency, entries);
    if (text) parts.push(text);
    else missing = "the channel is not in this version's list of frequencies";
  }
  if (step.repeaterId) {
    const repeater = resolved.repeaters[step.repeaterId];
    if (repeater)
      parts.push(
        [
          repeater.callsign,
          repeater.place,
          `listen ${megahertz(repeater.outputHz)}`,
          repeater.inputHz && repeater.inputHz !== repeater.outputHz ? `send ${megahertz(repeater.inputHz)}` : "",
          repeater.ctcssHz ? `tone ${repeater.ctcssHz} Hz` : "",
        ]
          .filter(Boolean)
          .join(", "),
      );
    else if (repeater === null) missing = "the repeater is no longer in Outpost";
  }
  if (step.meshChannel) {
    const label = resolved.mesh[step.meshChannel];
    if (label) parts.push(`channel ${label}`);
    else parts.push(`channel ${step.meshChannel.split(":").slice(1).join(":") || step.meshChannel}`);
  }
  if (step.markerId) {
    const place = resolved.places[step.markerId];
    if (place) parts.push(`${place.name} (${place.lat.toFixed(5)}, ${place.lon.toFixed(5)})`);
    else if (place === null) missing = "the saved place is no longer on the map";
  }
  if (step.text.trim()) parts.push(step.text.trim());
  if (step.when.trim()) parts.push(step.when.trim());
  return { text: [paceMeansLabel(step.means), parts.join(", ")].filter(Boolean).join(": "), missing };
}

export const levelLabel = (id: string) => PACE_LEVELS.find((level) => level.id === id)?.label ?? id;

/** Who to contact in a situation, as lines: name and first number. */
export function contactLines(ids: string[], resolved: CommsResolved): string[] {
  return ids.map((id) => {
    const contact = resolved.contacts[id];
    if (!contact) return "A contact no longer in Contacts";
    return [contact.displayName, contact.phones[0]?.value, contact.callsign].filter(Boolean).join(", ");
  });
}

/** One person's page: the plan with their own note at the top. */
export function commsBlocks(
  plan: CommsPlan,
  resolved: CommsResolved,
  person: CommsPerson | null,
  entries: readonly FrequencyEntry[],
  options: { checkIn: boolean; title?: boolean } = { checkIn: false },
): Block[] {
  const blocks: Block[] = [];
  const heading = person ? `Keeping in touch: ${person.name}` : "Keeping in touch";
  blocks.push(options.title === false ? { kind: "heading", text: heading } : { kind: "title", text: heading });
  if (person?.note.trim()) blocks.push({ kind: "para", text: person.note.trim() });
  if (plan.checkIns.trim()) blocks.push({ kind: "para", text: `Check in: ${plan.checkIns.trim()}` });
  for (const situation of plan.situations) {
    blocks.push({ kind: "heading", text: situation.name });
    const ordered = PACE_LEVELS.flatMap((level) => situation.steps.filter((step) => step.level === level.id));
    if (ordered.length > 0)
      blocks.push({
        kind: "table",
        head: ["", "How"],
        rows: ordered.map((step) => {
          const { text, missing } = stepText(step, resolved, entries);
          return [levelLabel(step.level), missing ? `${text} (${missing})` : text];
        }),
      });
    if (situation.checkIn.trim()) blocks.push({ kind: "para", text: `Check in: ${situation.checkIn.trim()}` });
    const who = contactLines(situation.contactIds, resolved);
    if (who.length > 0) blocks.push({ kind: "list", items: who.map((line, index) => `${index + 1}. ${line}`) });
  }
  if (plan.notes.trim()) blocks.push({ kind: "para", text: plan.notes.trim() });
  if (options.checkIn)
    blocks.push({
      kind: "para",
      text: "Where Outpost is reachable, send a check-in from its Check-in screen: OK, need help, where you are.",
    });
  blocks.push({
    kind: "para",
    text: "Our household's own plan, made in advance. In a real emergency, follow the emergency services and official warnings.",
  });
  return blocks;
}

/** The entries of the list of frequencies the plan uses. */
export function usedEntries(plan: CommsPlan, entries: readonly FrequencyEntry[]): FrequencyEntry[] {
  const ids = new Set(plan.situations.flatMap((situation) => situation.steps.map((step) => step.frequency?.entryId).filter(Boolean)));
  return entries.filter((entry) => ids.has(entry.id));
}
