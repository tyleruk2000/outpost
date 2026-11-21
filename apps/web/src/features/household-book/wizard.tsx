/**
 * The questions the household book is made from, one step at a time. Each step is saved
 * as a draft when the person moves on, so the questions can be left and taken up again on
 * any device. People and pets are Supplies' household: added here, they are added there.
 */
import {
  BOOK_HAZARDS,
  BOOK_LIMITS,
  BOOK_SECTIONS,
  BOOK_STEPS,
  type BookAnswers,
  type BookStepId,
  EMERGENCY_NUMBERS,
  ENERGY_BANDS,
  formatDecimal,
  type Household,
  type HouseholdMember,
  homePlaceOf,
  type MarkerDto,
  NO_HOME_PLACE,
  placeName,
  RECEIVER_PROFILES,
  sourceById,
} from "@outpost/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { Notice, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Checkbox, Segmented, Select } from "@/components/ui/misc";
import { useSetHousehold } from "@/features/supplies/data";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { localId } from "@/lib/utils";

interface WizardProps {
  answers: BookAnswers;
  household: Household | null;
  markers: MarkerDto[];
  /** Which country home is in, from what Outpost holds; null when not known. */
  country: string | null;
  /** Which of the people have a medical sheet. */
  sheets: ReadonlySet<string>;
  saving: boolean;
  /** Saves the answers as a draft; resolves once saved. */
  save: (answers: BookAnswers) => Promise<void>;
  onDone: () => void;
  startAt?: BookStepId;
}

const NONE = "__none__";

export function BookWizard({ answers: initial, household, markers, country, sheets, saving, save, onDone, startAt }: WizardProps) {
  const [answers, setAnswers] = useState<BookAnswers>(initial);
  const [step, setStep] = useState<BookStepId>(startAt ?? "people");
  const index = BOOK_STEPS.findIndex((each) => each.id === step);
  const set = (patch: Partial<BookAnswers>) => setAnswers((current) => ({ ...current, ...patch }));

  const go = async (to: number | "done") => {
    try {
      await save(answers);
    } catch (error) {
      notify.error(errorMessage(error));
      return;
    }
    if (to === "done") onDone();
    else setStep(BOOK_STEPS[to]!.id);
  };

  return (
    <div className="grid gap-6">
      <nav aria-label="The questions">
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-small">
          {BOOK_STEPS.map((each, at) => (
            <li key={each.id}>
              <button
                type="button"
                onClick={() => void go(at)}
                aria-current={each.id === step ? "step" : undefined}
                className={
                  each.id === step
                    ? "min-h-11 font-semibold text-ink underline underline-offset-4 md:min-h-0"
                    : "min-h-11 text-ink-muted hover:text-ink md:min-h-0"
                }
              >
                {at + 1}. {each.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <h2 className="font-title text-heading text-ink">
        Step {index + 1} of {BOOK_STEPS.length}: {BOOK_STEPS[index]!.label}
      </h2>

      {step === "people" ? (
        <PeopleStep answers={answers} set={set} household={household} sheets={sheets} />
      ) : step === "home" ? (
        <HomeStep answers={answers} set={set} markers={markers} country={country} />
      ) : step === "places" ? (
        <PlacesStep answers={answers} set={set} markers={markers} />
      ) : step === "vehicles" ? (
        <VehiclesStep answers={answers} set={set} />
      ) : step === "readiness" ? (
        <ReadinessStep answers={answers} set={set} />
      ) : (
        <BookStep answers={answers} set={set} country={country} />
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        {index < BOOK_STEPS.length - 1 ? (
          <Button variant="primary" loading={saving} onClick={() => void go(index + 1)}>
            Save and go on <ArrowRight />
          </Button>
        ) : (
          <Button variant="primary" loading={saving} onClick={() => void go("done")}>
            <Check /> Save the answers
          </Button>
        )}
        {index > 0 ? (
          <Button onClick={() => void go(index - 1)}>
            <ArrowLeft /> Back
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => void go("done")}>
          Save and stop here
        </Button>
      </div>
    </div>
  );
}

type StepProps = { answers: BookAnswers; set: (patch: Partial<BookAnswers>) => void };

function Lead({ children }: { children: ReactNode }) {
  return <p className="max-w-[65ch] text-body text-ink-muted">{children}</p>;
}

// ── People and pets ─────────────────────────────────────────────────────────

const isChild = (member: HouseholdMember) => ["under-1", "1", "2-3", "4-6", "7-10", "11-14"].includes(member.band ?? "");

function PeopleStep({ answers, set, household, sheets }: StepProps & { household: Household | null; sheets: ReadonlySet<string> }) {
  const setHousehold = useSetHousehold();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [band, setBand] = useState<string>("19-64");
  const [kind, setKind] = useState<"person" | "pet">("person");
  const members = household?.members ?? [];

  const extra = (memberId: string, member?: HouseholdMember) =>
    answers.people.find((person) => person.memberId === memberId) ?? {
      memberId,
      needs: "",
      carries: "",
      childCard: member ? isChild(member) : false,
    };
  const setExtra = (memberId: string, patch: Partial<BookAnswers["people"][number]>, member?: HouseholdMember) => {
    const next = { ...extra(memberId, member), ...patch };
    set({ people: [...answers.people.filter((person) => person.memberId !== memberId), next] });
  };

  const add = () => {
    if (!household || !name.trim()) return;
    const member = {
      kind,
      name: name.trim(),
      band: kind === "person" ? (band as HouseholdMember["band"]) : null,
      sex: null,
      kcalPerDay: null,
      drinkingLitres: null,
      allUsesLitres: null,
      note: "",
    };
    setHousehold.mutate(
      {
        daysWanted: household.daysWanted,
        drinkingLitres: household.drinkingLitres,
        allUsesLitres: household.allUsesLitres,
        waterBasis: household.waterBasis,
        members: [...household.members, member],
      },
      {
        onSuccess: () => {
          setName("");
          void client.invalidateQueries({ queryKey: ["supplies"] });
        },
        onError: (error) => notify.error(errorMessage(error)),
      },
    );
  };

  return (
    <div className="grid gap-6">
      <Lead>
        Everyone at home, and the pets. They are the household in Supplies, where the food and water they need is worked out: added here,
        they are added there. Say what each person needs and carries; the book puts it on their page.
      </Lead>
      {members.length === 0 ? (
        <p className="text-small text-ink-muted">No one is listed yet.</p>
      ) : (
        <Rows>
          {members.map((member) => {
            const own = extra(member.id, member);
            return (
              <li key={member.id} className="grid gap-3 py-4">
                <p className="text-ink">
                  <span className="font-semibold">{member.name || "Unnamed"}</span>{" "}
                  <span className="text-small text-ink-muted">
                    {member.kind === "pet" ? "Pet" : (ENERGY_BANDS.find((entry) => entry.id === member.band)?.label ?? "Age not given")}
                    {member.kind === "person" ? (sheets.has(member.id) ? " · Has a medical sheet" : " · No medical sheet") : ""}
                  </span>
                </p>
                {member.kind === "person" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Needs" optional hint="“Uses a wheelchair”, “hard of hearing”.">
                      {(ids) => (
                        <Input
                          {...ids}
                          maxLength={BOOK_LIMITS.text}
                          value={own.needs}
                          onChange={(event) => setExtra(member.id, { needs: event.target.value }, member)}
                        />
                      )}
                    </Field>
                    <Field label="Carries" optional hint="“Inhaler in coat pocket”.">
                      {(ids) => (
                        <Input
                          {...ids}
                          maxLength={BOOK_LIMITS.text}
                          value={own.carries}
                          onChange={(event) => setExtra(member.id, { carries: event.target.value }, member)}
                        />
                      )}
                    </Field>
                    <label htmlFor={`card-${member.id}`} className="flex min-h-11 items-center gap-3 text-small text-ink">
                      <Checkbox
                        id={`card-${member.id}`}
                        checked={own.childCard}
                        onCheckedChange={(on) => setExtra(member.id, { childCard: on === true }, member)}
                      />
                      A card of their own, to carry
                    </label>
                  </div>
                ) : null}
              </li>
            );
          })}
        </Rows>
      )}
      <Section title="Add someone" description="Change or take anyone out under Supplies → Household.">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <Field label="Name">
            {(ids) => <Input {...ids} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />}
          </Field>
          <Segmented<"person" | "pet">
            label="Person or pet"
            value={kind}
            onChange={setKind}
            options={[
              { value: "person", label: "Person" },
              { value: "pet", label: "Pet" },
            ]}
          />
          {kind === "person" ? (
            <Field label="Age">
              {(ids) => (
                <Select
                  {...ids}
                  value={band}
                  onChange={setBand}
                  options={ENERGY_BANDS.map((entry) => ({ value: entry.id, label: entry.label }))}
                />
              )}
            </Field>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={add} disabled={!household || !name.trim()} loading={setHousehold.isPending}>
            <Plus /> Add to the household
          </Button>
          <Link to="/prepare/medical" className="text-small text-primary underline underline-offset-2">
            Medical sheets
          </Link>
        </div>
      </Section>
    </div>
  );
}

// ── Home ────────────────────────────────────────────────────────────────────

function HomeStep({ answers, set, markers, country }: StepProps & { markers: MarkerDto[]; country: string | null }) {
  const home = homePlaceOf(markers);
  const client = useQueryClient();
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [busy, setBusy] = useState(false);
  const published = country ? EMERGENCY_NUMBERS.find((entry) => entry.regions.includes(country)) : undefined;

  const saveHome = async () => {
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      notify.error("Give the latitude and longitude in degrees: 51.5074 and -0.1278, say.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/maps/markers", { name: "Home", lat: latitude, lon: longitude, icon: "home" });
      await client.invalidateQueries({ queryKey: ["maps"] });
      await client.invalidateQueries({ queryKey: ["household-book"] });
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6">
      <Lead>
        Home is the saved place on the map with the home icon. Everything near home in the book is measured from it, and the paper and the
        emergency number follow the country it is in.
      </Lead>
      {home ? (
        <p className="text-body text-ink">
          Home: <span className="font-semibold">{home.name || "Home"}</span>{" "}
          <span className="font-mono text-small text-ink-muted">{formatDecimal(home.lat, home.lon, 5)}</span>
          {country ? <span className="text-small text-ink-muted"> · {placeName(country)}</span> : null}
        </p>
      ) : (
        <div className="grid gap-3">
          <Notice tone="info" title="No home is marked">
            {NO_HOME_PLACE}{" "}
            <Link to="/maps" className="text-primary underline underline-offset-2">
              Open Maps
            </Link>
          </Notice>
          <p className="text-small text-ink-muted">Or give where home is, and it is saved as a place on the map with the home icon.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Latitude">
              {(ids) => <Input {...ids} inputMode="decimal" value={lat} onChange={(event) => setLat(event.target.value)} />}
            </Field>
            <Field label="Longitude">
              {(ids) => <Input {...ids} inputMode="decimal" value={lon} onChange={(event) => setLon(event.target.value)} />}
            </Field>
          </div>
          <div>
            <Button onClick={() => void saveHome()} loading={busy} disabled={!lat.trim() || !lon.trim()}>
              Save as home
            </Button>
          </div>
        </div>
      )}
      <Field
        label="The number for the emergency services"
        hint={
          published
            ? `${published.number} ${published.where}, from ${sourceById(published.source)?.publisher ?? "its published source"}. Leave empty to use it.`
            : "Where home is not known, or its country's number is not in Outpost's list, type it."
        }
      >
        {(ids) => (
          <Input
            {...ids}
            inputMode="tel"
            className="max-w-48"
            value={answers.emergencyNumber}
            placeholder={published?.number ?? ""}
            onChange={(event) => set({ emergencyNumber: event.target.value })}
          />
        )}
      </Field>
    </div>
  );
}

// ── Where you would go and meet ─────────────────────────────────────────────

function PlacesStep({ answers, set, markers }: StepProps & { markers: MarkerDto[] }) {
  const contacts = useQuery({
    queryKey: ["contacts", "list", { q: "", tag: "", limit: 300 }],
    queryFn: () => api.get<{ contacts: Array<{ id: string; displayName: string }> }>("/api/contacts", { q: "", tag: "", limit: 300 }),
  });
  const placeOptions = [
    { value: NONE, label: "None" },
    ...markers.filter((marker) => marker.icon !== "home").map((marker) => ({ value: marker.id, label: marker.name || "Unnamed place" })),
  ];
  const contactOptions = [
    { value: NONE, label: "None" },
    ...(contacts.data?.contacts ?? []).map((contact) => ({ value: contact.id, label: contact.displayName })),
  ];
  const savedPlaces = placeOptions.length > 1;

  return (
    <div className="grid gap-8">
      <Lead>
        Where the household meets if it cannot get home or must leave, and the people it would go to. Places are saved places on the map:
        mark them on Maps first. The book draws the journey to each person, on foot and by car.
      </Lead>
      {!savedPlaces ? (
        <Notice tone="info" title="No saved places yet">
          Save the meeting points and the homes of the people you would go to on Maps, then come back.{" "}
          <Link to="/maps" className="text-primary underline underline-offset-2">
            Open Maps
          </Link>
        </Notice>
      ) : null}

      <Section title="Meeting points">
        <Rows>
          {answers.meetingPoints.map((point) => (
            <li key={point.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-end">
              <Field label="Place">
                {(ids) => (
                  <Select
                    {...ids}
                    value={point.markerId}
                    onChange={(value) =>
                      set({
                        meetingPoints: answers.meetingPoints.map((each) => (each.id === point.id ? { ...each, markerId: value } : each)),
                      })
                    }
                    options={placeOptions.filter((option) => option.value !== NONE)}
                  />
                )}
              </Field>
              <Segmented<"near" | "away">
                label="When"
                value={point.role}
                onChange={(role) =>
                  set({ meetingPoints: answers.meetingPoints.map((each) => (each.id === point.id ? { ...each, role } : each)) })
                }
                options={[
                  { value: "near", label: "Near home" },
                  { value: "away", label: "Outside the area" },
                ]}
              />
              <Field label="Note" optional>
                {(ids) => (
                  <Input
                    {...ids}
                    value={point.note}
                    maxLength={BOOK_LIMITS.text}
                    onChange={(event) =>
                      set({
                        meetingPoints: answers.meetingPoints.map((each) =>
                          each.id === point.id ? { ...each, note: event.target.value } : each,
                        ),
                      })
                    }
                  />
                )}
              </Field>
              <Button
                variant="ghost"
                aria-label="Take this meeting point out"
                onClick={() => set({ meetingPoints: answers.meetingPoints.filter((each) => each.id !== point.id) })}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </Rows>
        <Button
          className="mt-3"
          disabled={!savedPlaces || answers.meetingPoints.length >= BOOK_LIMITS.places}
          onClick={() =>
            set({
              meetingPoints: [
                ...answers.meetingPoints,
                { id: localId(), markerId: placeOptions[1]!.value, role: answers.meetingPoints.length === 0 ? "near" : "away", note: "" },
              ],
            })
          }
        >
          <Plus /> Add a meeting point
        </Button>
      </Section>

      <Section title="The people you would go to">
        <Rows>
          {answers.destinations.map((destination) => {
            const change = (patch: Partial<typeof destination>) =>
              set({ destinations: answers.destinations.map((each) => (each.id === destination.id ? { ...each, ...patch } : each)) });
            return (
              <li key={destination.id} className="grid gap-3 py-3 sm:grid-cols-2">
                <Field label="Name">
                  {(ids) => (
                    <Input
                      {...ids}
                      value={destination.name}
                      maxLength={BOOK_LIMITS.short}
                      onChange={(event) => change({ name: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Where (a saved place)">
                  {(ids) => (
                    <Select
                      {...ids}
                      value={destination.markerId ?? NONE}
                      onChange={(value) => change({ markerId: value === NONE ? null : value })}
                      options={placeOptions}
                    />
                  )}
                </Field>
                <Field label="Contact" optional hint="A contact with a saved place stands in for the place.">
                  {(ids) => (
                    <Select
                      {...ids}
                      value={destination.contactId ?? NONE}
                      onChange={(value) => change({ contactId: value === NONE ? null : value })}
                      options={contactOptions}
                    />
                  )}
                </Field>
                <Field label="Note" optional>
                  {(ids) => (
                    <Input
                      {...ids}
                      value={destination.note}
                      maxLength={BOOK_LIMITS.text}
                      onChange={(event) => change({ note: event.target.value })}
                    />
                  )}
                </Field>
                <div>
                  <Button
                    variant="ghost"
                    onClick={() => set({ destinations: answers.destinations.filter((each) => each.id !== destination.id) })}
                  >
                    <Trash2 /> Take out {destination.name || "this place"}
                  </Button>
                </div>
              </li>
            );
          })}
        </Rows>
        <Button
          className="mt-3"
          disabled={answers.destinations.length >= BOOK_LIMITS.places}
          onClick={() =>
            set({ destinations: [...answers.destinations, { id: localId(), name: "", markerId: null, contactId: null, note: "" }] })
          }
        >
          <Plus /> Add someone to go to
        </Button>
      </Section>
    </div>
  );
}

// ── Vehicles and radios ─────────────────────────────────────────────────────

function VehiclesStep({ answers, set }: StepProps) {
  const number = (text: string) => (text.trim() === "" || !Number.isFinite(Number(text)) ? null : Number(text));
  return (
    <div className="grid gap-8">
      <Section title="Vehicles" description="The book compares each one's range with the journeys.">
        <Rows>
          {answers.vehicles.map((vehicle) => {
            const change = (patch: Partial<typeof vehicle>) =>
              set({ vehicles: answers.vehicles.map((each) => (each.id === vehicle.id ? { ...each, ...patch } : each)) });
            return (
              <li key={vehicle.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_6rem_auto] sm:items-end">
                <Field label="Name">
                  {(ids) => (
                    <Input
                      {...ids}
                      value={vehicle.name}
                      maxLength={BOOK_LIMITS.short}
                      onChange={(event) => change({ name: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Range, km" optional>
                  {(ids) => (
                    <Input
                      {...ids}
                      inputMode="numeric"
                      value={vehicle.rangeKm ?? ""}
                      onChange={(event) => change({ rangeKm: number(event.target.value) })}
                    />
                  )}
                </Field>
                <Field label="Seats" optional>
                  {(ids) => (
                    <Input
                      {...ids}
                      inputMode="numeric"
                      value={vehicle.seats ?? ""}
                      onChange={(event) => change({ seats: number(event.target.value) })}
                    />
                  )}
                </Field>
                <Button
                  variant="ghost"
                  aria-label={`Take out ${vehicle.name || "this vehicle"}`}
                  onClick={() => set({ vehicles: answers.vehicles.filter((each) => each.id !== vehicle.id) })}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </Rows>
        <Button
          className="mt-3"
          disabled={answers.vehicles.length >= BOOK_LIMITS.vehicles}
          onClick={() => set({ vehicles: [...answers.vehicles, { id: localId(), name: "", rangeKm: null, seats: null, note: "" }] })}
        >
          <Plus /> Add a vehicle
        </Button>
      </Section>
      <Section
        title="Radios"
        description="The book lists the stations these can receive where home is, from Outpost's list of frequencies."
      >
        <Rows>
          {RECEIVER_PROFILES.map((profile) => (
            <li key={profile.id} className="py-2">
              <label htmlFor={`set-${profile.id}`} className="flex min-h-11 items-start gap-3">
                <Checkbox
                  id={`set-${profile.id}`}
                  className="mt-1"
                  checked={answers.receivers.includes(profile.id)}
                  onCheckedChange={(on) =>
                    set({
                      receivers: on === true ? [...answers.receivers, profile.id] : answers.receivers.filter((id) => id !== profile.id),
                    })
                  }
                />
                <span>
                  <span className="block text-ink">{profile.label}</span>
                  <span className="block text-small text-ink-muted">{profile.about}</span>
                </span>
              </label>
            </li>
          ))}
        </Rows>
      </Section>
    </div>
  );
}

// ── How long, and which hazards ─────────────────────────────────────────────

function ReadinessStep({ answers, set }: StepProps) {
  return (
    <div className="grid gap-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Days to be ready for" hint="The shopping list and the water are worked out for this many days.">
          {(ids) => (
            <Input
              {...ids}
              type="number"
              min={1}
              max={BOOK_LIMITS.days}
              value={answers.days}
              onChange={(event) => set({ days: Math.max(1, Math.min(BOOK_LIMITS.days, Math.round(Number(event.target.value) || 1))) })}
            />
          )}
        </Field>
        <Field label="Hours of walking in a day" hint="Your own figure: where each day's walking ends on a long journey.">
          {(ids) => (
            <Input
              {...ids}
              type="number"
              min={1}
              max={14}
              value={answers.walkHoursPerDay}
              onChange={(event) => set({ walkHoursPerDay: Math.max(1, Math.min(14, Number(event.target.value) || 1)) })}
            />
          )}
        </Field>
      </div>
      <Section title="Which hazards matter" description="Each has a page of what to do before, during and after, from official guidance.">
        <Rows>
          {BOOK_HAZARDS.map((hazard) => (
            <li key={hazard.id} className="py-1">
              <label htmlFor={`hazard-${hazard.id}`} className="flex min-h-11 items-center gap-3 text-ink">
                <Checkbox
                  id={`hazard-${hazard.id}`}
                  checked={answers.hazards.includes(hazard.id)}
                  onCheckedChange={(on) =>
                    set({ hazards: on === true ? [...answers.hazards, hazard.id] : answers.hazards.filter((id) => id !== hazard.id) })
                  }
                />
                {hazard.label}
              </label>
            </li>
          ))}
        </Rows>
      </Section>
    </div>
  );
}

// ── What goes in the book ───────────────────────────────────────────────────

function BookStep({ answers, set, country }: StepProps & { country: string | null }) {
  return (
    <div className="grid gap-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="The household's name" optional hint="On the cover: “The Rowans”.">
          {(ids) => (
            <Input
              {...ids}
              value={answers.householdName}
              maxLength={BOOK_LIMITS.short}
              onChange={(event) => set({ householdName: event.target.value })}
            />
          )}
        </Field>
        <Field label="Blank pages for notes">
          {(ids) => (
            <Input
              {...ids}
              type="number"
              min={0}
              max={BOOK_LIMITS.notesPages}
              value={answers.notesPages}
              onChange={(event) =>
                set({ notesPages: Math.max(0, Math.min(BOOK_LIMITS.notesPages, Math.round(Number(event.target.value) || 0))) })
              }
            />
          )}
        </Field>
      </div>
      <div className="grid gap-2">
        <Segmented<"a4" | "letter">
          label="Paper"
          value={answers.paper}
          onChange={(paper) => set({ paper })}
          options={[
            { value: "a4", label: "A4" },
            { value: "letter", label: "US Letter" },
          ]}
        />
        <p className="text-small text-ink-muted">
          {country ? `Home is in ${placeName(country)}. ` : ""}US Letter is the size in the United States, Canada and a few other countries;
          A4 everywhere else.
        </p>
      </div>
      <Section title="What goes in it">
        <Rows>
          {BOOK_SECTIONS.map((section) => (
            <li key={section.id} className="py-2">
              <label htmlFor={`section-${section.id}`} className="flex min-h-11 items-start gap-3">
                <Checkbox
                  id={`section-${section.id}`}
                  className="mt-1"
                  checked={answers.sections.includes(section.id)}
                  onCheckedChange={(on) =>
                    set({
                      sections: BOOK_SECTIONS.map((each) => each.id).filter((id) =>
                        id === section.id ? on === true : answers.sections.includes(id),
                      ),
                    })
                  }
                />
                <span>
                  <span className="block text-ink">{section.label}</span>
                  <span className="block text-small text-ink-muted">{section.about}</span>
                </span>
              </label>
            </li>
          ))}
        </Rows>
        <label htmlFor="medical-in-full" className="mt-3 flex min-h-11 items-start gap-3">
          <Checkbox
            id="medical-in-full"
            className="mt-1"
            checked={answers.medicalInFull}
            onCheckedChange={(on) => set({ medicalInFull: on === true })}
          />
          <span>
            <span className="block text-ink">Each medical sheet in full</span>
            <span className="block text-small text-ink-muted">
              Otherwise “Our household” has only the medicines and allergies. An encrypted sheet is put in only once it is opened on this
              device, and is then in the clear on paper.
            </span>
          </span>
        </label>
      </Section>
    </div>
  );
}
