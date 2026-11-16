/**
 * Telling whether a contact from a file is one Outpost already holds, and what bringing
 * the two together would do.
 *
 * Nothing here changes anything. A match is only ever a suggestion shown to a person
 * with both contacts side by side; what happens is what they choose (see `service.ts`).
 *
 * Three strengths of match, strongest first:
 *  - the same card: both carry the same identity (vCard UID), which is how a file
 *    exported from the same phone twice names the same person both times;
 *  - the same name and a phone number or email address in common;
 *  - the same name and nothing else in common, which may well be two people.
 * A shared number without a shared name is not a match: a household shares a landline.
 */
import {
  addressLines,
  type ContactAddress,
  type ContactCompareLine,
  type ContactFields,
  type ContactImportMatchReason,
  contactDisplayName,
} from "@outpost/shared";

/** Letters that are not a plain letter with a mark on it, and so are not separated by Unicode's own folding. */
const PLAIN: Record<string, string> = { ł: "l", ø: "o", đ: "d", ð: "d", ß: "ss", æ: "ae", œ: "oe", þ: "th", ı: "i" };

/** Lower case, accents removed, punctuation as spaces: "Zoë Łukasiewicz" is found by "zoe lukasiewicz". */
export const fold = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[łøđðßæœþı]/g, (letter) => PLAIN[letter] ?? letter)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** A name whichever way round it was written: "Okafor, Maya" and "Maya Okafor" are one name. */
export function nameKey(fields: ContactFields): string {
  const personal = fields.kind === "organisation" ? "" : [fields.name.given, fields.name.family].join(" ");
  const words = fold(personal.trim() ? personal : contactDisplayName(fields))
    .split(" ")
    .filter(Boolean)
    .sort();
  return words.join(" ");
}

/**
 * A phone number for comparing: its last nine digits, which are the same whether it
 * was written "07700 900123" or "+44 7700 900123". Shorter numbers are compared whole.
 */
export function phoneKey(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 3) return fold(value);
  return digits.length > 9 ? digits.slice(-9) : digits;
}

export const emailKey = (value: string): string => value.trim().toLowerCase();
const linkKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
const addressKey = (address: ContactAddress): string => fold(addressLines(address).join(" "));

export interface Known {
  id: string;
  uid: string;
  fields: ContactFields;
}

export interface MatchIndex {
  find(uid: string, fields: ContactFields): { known: Known; reason: ContactImportMatchReason } | null;
  add(known: Known): void;
}

export function createMatchIndex(existing: Known[]): MatchIndex {
  const byUid = new Map<string, Known>();
  const byName = new Map<string, Known[]>();
  const add = (known: Known) => {
    byUid.set(known.uid, known);
    const key = nameKey(known.fields);
    if (!key) return;
    const list = byName.get(key);
    if (list) list.push(known);
    else byName.set(key, [known]);
  };
  for (const known of existing) add(known);

  return {
    add,
    find(uid, fields) {
      const same = byUid.get(uid);
      if (same) return { known: same, reason: "same-card" };
      const key = nameKey(fields);
      const named = key ? byName.get(key) : undefined;
      if (!named || named.length === 0) return null;
      const phones = new Set(fields.phones.map((phone) => phoneKey(phone.value)));
      const emails = new Set(fields.emails.map((email) => emailKey(email.value)));
      const sharing = named.find(
        (known) =>
          known.fields.phones.some((phone) => phones.has(phoneKey(phone.value))) ||
          known.fields.emails.some((email) => emails.has(emailKey(email.value))),
      );
      if (sharing) return { known: sharing, reason: "name-and-number" };
      return { known: named[0]!, reason: "name" };
    },
  };
}

// ── Merging ─────────────────────────────────────────────────────────────────

function union<T>(base: T[], incoming: T[], key: (item: T) => string): T[] {
  const seen = new Set(base.map(key));
  const result = [...base];
  for (const item of incoming) {
    const itemKey = key(item);
    if (seen.has(itemKey)) continue;
    seen.add(itemKey);
    result.push(item);
  }
  return result;
}

/**
 * What Outpost's contact becomes when the file's is added to it. Nothing of Outpost's
 * is removed or replaced: an empty field is filled, a list gains what it lacked, and a
 * note that differs is added under the one that is there.
 */
export function mergeFields(base: ContactFields, incoming: ContactFields): ContactFields {
  const either = (a: string, b: string) => (a.trim() ? a : b);
  const baseNote = base.note.trim();
  const incomingNote = incoming.note.trim();
  const note =
    !incomingNote || fold(baseNote).includes(fold(incomingNote)) ? base.note : baseNote ? `${baseNote}\n\n${incomingNote}` : incoming.note;
  const hasName = Object.values(base.name).some((part) => part.trim());
  return {
    kind: base.kind,
    // A name is taken whole or not at all: half of one name and half of another is nobody's.
    name: hasName ? { ...base.name } : { ...incoming.name },
    nickname: either(base.nickname, incoming.nickname),
    organisation: either(base.organisation, incoming.organisation),
    department: either(base.department, incoming.department),
    title: either(base.title, incoming.title),
    phones: union(base.phones, incoming.phones, (phone) => phoneKey(phone.value)),
    emails: union(base.emails, incoming.emails, (email) => emailKey(email.value)),
    addresses: union(base.addresses, incoming.addresses, addressKey),
    links: union(base.links, incoming.links, (link) => linkKey(link.value)),
    related: union(base.related, incoming.related, (related) => fold(related.name)),
    birthday: either(base.birthday, incoming.birthday),
    note,
    tags: union(base.tags, incoming.tags, (tag) => tag.toLowerCase()),
    isEmergency: base.isEmergency || incoming.isEmergency,
    emergencyNote: either(base.emergencyNote, incoming.emergencyNote),
    callsign: either(base.callsign, incoming.callsign),
    channels: union(base.channels, incoming.channels, (channel) => fold(`${channel.frequency} ${channel.mode}`)),
  };
}

/**
 * What Outpost's contact becomes when the file's is used instead. What a card from a
 * phone carries is replaced. What only Outpost knows (the emergency mark and its note,
 * the radio details) stays unless the file says otherwise, and tags are added to.
 */
export function replaceFields(base: ContactFields, incoming: ContactFields): ContactFields {
  return {
    ...incoming,
    tags: union(base.tags, incoming.tags, (tag) => tag.toLowerCase()),
    isEmergency: base.isEmergency || incoming.isEmergency,
    emergencyNote: incoming.emergencyNote.trim() ? incoming.emergencyNote : base.emergencyNote,
    callsign: incoming.callsign.trim() ? incoming.callsign : base.callsign,
    channels: incoming.channels.length > 0 ? incoming.channels : base.channels,
  };
}

/** The same contact field for field, whatever order the keys were written in. */
export function sameFields(a: ContactFields, b: ContactFields): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(typeof value === "string" ? value.trim() : value);
}

// ── Side by side ────────────────────────────────────────────────────────────

const withLabel = (value: string, label: string) => (label.trim() ? `${value} (${label.trim()})` : value);

function sides(fields: ContactFields): Array<{ label: string; values: string[]; keys: string[] }> {
  const personal = [fields.name.prefix, fields.name.given, fields.name.additional, fields.name.family, fields.name.suffix]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const work = [fields.organisation, fields.department, fields.title].map((part) => part.trim()).filter(Boolean);
  const radio = [
    fields.callsign.trim(),
    ...fields.channels.map((channel) => [channel.frequency, channel.mode].filter(Boolean).join(" ")),
  ].filter(Boolean);
  const line = (label: string, values: string[], keys: string[] = values.map(fold)) => ({ label, values, keys });
  return [
    line("Name", personal ? [personal] : []),
    line("Also known as", fields.nickname.trim() ? [fields.nickname.trim()] : []),
    line("Organisation", work),
    line(
      "Phone",
      fields.phones.map((phone) => withLabel(phone.value, phone.label)),
      fields.phones.map((phone) => phoneKey(phone.value)),
    ),
    line(
      "Email",
      fields.emails.map((email) => withLabel(email.value, email.label)),
      fields.emails.map((email) => emailKey(email.value)),
    ),
    line(
      "Address",
      fields.addresses.map((address) => withLabel(addressLines(address).join(", "), address.label)),
      fields.addresses.map(addressKey),
    ),
    line(
      "Link",
      fields.links.map((link) => link.value),
      fields.links.map((link) => linkKey(link.value)),
    ),
    line(
      "Related",
      fields.related.map((related) => withLabel(related.name, related.label)),
      fields.related.map((related) => fold(related.name)),
    ),
    line("Birthday", fields.birthday.trim() ? [fields.birthday.trim()] : []),
    line("Note", fields.note.trim() ? [fields.note.trim()] : []),
    line(
      "Tags",
      fields.tags,
      fields.tags.map((tag) => tag.toLowerCase()),
    ),
    line("Radio", radio),
    line("In an emergency", fields.isEmergency ? [fields.emergencyNote.trim() || "Marked"] : []),
  ];
}

/** The two contacts line by line, leaving out what neither has. */
export function compareLines(here: ContactFields, incoming: ContactFields): ContactCompareLine[] {
  const left = sides(here);
  const right = sides(incoming);
  const lines: ContactCompareLine[] = [];
  left.forEach((mine, index) => {
    const theirs = right[index]!;
    if (mine.values.length === 0 && theirs.values.length === 0) return;
    const differs = [...mine.keys].sort().join("\n") !== [...theirs.keys].sort().join("\n");
    lines.push({ label: mine.label, here: mine.values, incoming: theirs.values, differs });
  });
  return lines;
}

/**
 * Whether everything the incoming contact says is already said by the one here: every
 * number, address and name it has is one Outpost has too. Then there is nothing to
 * bring in, and nothing to ask.
 */
export function addsNothing(here: ContactFields, incoming: ContactFields): boolean {
  if (!sameFields(mergeFields(here, incoming), here)) return false;
  const left = sides(here);
  const right = sides(incoming);
  return right.every((theirs, index) => {
    // A note that is part of Outpost's, and the emergency mark, are settled by the merge above.
    if (theirs.label === "Note" || theirs.label === "In an emergency") return true;
    const mine = new Set(left[index]!.keys);
    return theirs.keys.every((key) => mine.has(key));
  });
}

const count = (n: number, one: string, many = `${one}s`) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** What merging would add, in words. Empty when it would add nothing. */
export function describeAdditions(base: ContactFields, merged: ContactFields): string[] {
  const adds: string[] = [];
  const more = (before: unknown[], after: unknown[], one: string, many?: string) => {
    if (after.length > before.length) adds.push(count(after.length - before.length, one, many));
  };
  if (!Object.values(base.name).some((part) => part.trim()) && Object.values(merged.name).some((part) => part.trim())) adds.push("a name");
  more(base.phones, merged.phones, "phone number");
  more(base.emails, merged.emails, "email address", "email addresses");
  more(base.addresses, merged.addresses, "address", "addresses");
  more(base.links, merged.links, "link");
  more(base.related, merged.related, "related name");
  more(base.tags, merged.tags, "tag");
  more(base.channels, merged.channels, "frequency", "frequencies");
  const filled: Array<[keyof ContactFields, string]> = [
    ["nickname", "a nickname"],
    ["organisation", "an organisation"],
    ["department", "a department"],
    ["title", "a title"],
    ["birthday", "a birthday"],
    ["callsign", "a callsign"],
    ["emergencyNote", "an emergency note"],
  ];
  for (const [key, words] of filled) if (!String(base[key]).trim() && String(merged[key]).trim()) adds.push(words);
  if (merged.note.trim() !== base.note.trim()) adds.push(base.note.trim() ? "more to the note" : "a note");
  if (merged.isEmergency && !base.isEmergency) adds.push("the emergency mark");
  return adds;
}
