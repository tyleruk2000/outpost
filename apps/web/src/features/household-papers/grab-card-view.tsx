/**
 * A grab card to read on the phone, in large type, before any print: what the printed card
 * holds, in the same order, with numbers that call and home's address before its position.
 * Made from the same pieces as the card (`GrabPerson`, `GrabHousehold`), so the two agree.
 */
import { dialable, formatDecimal } from "@outpost/shared";
import { Phone } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { Segmented } from "@/components/ui/misc";
import type { GrabHousehold, GrabPerson } from "./grab-cards";

function Call({ label, phone, big }: { label: string; phone: string; big?: boolean }) {
  const dial = dialable(phone);
  const style = big ? "text-title" : "text-heading";
  return dial ? (
    <a
      href={`tel:${dial}`}
      aria-label={`Call ${label}: ${phone}`}
      className={`tabular inline-flex min-h-12 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline ${style}`}
    >
      <Phone aria-hidden className="size-5 shrink-0" />
      <span className="whitespace-nowrap">{phone}</span>
    </a>
  ) : (
    <span className={`tabular font-semibold text-ink ${style}`}>{phone}</span>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-border py-3">
      <h3 className="text-body text-ink-muted">{title}</h3>
      <div className="mt-1 grid gap-1">{children}</div>
    </div>
  );
}

export function GrabCardView({
  people,
  household,
  householdTo,
}: {
  people: GrabPerson[];
  household: GrabHousehold;
  /** The household's page, where the address is given. */
  householdTo: string;
}) {
  const [shown, setShown] = useState(0);
  const person = people[Math.min(shown, people.length - 1)];
  if (!person) return null;
  const calls = [...person.contacts, ...household.contacts].filter((entry) => entry.phone);
  const address = (household.home?.address ?? "").split("\n").filter(Boolean);
  return (
    <section aria-labelledby="grab-on-phone" className="grid gap-3">
      <h2 id="grab-on-phone" className="text-heading font-semibold text-ink">
        On this phone
      </h2>
      {people.length > 1 ? (
        <Segmented<string>
          label="Whose card"
          value={String(Math.min(shown, people.length - 1))}
          onChange={(next) => setShown(Number(next))}
          options={people.map((each, index) => ({ value: String(index), label: each.name || `Person ${index + 1}` }))}
          className="justify-self-start"
        />
      ) : null}
      <article
        aria-label={`Grab card: ${person.name || "name not given"}`}
        className="rounded-panel border border-border px-4 pt-3 text-lead"
      >
        <p className="text-body text-ink-muted">In an emergency</p>
        <p className="font-title text-title text-ink">{person.name || "Name not given"}</p>
        <div className="mt-2 pb-3">
          <p className="text-body text-ink">Emergency services</p>
          {household.emergencyNumber.trim() ? (
            <Call label="the emergency services" phone={household.emergencyNumber.trim()} big />
          ) : (
            <p className="text-lead text-warning">Not given in the plans: add your local number to a plan.</p>
          )}
        </div>
        {(household.remember?.[person.name] ?? []).length > 0 ? (
          <Part title="Remember">
            {household.remember![person.name]!.map((line) => (
              <p key={line} className="text-ink">
                {line}
              </p>
            ))}
          </Part>
        ) : null}
        {person.sheetLocked ? (
          <Part title="Medical">
            <p className="text-ink-muted">The medical sheet is kept encrypted: open it on this device to see it here.</p>
          </Part>
        ) : (
          <Part title="Medical">
            <p className="text-ink">Blood group: {person.bloodGroup || "not known"}</p>
            {person.allergies.length > 0 ? <p className="font-semibold text-ink">Allergies: {person.allergies.join("; ")}</p> : null}
            {person.needs.length > 0 ? <p className="text-ink">{person.needs.join("; ")}</p> : null}
            {person.medicines.length > 0 ? <p className="text-ink">Medicines: {person.medicines.join("; ")}</p> : null}
          </Part>
        )}
        {calls.length > 0 ? (
          <Part title="Who to contact, in this order">
            {calls.map((entry) => (
              <div key={`${entry.label}-${entry.phone}`} className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-ink">{entry.label}</span>
                <Call label={entry.label} phone={entry.phone} />
              </div>
            ))}
          </Part>
        ) : null}
        {household.places.length > 0 ? (
          <Part title="Where we meet">
            {household.places.map((place) => (
              <p key={place} className="text-ink">
                {place}
              </p>
            ))}
          </Part>
        ) : null}
        {household.comms.length > 0 ? (
          <Part title="If the phones fail">
            {household.comms.map((line) => (
              <p key={line} className="text-ink">
                {line}
              </p>
            ))}
          </Part>
        ) : null}
        {household.home ? (
          <Part title={`Home: ${household.home.name}`}>
            {address.length > 0 ? (
              address.map((line) => (
                <p key={line} className="font-semibold text-ink">
                  {line}
                </p>
              ))
            ) : (
              <p className="text-body text-ink-muted">
                No address given.{" "}
                <Link to={`${householdTo}#place`} className="text-primary underline underline-offset-2">
                  Add the address
                </Link>
              </p>
            )}
            <p className="tabular font-mono text-body text-ink-muted">{formatDecimal(household.home.lat, household.home.lon, 5)}</p>
          </Part>
        ) : null}
        {household.travelling ? (
          <Part title={`Travelling with ${household.travelling.household}`}>
            {household.travelling.people.length > 0 ? <p className="text-ink">{household.travelling.people.join(", ")}</p> : null}
            {household.travelling.kit ? <p className="text-ink">Kit: {household.travelling.kit}</p> : null}
          </Part>
        ) : null}
      </article>
    </section>
  );
}
