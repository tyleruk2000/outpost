/**
 * What a code holds, as the screen keeps it while a person types, and the three things
 * made from it: the text inside the code, a title for the files, and the same thing in
 * plain words for under the code and on the printed sheet.
 *
 * Held in the page's memory only. Nothing here is stored, sent or put in the address.
 */
import { EC_RECOVERY, type EcLevel, type QrCode } from "./encoder";
import {
  geoPayload,
  isEmailAddress,
  isPhoneNumber,
  mailtoPayload,
  type QrContact,
  telPayload,
  vcardPayload,
  WIFI_SECURITY_WORDS,
  type WifiInput,
  wifiPayload,
} from "./payloads";

export type QrKind = "text" | "wifi" | "contact" | "phone" | "email" | "place";

export const KIND_LABELS: Record<QrKind, string> = {
  text: "Text or a web address",
  wifi: "Wi-Fi network",
  contact: "Contact",
  phone: "Phone number",
  email: "Email address",
  place: "Saved place",
};

export type QrContent =
  | { kind: "text"; text: string }
  | { kind: "wifi"; wifi: WifiInput }
  | { kind: "contact"; contact: QrContact }
  | { kind: "phone"; number: string }
  | { kind: "email"; address: string }
  | { kind: "place"; name: string; lat: number; lon: number };

export interface Described {
  /** The text the code holds. */
  payload: string;
  /** What the files are called and the library lists it as. */
  title: string;
  /** The sheet's heading: what a person sees the code is for. */
  heading: string;
  /** What is in it, a line each. */
  lines: Array<{ label: string; value: string }>;
  /** What a phone does with it, in a sentence. */
  action: string;
}

const short = (text: string, length = 48) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > length ? `${line.slice(0, length - 1).trimEnd()}…` : line;
};

/** A web address a phone will open: http or https, and nothing else. */
export function webAddress(text: string): URL | null {
  const trimmed = text.trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

/** Why there is nothing to encode yet, or null when there is. */
export function missing(content: QrContent): string | null {
  switch (content.kind) {
    case "text":
      return content.text.trim() ? null : "Type the text or web address to put in the code.";
    case "wifi":
      if (!content.wifi.ssid) return "Type the network’s name, exactly as it appears in a phone’s list of networks.";
      if (content.wifi.security !== "nopass" && !content.wifi.password) return "Type the network’s password, or choose “No password”.";
      return null;
    case "contact":
      return content.contact.fullName.trim() ||
        content.contact.given.trim() ||
        content.contact.family.trim() ||
        content.contact.organisation.trim()
        ? null
        : "Give the contact a name.";
    case "phone":
      return isPhoneNumber(content.number) ? null : "Type a phone number.";
    case "email":
      return isEmailAddress(content.address) ? null : "Type an email address, with an @ in it.";
    case "place":
      return null;
  }
}

/**
 * The code's contents in words. A Wi-Fi password is written out only when the person
 * has asked for it to be (`showPassword`); otherwise it is said to be in the code.
 */
export function describe(content: QrContent, options: { showPassword: boolean }): Described {
  switch (content.kind) {
    case "text": {
      const url = webAddress(content.text);
      return url
        ? {
            payload: content.text.trim(),
            title: `QR code for ${url.host}`,
            heading: url.host,
            lines: [{ label: "Web address", value: content.text.trim() }],
            action: "A phone offers to open the web address.",
          }
        : {
            payload: content.text,
            title: `QR code: ${short(content.text, 40)}`,
            heading: short(content.text),
            lines: [{ label: "Text", value: content.text }],
            action: "A phone shows the text, and offers to copy it.",
          };
    }
    case "wifi": {
      const { wifi } = content;
      const lines = [
        { label: "Network", value: wifi.ssid },
        { label: "Security", value: WIFI_SECURITY_WORDS[wifi.security] },
      ];
      if (wifi.security !== "nopass")
        lines.push({ label: "Password", value: options.showPassword ? wifi.password : "in the code, not written here" });
      if (wifi.hidden) lines.push({ label: "Hidden", value: "the network does not announce its name" });
      return {
        payload: wifiPayload(wifi),
        title: `Wi-Fi code for ${short(wifi.ssid, 40)}`,
        heading: `Wi-Fi: ${wifi.ssid}`,
        lines,
        action: "A phone offers to join the network, without anyone typing the password.",
      };
    }
    case "contact": {
      const { contact } = content;
      const name =
        contact.fullName.trim() || [contact.given, contact.family].filter((part) => part.trim()).join(" ") || contact.organisation.trim();
      const lines = [{ label: "Name", value: name }];
      if (contact.organisation.trim() && contact.organisation.trim() !== name)
        lines.push({ label: "Organisation", value: [contact.organisation, contact.title].filter((part) => part.trim()).join(", ") });
      else if (contact.title.trim()) lines.push({ label: "Title", value: contact.title });
      for (const phone of contact.phones)
        if (phone.value.trim()) lines.push({ label: phone.label ? `Phone (${phone.label})` : "Phone", value: phone.value });
      for (const email of contact.emails)
        if (email.value.trim()) lines.push({ label: email.label ? `Email (${email.label})` : "Email", value: email.value });
      for (const address of contact.addresses)
        if (address.value.trim()) lines.push({ label: address.label ? `Address (${address.label})` : "Address", value: address.value });
      for (const link of contact.links) if (link.trim()) lines.push({ label: "Web", value: link });
      if (contact.note.trim()) lines.push({ label: "Note", value: contact.note });
      return {
        payload: vcardPayload(contact),
        title: `Contact code for ${short(name, 40)}`,
        heading: name,
        lines,
        action: "A phone offers to add the contact to its address book.",
      };
    }
    case "phone":
      return {
        payload: telPayload(content.number),
        title: `QR code to call ${content.number.trim()}`,
        heading: content.number.trim(),
        lines: [{ label: "Phone", value: content.number.trim() }],
        action: "A phone offers to call the number. It does not call by itself.",
      };
    case "email":
      return {
        payload: mailtoPayload(content.address),
        title: `QR code to email ${content.address.trim()}`,
        heading: content.address.trim(),
        lines: [{ label: "Email", value: content.address.trim() }],
        action: "A phone offers to write an email to the address.",
      };
    case "place": {
      const position = `${content.lat.toFixed(5)}, ${content.lon.toFixed(5)}`;
      return {
        payload: geoPayload(content.lat, content.lon),
        title: `QR code for ${short(content.name, 40)}`,
        heading: content.name,
        lines: [
          { label: "Place", value: content.name },
          { label: "Position", value: position },
        ],
        action: "A phone offers to show the position in its maps app. The place’s name is not in the code.",
      };
    }
  }
}

/** Whether "Add to library" should ask first, and why: someone else's details, or a secret. */
export function sensitive(kind: QrKind): "secret" | "people" | null {
  return kind === "wifi" ? "secret" : kind === "contact" ? "people" : null;
}

// ── Size ─────────────────────────────────────────────────────────────────────

/** Reading distance the size is worked out for: a phone held at arm's length. */
export const ARM_LENGTH_CM = 50;
/**
 * The rule of thumb for how large to print: the code (without its margin) about a tenth
 * as wide as the distance it is read from. It is not in the standard, which leaves size
 * to the reader's optics; it is what QR code publishers give (Bitly, "What's the minimum
 * size for a QR code?"; Scanova, "QR code scanning distance"; both read 16 November 2026).
 */
export const DISTANCE_RATIO = 10;

export function printAdvice(code: QrCode): { minimumCm: number; sentence: string } {
  const minimumCm = ARM_LENGTH_CM / DISTANCE_RATIO;
  const denser = code.size > 45;
  return {
    minimumCm,
    sentence:
      `Print it at least ${minimumCm} cm wide, not counting the white margin, for a phone to read it from arm’s length (about ${ARM_LENGTH_CM} cm). ` +
      `That is a rule of thumb, a tenth of the distance, not part of the standard.${denser ? " This code has many squares: give it more room, or put less in it, if a phone struggles." : ""}`,
  };
}

export const EC_WORDS: Record<EcLevel, string> = {
  L: `Low: about ${EC_RECOVERY.L} of the code can be lost and it still reads. The smallest code.`,
  M: `Medium: about ${EC_RECOVERY.M} can be lost. Right for most codes.`,
  Q: `Quartile: about ${EC_RECOVERY.Q} can be lost. For a code that will get dirty or worn.`,
  H: `High: about ${EC_RECOVERY.H} can be lost. The largest code, for a sheet left outdoors.`,
};
