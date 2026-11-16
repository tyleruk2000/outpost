/**
 * Contacts: the people and places to reach, kept where they still open when the phone
 * network and the internet are down.
 *
 * A contact is plain text throughout. Nothing here is checked for being a real phone
 * number or a real frequency: people write these the way they need to read them.
 */

export type ContactKind = "person" | "organisation";

/** A phone number, an email address or a web address, with the word that says which one it is ("mobile", "work"). */
export interface ContactValue {
  value: string;
  label: string;
}

export interface ContactAddress {
  label: string;
  /** House and street, on as many lines as it takes. A post office box or flat number is a line of it. */
  street: string;
  locality: string;
  region: string;
  postcode: string;
  country: string;
}

/** Someone connected to the contact: "partner: Maya Okafor". */
export interface ContactRelated {
  name: string;
  label: string;
}

/** One frequency to try, and how: "145.500 MHz", "FM, on the hour". Both are plain text. */
export interface ContactChannel {
  frequency: string;
  mode: string;
}

export interface ContactName {
  prefix: string;
  given: string;
  additional: string;
  family: string;
  suffix: string;
}

/** Everything a person types for a contact. */
export interface ContactFields {
  kind: ContactKind;
  name: ContactName;
  nickname: string;
  organisation: string;
  department: string;
  title: string;
  phones: ContactValue[];
  emails: ContactValue[];
  addresses: ContactAddress[];
  links: ContactValue[];
  related: ContactRelated[];
  /** As written in the card it came from: "1984-03-09", or "--03-09" when the year is not known. */
  birthday: string;
  note: string;
  tags: string[];
  /** Listed first, and printed on the emergency sheet. */
  isEmergency: boolean;
  /** One line for the emergency sheet: who this is when it matters. "Has a spare key and a generator." */
  emergencyNote: string;
  callsign: string;
  channels: ContactChannel[];
}

export const CONTACT_LIMITS = {
  /** Contacts one Outpost holds. */
  contacts: 20_000,
  /** Phones, emails, addresses, links, related names or frequencies on one contact, each. */
  values: 30,
  tags: 30,
  linkedPages: 20,
  name: 200,
  value: 300,
  label: 60,
  note: 20_000,
  /** A vCard file: an iPhone's export carries a photo with every contact that has one. */
  fileBytes: 50 * 1024 * 1024,
  /** Cards read from one file. */
  cards: 20_000,
} as const;

/** The labels offered for a phone number. Any other word can be typed. */
export const PHONE_LABELS = ["mobile", "home", "work", "main", "satellite", "home fax", "work fax", "pager", "other"] as const;
export const EMAIL_LABELS = ["home", "work", "other"] as const;
export const ADDRESS_LABELS = ["home", "work", "meeting point", "other"] as const;
export const LINK_LABELS = ["website", "home", "work", "other"] as const;

export const emptyContactFields = (): ContactFields => ({
  kind: "person",
  name: { prefix: "", given: "", additional: "", family: "", suffix: "" },
  nickname: "",
  organisation: "",
  department: "",
  title: "",
  phones: [],
  emails: [],
  addresses: [],
  links: [],
  related: [],
  birthday: "",
  note: "",
  tags: [],
  isEmergency: false,
  emergencyNote: "",
  callsign: "",
  channels: [],
});

/** The name a contact is listed under: the person's name as said aloud, or else the organisation, a nickname, a number. */
export function contactDisplayName(fields: ContactFields): string {
  const { name } = fields;
  const personal = [name.prefix, name.given, name.additional, name.family, name.suffix]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  if (fields.kind === "organisation" && fields.organisation.trim()) return fields.organisation.trim();
  return (
    personal ||
    fields.organisation.trim() ||
    fields.nickname.trim() ||
    fields.callsign.trim() ||
    fields.emails[0]?.value.trim() ||
    fields.phones[0]?.value.trim() ||
    "No name"
  );
}

/** An address on as few lines as it has parts. */
export function addressLines(address: ContactAddress): string[] {
  const lines = address.street
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const town = [address.locality.trim(), address.region.trim()].filter(Boolean).join(", ");
  const last = [town, address.postcode.trim()].filter(Boolean).join(" ");
  if (last) lines.push(last);
  if (address.country.trim()) lines.push(address.country.trim());
  return lines;
}

/**
 * A phone number as a `tel:` or `sms:` address takes it: digits, with a leading plus
 * kept. Null when there is nothing to dial (a number written as words, say).
 */
export function dialable(value: string): string | null {
  const trimmed = value.trim();
  // An extension is dialled by hand; what comes before it is the number.
  const main = trimmed.split(/(?:ext\.?|extension|x)\s*\d+\s*$/i)[0] ?? trimmed;
  const digits = main.replace(/[^\d*#]/g, "");
  if (digits.length < 3) return null;
  return `${main.trimStart().startsWith("+") ? "+" : ""}${digits}`;
}

/** A page of notes a contact points at. */
export interface ContactPageLink {
  id: string;
  title: string;
  icon: string | null;
}

/** The saved place on the map a contact points at. */
export interface ContactPlaceLink {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export type ContactSource = "manual" | "file" | "picker";

export interface ContactDto extends ContactFields {
  id: string;
  displayName: string;
  /** The saved place it is linked to. Null when there is none, or it has since been removed from the map. */
  place: ContactPlaceLink | null;
  pages: ContactPageLink[];
  /**
   * Fields that came with the contact from a phone or a file and have no place on the
   * screen: other dates, messaging names, a phonetic spelling. They are kept and exported.
   */
  otherFields: string[];
  source: ContactSource;
  createdAt: number;
  updatedAt: number;
}

/** A contact as the list shows it. */
export interface ContactSummary {
  id: string;
  kind: ContactKind;
  displayName: string;
  /** What to file it under: the first letter of the family name, or of the organisation. */
  initial: string;
  /** Organisation and title for a person; empty for an organisation. */
  detail: string;
  phones: ContactValue[];
  emails: ContactValue[];
  tags: string[];
  isEmergency: boolean;
  emergencyNote: string;
  callsign: string;
}

export interface ContactListResponse {
  contacts: ContactSummary[];
  /** How many match, which may be more than were sent. */
  total: number;
  /** How many there are in all, whatever was asked for. */
  all: number;
  emergency: number;
  tags: Array<{ name: string; count: number }>;
}

/** What is sent to make a contact or change one. Anything left out of a change stays as it is. */
export type ContactInput = Partial<ContactFields> & {
  /** The saved place to link, or null for none. */
  markerId?: string | null;
  /** The pages of notes to link, in order. */
  pageIds?: string[];
};

export interface ContactPatch extends ContactInput {
  /** `updatedAt` of the contact as it was read. A change made since then is not overwritten. */
  baseUpdatedAt?: number;
}

// ── Bringing contacts in ────────────────────────────────────────────────────

/**
 * What to do with a contact from a file that looks like one already here.
 *  - `keep`: leave Outpost's as it is and do not bring this one in (the default).
 *  - `merge`: add what the file has that Outpost's lacks; nothing of Outpost's is removed or replaced.
 *  - `replace`: Outpost's becomes the file's.
 *  - `both`: bring it in as a contact of its own.
 */
export type ContactImportChoice = "keep" | "merge" | "replace" | "both";

export type ContactImportMatchReason = "same-card" | "name-and-number" | "name";

/** One line of a side-by-side comparison. `differs` marks what is not the same on both sides. */
export interface ContactCompareLine {
  label: string;
  here: string[];
  incoming: string[];
  differs: boolean;
}

export interface ContactImportDuplicate {
  /** Position of the card in the file, from 0: how a choice names it. */
  index: number;
  displayName: string;
  existing: { id: string; displayName: string };
  reason: ContactImportMatchReason;
  lines: ContactCompareLine[];
  /** What merging would add to Outpost's contact, in words: "1 phone number, a note". */
  mergeAdds: string[];
}

export interface ContactImportPreview {
  /** Names the staged file in the request that carries it out. It is forgotten after half an hour, or a restart. */
  token: string;
  fileName: string;
  /** vCard versions met in the file, such as ["3.0"]. */
  versions: string[];
  cards: number;
  /** Contacts that are not here yet. */
  fresh: Array<{ index: number; displayName: string; detail: string }>;
  /** Already here, with everything the file has for them: nothing to do. */
  alreadyHere: number;
  /** The same card more than once in the file; one of each is read. */
  repeated: number;
  duplicates: ContactImportDuplicate[];
  /** Cards that could not be read, each with the reason. */
  unreadable: Array<{ position: number; reason: string }>;
  /** Pictures and other embedded files that were left out, in all. */
  photosLeftOut: number;
  /** Room left before the limit on contacts; fewer than `fresh` means not all can come in. */
  room: number;
}

export interface ContactImportApplyRequest {
  token: string;
  /** For duplicates, by card index. Any not named are kept as Outpost has them. */
  choices?: Record<string, ContactImportChoice>;
  /** New contacts not to bring in, by card index. */
  leaveOut?: number[];
}

export interface ContactImportResult {
  added: number;
  merged: number;
  replaced: number;
  /** Duplicates left as Outpost had them. */
  kept: number;
  alreadyHere: number;
  leftOut: number;
  /** Not brought in because Outpost holds as many contacts as it will. */
  overLimit: number;
}

/** One person chosen in the phone's own contact picker (the browser's Contact Picker API). */
export interface PickedContact {
  name?: string[];
  tel?: string[];
  email?: string[];
  address?: Array<{
    addressLine?: string[];
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  }>;
}

// ── Phones that subscribe to the address book ───────────────────────────────

export interface ContactsPhoneStatus {
  /** The setting: whether phones may read the address book over CardDAV. */
  enabled: boolean;
  /** Set where it is not offered at all: on a portable drive, which only its own computer can reach. */
  unavailable: "portable" | null;
  /** Other devices can reach this Outpost at all. */
  lanAccess: boolean;
  /** The user name to type on the phone. It is not a secret, and there is no password to keep. */
  userName: string;
  /** Where the address book is on this server: what follows the host and port in the address a phone is given. */
  path: string;
  contacts: number;
}
