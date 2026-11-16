/**
 * Contacts: what is kept, how it is listed and found, and how contacts come in from a
 * file or a phone and go out again.
 *
 * Two rules run through this file.
 *
 * Nothing changes a contact but a person saying so. A change made on the screen names
 * the version it was made from, and is refused if the contact has changed since. A
 * file that is brought in adds the contacts that are new and leaves every other one
 * alone: a contact that looks like one already here is shown beside it, and is merged,
 * replaced or added only when chosen, one contact at a time.
 *
 * Everything in a contact is text. Nothing is fetched, run or looked up because a
 * contact says so, and a number or an address is never checked against anything.
 */
import {
  CONTACT_LIMITS,
  type ContactDto,
  type ContactFields,
  type ContactImportApplyRequest,
  type ContactImportChoice,
  type ContactImportPreview,
  type ContactImportResult,
  type ContactListResponse,
  type ContactSource,
  type ContactSummary,
  contactDisplayName,
  emptyContactFields,
  type PickedContact,
} from "@outpost/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, conflict, notFound } from "../../core/errors.ts";
import { newId, randomToken, sha256Hex } from "../../core/ids.ts";
import { contactPages, contacts, contactTags, markers, notes } from "../../db/schema.ts";
import { type CardContact, contactFromCard, contactFromPicked, newUid, otherFieldsOf, vcardOf } from "./card.ts";
import { addsNothing, compareLines, createMatchIndex, describeAdditions, fold, type Known, mergeFields, replaceFields } from "./compare.ts";
import { parseVcards, VcardError } from "./vcard.ts";

type Row = typeof contacts.$inferSelect;

// ── What may be typed ───────────────────────────────────────────────────────

const L = CONTACT_LIMITS;
const oneLine = (max: number, what: string) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .refine((value) => value.length <= max, `${what} can be at most ${max} characters.`);
const lines = (max: number, what: string) =>
  z
    .string()
    .transform((value) => value.replace(/\r\n?/g, "\n").trim())
    .refine((value) => value.length <= max, `${what} can be at most ${max.toLocaleString("en-GB")} characters.`);
const list = <T extends z.ZodType>(item: T, what: string, max: number = L.values) =>
  z.array(item).max(max, `A contact can have at most ${max} ${what}.`);
const labelled = (what: string) =>
  z
    .object({ value: oneLine(L.value, what), label: oneLine(L.label, "A label").default("") })
    .refine((entry) => entry.value !== "", `${what} is empty.`);

export const contactFieldsSchema = z.object({
  kind: z.enum(["person", "organisation"]),
  name: z.object({
    prefix: oneLine(L.name, "A name"),
    given: oneLine(L.name, "A name"),
    additional: oneLine(L.name, "A name"),
    family: oneLine(L.name, "A name"),
    suffix: oneLine(L.name, "A name"),
  }),
  nickname: oneLine(L.name, "A nickname"),
  organisation: oneLine(L.name, "An organisation's name"),
  department: oneLine(L.name, "A department"),
  title: oneLine(L.name, "A title"),
  phones: list(labelled("A phone number"), "phone numbers"),
  emails: list(labelled("An email address"), "email addresses"),
  addresses: list(
    z.object({
      label: oneLine(L.label, "A label").default(""),
      street: lines(L.value, "A street address"),
      locality: oneLine(L.value, "A town"),
      region: oneLine(L.value, "A region"),
      postcode: oneLine(L.label, "A postcode"),
      country: oneLine(L.value, "A country"),
    }),
    "addresses",
  ),
  links: list(labelled("A link"), "links"),
  related: list(z.object({ name: oneLine(L.name, "A name"), label: oneLine(L.label, "A label").default("") }), "related names"),
  birthday: oneLine(40, "A birthday"),
  note: lines(L.note, "A note"),
  tags: list(oneLine(L.label, "A tag"), "tags", L.tags),
  isEmergency: z.boolean(),
  emergencyNote: oneLine(L.value, "The emergency note"),
  callsign: oneLine(L.label, "A callsign"),
  channels: list(z.object({ frequency: oneLine(L.label, "A frequency"), mode: oneLine(L.value, "A mode") }), "frequencies"),
});

const links = {
  markerId: z.string().min(1).max(64).nullable().optional(),
  pageIds: z.array(z.string().min(1).max(64)).max(L.linkedPages, `A contact can link to at most ${L.linkedPages} pages.`).optional(),
};
export const contactCreateSchema = contactFieldsSchema.partial().extend(links);
export const contactPatchSchema = contactCreateSchema.extend({ baseUpdatedAt: z.number().optional() });

/** Blank rows and repeated tags are dropped; nothing else is altered. */
function tidy(fields: ContactFields): ContactFields {
  const tags: string[] = [];
  for (const tag of fields.tags) if (tag && !tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  return {
    ...fields,
    addresses: fields.addresses.filter(
      (address) => address.street || address.locality || address.region || address.postcode || address.country,
    ),
    related: fields.related.filter((related) => related.name),
    channels: fields.channels.filter((channel) => channel.frequency || channel.mode),
    tags,
  };
}

const hasSomething = (fields: ContactFields): boolean =>
  contactDisplayName(fields) !== "No name" || fields.addresses.length > 0 || fields.note !== "" || fields.channels.length > 0;

// ── What is worked out from the fields ──────────────────────────────────────

function derive(fields: ContactFields): { displayName: string; sortKey: string; searchText: string } {
  const displayName = contactDisplayName(fields);
  const { name } = fields;
  const personal = fields.kind === "person" ? fold([name.family, name.given, name.additional].join(" ")) : "";
  const sortKey = (personal || fold(displayName) || "~").slice(0, 300);
  const words = [
    displayName,
    fields.nickname,
    fields.organisation,
    fields.department,
    fields.title,
    ...fields.emails.map((email) => email.value),
    ...fields.phones.map((phone) => phone.label),
    ...fields.addresses.flatMap((address) => [address.street, address.locality, address.region, address.postcode, address.country]),
    ...fields.related.map((related) => related.name),
    ...fields.tags,
    fields.callsign,
    ...fields.channels.flatMap((channel) => [channel.frequency, channel.mode]),
    fields.emergencyNote,
    fields.note.slice(0, 4000),
  ];
  // Numbers are found by their digits however they were spaced, and emails by the address as written.
  const digits = fields.phones.map((phone) => phone.value.replace(/\D/g, "")).filter(Boolean);
  const emails = fields.emails.map((email) => email.value.toLowerCase());
  const frequencies = fields.channels.map((channel) => channel.frequency.toLowerCase().replace(/\s+/g, ""));
  return { displayName, sortKey, searchText: [fold(words.join(" ")), ...digits, ...emails, ...frequencies].join(" ") };
}

const initialOf = (sortKey: string): string => {
  const first = sortKey.slice(0, 1).toUpperCase();
  return /\p{L}/u.test(first) ? first : "#";
};

/** Reads what is stored into the shape the rest of the code relies on, whatever a restored or older database holds. */
function fieldsFrom(data: unknown, tags: string[]): ContactFields {
  const stored = (data && typeof data === "object" ? data : {}) as Partial<ContactFields>;
  const empty = emptyContactFields();
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const rows = <T>(value: unknown, read: (item: Record<string, unknown>) => T): T[] =>
    Array.isArray(value)
      ? value.filter((item) => item && typeof item === "object").map((item) => read(item as Record<string, unknown>))
      : [];
  const valueRows = (value: unknown) => rows(value, (item) => ({ value: text(item.value), label: text(item.label) }));
  const name = (stored.name ?? {}) as Record<string, unknown>;
  return {
    ...empty,
    kind: stored.kind === "organisation" ? "organisation" : "person",
    name: {
      prefix: text(name.prefix),
      given: text(name.given),
      additional: text(name.additional),
      family: text(name.family),
      suffix: text(name.suffix),
    },
    nickname: text(stored.nickname),
    organisation: text(stored.organisation),
    department: text(stored.department),
    title: text(stored.title),
    phones: valueRows(stored.phones),
    emails: valueRows(stored.emails),
    addresses: rows(stored.addresses, (item) => ({
      label: text(item.label),
      street: text(item.street),
      locality: text(item.locality),
      region: text(item.region),
      postcode: text(item.postcode),
      country: text(item.country),
    })),
    links: valueRows(stored.links),
    related: rows(stored.related, (item) => ({ name: text(item.name), label: text(item.label) })),
    birthday: text(stored.birthday),
    note: text(stored.note),
    tags,
    isEmergency: stored.isEmergency === true,
    emergencyNote: text(stored.emergencyNote),
    callsign: text(stored.callsign),
    channels: rows(stored.channels, (item) => ({ frequency: text(item.frequency), mode: text(item.mode) })),
  };
}

const extraLines = (extra: string): string[] => extra.split("\n").filter((line) => line.trim());

// ── Staged imports ──────────────────────────────────────────────────────────

interface StagedCard {
  index: number;
  card: CardContact;
  state: "fresh" | "duplicate";
  /** For a duplicate: the contact it looked like when the file was read. */
  existingId?: string;
}

interface Staged {
  token: string;
  source: ContactSource;
  at: number;
  cards: StagedCard[];
  alreadyHere: number;
}

const STAGED_FOR = 30 * 60 * 1000;
const STAGED_AT_ONCE = 4;
const pause = () => new Promise<void>((resolve) => setImmediate(resolve));

export interface ListQuery {
  q?: string;
  tag?: string;
  emergency?: boolean;
  limit: number;
  offset: number;
}

export interface ExportSelection {
  ids?: string[];
  tag?: string;
  emergency?: boolean;
}

export interface ContactsService {
  list(query: ListQuery): ContactListResponse;
  get(id: string): ContactDto;
  create(input: z.infer<typeof contactCreateSchema>): ContactDto;
  update(id: string, patch: z.infer<typeof contactPatchSchema>): ContactDto;
  remove(id: string): void;
  /** The contacts marked for an emergency, whole, in the order the sheet prints them. */
  emergency(): ContactDto[];
  exportCards(selection: ExportSelection, version: "3.0" | "4.0"): { filename: string; body: string; count: number };
  previewFile(file: { name: string; bytes: Buffer }): Promise<ContactImportPreview>;
  previewPicked(picked: PickedContact[]): Promise<ContactImportPreview>;
  applyImport(request: ContactImportApplyRequest): Promise<ContactImportResult>;
  discardImport(token: string): void;
  count(): number;
  /** Removes every contact. Only "erase everything" calls it. */
  eraseAll(): number;
  /** Every contact as a phone is given it: a name for the card, and a fingerprint that changes when the card does. */
  cards(): Array<{ id: string; etag: string }>;
  card(id: string): { etag: string; body: string } | null;
}

declare module "../../core/context.ts" {
  interface Services {
    contacts: ContactsService;
  }
}

export function createContactsService(ctx: AppContext): ContactsService {
  const { db, sqlite } = ctx;
  const { search } = ctx.services;
  const staged = new Map<string, Staged>();
  /** Cards as last written out, by contact, so that a phone asking for the list does not make them all again. */
  const written = new Map<string, { updatedAt: number; etag: string; body: string }>();

  const changed = (id?: string) => ctx.events.publish({ type: "contacts.changed", id });

  const tagStatement = sqlite.prepare("SELECT name FROM contact_tags WHERE contact_id = ? ORDER BY name COLLATE NOCASE");
  const tagsOf = (id: string): string[] => (tagStatement.all(id) as Array<{ name: string }>).map((row) => row.name);

  function rowOf(id: string): Row {
    const row = db.select().from(contacts).where(eq(contacts.id, id)).get();
    if (!row) throw notFound("That contact");
    return row;
  }

  const count = (): number => db.select({ n: sql<number>`count(*)` }).from(contacts).get()?.n ?? 0;

  function toDto(row: Row): ContactDto {
    const fields = fieldsFrom(row.data, tagsOf(row.id));
    const place = row.markerId
      ? db
          .select({ id: markers.id, name: markers.name, lat: markers.lat, lon: markers.lon })
          .from(markers)
          .where(eq(markers.id, row.markerId))
          .get()
      : undefined;
    const linked = db
      .select({ noteId: contactPages.noteId })
      .from(contactPages)
      .where(eq(contactPages.contactId, row.id))
      .orderBy(contactPages.position)
      .all();
    const pages =
      linked.length === 0
        ? []
        : db
            .select({ id: notes.id, title: notes.title, icon: notes.icon })
            .from(notes)
            .where(
              and(
                inArray(
                  notes.id,
                  linked.map((link) => link.noteId),
                ),
                isNull(notes.trashedAt),
              ),
            )
            .all();
    const order = new Map(linked.map((link, index) => [link.noteId, index]));
    pages.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return {
      ...fields,
      id: row.id,
      displayName: row.displayName,
      place: place ?? null,
      pages: pages.map((page) => ({ id: page.id, title: page.title || "Untitled", icon: page.icon })),
      otherFields: otherFieldsOf(extraLines(row.extra)),
      source: row.source,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  function toSummary(row: Row, tags: string[]): ContactSummary {
    const fields = fieldsFrom(row.data, tags);
    return {
      id: row.id,
      kind: fields.kind,
      displayName: row.displayName,
      initial: initialOf(row.sortKey),
      detail: fields.kind === "person" ? [fields.title, fields.organisation].filter(Boolean).join(", ") : fields.department,
      phones: fields.phones,
      emails: fields.emails,
      tags,
      isEmergency: row.isEmergency,
      emergencyNote: fields.emergencyNote,
      callsign: fields.callsign,
    };
  }

  function index(row: Row, fields: ContactFields): void {
    const facts = [
      ...fields.phones.map((phone) => `${phone.label || "Phone"}: ${phone.value}`),
      ...fields.emails.map((email) => `${email.label || "Email"}: ${email.value}`),
      ...fields.addresses.map((address) =>
        [address.street, address.locality, address.region, address.postcode, address.country].filter(Boolean).join(", "),
      ),
      fields.callsign ? `Callsign: ${fields.callsign}` : "",
      ...fields.channels.map((channel) => [channel.frequency, channel.mode].filter(Boolean).join(" ")),
      fields.emergencyNote,
      fields.nickname,
    ].filter(Boolean);
    search.upsert({
      kind: "contact",
      entityId: row.id,
      title: row.displayName,
      subtitle:
        [fields.title, fields.kind === "person" ? fields.organisation : fields.department].filter(Boolean).join(", ") ||
        fields.phones[0]?.value ||
        null,
      collection: "Contacts",
      url: `/contacts/${row.id}`,
      tags: fields.tags,
      sections: [
        ...(facts.length > 0 ? [{ text: facts.join("\n") }] : []),
        ...(fields.note ? [{ heading: "Note", text: fields.note }] : []),
      ],
    });
  }

  function setTags(id: string, tags: string[]): void {
    db.delete(contactTags).where(eq(contactTags.contactId, id)).run();
    for (const name of tags) db.insert(contactTags).values({ contactId: id, name }).onConflictDoNothing().run();
  }

  function setPages(id: string, pageIds: string[]): void {
    const unique = [...new Set(pageIds)];
    if (unique.length > 0) {
      const found = db.select({ id: notes.id }).from(notes).where(inArray(notes.id, unique)).all();
      if (found.length !== unique.length) throw badRequest("One of those pages no longer exists. Choose the pages again.");
    }
    db.delete(contactPages).where(eq(contactPages.contactId, id)).run();
    for (const [position, noteId] of unique.entries()) db.insert(contactPages).values({ contactId: id, noteId, position }).run();
  }

  function checkMarker(markerId: string | null | undefined): void {
    if (!markerId) return;
    if (!db.select({ id: markers.id }).from(markers).where(eq(markers.id, markerId)).get()) {
      throw badRequest("That saved place is no longer on the map. Choose another.");
    }
  }

  /** Writes a contact, new or changed, with everything worked out from it. Call inside a transaction. */
  function write(
    id: string,
    fields: ContactFields,
    more: { uid: string; extra: string[]; source: ContactSource; markerId: string | null; createdAt: number; isNew: boolean },
  ): Row {
    const now = Date.now();
    const derived = derive(fields);
    const { tags, ...data } = fields;
    const values = {
      uid: more.uid,
      kind: fields.kind,
      displayName: derived.displayName,
      sortKey: derived.sortKey,
      data: data as Record<string, unknown>,
      searchText: derived.searchText,
      isEmergency: fields.isEmergency,
      markerId: more.markerId,
      extra: more.extra.join("\n"),
      source: more.source,
      updatedAt: now,
    };
    if (more.isNew)
      db.insert(contacts)
        .values({ id, ...values, createdAt: more.createdAt })
        .run();
    else db.update(contacts).set(values).where(eq(contacts.id, id)).run();
    setTags(id, tags);
    written.delete(id);
    const row = rowOf(id);
    index(row, fields);
    return row;
  }

  function assertRoom(adding: number): void {
    if (count() + adding > L.contacts) {
      throw conflict(`Outpost holds at most ${L.contacts.toLocaleString("en-GB")} contacts. Remove some before adding more.`);
    }
  }

  function cardOf(row: Row): { updatedAt: number; etag: string; body: string } {
    const cached = written.get(row.id);
    if (cached && cached.updatedAt === row.updatedAt) return cached;
    const body = vcardOf(
      { uid: row.uid, fields: fieldsFrom(row.data, tagsOf(row.id)), extra: extraLines(row.extra), updatedAt: row.updatedAt },
      "3.0",
    );
    const entry = { updatedAt: row.updatedAt, etag: sha256Hex(body).slice(0, 32), body };
    written.set(row.id, entry);
    return entry;
  }

  // ── Bringing contacts in ──

  function stage(
    source: ContactSource,
    fileName: string,
    cards: CardContact[],
    preview: Pick<ContactImportPreview, "versions" | "unreadable" | "photosLeftOut">,
  ): ContactImportPreview {
    const known: Known[] = db
      .select()
      .from(contacts)
      .all()
      .map((row) => ({ id: row.id, uid: row.uid, fields: fieldsFrom(row.data, tagsOf(row.id)) }));
    const matches = createMatchIndex(known);
    const result: ContactImportPreview = {
      token: randomToken(18),
      fileName,
      cards: cards.length + preview.unreadable.length,
      fresh: [],
      alreadyHere: 0,
      repeated: 0,
      duplicates: [],
      room: Math.max(0, L.contacts - known.length),
      ...preview,
    };
    const entry: Staged = { token: result.token, source, at: Date.now(), cards: [], alreadyHere: 0 };
    const seen = new Set<string>();
    cards.forEach((card, position) => {
      // The same card twice in one file is read once.
      const fingerprint = sha256Hex(JSON.stringify([card.fields, card.extra]));
      if (seen.has(fingerprint)) {
        result.repeated += 1;
        return;
      }
      seen.add(fingerprint);
      const match = matches.find(card.uid, card.fields);
      if (!match) {
        entry.cards.push({ index: position, card, state: "fresh" });
        const detail = [
          card.fields.organisation && card.fields.kind === "person" ? card.fields.organisation : "",
          card.fields.phones[0]?.value ?? card.fields.emails[0]?.value ?? "",
        ]
          .filter(Boolean)
          .join(", ");
        result.fresh.push({ index: position, displayName: contactDisplayName(card.fields), detail });
        return;
      }
      const merged = mergeFields(match.known.fields, card.fields);
      if (addsNothing(match.known.fields, card.fields)) {
        // Everything the file has for this contact is here already.
        result.alreadyHere += 1;
        return;
      }
      entry.cards.push({ index: position, card, state: "duplicate", existingId: match.known.id });
      result.duplicates.push({
        index: position,
        displayName: contactDisplayName(card.fields),
        existing: { id: match.known.id, displayName: contactDisplayName(match.known.fields) },
        reason: match.reason,
        lines: compareLines(match.known.fields, card.fields),
        mergeAdds: describeAdditions(match.known.fields, merged),
      });
    });
    entry.alreadyHere = result.alreadyHere;

    const now = Date.now();
    for (const [token, old] of staged) if (now - old.at > STAGED_FOR) staged.delete(token);
    while (staged.size >= STAGED_AT_ONCE) staged.delete(staged.keys().next().value as string);
    staged.set(entry.token, entry);
    return result;
  }

  /** A card as a contact Outpost can keep, or the reason it cannot. */
  function checked(card: CardContact): CardContact | string {
    const parsed = contactFieldsSchema.safeParse(card.fields);
    if (!parsed.success)
      return `${parsed.error.issues[0]?.message ?? "A field is not one Outpost can keep."} It was left out whole, so that nothing is cut short.`;
    const fields = tidy(parsed.data);
    if (!hasSomething(fields)) return "It has no name, number or address.";
    return { uid: card.uid, fields, extra: card.extra.filter((line) => line.length <= 4000).slice(0, 200) };
  }

  return {
    count,

    list(query) {
      const conditions: string[] = [];
      const values: unknown[] = [];
      for (const word of fold(query.q ?? "")
        .split(" ")
        .filter(Boolean)
        .slice(0, 8)) {
        conditions.push("c.search_text LIKE ? ESCAPE '\\'");
        values.push(`%${word.replace(/[\\%_]/g, "\\$&")}%`);
      }
      // "07700 900123" is found as it was typed too, spaces and all.
      const digits = (query.q ?? "").replace(/\D/g, "");
      if (digits.length >= 3 && fold(query.q ?? "").replace(/[\d ]/g, "") === "") {
        conditions.length = 0;
        values.length = 0;
        // A number typed as it is dialled at home ("07700…") is also one stored with its country code ("+44 7700…").
        const national = digits.replace(/^0+/, "");
        if (national !== digits && national.length >= 3) {
          conditions.push("(c.search_text LIKE ? OR c.search_text LIKE ?)");
          values.push(`%${digits}%`, `%${national}%`);
        } else {
          conditions.push("c.search_text LIKE ?");
          values.push(`%${digits}%`);
        }
      }
      if (query.tag) {
        conditions.push("EXISTS (SELECT 1 FROM contact_tags t WHERE t.contact_id = c.id AND t.name = ? COLLATE NOCASE)");
        values.push(query.tag);
      }
      if (query.emergency) conditions.push("c.is_emergency = 1");
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const total = (sqlite.prepare(`SELECT count(*) AS n FROM contacts c ${where}`).get(...values) as { n: number }).n;
      const ids = sqlite
        .prepare(`SELECT c.id FROM contacts c ${where} ORDER BY c.is_emergency DESC, c.sort_key, c.id LIMIT ? OFFSET ?`)
        .all(...values, query.limit, query.offset) as Array<{ id: string }>;
      const rows =
        ids.length === 0
          ? []
          : db
              .select()
              .from(contacts)
              .where(
                inArray(
                  contacts.id,
                  ids.map((row) => row.id),
                ),
              )
              .all();
      const byId = new Map(rows.map((row) => [row.id, row]));
      const tagRows =
        ids.length === 0
          ? []
          : db
              .select()
              .from(contactTags)
              .where(
                inArray(
                  contactTags.contactId,
                  ids.map((row) => row.id),
                ),
              )
              .all();
      const tagsById = new Map<string, string[]>();
      for (const tag of tagRows) tagsById.set(tag.contactId, [...(tagsById.get(tag.contactId) ?? []), tag.name]);
      const tags = sqlite
        .prepare("SELECT min(name) AS name, count(*) AS count FROM contact_tags GROUP BY name COLLATE NOCASE ORDER BY name COLLATE NOCASE")
        .all() as Array<{ name: string; count: number }>;
      return {
        contacts: ids.map(({ id }) =>
          toSummary(
            byId.get(id)!,
            (tagsById.get(id) ?? []).sort((a, b) => a.localeCompare(b)),
          ),
        ),
        total,
        all: count(),
        emergency: (sqlite.prepare("SELECT count(*) AS n FROM contacts WHERE is_emergency = 1").get() as { n: number }).n,
        tags,
      };
    },

    get: (id) => toDto(rowOf(id)),

    create(input) {
      const { markerId, pageIds, ...given } = input;
      const fields = tidy(contactFieldsSchema.parse({ ...emptyContactFields(), ...given }));
      if (!hasSomething(fields)) throw badRequest("Give the contact a name, a number or an address.");
      assertRoom(1);
      checkMarker(markerId);
      const id = newId();
      const row = sqlite.transaction(() => {
        const made = write(id, fields, {
          uid: newUid(),
          extra: [],
          source: "manual",
          markerId: markerId ?? null,
          createdAt: Date.now(),
          isNew: true,
        });
        if (pageIds) setPages(id, pageIds);
        return made;
      })();
      changed(id);
      return toDto(row);
    },

    update(id, patch) {
      const current = rowOf(id);
      const { markerId, pageIds, baseUpdatedAt, ...given } = patch;
      if (baseUpdatedAt !== undefined && baseUpdatedAt !== current.updatedAt) {
        throw conflict(
          "This contact was changed somewhere else after you opened it. Nothing was saved. Open it again to see how it is now.",
          {
            updatedAt: current.updatedAt,
          },
        );
      }
      const fields = tidy(contactFieldsSchema.parse({ ...fieldsFrom(current.data, tagsOf(id)), ...given }));
      if (!hasSomething(fields)) throw badRequest("Give the contact a name, a number or an address.");
      if (markerId !== undefined) checkMarker(markerId);
      const row = sqlite.transaction(() => {
        const next = write(id, fields, {
          uid: current.uid,
          extra: extraLines(current.extra),
          source: current.source,
          markerId: markerId === undefined ? current.markerId : markerId,
          createdAt: current.createdAt,
          isNew: false,
        });
        if (pageIds) setPages(id, pageIds);
        return next;
      })();
      changed(id);
      return toDto(row);
    },

    remove(id) {
      rowOf(id);
      db.delete(contacts).where(eq(contacts.id, id)).run();
      search.remove("contact", id);
      written.delete(id);
      changed(id);
    },

    emergency() {
      return db.select().from(contacts).where(eq(contacts.isEmergency, true)).orderBy(contacts.sortKey, contacts.id).all().map(toDto);
    },

    exportCards(selection, version) {
      let rows = db.select().from(contacts).orderBy(contacts.sortKey, contacts.id).all();
      if (selection.ids) {
        const wanted = new Set(selection.ids);
        rows = rows.filter((row) => wanted.has(row.id));
      }
      if (selection.emergency) rows = rows.filter((row) => row.isEmergency);
      if (selection.tag) {
        const tag = selection.tag.toLowerCase();
        rows = rows.filter((row) => tagsOf(row.id).some((name) => name.toLowerCase() === tag));
      }
      if (rows.length === 0) throw notFound("Any contact to export");
      const body = rows
        .map((row) =>
          vcardOf(
            { uid: row.uid, fields: fieldsFrom(row.data, tagsOf(row.id)), extra: extraLines(row.extra), updatedAt: row.updatedAt },
            version,
          ),
        )
        .join("");
      const stampOf = new Date().toISOString().slice(0, 10);
      const one =
        rows.length === 1
          ? rows[0]!.displayName
              .replace(/[^\p{L}\p{N} _.-]+/gu, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 60)
          : "";
      const filename = one
        ? `${one}.vcf`
        : selection.emergency
          ? `outpost-emergency-contacts-${stampOf}.vcf`
          : `outpost-contacts-${stampOf}.vcf`;
      return { filename, body, count: rows.length };
    },

    async previewFile(file) {
      if (file.bytes.length > L.fileBytes) throw badRequest("That file is larger than Outpost reads as contacts (50 MB).");
      let parsed: Awaited<ReturnType<typeof parseVcards>>;
      try {
        parsed = await parseVcards(file.bytes);
      } catch (error) {
        if (error instanceof VcardError) throw badRequest(error.message);
        throw error;
      }
      const unreadable = [...parsed.unreadable];
      const cards: CardContact[] = [];
      for (const card of parsed.cards) {
        const contact = checked(contactFromCard(card));
        if (typeof contact === "string") unreadable.push({ position: card.position, reason: contact });
        else cards.push(contact);
      }
      unreadable.sort((a, b) => a.position - b.position);
      return stage("file", file.name.slice(0, 200), cards, { versions: parsed.versions, unreadable, photosLeftOut: parsed.binaryLeftOut });
    },

    async previewPicked(picked) {
      const unreadable: ContactImportPreview["unreadable"] = [];
      const cards: CardContact[] = [];
      picked.forEach((person, position) => {
        const contact = checked(contactFromPicked(person));
        if (typeof contact === "string") unreadable.push({ position: position + 1, reason: contact });
        else cards.push(contact);
      });
      return stage("picker", "Chosen on this phone", cards, { versions: [], unreadable, photosLeftOut: 0 });
    },

    async applyImport(request) {
      const entry = staged.get(request.token);
      if (!entry)
        throw conflict(
          "That file is no longer waiting: it was read more than half an hour ago, or Outpost has restarted. Choose it again.",
        );
      staged.delete(request.token);
      const leaveOut = new Set(request.leaveOut ?? []);
      const result: ContactImportResult = {
        added: 0,
        merged: 0,
        replaced: 0,
        kept: 0,
        alreadyHere: entry.alreadyHere,
        leftOut: 0,
        overLimit: 0,
      };
      let room = Math.max(0, L.contacts - count());

      const add = (card: CardContact) => {
        if (room <= 0) {
          result.overLimit += 1;
          return;
        }
        // A card whose identity is taken (it was chosen to be kept beside the one that has it) gets its own.
        const taken = db.select({ id: contacts.id }).from(contacts).where(eq(contacts.uid, card.uid)).get();
        write(newId(), card.fields, {
          uid: taken ? newUid() : card.uid,
          extra: card.extra,
          source: entry.source,
          markerId: null,
          createdAt: Date.now(),
          isNew: true,
        });
        room -= 1;
        result.added += 1;
      };

      for (let start = 0; start < entry.cards.length; start += 200) {
        sqlite.transaction(() => {
          for (const item of entry.cards.slice(start, start + 200)) {
            if (item.state === "fresh") {
              if (leaveOut.has(item.index)) result.leftOut += 1;
              else add(item.card);
              continue;
            }
            const choice: ContactImportChoice = request.choices?.[String(item.index)] ?? "keep";
            const existing = item.existingId ? db.select().from(contacts).where(eq(contacts.id, item.existingId)).get() : undefined;
            if (choice === "keep") result.kept += 1;
            else if (choice === "both" || !existing) add(item.card);
            else {
              const here = fieldsFrom(existing.data, tagsOf(existing.id));
              const next = choice === "merge" ? mergeFields(here, item.card.fields) : replaceFields(here, item.card.fields);
              const parsed = contactFieldsSchema.safeParse(next);
              if (!parsed.success) {
                // Together they are more than one contact holds. Outpost's stays as it was.
                result.kept += 1;
                continue;
              }
              const extra = [...new Set([...extraLines(existing.extra), ...item.card.extra])].slice(0, 200);
              write(existing.id, tidy(parsed.data), {
                uid: existing.uid,
                extra,
                source: existing.source,
                markerId: existing.markerId,
                createdAt: existing.createdAt,
                isNew: false,
              });
              if (choice === "merge") result.merged += 1;
              else result.replaced += 1;
            }
          }
        })();
        // Other requests are answered between batches of a large file.
        await pause();
      }
      changed();
      return result;
    },

    discardImport(token) {
      staged.delete(token);
    },

    eraseAll() {
      const ids = db.select({ id: contacts.id }).from(contacts).all();
      sqlite.transaction(() => {
        for (const { id } of ids) search.remove("contact", id);
        db.delete(contacts).run();
      })();
      written.clear();
      staged.clear();
      changed();
      return ids.length;
    },

    cards() {
      return db
        .select()
        .from(contacts)
        .orderBy(contacts.id)
        .all()
        .map((row) => ({ id: row.id, etag: cardOf(row).etag }));
    },

    card(id) {
      const row = db.select().from(contacts).where(eq(contacts.id, id)).get();
      return row ? cardOf(row) : null;
    },
  };
}
