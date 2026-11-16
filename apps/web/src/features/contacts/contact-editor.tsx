/**
 * Adding a contact and changing one. Nothing is saved until "Save contact" is pressed,
 * and a change is refused if the contact was changed somewhere else in the meantime.
 */
import {
  ADDRESS_LABELS,
  CONTACT_LIMITS,
  type ContactAddress,
  type ContactDto,
  type ContactFields,
  type ContactPageLink,
  EMAIL_LABELS,
  emptyContactFields,
  LINK_LABELS,
  type MarkerDto,
  type NoteLookupItem,
  type NoteLookupResponse,
  PHONE_LABELS,
} from "@outpost/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { FileText, Plus, Search, Trash2, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useId, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger, Segmented, Select, Switch } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { BackToList, DetailSkeleton } from "./contact-detail";
import { useContact, useSaveContact } from "./contacts-data";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function Part({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="mt-8 min-w-0 border-t border-border pt-4">
      <legend className="float-left mb-3 w-full text-lead font-semibold text-ink">{title}</legend>
      {hint ? <p className="clear-both -mt-2 mb-3 max-w-[60ch] text-small text-ink-muted">{hint}</p> : null}
      <div className="clear-both grid gap-3">{children}</div>
    </fieldset>
  );
}

function RemoveButton({ what, onClick }: { what: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" aria-label={`Remove ${what}`} onClick={onClick} className="shrink-0">
      <Trash2 />
    </Button>
  );
}

function AddButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <div>
      <Button variant="soft" size="sm" onClick={onClick} disabled={disabled}>
        <Plus /> {children}
      </Button>
    </div>
  );
}

/** Rows of a value and the word that says which one it is. The word can be chosen or typed. */
function ValueRows({
  what,
  rows,
  onChange,
  labels,
  type,
  inputMode,
  placeholder,
}: {
  what: string;
  rows: Array<{ value: string; label: string }>;
  onChange: (rows: Array<{ value: string; label: string }>) => void;
  labels: readonly string[];
  type?: string;
  inputMode?: "tel" | "email" | "url";
  placeholder?: string;
}) {
  const listId = useId();
  const set = (index: number, patch: Partial<{ value: string; label: string }>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  return (
    <>
      <datalist id={listId}>
        {labels.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
      {rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place and have no identity but their position
        <div key={index} className="flex items-center gap-2">
          <Input
            type={type ?? "text"}
            inputMode={inputMode}
            value={row.value}
            onChange={(event) => set(index, { value: event.target.value })}
            aria-label={`${what} ${index + 1}`}
            placeholder={placeholder}
            maxLength={CONTACT_LIMITS.value}
            className="min-w-0 flex-[2]"
            autoComplete="off"
          />
          <Input
            value={row.label}
            onChange={(event) => set(index, { label: event.target.value })}
            aria-label={`What ${what.toLowerCase()} ${index + 1} is`}
            placeholder="label"
            list={listId}
            maxLength={CONTACT_LIMITS.label}
            className="min-w-0 flex-1"
            autoComplete="off"
          />
          <RemoveButton what={`${what.toLowerCase()} ${index + 1}`} onClick={() => onChange(rows.filter((_row, at) => at !== index))} />
        </div>
      ))}
      <AddButton
        onClick={() => onChange([...rows, { value: "", label: rows.length === 0 ? (labels[0] ?? "") : "" }])}
        disabled={rows.length >= CONTACT_LIMITS.values}
      >
        Add {/^[aeiou]/i.test(what) ? "an" : "a"} {what.toLowerCase()}
      </AddButton>
    </>
  );
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = (typed: string) => {
    const next = [...tags];
    for (const part of typed.split(",")) {
      const name = part.replace(/\s+/g, " ").trim();
      if (name && !next.some((tag) => tag.toLowerCase() === name.toLowerCase())) next.push(name);
    }
    onChange(next);
    setDraft("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-ink">
        Tags
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-control border border-border-strong bg-page p-1.5 focus-within:border-focus focus-within:ring-2 focus-within:ring-focus/30">
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(tags.filter((other) => other !== tag))}
            className="flex h-7 items-center gap-1 rounded-full bg-surface-strong pr-1.5 pl-2.5 text-small text-ink hover:bg-border max-md:h-9"
          >
            {tag}
            <X aria-hidden className="size-3.5 text-ink-muted" />
          </button>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          maxLength={CONTACT_LIMITS.label}
          placeholder={tags.length === 0 ? "Family, Neighbours, Has a key" : ""}
          className="h-7 min-w-28 flex-1 bg-transparent px-1.5 text-body text-ink placeholder:text-ink-faint focus:outline-none max-md:h-9"
        />
      </div>
      <p className="text-small text-ink-muted">Press Enter or a comma after each one.</p>
    </div>
  );
}

/** Pages of notes the contact points at: a list with a way to find one more. */
function PagesInput({ pages, onChange }: { pages: ContactPageLink[]; onChange: (pages: ContactPageLink[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const found = useQuery<NoteLookupItem[]>({
    queryKey: ["notes", "lookup", query.trim()],
    queryFn: ({ signal }) =>
      api.get<NoteLookupResponse>("/api/notes/lookup", { q: query.trim(), limit: 8 }, signal).then((data) => data.notes),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const offered = (found.data ?? []).filter((page) => !pages.some((chosen) => chosen.id === page.id));
  return (
    <div className="grid gap-2">
      <p className="text-small font-medium text-ink">Pages of notes</p>
      {pages.length > 0 ? (
        <ul className="divide-y divide-border border-y border-border">
          {pages.map((page) => (
            <li key={page.id} className="flex items-center gap-2 py-1">
              <FileText aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate text-body text-ink">{page.title}</span>
              <RemoveButton what={`the link to ${page.title}`} onClick={() => onChange(pages.filter((other) => other.id !== page.id))} />
            </li>
          ))}
        </ul>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <div>
          <PopoverTrigger asChild>
            <Button variant="soft" size="sm" disabled={pages.length >= CONTACT_LIMITS.linkedPages}>
              <Plus /> Link a page
            </Button>
          </PopoverTrigger>
        </div>
        <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-0">
          <Command shouldFilter={false} loop label="Link a page of notes">
            <div className="flex items-center gap-2.5 border-b border-border px-3">
              <Search aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Find a page"
                className="h-10 min-w-0 flex-1 bg-transparent text-small text-ink placeholder:text-ink-faint focus:outline-none max-md:h-11 max-md:text-body"
              />
            </div>
            <Command.List className="scroll-quiet max-h-[min(45dvh,18rem)] overflow-y-auto p-1.5">
              {offered.map((page) => (
                <Command.Item
                  key={page.id}
                  value={page.id}
                  onSelect={() => {
                    onChange([...pages, { id: page.id, title: page.title.trim() || "Untitled", icon: page.icon ?? null }]);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex cursor-default items-center gap-3 rounded-control px-3 py-2 text-small text-ink data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary-soft-ink max-md:py-3"
                >
                  <FileText aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{page.title.trim() || "Untitled"}</span>
                    {page.path ? <span className="block truncate text-micro text-ink-muted">{page.path}</span> : null}
                  </span>
                </Command.Item>
              ))}
              {found.isError ? <p className="px-3 py-3 text-small text-danger">{errorMessage(found.error)}</p> : null}
              {found.isPending ? <p className="px-3 py-3 text-small text-ink-muted">Looking…</p> : null}
              {found.isSuccess && offered.length === 0 ? (
                <p className="px-3 py-3 text-small text-ink-muted">
                  {query.trim() ? "No page has that in its title." : "There are no pages to link yet."}
                </p>
              ) : null}
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** A birthday as day, month and, if it is known, year. One that was written some other way is kept as text. */
function BirthdayInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const short = /^--(\d{2})-(\d{2})$/.exec(value);
  const [day, setDay] = useState(full?.[3] ?? short?.[2] ?? "");
  const [month, setMonth] = useState(full?.[2] ?? short?.[1] ?? "");
  const [year, setYear] = useState(full?.[1] ?? "");
  const freeText = value !== "" && !full && !short;
  if (freeText) {
    return (
      <Field label="Birthday" hint="As it was written in the card this contact came from. Clear it to choose a day and month instead.">
        {(ids) => <Input {...ids} value={value} onChange={(event) => onChange(event.target.value)} maxLength={40} />}
      </Field>
    );
  }
  const update = (next: { day?: string; month?: string; year?: string }) => {
    const d = next.day ?? day;
    const m = next.month ?? month;
    const y = next.year ?? year;
    if (next.day !== undefined) setDay(d);
    if (next.month !== undefined) setMonth(m);
    if (next.year !== undefined) setYear(y);
    const dayNumber = Number(d);
    if (!m || !(dayNumber >= 1 && dayNumber <= 31)) return onChange("");
    const dd = String(dayNumber).padStart(2, "0");
    onChange(/^\d{4}$/.test(y) ? `${y}-${m}-${dd}` : `--${m}-${dd}`);
  };
  return (
    <div className="grid gap-1.5">
      <p className="text-small font-medium text-ink">Birthday</p>
      <div className="flex gap-2">
        <Input
          aria-label="Day of birthday"
          inputMode="numeric"
          placeholder="Day"
          value={day.replace(/^0/, "")}
          onChange={(event) => update({ day: event.target.value.replace(/\D/g, "").slice(0, 2) })}
          className="w-20"
        />
        <Select
          aria-label="Month of birthday"
          value={month || undefined}
          onChange={(next) => update({ month: next === "none" ? "" : next })}
          placeholder="Month"
          options={[
            { value: "none", label: "No birthday" },
            ...MONTHS.map((name, index) => ({ value: String(index + 1).padStart(2, "0"), label: name })),
          ]}
          className="min-w-0 flex-1"
        />
        <Input
          aria-label="Year of birth, if known"
          inputMode="numeric"
          placeholder="Year"
          value={year}
          onChange={(event) => update({ year: event.target.value.replace(/\D/g, "").slice(0, 4) })}
          className="w-24"
        />
      </div>
      <p className="text-small text-ink-muted">Leave the year empty if you do not know it.</p>
    </div>
  );
}

function Form({ contact }: { contact?: ContactDto }) {
  const navigate = useNavigate();
  const initial = (): ContactFields => {
    if (!contact) return emptyContactFields();
    const {
      id: _id,
      displayName: _name,
      place: _place,
      pages: _pages,
      otherFields: _other,
      source: _source,
      createdAt: _made,
      updatedAt: _at,
      ...fields
    } = contact;
    return fields;
  };
  const [start] = useState(initial);
  const [fields, setFields] = useState<ContactFields>(start);
  const [markerId, setMarkerId] = useState<string | null>(contact?.place?.id ?? null);
  const [pages, setPages] = useState<ContactPageLink[]>(contact?.pages ?? []);
  const [leaving, setLeaving] = useState(false);
  const emergencyId = useId();
  const save = useSaveContact(contact?.id);
  const markers = useQuery({
    queryKey: ["maps", "markers"],
    queryFn: () => api.get<{ markers: MarkerDto[] }>("/api/maps/markers").then((data) => data.markers),
  });

  const set = <K extends keyof ContactFields>(key: K, value: ContactFields[K]) => setFields((current) => ({ ...current, [key]: value }));
  const setName = (part: keyof ContactFields["name"], value: string) =>
    setFields((current) => ({ ...current, name: { ...current.name, [part]: value } }));
  const setAddress = (index: number, patch: Partial<ContactAddress>) =>
    set(
      "addresses",
      fields.addresses.map((address, at) => (at === index ? { ...address, ...patch } : address)),
    );
  const back = contact ? `/contacts/${contact.id}` : "/contacts";
  const dirty =
    JSON.stringify(fields) !== JSON.stringify(start) ||
    markerId !== (contact?.place?.id ?? null) ||
    pages.map((page) => page.id).join() !== (contact?.pages ?? []).map((page) => page.id).join();
  const organisation = fields.kind === "organisation";

  const submit = () => {
    // Rows left empty are not rows.
    const cleaned: ContactFields = {
      ...fields,
      phones: fields.phones.filter((row) => row.value.trim()),
      emails: fields.emails.filter((row) => row.value.trim()),
      links: fields.links.filter((row) => row.value.trim()),
    };
    save.mutate(
      { ...cleaned, markerId, pageIds: pages.map((page) => page.id), ...(contact ? { baseUpdatedAt: contact.updatedAt } : {}) },
      {
        onSuccess: (saved) => {
          toast.success(contact ? "Saved." : `Added ${saved.displayName}.`);
          void navigate(`/contacts/${saved.id}`);
        },
      },
    );
  };

  return (
    <form
      className="max-w-[40rem]"
      aria-labelledby="editor-title"
      // The browser's own checks would refuse an address or number written in a way it does not expect. The server says what it will not keep.
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <BackToList />
      <h1 id="editor-title" className="font-title text-title text-ink">
        {contact ? `Edit ${contact.displayName}` : "Add a contact"}
      </h1>

      <div className="mt-5">
        <Segmented
          label="What this contact is"
          value={fields.kind}
          onChange={(kind) => set("kind", kind)}
          options={[
            { value: "person", label: "A person" },
            { value: "organisation", label: "An organisation or place" },
          ]}
        />
      </div>

      <div className="mt-5 grid gap-3">
        {organisation ? (
          <>
            <Field label="Name">
              {(ids) => (
                <Input
                  {...ids}
                  value={fields.organisation}
                  onChange={(event) => set("organisation", event.target.value)}
                  maxLength={CONTACT_LIMITS.name}
                  autoFocus={!contact}
                />
              )}
            </Field>
            <Field label="Department or desk">
              {(ids) => (
                <Input
                  {...ids}
                  value={fields.department}
                  onChange={(event) => set("department", event.target.value)}
                  maxLength={CONTACT_LIMITS.name}
                />
              )}
            </Field>
          </>
        ) : (
          <>
            <div className="grid items-start gap-3 sm:grid-cols-2">
              <Field label="First name">
                {(ids) => (
                  <Input
                    {...ids}
                    value={fields.name.given}
                    onChange={(event) => setName("given", event.target.value)}
                    maxLength={CONTACT_LIMITS.name}
                    autoFocus={!contact}
                    autoComplete="off"
                  />
                )}
              </Field>
              <Field label="Family name">
                {(ids) => (
                  <Input
                    {...ids}
                    value={fields.name.family}
                    onChange={(event) => setName("family", event.target.value)}
                    maxLength={CONTACT_LIMITS.name}
                    autoComplete="off"
                  />
                )}
              </Field>
            </div>
            <details open={Boolean(fields.name.prefix || fields.name.additional || fields.name.suffix || fields.nickname)}>
              <summary className="min-h-9 cursor-pointer py-1.5 text-small text-primary max-md:min-h-11 max-md:py-2.5">
                More of the name
              </summary>
              <div className="mt-2 grid items-start gap-3 sm:grid-cols-2">
                <Field label="Before the name" hint="Dr, Sister, Capt.">
                  {(ids) => (
                    <Input
                      {...ids}
                      value={fields.name.prefix}
                      onChange={(event) => setName("prefix", event.target.value)}
                      maxLength={CONTACT_LIMITS.name}
                    />
                  )}
                </Field>
                <Field label="Middle names">
                  {(ids) => (
                    <Input
                      {...ids}
                      value={fields.name.additional}
                      onChange={(event) => setName("additional", event.target.value)}
                      maxLength={CONTACT_LIMITS.name}
                    />
                  )}
                </Field>
                <Field label="After the name" hint="Jr, RN, MBE.">
                  {(ids) => (
                    <Input
                      {...ids}
                      value={fields.name.suffix}
                      onChange={(event) => setName("suffix", event.target.value)}
                      maxLength={CONTACT_LIMITS.name}
                    />
                  )}
                </Field>
                <Field label="Known as">
                  {(ids) => (
                    <Input
                      {...ids}
                      value={fields.nickname}
                      onChange={(event) => set("nickname", event.target.value)}
                      maxLength={CONTACT_LIMITS.name}
                    />
                  )}
                </Field>
              </div>
            </details>
            <div className="grid items-start gap-3 sm:grid-cols-2">
              <Field label="Organisation">
                {(ids) => (
                  <Input
                    {...ids}
                    value={fields.organisation}
                    onChange={(event) => set("organisation", event.target.value)}
                    maxLength={CONTACT_LIMITS.name}
                  />
                )}
              </Field>
              <Field label="What they do there">
                {(ids) => (
                  <Input
                    {...ids}
                    value={fields.title}
                    onChange={(event) => set("title", event.target.value)}
                    maxLength={CONTACT_LIMITS.name}
                  />
                )}
              </Field>
            </div>
          </>
        )}
      </div>

      <Part title="Phone">
        <ValueRows
          what="Phone number"
          rows={fields.phones}
          onChange={(rows) => set("phones", rows)}
          labels={PHONE_LABELS}
          type="tel"
          inputMode="tel"
          placeholder="07700 900123"
        />
      </Part>

      <Part title="Email">
        <ValueRows
          what="Email address"
          rows={fields.emails}
          onChange={(rows) => set("emails", rows)}
          labels={EMAIL_LABELS}
          type="email"
          inputMode="email"
        />
      </Part>

      <Part title="In an emergency" hint="Marked contacts are listed first and printed on the emergency sheet.">
        <label htmlFor={emergencyId} className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
          <span className="text-body text-ink">Mark this contact for an emergency</span>
          <Switch
            id={emergencyId}
            checked={fields.isEmergency}
            onCheckedChange={(on) => set("isEmergency", on)}
            aria-label="Mark this contact for an emergency"
          />
        </label>
        <Field label="Who this is when it matters" hint="One line for the sheet: “Has a spare key and a generator.”">
          {(ids) => (
            <Input
              {...ids}
              value={fields.emergencyNote}
              onChange={(event) => set("emergencyNote", event.target.value)}
              maxLength={CONTACT_LIMITS.value}
            />
          )}
        </Field>
      </Part>

      <Part
        title="Radio"
        hint="A callsign, and the frequencies to try in the order to try them. Written as you would read them out; nothing is checked."
      >
        <Field label="Callsign">
          {(ids) => (
            <Input
              {...ids}
              value={fields.callsign}
              onChange={(event) => set("callsign", event.target.value)}
              maxLength={CONTACT_LIMITS.label}
              className="font-mono"
              autoCapitalize="characters"
              autoComplete="off"
            />
          )}
        </Field>
        {fields.channels.map((channel, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place and have no identity but their position
          <div key={index} className="flex items-center gap-2">
            <Input
              value={channel.frequency}
              onChange={(event) =>
                set(
                  "channels",
                  fields.channels.map((row, at) => (at === index ? { ...row, frequency: event.target.value } : row)),
                )
              }
              aria-label={`Frequency ${index + 1}`}
              placeholder="145.500 MHz"
              maxLength={CONTACT_LIMITS.label}
              className="min-w-0 flex-1"
            />
            <Input
              value={channel.mode}
              onChange={(event) =>
                set(
                  "channels",
                  fields.channels.map((row, at) => (at === index ? { ...row, mode: event.target.value } : row)),
                )
              }
              aria-label={`Mode and when, for frequency ${index + 1}`}
              placeholder="FM, on the hour"
              maxLength={CONTACT_LIMITS.value}
              className="min-w-0 flex-[2]"
            />
            <RemoveButton
              what={`frequency ${index + 1}`}
              onClick={() =>
                set(
                  "channels",
                  fields.channels.filter((_row, at) => at !== index),
                )
              }
            />
          </div>
        ))}
        <AddButton
          onClick={() => set("channels", [...fields.channels, { frequency: "", mode: "" }])}
          disabled={fields.channels.length >= CONTACT_LIMITS.values}
        >
          Add a frequency
        </AddButton>
      </Part>

      <Part title="Where">
        {fields.addresses.map((address, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above
          <div key={index} className="grid gap-2 rounded-panel border border-border p-3">
            <div className="flex items-center gap-2">
              <Input
                value={address.label}
                onChange={(event) => setAddress(index, { label: event.target.value })}
                aria-label={`What address ${index + 1} is`}
                placeholder="label: home, work, meeting point"
                list="contact-address-labels"
                maxLength={CONTACT_LIMITS.label}
                className="min-w-0 flex-1"
              />
              <RemoveButton
                what={`address ${index + 1}`}
                onClick={() =>
                  set(
                    "addresses",
                    fields.addresses.filter((_row, at) => at !== index),
                  )
                }
              />
            </div>
            <Textarea
              value={address.street}
              onChange={(event) => setAddress(index, { street: event.target.value })}
              aria-label={`House and street of address ${index + 1}`}
              placeholder="House and street"
              rows={2}
              maxLength={CONTACT_LIMITS.value}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={address.locality}
                onChange={(event) => setAddress(index, { locality: event.target.value })}
                aria-label={`Town of address ${index + 1}`}
                placeholder="Town"
                maxLength={CONTACT_LIMITS.value}
              />
              <Input
                value={address.region}
                onChange={(event) => setAddress(index, { region: event.target.value })}
                aria-label={`County or region of address ${index + 1}`}
                placeholder="County or region"
                maxLength={CONTACT_LIMITS.value}
              />
              <Input
                value={address.postcode}
                onChange={(event) => setAddress(index, { postcode: event.target.value })}
                aria-label={`Postcode of address ${index + 1}`}
                placeholder="Postcode"
                maxLength={CONTACT_LIMITS.label}
              />
              <Input
                value={address.country}
                onChange={(event) => setAddress(index, { country: event.target.value })}
                aria-label={`Country of address ${index + 1}`}
                placeholder="Country"
                maxLength={CONTACT_LIMITS.value}
              />
            </div>
          </div>
        ))}
        <datalist id="contact-address-labels">
          {ADDRESS_LABELS.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
        <AddButton
          onClick={() =>
            set("addresses", [
              ...fields.addresses,
              { label: fields.addresses.length === 0 ? "home" : "", street: "", locality: "", region: "", postcode: "", country: "" },
            ])
          }
          disabled={fields.addresses.length >= CONTACT_LIMITS.values}
        >
          Add an address
        </AddButton>
        <Field
          label="Saved place on the map"
          hint={
            markers.data && markers.data.length === 0
              ? "There are no saved places yet. Save one on the map, then link it here."
              : "For a meeting point, or a house the map can lead to."
          }
        >
          {(ids) => (
            <Select
              {...ids}
              value={markerId ?? "none"}
              onChange={(next) => setMarkerId(next === "none" ? null : next)}
              disabled={markers.isPending}
              options={[
                { value: "none", label: "No saved place" },
                ...(markers.data ?? []).map((marker) => ({ value: marker.id, label: marker.name })),
              ]}
            />
          )}
        </Field>
      </Part>

      <Part title="Notes and tags">
        <Field label="Note">
          {(ids) => (
            <Textarea
              {...ids}
              value={fields.note}
              onChange={(event) => set("note", event.target.value)}
              rows={4}
              maxLength={CONTACT_LIMITS.note}
            />
          )}
        </Field>
        <PagesInput pages={pages} onChange={setPages} />
        <TagInput tags={fields.tags} onChange={(tags) => set("tags", tags)} />
      </Part>

      <Part title="More">
        <BirthdayInput value={fields.birthday} onChange={(value) => set("birthday", value)} />
        <p className="mt-2 text-small font-medium text-ink">Related people</p>
        {fields.related.map((related, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above
          <div key={index} className="flex items-center gap-2">
            <Input
              value={related.name}
              onChange={(event) =>
                set(
                  "related",
                  fields.related.map((row, at) => (at === index ? { ...row, name: event.target.value } : row)),
                )
              }
              aria-label={`Related person ${index + 1}`}
              placeholder="Name"
              maxLength={CONTACT_LIMITS.name}
              className="min-w-0 flex-[2]"
            />
            <Input
              value={related.label}
              onChange={(event) =>
                set(
                  "related",
                  fields.related.map((row, at) => (at === index ? { ...row, label: event.target.value } : row)),
                )
              }
              aria-label={`How related person ${index + 1} is related`}
              placeholder="partner, mother, carer"
              maxLength={CONTACT_LIMITS.label}
              className="min-w-0 flex-1"
            />
            <RemoveButton
              what={`related person ${index + 1}`}
              onClick={() =>
                set(
                  "related",
                  fields.related.filter((_row, at) => at !== index),
                )
              }
            />
          </div>
        ))}
        <AddButton
          onClick={() => set("related", [...fields.related, { name: "", label: "" }])}
          disabled={fields.related.length >= CONTACT_LIMITS.values}
        >
          Add a related person
        </AddButton>
        <p className="mt-2 text-small font-medium text-ink">Links</p>
        <ValueRows
          what="Link"
          rows={fields.links}
          onChange={(rows) => set("links", rows)}
          labels={LINK_LABELS}
          inputMode="url"
          placeholder="https://"
        />
      </Part>

      {save.isError ? (
        <Notice tone="danger" title="This was not saved" className="mt-6">
          {errorMessage(save.error)}
        </Notice>
      ) : null}

      <div className="sticky bottom-0 z-(--z-sticky) -mx-1 mt-8 flex flex-wrap justify-end gap-2 border-t border-border bg-page px-1 py-3 max-md:bottom-[calc(3.5rem+env(safe-area-inset-bottom))]">
        <Button onClick={() => (dirty ? setLeaving(true) : void navigate(back))}>Cancel</Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save contact
        </Button>
      </div>

      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Leave without saving?"
        description="What you changed here has not been saved, and will be lost."
        confirmLabel="Leave without saving"
        cancelLabel="Keep editing"
        onConfirm={() => void navigate(back)}
      />
    </form>
  );
}

export function ContactEditor({ id }: { id?: string }) {
  const contact = useContact(id);
  if (!id) return <Form />;
  if (contact.isPending) return <DetailSkeleton />;
  if (contact.isError) return <ErrorState error={contact.error} onRetry={() => contact.refetch()} />;
  return <Form contact={contact.data} />;
}
