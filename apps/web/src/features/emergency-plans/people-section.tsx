/**
 * Who and how: the household's people and what each must remember; the people to
 * contact, in order, chosen from Contacts (linked, not copied) or typed; and the
 * out-of-area contact. A linked contact deleted from Contacts since is shown as missing,
 * by the name it had, and is not dropped.
 *
 * The people of the plan's household (Households) are offered by name, one press each;
 * a name may be typed too. The name is copied into the plan, as a typed one is.
 */
import type { PlanContact, PlanPerson, PlanResolved } from "@outpost/shared";
import { CircleAlert, Link2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { useHouseholds, usePeople } from "@/features/households/use-household";
import { errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import { localId } from "@/lib/utils";
import { useContactSearch } from "./data";
import { move, RowTools, removeAt, replaceAt } from "./list-edit";

export interface PickedContact {
  contactId: string | null;
  name: string;
  phone: string;
}

/** Search Contacts and choose one, or (where a number typed is kept) type a name and number. */
export function ContactPicker({
  open,
  onOpenChange,
  title,
  typed = true,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Whether a name and number may be typed in instead; false where the plan has nowhere to keep the number. */
  typed?: boolean;
  onPick: (picked: PickedContact) => void;
}) {
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // Asked once typing pauses, not at every letter.
  const asked = useDebounced(q.trim(), 250);
  const found = useContactSearch(asked, open);
  const close = (next: boolean) => {
    if (!next) {
      setQ("");
      setName("");
      setPhone("");
    }
    onOpenChange(next);
  };
  const pick = (picked: PickedContact) => {
    onPick(picked);
    close(false);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={title}
        description={
          typed
            ? "Choose from Contacts, so that a changed number is changed here too, or type one in."
            : "Choose from Contacts, so that a changed number is changed here too."
        }
      >
        <DialogBody>
          <Field label="Find in Contacts">
            {(ids) => <Input {...ids} value={q} onChange={(event) => setQ(event.target.value)} placeholder="A name or number" />}
          </Field>
          {found.isError ? (
            <p role="alert" className="mt-2 text-small text-danger">
              {errorMessage(found.error)}
            </p>
          ) : found.isPending ? (
            <p className="mt-2 text-small text-ink-muted">Looking in Contacts…</p>
          ) : found.data.contacts.length === 0 ? (
            <p className="mt-2 text-small text-ink-muted">
              {found.data.all === 0
                ? typed
                  ? "There are no contacts in Outpost yet. Type the name and number below."
                  : "There are no contacts in Outpost yet. Add them under Contacts, then link one here."
                : `No contact matches “${asked}”.`}
            </p>
          ) : (
            <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto border-y border-border" aria-label="Contacts found">
              {found.data.contacts.map((contact) => (
                <li key={contact.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between gap-3 px-1 py-2 text-left hover:bg-surface"
                    onClick={() => pick({ contactId: contact.id, name: contact.displayName, phone: "" })}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{contact.displayName}</span>
                      <span className="tabular block truncate text-small text-ink-muted">
                        {contact.phones[0]?.value ?? "No phone number"}
                      </span>
                    </span>
                    <span className="text-small text-primary">Choose</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {typed ? (
            <form
              className="mt-5 grid gap-3 border-t border-border pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) pick({ contactId: null, name: name.trim(), phone: phone.trim() });
              }}
            >
              <p className="text-small font-medium text-ink">Or type one in</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  {(ids) => <Input {...ids} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />}
                </Field>
                <Field label="Phone number" optional>
                  {(ids) => (
                    <Input {...ids} value={phone} inputMode="tel" maxLength={120} onChange={(event) => setPhone(event.target.value)} />
                  )}
                </Field>
              </div>
              <Button type="submit" className="justify-self-start" disabled={!name.trim()}>
                Add as typed
              </Button>
            </form>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => close(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A linked contact's name and numbers as Contacts has them now, or that it is missing. */
function LinkedLine({ contactId, name, resolved }: { contactId: string; name: string; resolved: PlanResolved }) {
  const now = resolved.contacts[contactId];
  if (now === null)
    return (
      <p className="flex items-center gap-1.5 text-small text-warning">
        <CircleAlert aria-hidden className="size-4 shrink-0" /> {name}: no longer in Contacts. Choose another or type the number in.
      </p>
    );
  if (now === undefined) return <p className="text-small text-ink-muted">{name}, from Contacts. Saving…</p>;
  return (
    <p className="text-small text-ink-muted">
      <Link to={`/contacts/${contactId}`} className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
        <Link2 aria-hidden className="size-3.5" />
        {now.displayName}
      </Link>
      <span className="tabular">
        {now.phones.length > 0 ? `, ${now.phones.map((phone) => phone.value).join(", ")}` : ", no phone number"}
      </span>
    </p>
  );
}

export function ContactsSection({
  contacts,
  resolved,
  onChange,
}: {
  contacts: PlanContact[];
  resolved: PlanResolved;
  onChange: (contacts: PlanContact[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const hasAway = contacts.some((contact) => contact.outOfArea);
  return (
    <Section
      title="Who to contact, in this order"
      description="Numbers from Contacts stay up to date here. If someone well away from home is to be the one everyone contacts, mark them as the out-of-area contact."
      actions={<Button onClick={() => setPicking(true)}>Add a contact</Button>}
    >
      {contacts.length === 0 ? (
        <p className="text-small text-ink-muted">Nobody yet.</p>
      ) : (
        <ol className="divide-y divide-border border-y border-border">
          {contacts.map((contact, index) => (
            <li key={contact.id} className="flex gap-2 py-3">
              <span className="tabular w-6 shrink-0 pt-2 text-right text-small text-ink-muted">{index + 1}.</span>
              <div className="grid min-w-0 flex-1 gap-2">
                {contact.contactId ? (
                  <LinkedLine contactId={contact.contactId} name={contact.name} resolved={resolved} />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      aria-label={`Name of contact ${index + 1}`}
                      value={contact.name}
                      maxLength={120}
                      onChange={(event) => onChange(replaceAt(contacts, index, { ...contact, name: event.target.value }))}
                    />
                    <Input
                      aria-label={`Phone number of ${contact.name || `contact ${index + 1}`}`}
                      value={contact.phone}
                      inputMode="tel"
                      maxLength={120}
                      className="tabular"
                      onChange={(event) => onChange(replaceAt(contacts, index, { ...contact, phone: event.target.value }))}
                    />
                  </div>
                )}
                <Input
                  aria-label={`Why ${contact.name || "this contact"}`}
                  placeholder="Why: has a spare key, the electricity network"
                  value={contact.note}
                  maxLength={600}
                  onChange={(event) => onChange(replaceAt(contacts, index, { ...contact, note: event.target.value }))}
                />
                <label htmlFor={`${contact.id}-away`} className="flex min-h-11 items-center gap-3 text-small text-ink">
                  <Switch
                    id={`${contact.id}-away`}
                    checked={contact.outOfArea}
                    onCheckedChange={(checked) => onChange(replaceAt(contacts, index, { ...contact, outOfArea: checked }))}
                  />
                  Out-of-area contact
                </label>
              </div>
              <RowTools
                name={contact.name}
                first={index === 0}
                last={index === contacts.length - 1}
                onMove={(by) => onChange(move(contacts, index, by))}
                onRemove={() => onChange(removeAt(contacts, index))}
              />
            </li>
          ))}
        </ol>
      )}
      {contacts.length > 0 && !hasAway ? (
        <p className="mt-2 text-small text-ink-muted">No one is marked as the out-of-area contact yet.</p>
      ) : null}
      <ContactPicker
        open={picking}
        onOpenChange={setPicking}
        title="Add a contact"
        onPick={(picked) => onChange([...contacts, { id: localId(), ...picked, note: "", outOfArea: false }])}
      />
    </Section>
  );
}

/**
 * The people of a household not yet in the plan, by name, in the household's order.
 * Pets are left out: a plan's people each get a wallet card. Pure, for the tests.
 */
export function householdPeopleToOffer(
  personIds: readonly string[],
  everyone: ReadonlyArray<{ id: string; name: string; kind: string }>,
  inPlan: readonly PlanPerson[],
): Array<{ id: string; name: string }> {
  const taken = new Set(inPlan.map((person) => person.name.trim().toLocaleLowerCase()));
  const byId = new Map(everyone.map((person) => [person.id, person]));
  return personIds
    .map((id) => byId.get(id))
    .filter((person): person is { id: string; name: string; kind: string } => person !== undefined && person.kind === "person")
    .filter((person) => person.name.trim() !== "" && !taken.has(person.name.trim().toLocaleLowerCase()))
    .map((person) => ({ id: person.id, name: person.name.trim() }));
}

/** The plan's household's people, offered by name. Nothing while they load or when everyone is in. */
function FromHousehold({
  householdId,
  people,
  onAdd,
}: {
  householdId: string | undefined;
  people: PlanPerson[];
  onAdd: (name: string) => void;
}) {
  const households = useHouseholds();
  const everyone = usePeople();
  const household = households.data
    ? (households.data.households.find((entry) => entry.id === (householdId ?? households.data.currentId)) ?? null)
    : null;
  const offered = useMemo(
    () => (household && everyone.data ? householdPeopleToOffer(household.personIds, everyone.data, people) : []),
    [household, everyone.data, people],
  );
  if (offered.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="household-people">
      <span className="text-small text-ink-muted">
        {households.data && households.data.households.length > 1 ? `In ${household?.name}:` : "In the household:"}
      </span>
      {offered.map((person) => (
        <Button key={person.id} size="sm" onClick={() => onAdd(person.name)}>
          Add {person.name}
        </Button>
      ))}
    </div>
  );
}

export function PeopleSection({
  people,
  resolved,
  householdId,
  onChange,
}: {
  people: PlanPerson[];
  resolved: PlanResolved;
  /** The household the plan is for, whose people are offered; left out, the current one. */
  householdId?: string;
  onChange: (people: PlanPerson[]) => void;
}) {
  const [linking, setLinking] = useState<number | null>(null);
  const add = (name = "") => onChange([...people, { id: localId(), name, remember: "", medical: "", contactId: null }]);
  return (
    <Section
      title="The household"
      description="Each person, and what they need to remember. Each gets a wallet card; anything medical goes only on their own card, and only if they choose."
      actions={<Button onClick={() => add()}>Add a person</Button>}
    >
      <FromHousehold householdId={householdId} people={people} onAdd={add} />
      {people.length === 0 ? (
        <p className="text-small text-ink-muted">Nobody yet. Add the people this plan is for.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {people.map((person, index) => (
            <li key={person.id} className="flex gap-2 py-3">
              <div className="grid min-w-0 flex-1 gap-2">
                <Field label="Name">
                  {(ids) => (
                    <Input
                      {...ids}
                      value={person.name}
                      maxLength={120}
                      onChange={(event) => onChange(replaceAt(people, index, { ...person, name: event.target.value }))}
                    />
                  )}
                </Field>
                <Field label="What to remember or do" optional>
                  {(ids) => (
                    <Textarea
                      {...ids}
                      rows={2}
                      className="min-h-0"
                      value={person.remember}
                      maxLength={600}
                      onChange={(event) => onChange(replaceAt(people, index, { ...person, remember: event.target.value }))}
                    />
                  )}
                </Field>
                <Field label="Medical, for their card" optional hint="Printed only on this person's own wallet card.">
                  {(ids) => (
                    <Input
                      {...ids}
                      value={person.medical}
                      maxLength={600}
                      onChange={(event) => onChange(replaceAt(people, index, { ...person, medical: event.target.value }))}
                    />
                  )}
                </Field>
                {person.contactId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <LinkedLine contactId={person.contactId} name={person.name} resolved={resolved} />
                    <Button variant="ghost" onClick={() => onChange(replaceAt(people, index, { ...person, contactId: null }))}>
                      Unlink
                    </Button>
                  </div>
                ) : (
                  <Button className="justify-self-start" onClick={() => setLinking(index)}>
                    Link their own number from Contacts
                  </Button>
                )}
              </div>
              <RowTools
                name={person.name || `person ${index + 1}`}
                first={index === 0}
                last={index === people.length - 1}
                onMove={(by) => onChange(move(people, index, by))}
                onRemove={() => onChange(removeAt(people, index))}
              />
            </li>
          ))}
        </ul>
      )}
      <ContactPicker
        open={linking !== null}
        onOpenChange={(open) => !open && setLinking(null)}
        title="Their own number"
        typed={false}
        onPick={(picked) => {
          if (linking === null) return;
          const person = people[linking]!;
          onChange(replaceAt(people, linking, { ...person, contactId: picked.contactId, name: person.name || picked.name }));
        }}
      />
    </Section>
  );
}
