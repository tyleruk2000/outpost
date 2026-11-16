/**
 * The forms for each kind of code. Everything typed is held in the page's memory: not
 * in the address, not in the browser's storage, not sent. Spell checking is off in every
 * field, because some browsers send the words of a field to a spelling service.
 */
import { addressLines, type ContactDto, type MarkerDto } from "@outpost/shared";
import { Eye, EyeOff } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { ErrorState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Checkbox, Segmented, Select, Skeleton } from "@/components/ui/misc";
import { useContact, useContactList } from "@/features/contacts/contacts-data";
import { useMarkers } from "@/features/maps/data";
import { cn } from "@/lib/utils";
import { emptyQrContact, type QrContact, WIFI_SECURITY_WORDS, type WifiInput, type WifiSecurity } from "./payloads";

/** What every text field here has: nothing remembered, nothing checked by a service. */
const quiet = { autoComplete: "off", autoCorrect: "off", autoCapitalize: "off", spellCheck: false } as const;

/** A tick box and its words, a finger high. */
export function CheckLine({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-small", disabled ? "text-ink-muted" : "text-ink")}
    >
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(value) => onChange?.(value === true)} />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </label>
  );
}

export function TextForm({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  return (
    <Field label="Text or web address" hint="A web address starting https:// opens in the phone’s browser. Anything else is shown as text.">
      {(ids) => <Textarea {...ids} {...quiet} rows={4} value={text} onChange={(event) => onChange(event.target.value)} />}
    </Field>
  );
}

export function WifiForm({ wifi, onChange }: { wifi: WifiInput; onChange: (wifi: WifiInput) => void }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="grid gap-4">
      <Field label="Network name" hint="Exactly as a phone lists it, with capitals and spaces.">
        {(ids) => <Input {...ids} {...quiet} value={wifi.ssid} onChange={(event) => onChange({ ...wifi, ssid: event.target.value })} />}
      </Field>
      <Field label="Security">
        {(ids) => (
          <Select<WifiSecurity>
            id={ids.id}
            aria-describedby={ids["aria-describedby"]}
            value={wifi.security}
            onChange={(security) => onChange({ ...wifi, security })}
            options={(Object.keys(WIFI_SECURITY_WORDS) as WifiSecurity[]).map((value) => ({ value, label: WIFI_SECURITY_WORDS[value] }))}
          />
        )}
      </Field>
      {wifi.security !== "nopass" ? (
        <Field label="Password">
          {(ids) => (
            <div className="flex gap-2">
              <Input
                {...ids}
                {...quiet}
                type={shown ? "text" : "password"}
                // Not offered to a password manager: this is the network's password, not one for Outpost.
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                value={wifi.password}
                onChange={(event) => onChange({ ...wifi, password: event.target.value })}
                className="min-w-0 flex-1 font-mono"
              />
              <Button
                variant="secondary"
                size="icon"
                aria-label={shown ? "Hide the password" : "Show the password"}
                aria-pressed={shown}
                onClick={() => setShown(!shown)}
              >
                {shown ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          )}
        </Field>
      ) : null}
      <CheckLine checked={wifi.hidden} onChange={(hidden) => onChange({ ...wifi, hidden })}>
        The network is hidden (it does not appear in a phone’s list)
      </CheckLine>
    </div>
  );
}

export function NumberForm({ value, onChange, kind }: { value: string; onChange: (value: string) => void; kind: "phone" | "email" }) {
  return kind === "phone" ? (
    <Field label="Phone number" hint="With the country code (+44 for the UK) if the code may be read abroad.">
      {(ids) => <Input {...ids} {...quiet} type="tel" inputMode="tel" value={value} onChange={(event) => onChange(event.target.value)} />}
    </Field>
  ) : (
    <Field label="Email address">
      {(ids) => (
        <Input {...ids} {...quiet} type="email" inputMode="email" value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </Field>
  );
}

// ── A saved place ────────────────────────────────────────────────────────────

export function PlaceForm({ placeId, onChange }: { placeId: string | undefined; onChange: (marker: MarkerDto) => void }) {
  const markers = useMarkers();
  if (markers.isPending) return <Skeleton className="h-11" aria-label="Loading saved places" />;
  if (markers.isError) return <ErrorState error={markers.error} onRetry={() => markers.refetch()} />;
  const list = [...markers.data].sort((a, b) => a.name.localeCompare(b.name));
  if (list.length === 0) {
    return (
      <p className="text-small text-ink-muted">
        No places are saved on the map yet.{" "}
        <Link to="/maps" className="font-medium text-primary underline underline-offset-[0.2em]">
          Open Maps
        </Link>{" "}
        and save one, then come back.
      </p>
    );
  }
  return (
    <Field label="Saved place" hint="The code holds the position. A phone opens it in its own maps app.">
      {(ids) => (
        <Select
          id={ids.id}
          aria-describedby={ids["aria-describedby"]}
          value={placeId}
          placeholder="Choose a place"
          onChange={(id) => {
            const marker = list.find((entry) => entry.id === id);
            if (marker) onChange(marker);
          }}
          options={list.map((marker) => ({ value: marker.id, label: marker.name || "Unnamed place" }))}
        />
      )}
    </Field>
  );
}

// ── A contact ────────────────────────────────────────────────────────────────

export type ContactSource = "typed" | "outpost";

export function ContactForm({
  source,
  onSource,
  typed,
  onTyped,
  onPicked,
}: {
  source: ContactSource;
  onSource: (source: ContactSource) => void;
  typed: QrContact;
  onTyped: (contact: QrContact) => void;
  onPicked: (contact: QrContact | null) => void;
}) {
  return (
    <div className="grid gap-4">
      <Segmented<ContactSource>
        label="Where the contact comes from"
        value={source}
        onChange={onSource}
        options={[
          { value: "typed", label: "Type one" },
          { value: "outpost", label: "From Contacts" },
        ]}
        className="justify-self-start"
      />
      {source === "typed" ? <TypedContact contact={typed} onChange={onTyped} /> : <PickedContact onPicked={onPicked} />}
    </div>
  );
}

function TypedContact({ contact, onChange }: { contact: QrContact; onChange: (contact: QrContact) => void }) {
  const one = (list: Array<{ value: string; label: string }>) => list[0]?.value ?? "";
  const set = (patch: Partial<QrContact>) => onChange({ ...contact, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" className="sm:col-span-2">
        {(ids) => <Input {...ids} {...quiet} value={contact.fullName} onChange={(event) => set({ fullName: event.target.value })} />}
      </Field>
      <Field label="Phone">
        {(ids) => (
          <Input
            {...ids}
            {...quiet}
            type="tel"
            value={one(contact.phones)}
            onChange={(event) => set({ phones: [{ value: event.target.value, label: "mobile" }] })}
          />
        )}
      </Field>
      <Field label="Email">
        {(ids) => (
          <Input
            {...ids}
            {...quiet}
            type="email"
            value={one(contact.emails)}
            onChange={(event) => set({ emails: [{ value: event.target.value, label: "" }] })}
          />
        )}
      </Field>
      <Field label="Organisation" className="sm:col-span-2">
        {(ids) => (
          <Input {...ids} {...quiet} value={contact.organisation} onChange={(event) => set({ organisation: event.target.value })} />
        )}
      </Field>
      <Field label="Address" className="sm:col-span-2">
        {(ids) => (
          <Textarea
            {...ids}
            {...quiet}
            rows={2}
            value={one(contact.addresses)}
            onChange={(event) => set({ addresses: [{ value: event.target.value, label: "" }] })}
          />
        )}
      </Field>
    </div>
  );
}

/** One field of a picked contact that can go in the code or be left out. */
interface Choice {
  id: string;
  label: string;
  value: string;
}

/** The fields of a contact, each one a choice. The name is always in. */
export function contactChoices(contact: ContactDto): Choice[] {
  const choices: Choice[] = [];
  const work = [contact.organisation, contact.title].filter((part) => part.trim()).join(", ");
  if (work) choices.push({ id: "org", label: "Organisation", value: work });
  for (const [index, phone] of contact.phones.entries())
    choices.push({ id: `tel-${index}`, label: phone.label ? `Phone (${phone.label})` : "Phone", value: phone.value });
  for (const [index, email] of contact.emails.entries())
    choices.push({ id: `email-${index}`, label: email.label ? `Email (${email.label})` : "Email", value: email.value });
  for (const [index, address] of contact.addresses.entries())
    choices.push({
      id: `adr-${index}`,
      label: address.label ? `Address (${address.label})` : "Address",
      value: addressLines(address).join(", "),
    });
  for (const [index, link] of contact.links.entries()) choices.push({ id: `url-${index}`, label: "Web", value: link.value });
  if (contact.note.trim()) choices.push({ id: "note", label: "Note", value: contact.note });
  return choices.filter((choice) => choice.value.trim());
}

/** The first phone number and the first email address: enough to reach someone, small enough to scan. */
export const usualChoices = (choices: Choice[]) =>
  new Set(
    [choices.find((choice) => choice.id.startsWith("tel-"))?.id, choices.find((choice) => choice.id.startsWith("email-"))?.id].filter(
      (id): id is string => Boolean(id),
    ),
  );

export function contactFromChoices(contact: ContactDto, chosen: ReadonlySet<string>): QrContact {
  const result = emptyQrContact();
  result.fullName = contact.displayName;
  result.given = contact.name.given;
  result.family = contact.name.family;
  if (chosen.has("org")) {
    result.organisation = contact.organisation;
    result.title = contact.title;
  }
  for (const [index, phone] of contact.phones.entries()) if (chosen.has(`tel-${index}`)) result.phones.push(phone);
  for (const [index, email] of contact.emails.entries()) if (chosen.has(`email-${index}`)) result.emails.push(email);
  for (const [index, address] of contact.addresses.entries())
    if (chosen.has(`adr-${index}`)) result.addresses.push({ value: addressLines(address).join(", "), label: address.label });
  for (const [index, link] of contact.links.entries()) if (chosen.has(`url-${index}`)) result.links.push(link.value);
  if (chosen.has("note")) result.note = contact.note;
  return result;
}

function PickedContact({ onPicked }: { onPicked: (contact: QrContact | null) => void }) {
  // The list is asked for whole and narrowed here: a search typed on this screen does not go to the server.
  const list = useContactList({ q: "", tag: "", limit: 1000 });
  const [id, setId] = useState<string>();
  const [filter, setFilter] = useState("");
  const one = useContact(id);
  const choices = useMemo(() => (one.data ? contactChoices(one.data) : []), [one.data]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  useEffect(() => {
    setChosen(usualChoices(choices));
  }, [choices]);

  useEffect(() => {
    onPicked(one.data ? contactFromChoices(one.data, chosen) : null);
  }, [one.data, chosen, onPicked]);

  if (list.isPending) return <Skeleton className="h-11" aria-label="Loading contacts" />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  const contacts = list.data.contacts;
  if (contacts.length === 0) {
    return (
      <p className="text-small text-ink-muted">
        There are no contacts in Outpost yet.{" "}
        <Link to="/contacts" className="font-medium text-primary underline underline-offset-[0.2em]">
          Open Contacts
        </Link>{" "}
        to add some, or type one here instead.
      </p>
    );
  }
  const needle = filter.trim().toLowerCase();
  const shown = needle ? contacts.filter((contact) => contact.displayName.toLowerCase().includes(needle)) : contacts;
  return (
    <div className="grid gap-4">
      {contacts.length > 12 ? (
        <Field label="Narrow the list" hint="Looked for on this device; nothing typed here is sent.">
          {(ids) => <Input {...ids} {...quiet} type="search" value={filter} onChange={(event) => setFilter(event.target.value)} />}
        </Field>
      ) : null}
      <Field label="Contact">
        {(ids) => (
          <Select
            id={ids.id}
            value={id}
            placeholder={shown.length === 0 ? "None match" : "Choose a contact"}
            disabled={shown.length === 0}
            onChange={setId}
            options={shown.slice(0, 300).map((contact) => ({ value: contact.id, label: contact.displayName || "Unnamed contact" }))}
          />
        )}
      </Field>
      {id && one.isPending ? <Skeleton className="h-24" aria-label="Loading the contact" /> : null}
      {one.isError ? <ErrorState error={one.error} onRetry={() => one.refetch()} /> : null}
      {one.data ? (
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-small font-medium text-ink">What goes in the code</legend>
          <p className="mb-1 text-small text-ink-muted">
            The name always does. Each line more makes the code denser and harder for a phone to read; a number and an email address are
            usually enough.
          </p>
          <CheckLine checked disabled>
            Name: <span className="text-ink">{one.data.displayName}</span>
          </CheckLine>
          {choices.map((choice) => (
            <CheckLine
              key={choice.id}
              checked={chosen.has(choice.id)}
              onChange={(checked) => {
                const next = new Set(chosen);
                if (checked) next.add(choice.id);
                else next.delete(choice.id);
                setChosen(next);
              }}
            >
              {choice.label}: {choice.value}
            </CheckLine>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
