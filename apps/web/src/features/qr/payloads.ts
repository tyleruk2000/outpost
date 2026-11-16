/**
 * What goes inside a code, for each kind of thing a phone knows what to do with, and
 * the same thing said in words for under the code and on the printed sheet.
 *
 * The forms are the ones phone camera apps read, as written down by the ZXing project
 * ("Barcode Contents", github.com/zxing/zxing/wiki/Barcode-Contents, read 16 November
 * 2026): a web address as it is, `tel:`, `mailto:`, `geo:`, a contact as a vCard, and a
 * Wi-Fi network as `WIFI:T:WPA;S:name;P:password;H:true;;`.
 *
 * Everything here is pure: text in, text out. Nothing is stored or sent.
 */

export type WifiSecurity = "WPA" | "WEP" | "nopass";

export interface WifiInput {
  ssid: string;
  security: WifiSecurity;
  password: string;
  hidden: boolean;
}

/**
 * A field of a Wi-Fi code. From the ZXing page: "Special characters `\`, `;`, `,`, `"`
 * and `:` should be escaped with a backslash (`\`) as in MECARD encoding."
 */
export function escapeWifi(value: string): string {
  return value.replace(/([\\;,":])/g, "\\$1");
}

/**
 * The Wi-Fi code. `T` is left out for an open network, as is `P`; `H:true` only for a
 * network that does not announce its name. WPA covers WPA2 and WPA3 personal: phones
 * read "WPA" as "a password-protected network" and work out the rest when they join.
 */
export function wifiPayload(input: WifiInput): string {
  const parts = [];
  if (input.security !== "nopass") parts.push(`T:${input.security}`);
  else parts.push("T:nopass");
  parts.push(`S:${escapeWifi(input.ssid)}`);
  if (input.security !== "nopass") parts.push(`P:${escapeWifi(input.password)}`);
  if (input.hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}

export const WIFI_SECURITY_WORDS: Record<WifiSecurity, string> = {
  WPA: "WPA, WPA2 or WPA3 (most home networks)",
  WEP: "WEP (old)",
  nopass: "No password",
};

// ── Contacts ─────────────────────────────────────────────────────────────────

/**
 * Text in a vCard value, escaped as Outpost's own vCard writer escapes it
 * (`escapeText` in apps/server/src/modules/contacts/vcard.ts, RFC 2426 section 4):
 * backslash, line break, comma and semicolon. Kept the same here so that a code and an
 * exported file say a contact the same way; this copy runs in the browser, so that
 * what is typed here never goes to the server.
 */
export function escapeVcard(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export interface QrContact {
  /** As it should be shown: "Maya Okafor". */
  fullName: string;
  given: string;
  family: string;
  organisation: string;
  title: string;
  phones: Array<{ value: string; label: string }>;
  emails: Array<{ value: string; label: string }>;
  /** One line each, already joined: "4 Mill Lane, Keswick, CA12 4AB". */
  addresses: Array<{ value: string; label: string }>;
  links: string[];
  note: string;
}

export const emptyQrContact = (): QrContact => ({
  fullName: "",
  given: "",
  family: "",
  organisation: "",
  title: "",
  phones: [],
  emails: [],
  addresses: [],
  links: [],
  note: "",
});

const PHONE_TYPES: Record<string, string> = { mobile: "CELL", home: "HOME", work: "WORK" };
const PLAIN_TYPES: Record<string, string> = { home: "HOME", work: "WORK" };
const typeOf = (table: Record<string, string>, label: string) => {
  const type = Object.hasOwn(table, label.trim().toLowerCase()) ? table[label.trim().toLowerCase()] : undefined;
  return type ? `;TYPE=${type}` : "";
};

/**
 * A vCard 3.0 of the fields given, and nothing else: no PRODID, UID or REV, which a phone
 * does not need and which would make the code larger. Lines are not folded (a code has
 * no line length) and end in CRLF as the format asks.
 */
export function vcardPayload(contact: QrContact): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  const fullName =
    contact.fullName.trim() || [contact.given, contact.family].filter((part) => part.trim()).join(" ") || contact.organisation;
  lines.push(`N:${escapeVcard(contact.family.trim())};${escapeVcard(contact.given.trim())};;;`);
  lines.push(`FN:${escapeVcard(fullName.trim())}`);
  if (contact.organisation.trim()) lines.push(`ORG:${escapeVcard(contact.organisation.trim())}`);
  if (contact.title.trim()) lines.push(`TITLE:${escapeVcard(contact.title.trim())}`);
  for (const phone of contact.phones)
    if (phone.value.trim()) lines.push(`TEL${typeOf(PHONE_TYPES, phone.label)}:${escapeVcard(phone.value.trim())}`);
  for (const email of contact.emails)
    if (email.value.trim()) lines.push(`EMAIL${typeOf(PLAIN_TYPES, email.label)}:${escapeVcard(email.value.trim())}`);
  for (const address of contact.addresses) {
    if (!address.value.trim()) continue;
    // The whole address goes in the street part: the code carries it as written, without guessing which part is the town.
    lines.push(`ADR${typeOf(PLAIN_TYPES, address.label)}:;;${escapeVcard(address.value.trim())};;;;`);
  }
  for (const link of contact.links) if (link.trim()) lines.push(`URL:${escapeVcard(link.trim())}`);
  if (contact.note.trim()) lines.push(`NOTE:${escapeVcard(contact.note.trim())}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

// ── Small ones ───────────────────────────────────────────────────────────────

/**
 * `tel:` with the number as written, less spaces and the characters a dialler cannot use.
 * A "(0)" written after a country code ("+44 (0)17687 …") is a reminder for callers at
 * home and is not dialled from abroad, so it goes.
 */
export function telPayload(number: string): string {
  return `tel:${number.replace(/\(0\)/g, "").replace(/[^0-9+*#,;]/g, "")}`;
}

/** `mailto:` with the address. A subject or body is not offered: the code is for the address. */
export function mailtoPayload(address: string): string {
  return `mailto:${address.trim()}`;
}

/** `geo:` (RFC 5870) with latitude and longitude to six decimal places, about 10 cm. */
export function geoPayload(lat: number, lon: number): string {
  return `geo:${lat.toFixed(6)},${lon.toFixed(6)}`;
}

export const isPhoneNumber = (value: string) => /[0-9]{3,}/.test(value.replace(/[\s()-]/g, ""));
export const isEmailAddress = (value: string) => /^[^\s@]+@[^\s@]+$/.test(value.trim());
