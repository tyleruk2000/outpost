/**
 * Between a vCard and a contact as Outpost keeps one.
 *
 * Reading: the properties Outpost has a field for become that field. Every other
 * property is kept as the line it was (`extra`), so that it is still there when the
 * contact is exported or handed to a phone. Nothing is thrown away except what
 * `vcard.ts` leaves out (embedded pictures) and the housekeeping lines every writer
 * makes again (VERSION, PRODID, REV).
 *
 * Writing: version 3.0 unless 4.0 is asked for, because 3.0 is what an iPhone, Google
 * Contacts and a CardDAV client all read. Labels a phone would not know ("meeting
 * point") are written the way Apple's address book writes its own: the property in a
 * group, with an `X-ABLabel` beside it. What vCard has no property for (the emergency
 * mark, a callsign, frequencies) is written as `X-OUTPOST-…` lines, which another
 * Outpost reads back and a phone ignores.
 */
import {
  type ContactAddress,
  type ContactFields,
  contactDisplayName,
  emptyContactFields,
  type PickedContact,
} from "@outpost/shared";
import { randomUUID } from "node:crypto";
import { fold } from "./compare.ts";
import {
  escapeText,
  type ParsedCard,
  parsePropertyLine,
  propertyLine,
  splitValue,
  unescapeText,
  type VcardProperty,
  writeCard,
} from "./vcard.ts";

export interface CardContact {
  uid: string;
  fields: ContactFields;
  /** Lines Outpost has no field for, one property each, unfolded. */
  extra: string[];
}

export const newUid = (): string => randomUUID();

// ── Labels ──────────────────────────────────────────────────────────────────

/** Apple writes its built-in labels as `_$!<Mobile>!$_`. A label a person typed is plain text. */
const APPLE_LABELS: Record<string, string> = {
  homepage: "website",
  homefax: "home fax",
  workfax: "work fax",
  otherfax: "fax",
};

function readLabel(raw: string): string {
  const text = unescapeText(raw).trim();
  const builtIn = /^_\$!<(.+)>!\$_$/.exec(text);
  if (!builtIn) return text;
  const word = builtIn[1]!.toLowerCase();
  return APPLE_LABELS[word] ?? word;
}

/** The TYPE values of a property, upper case, without the ones that say nothing about what the number is for. */
function typesOf(property: VcardProperty): string[] {
  const types = new Set<string>();
  for (const entry of property.params) {
    if (entry.name !== "TYPE") continue;
    for (const value of entry.values) for (const part of value.split(",")) if (part.trim()) types.add(part.trim().toUpperCase());
  }
  for (const noise of ["VOICE", "PREF", "INTERNET", "X-INTERNET"]) types.delete(noise);
  return [...types].sort();
}

const PHONE_TYPES: Record<string, string> = {
  CELL: "mobile",
  "CELL+IPHONE": "iPhone",
  IPHONE: "iPhone",
  HOME: "home",
  WORK: "work",
  MAIN: "main",
  FAX: "fax",
  "FAX+HOME": "home fax",
  "FAX+WORK": "work fax",
  PAGER: "pager",
  OTHER: "other",
  "CELL+WORK": "work mobile",
  "CELL+HOME": "mobile",
};
/** The other way round: what to write for a label. A label not here is written as an `X-ABLabel`. */
const PHONE_LABEL_TYPES: Record<string, string[]> = {
  mobile: ["CELL"],
  iphone: ["IPHONE", "CELL"],
  home: ["HOME"],
  work: ["WORK"],
  main: ["MAIN"],
  fax: ["FAX"],
  "home fax": ["HOME", "FAX"],
  "work fax": ["WORK", "FAX"],
  pager: ["PAGER"],
  other: ["OTHER"],
  "work mobile": ["WORK", "CELL"],
};
const PLAIN_TYPES: Record<string, string> = { HOME: "home", WORK: "work", OTHER: "other" };
const PLAIN_LABEL_TYPES: Record<string, string[]> = { home: ["HOME"], work: ["WORK"], other: ["OTHER"] };

function labelFrom(property: VcardProperty, groupLabel: string | undefined, table: Record<string, string>): string {
  if (groupLabel !== undefined && groupLabel !== "") return groupLabel;
  const types = typesOf(property);
  if (types.length === 0) return "";
  return table[types.join("+")] ?? types.map((type) => type.toLowerCase()).join(" ");
}

// ── Reading ─────────────────────────────────────────────────────────────────

const parts = (value: string, count: number, join = " "): string[] => {
  const components = splitValue(value, ";");
  return Array.from({ length: count }, (_unused, index) =>
    splitValue(components[index] ?? "", ",")
      .map((part) => unescapeText(part).trim())
      .filter(Boolean)
      .join(join),
  );
};

/** A birthday as "1984-03-09", or "--03-09" when the card gives no year. Anything else is kept as written. */
function readBirthday(property: VcardProperty): string {
  const text = unescapeText(property.value).trim();
  const noYear = property.params.some((entry) => entry.name === "X-APPLE-OMIT-YEAR");
  const full = /^(\d{4})-?(\d{2})-?(\d{2})(?:T.*)?$/.exec(text);
  if (full) return noYear || full[1] === "1604" ? `--${full[2]}-${full[3]}` : `${full[1]}-${full[2]}-${full[3]}`;
  const short = /^--(\d{2})-?(\d{2})$/.exec(text);
  if (short) return `--${short[1]}-${short[2]}`;
  return text.slice(0, 40);
}

/** Housekeeping every writer makes again; and the lines read into fields below. */
const NOT_KEPT = new Set(["VERSION", "PRODID", "REV", "BEGIN", "END"]);

export function contactFromCard(card: ParsedCard): CardContact {
  const fields = emptyContactFields();
  const extra: string[] = [];
  let uid = "";
  let fullName = "";
  const notes: string[] = [];

  // A label for a grouped property is a line of its own in the same group.
  const groupLabels = new Map<string, string>();
  for (const property of card.properties) {
    if (property.name === "X-ABLABEL" && property.group) groupLabels.set(property.group.toLowerCase(), readLabel(property.value));
  }
  const usedLabels = new Set<string>();
  const labelOf = (property: VcardProperty): string | undefined => {
    if (!property.group) return undefined;
    const key = property.group.toLowerCase();
    if (!groupLabels.has(key)) return undefined;
    usedLabels.add(key);
    return groupLabels.get(key);
  };

  for (const property of card.properties) {
    const text = () => unescapeText(property.value).trim();
    switch (property.name) {
      case "UID":
        uid = text().slice(0, 300);
        break;
      case "FN":
        fullName ||= text();
        break;
      case "N": {
        const [family, given, additional, prefix, suffix] = parts(property.value, 5);
        fields.name = { family: family!, given: given!, additional: additional!, prefix: prefix!, suffix: suffix! };
        break;
      }
      case "NICKNAME":
        fields.nickname ||= parts(property.value, 1, ", ")[0]!;
        break;
      case "ORG": {
        const components = splitValue(property.value, ";")
          .map((part) => unescapeText(part).trim())
          .filter(Boolean);
        if (fields.organisation) extra.push(propertyLine(property));
        else {
          fields.organisation = components[0] ?? "";
          fields.department = components.slice(1).join(", ");
        }
        break;
      }
      case "TITLE":
        if (fields.title) extra.push(propertyLine(property));
        else fields.title = text();
        break;
      case "TEL": {
        const value = text().replace(/^tel:/i, "");
        if (value) fields.phones.push({ value, label: labelFrom(property, labelOf(property), PHONE_TYPES) });
        break;
      }
      case "EMAIL": {
        const value = text().replace(/^mailto:/i, "");
        if (value) fields.emails.push({ value, label: labelFrom(property, labelOf(property), PLAIN_TYPES) });
        break;
      }
      case "ADR": {
        const [box, extended, street, locality, region, postcode, country] = parts(property.value, 7, "\n");
        const address: ContactAddress = {
          label: labelFrom(property, labelOf(property), PLAIN_TYPES),
          street: [box, extended, street].filter(Boolean).join("\n"),
          locality: locality!.replace(/\n/g, ", "),
          region: region!.replace(/\n/g, ", "),
          postcode: postcode!.replace(/\n/g, " "),
          country: country!.replace(/\n/g, ", "),
        };
        if (address.street || address.locality || address.region || address.postcode || address.country) fields.addresses.push(address);
        break;
      }
      case "URL": {
        const value = text();
        if (value) fields.links.push({ value, label: labelFrom(property, labelOf(property), PLAIN_TYPES) || "website" });
        break;
      }
      case "X-ABRELATEDNAMES":
      case "RELATED": {
        const name = text().replace(/^urn:uuid:.*$/i, "");
        if (name) fields.related.push({ name, label: labelFrom(property, labelOf(property), {}) });
        else extra.push(propertyLine(property));
        break;
      }
      case "BDAY":
        if (fields.birthday) extra.push(propertyLine(property));
        else fields.birthday = readBirthday(property);
        break;
      case "NOTE":
        if (text()) notes.push(unescapeText(property.value).trim());
        break;
      case "CATEGORIES":
        for (const part of splitValue(property.value, ",")) {
          const tag = unescapeText(part).replace(/\s+/g, " ").trim();
          // Google Contacts puts every contact in "myContacts"; it says nothing about the person.
          if (tag && tag !== "myContacts" && !fields.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) fields.tags.push(tag);
        }
        break;
      case "KIND":
        if (/^org/i.test(text())) fields.kind = "organisation";
        else if (!/^individual$/i.test(text())) extra.push(propertyLine(property));
        break;
      case "X-ABSHOWAS":
        if (/^company$/i.test(text())) fields.kind = "organisation";
        break;
      case "X-OUTPOST-EMERGENCY":
        fields.isEmergency = text() === "1";
        break;
      case "X-OUTPOST-EMERGENCY-NOTE":
        fields.emergencyNote = text();
        break;
      case "X-OUTPOST-CALLSIGN":
        fields.callsign = text();
        break;
      case "X-OUTPOST-CHANNEL": {
        const [frequency, mode] = parts(property.value, 2);
        if (frequency || mode) fields.channels.push({ frequency: frequency!, mode: mode! });
        break;
      }
      case "X-OUTPOST-FULL-NAME":
        break;
      case "X-ABLABEL":
        break;
      default:
        if (!NOT_KEPT.has(property.name)) extra.push(propertyLine(property));
    }
  }
  // A label whose property was not one of ours stays with it.
  for (const property of card.properties) {
    if (property.name === "X-ABLABEL" && !(property.group && usedLabels.has(property.group.toLowerCase()))) extra.push(propertyLine(property));
  }

  fields.note = notes.join("\n\n");
  const hasName = Object.values(fields.name).some(Boolean);
  if (!hasName && fullName && !(fields.kind === "organisation" && fields.organisation)) {
    // A card with only a formatted name (2.1 allows it, and the phone's picker gives nothing else).
    if (fields.organisation && fold(fullName) === fold(fields.organisation)) fields.kind = "organisation";
    else fields.name.given = fullName;
  } else if (hasName && fullName && fold(fullName) !== fold(contactDisplayName({ ...fields, kind: "person" })) && fold(fullName) !== fold(fields.organisation)) {
    // The card names the person one way and spells the parts another. The parts are what is shown; the other is kept.
    extra.push(`X-OUTPOST-FULL-NAME:${escapeText(fullName)}`);
  }
  return { uid: uid || newUid(), fields, extra };
}

/** A person chosen in the phone's contact picker, as a contact. The picker gives a name, numbers, emails and addresses, nothing else. */
export function contactFromPicked(picked: PickedContact): CardContact {
  const fields = emptyContactFields();
  const clean = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
  fields.name.given = clean(picked.name?.[0]);
  for (const value of picked.tel ?? []) if (clean(value)) fields.phones.push({ value: clean(value), label: "" });
  for (const value of picked.email ?? []) if (clean(value)) fields.emails.push({ value: clean(value), label: "" });
  for (const address of picked.address ?? []) {
    const entry: ContactAddress = {
      label: "",
      street: (address.addressLine ?? []).map(clean).filter(Boolean).join("\n"),
      locality: clean(address.city),
      region: clean(address.region),
      postcode: clean(address.postalCode),
      country: clean(address.country),
    };
    if (entry.street || entry.locality || entry.region || entry.postcode || entry.country) fields.addresses.push(entry);
  }
  return { uid: newUid(), fields, extra: [] };
}

// ── Writing ─────────────────────────────────────────────────────────────────

const stamp = (time: number): string => `${new Date(time).toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;

function writeBirthday(birthday: string, version: "3.0" | "4.0"): string | null {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
  const short = /^--(\d{2})-(\d{2})$/.exec(birthday);
  if (full) return version === "4.0" ? `BDAY:${full[1]}${full[2]}${full[3]}` : `BDAY:${birthday}`;
  // 3.0 has no way to leave the year out; Apple's address book writes the year 1604 and says so.
  if (short) return version === "4.0" ? `BDAY:--${short[1]}${short[2]}` : `BDAY;X-APPLE-OMIT-YEAR=1604:1604-${short[1]}-${short[2]}`;
  if (!birthday.trim()) return null;
  return version === "4.0" ? `BDAY;VALUE=text:${escapeText(birthday)}` : `BDAY:${escapeText(birthday)}`;
}

/** The lines of a card, between VERSION and END. */
export function cardLines(contact: CardContact & { updatedAt: number }, version: "3.0" | "4.0"): string[] {
  const { fields } = contact;
  const lines: string[] = ["PRODID:-//Outpost//Contacts//EN", `UID:${escapeText(contact.uid)}`];
  const name = fields.name;
  lines.push(`N:${[name.family, name.given, name.additional, name.prefix, name.suffix].map(escapeText).join(";")}`);
  lines.push(`FN:${escapeText(contactDisplayName(fields))}`);
  if (fields.nickname) lines.push(`NICKNAME:${escapeText(fields.nickname)}`);
  if (fields.organisation || fields.department) lines.push(`ORG:${escapeText(fields.organisation)};${escapeText(fields.department)}`);
  if (fields.title) lines.push(`TITLE:${escapeText(fields.title)}`);
  if (fields.kind === "organisation") lines.push(version === "4.0" ? "KIND:org" : "X-ABShowAs:COMPANY");

  // Groups already used by the lines kept from the card must not be used twice.
  let group = 0;
  for (const line of contact.extra) {
    const used = /^item(\d+)\./i.exec(line);
    if (used) group = Math.max(group, Number(used[1]));
  }
  const labelled = (property: string, value: string, label: string, table: Record<string, string[]>, always: string[] = []) => {
    const types = table[label.trim().toLowerCase()];
    if (types || !label.trim()) {
      const all = [...always, ...(types ?? [])].map((type) => (version === "4.0" ? type.toLowerCase() : type));
      lines.push(`${property}${all.length > 0 ? `;TYPE=${all.join(",")}` : ""}:${value}`);
      return;
    }
    group += 1;
    lines.push(`item${group}.${property}${always.length > 0 ? `;TYPE=${always.join(",")}` : ""}:${value}`);
    lines.push(`item${group}.X-ABLabel:${escapeText(label.trim())}`);
  };

  for (const phone of fields.phones) labelled("TEL", escapeText(phone.value), phone.label, PHONE_LABEL_TYPES);
  for (const email of fields.emails) labelled("EMAIL", escapeText(email.value), email.label, PLAIN_LABEL_TYPES, version === "3.0" ? ["INTERNET"] : []);
  for (const address of fields.addresses) {
    const value = ["", "", address.street, address.locality, address.region, address.postcode, address.country].map(escapeText).join(";");
    labelled("ADR", value, address.label, PLAIN_LABEL_TYPES);
  }
  for (const link of fields.links) labelled("URL", escapeText(link.value), link.label === "website" ? "" : link.label, PLAIN_LABEL_TYPES);
  for (const related of fields.related) {
    group += 1;
    lines.push(`item${group}.X-ABRELATEDNAMES:${escapeText(related.name)}`);
    if (related.label.trim()) lines.push(`item${group}.X-ABLabel:${escapeText(related.label.trim())}`);
  }
  const birthday = writeBirthday(fields.birthday, version);
  if (birthday) lines.push(birthday);
  if (fields.note) lines.push(`NOTE:${escapeText(fields.note)}`);
  if (fields.tags.length > 0) lines.push(`CATEGORIES:${fields.tags.map(escapeText).join(",")}`);
  if (fields.isEmergency) lines.push("X-OUTPOST-EMERGENCY:1");
  if (fields.emergencyNote) lines.push(`X-OUTPOST-EMERGENCY-NOTE:${escapeText(fields.emergencyNote)}`);
  if (fields.callsign) lines.push(`X-OUTPOST-CALLSIGN:${escapeText(fields.callsign)}`);
  for (const channel of fields.channels) lines.push(`X-OUTPOST-CHANNEL:${escapeText(channel.frequency)};${escapeText(channel.mode)}`);
  for (const line of contact.extra) if (line.trim()) lines.push(line.replace(/[\r\n]+/g, " "));
  lines.push(`REV:${stamp(contact.updatedAt)}`);
  return lines;
}

export const vcardOf = (contact: CardContact & { updatedAt: number }, version: "3.0" | "4.0" = "3.0"): string =>
  writeCard(version, cardLines(contact, version));

// ── The lines that are kept but have no field ───────────────────────────────

const OTHER_NAMES: Record<string, string> = {
  ROLE: "Role",
  ANNIVERSARY: "Anniversary",
  "X-ABDATE": "Date",
  "X-ANNIVERSARY": "Anniversary",
  IMPP: "Messaging",
  "X-SOCIALPROFILE": "Social profile",
  "X-PHONETIC-FIRST-NAME": "Phonetic first name",
  "X-PHONETIC-LAST-NAME": "Phonetic last name",
  "X-OUTPOST-FULL-NAME": "Full name as written",
  GEO: "Position",
  TZ: "Time zone",
  LABEL: "Address label",
  PHOTO: "Picture (a link)",
  GENDER: "Gender",
  LANG: "Language",
  ORG: "Another organisation",
  TITLE: "Another title",
  BDAY: "Another birthday",
};
/** Lines that are kept for the phone's sake and mean nothing to a reader. */
const NOT_SHOWN = new Set(["X-ABUID", "X-ABADR", "X-ABLABEL", "X-IMAGETYPE", "X-IMAGEHASH", "X-ADDRESSBOOKSERVER-KIND", "X-APPLE-SUBLOCALITY"]);

/** The kept lines as "what: value", for the screen. */
export function otherFieldsOf(extra: string[]): string[] {
  const shown: string[] = [];
  for (const line of extra) {
    const property = parsePropertyLine(line);
    if (!property || NOT_SHOWN.has(property.name)) continue;
    const value = unescapeText(property.value).replace(/\s+/g, " ").trim();
    if (!value) continue;
    const name = OTHER_NAMES[property.name] ?? property.written;
    shown.push(`${name}: ${value.length > 200 ? `${value.slice(0, 200)}…` : value}`);
  }
  return shown;
}
