/** Contacts: the requests the screens make, and the small things they all need to say the same way. */
import type {
  ContactDto,
  ContactImportApplyRequest,
  ContactImportPreview,
  ContactImportResult,
  ContactInput,
  ContactListResponse,
  ContactPatch,
  ContactsPhoneStatus,
  PickedContact,
} from "@outpost/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** How many contacts the list asks for at a time. */
export const LIST_STEP = 300;

export interface ListFilter {
  q: string;
  tag: string;
  limit: number;
}

export const useContactList = (filter: ListFilter) =>
  useQuery({
    queryKey: ["contacts", "list", filter],
    queryFn: ({ signal }) => api.get<ContactListResponse>("/api/contacts", { q: filter.q, tag: filter.tag, limit: filter.limit }, signal),
    placeholderData: keepPreviousData,
  });

export const useContact = (id: string | undefined) =>
  useQuery({
    queryKey: ["contacts", "one", id],
    queryFn: () => api.get<{ contact: ContactDto }>(`/api/contacts/${id}`).then((data) => data.contact),
    enabled: Boolean(id),
  });

export const useEmergencyContacts = () =>
  useQuery({
    queryKey: ["contacts", "emergency"],
    queryFn: () => api.get<{ contacts: ContactDto[] }>("/api/contacts/emergency").then((data) => data.contacts),
  });

export const usePhoneStatus = () =>
  useQuery({ queryKey: ["contacts", "phones"], queryFn: () => api.get<ContactsPhoneStatus>("/api/contacts/phones") });

export function useSaveContact(id: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ContactInput | ContactPatch) =>
      (id
        ? api.patch<{ contact: ContactDto }>(`/api/contacts/${id}`, input)
        : api.post<{ contact: ContactDto }>("/api/contacts", input)
      ).then((data) => data.contact),
    onSuccess: (contact) => {
      client.setQueryData(["contacts", "one", contact.id], contact);
      return client.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useRemoveContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/contacts/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export const previewFile = (file: File) => {
  const form = new FormData();
  form.append("file", file, file.name);
  return api.upload<ContactImportPreview>("/api/contacts/import/preview", form);
};
export const previewPicked = (picked: PickedContact[]) => api.post<ContactImportPreview>("/api/contacts/import/preview", { picked });
export const applyImport = (request: ContactImportApplyRequest) => api.post<ContactImportResult>("/api/contacts/import/apply", request);
export const discardImport = (token: string) => api.delete(`/api/contacts/import/${encodeURIComponent(token)}`);

/** The address of a vCard file of some or all contacts. A plain link, so that a phone's browser hands it to its contacts app. */
export function exportHref(selection: { ids?: string[]; emergency?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (selection.ids?.length) params.set("ids", selection.ids.join(","));
  if (selection.emergency) params.set("emergency", "1");
  const query = params.toString();
  return `/api/contacts/export.vcf${query ? `?${query}` : ""}`;
}

/** A label as it is shown: what was typed, or the plain word for the kind of thing when nothing was. */
export const labelOr = (label: string, fallback: string): string => label.trim() || fallback;

/** A birthday as words: "9 March 1984", or "9 March" when the year is not known. Anything else is shown as written. */
export function birthdayWords(value: string): string {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const short = /^--(\d{2})-(\d{2})$/.exec(value);
  const parts = full ? [full[1]!, full[2]!, full[3]!] : short ? ["2000", short[1]!, short[2]!] : null;
  if (!parts) return value;
  const date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", ...(full ? { year: "numeric" } : {}), timeZone: "UTC" }).format(
    date,
  );
}

/** Only web addresses become links. Anything else a card called a link is shown as the text it is. */
export function safeWebHref(value: string): string | null {
  const text = value.trim();
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(text) ? `https://${text}` : "";
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** An email address fit for a `mailto:` link, or null when the text is not one. */
export const mailHref = (value: string): string | null =>
  /^[^\s@<>"]+@[^\s@<>"]+$/.test(value.trim()) ? `mailto:${encodeURI(value.trim())}` : null;

// ── The browser's contact picker ────────────────────────────────────────────

type PickerProperty = "name" | "tel" | "email" | "address";
interface ContactsManager {
  getProperties(): Promise<string[]>;
  select(properties: string[], options?: { multiple?: boolean }): Promise<PickedContact[]>;
}

/**
 * Whether this browser can hand over contacts a person picks. Only Chrome on Android
 * can today, and only to a page opened over https; where it could with https and the
 * page is on plain http, that is said, because the fix is in Settings.
 */
export function pickerSupport(): "available" | "needs-https" | "unsupported" {
  const manager = (navigator as Navigator & { contacts?: ContactsManager }).contacts;
  if (manager && typeof manager.select === "function" && "ContactsManager" in window) return "available";
  const agent = navigator.userAgent;
  const androidChrome = /Android/.test(agent) && /Chrome\//.test(agent) && !/Firefox|SamsungBrowser/.test(agent);
  return androidChrome && !window.isSecureContext ? "needs-https" : "unsupported";
}

/** Opens the phone's own picker. Resolves with what the person chose; an empty list when they chose nobody. */
export async function pickFromPhone(): Promise<PickedContact[]> {
  const manager = (navigator as Navigator & { contacts?: ContactsManager }).contacts;
  if (!manager) return [];
  const wanted: PickerProperty[] = ["name", "tel", "email", "address"];
  const offered = await manager.getProperties();
  const picked = await manager.select(
    wanted.filter((property) => offered.includes(property)),
    { multiple: true },
  );
  // Only the plain values are kept: an address arrives as an object with methods of its own.
  return picked.map((person) => ({
    name: person.name,
    tel: person.tel,
    email: person.email,
    address: person.address?.map((address) => ({
      addressLine: address.addressLine,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      country: address.country,
    })),
  }));
}
