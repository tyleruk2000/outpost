/**
 * One household (Prepare › Households › its name): its name, whether it moves, its home
 * or where it is now, its country, its people (new, from another household, or taken
 * out: never deleted from the People list), where a portable one has been, the way to its
 * supplies and papers, and removing it.
 */
import { DEFAULT_HOUSEHOLD, type EnergyTable, type HouseholdDto, type HouseholdHolds, type HouseholdKind } from "@outpost/shared";
import { ChevronRight, LocateFixed, MapPin, Trash2, UserRoundPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { LeaveGuard } from "@/components/leave-guard";
import { EmptyState, ErrorState, Joined, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Badge, Segmented, Select, Skeleton } from "@/components/ui/misc";
import { SAVE_BAR_ROOM, SaveBar } from "@/features/household-papers/save-bar";
import { useCatalogue } from "@/features/layers/data";
import { countryName } from "@/features/maps/lib/search";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatDateTime, timeAgo } from "@/lib/utils";
import {
  householdHolds,
  settle,
  useDeleteHousehold,
  useHouseholds,
  usePeople,
  usePositions,
  useSaveHouseholdPeople,
  useSetCurrentHousehold,
  useUpdateHousehold,
} from "./data";
import { HOUSEHOLDS_PATH } from "./for-household";
import { HereDialog } from "./here";
import { HomePlaceDialog } from "./home-place";
import { PlaceSelect } from "./households-page";
import { draftToPerson, type MemberDraft, PeopleEditor, toDraft } from "./people-editor";
import { alsoInWords, holdsWords, KIND_ABOUT, KIND_LABEL, listWords, positionName, whereWords } from "./words";

const WORKED_OUT = "worked-out";

/** The screens that keep things for the current household. */
export const HOUSEHOLD_THINGS = [
  { to: "/prepare/supplies", label: "Supplies" },
  { to: "/prepare/plans", label: "Emergency plans" },
  { to: "/prepare/medical", label: "Medical sheets" },
  { to: "/prepare/keeping-in-touch", label: "Keeping in touch" },
  { to: "/prepare/grab-cards", label: "Grab cards" },
  { to: "/prepare/book", label: "Household book" },
] as const;

function DetailsForm({ household }: { household: HouseholdDto }) {
  const [name, setName] = useState(household.name);
  const [kind, setKind] = useState<HouseholdKind>(household.kind);
  const [homePlaceId, setHomePlaceId] = useState(household.homePlaceId);
  const [basePlaceId, setBasePlaceId] = useState(household.basePlaceId);
  const [country, setCountry] = useState(household.countryOverride ?? WORKED_OUT);
  const [problem, setProblem] = useState<string | null>(null);
  const [hereOpen, setHereOpen] = useState(false);
  const [homeOpen, setHomeOpen] = useState(false);
  const catalogue = useCatalogue();
  const save = useUpdateHousehold(household.id);
  const countries = [...(catalogue.data?.countries ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const workedOut = household.home?.country ?? null;
  const dirty =
    name !== household.name ||
    kind !== household.kind ||
    homePlaceId !== household.homePlaceId ||
    basePlaceId !== household.basePlaceId ||
    country !== (household.countryOverride ?? WORKED_OUT);

  const submit = () => {
    if (!name.trim()) return setProblem("Give the household a name.");
    setProblem(null);
    settle(
      save,
      { name: name.trim(), kind, homePlaceId, basePlaceId, countryOverride: country === WORKED_OUT ? null : country },
      {
        onSuccess: () => toast.success(`${name.trim()} saved.`),
        onError: (error) => setProblem(errorMessage(error)),
      },
    );
  };

  return (
    <Section title="Name and place" className="scroll-mt-20" id="place">
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field label="Name">
          {(ids) => <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="off" />}
        </Field>
        <div className="grid gap-1.5">
          <span className="text-small font-medium text-ink">Does it move?</span>
          <Segmented<HouseholdKind>
            label="Does it move?"
            value={kind}
            onChange={setKind}
            options={[
              { value: "fixed", label: "Fixed" },
              { value: "portable", label: "Portable" },
            ]}
            className="justify-self-start"
          />
          <p className="text-small text-ink-muted">{KIND_ABOUT[kind]}</p>
        </div>
        {kind === "fixed" ? (
          <div className="grid gap-2">
            <PlaceSelect label="Home place" value={homePlaceId} onChange={setHomePlaceId} />
            <Button className="justify-self-start" onClick={() => setHomeOpen(true)}>
              <MapPin /> {household.home ? "Mark a new home on the map" : "Mark home on the map"}
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-2">
              <span className="text-small font-medium text-ink">Where it is now</span>
              <p className="text-body text-ink" data-testid="where-now">
                {household.here
                  ? `${positionName(household.here)}, as of ${timeAgo(household.here.at)}`
                  : "Not set yet. Screens that work from home ask for it."}
              </p>
              {household.kind === "portable" ? (
                <Button className="justify-self-start" onClick={() => setHereOpen(true)}>
                  <LocateFixed /> We're here now
                </Button>
              ) : (
                <p className="text-small text-ink-muted">Save it as portable first; then say where it is.</p>
              )}
            </div>
            <PlaceSelect
              label="Where it is kept"
              optional
              hint="Its base, such as the storage yard: shown, never taken as where it is."
              value={basePlaceId}
              onChange={setBasePlaceId}
            />
          </>
        )}
        <Field
          label="Country"
          hint={
            workedOut
              ? `Worked out from ${kind === "portable" ? "where it is" : "home"}: ${countryName(workedOut) ?? workedOut}. Used for warnings, frequencies and the energy table.`
              : "Not worked out: no home place or position yet. Choose one here if you like."
          }
        >
          {(ids) => (
            <Select<string>
              {...ids}
              value={country}
              onChange={setCountry}
              options={[
                { value: WORKED_OUT, label: workedOut ? `As worked out (${countryName(workedOut) ?? workedOut})` : "As worked out" },
                ...countries.map((entry) => ({ value: entry.code, label: entry.name })),
                // A choice made earlier stays shown, even while the list of countries is loading.
                ...(household.countryOverride && !countries.some((entry) => entry.code === household.countryOverride)
                  ? [{ value: household.countryOverride, label: countryName(household.countryOverride) ?? household.countryOverride }]
                  : []),
              ]}
            />
          )}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" loading={save.isPending}>
            Save
          </Button>
          {problem ? (
            <p role="alert" className="text-small text-danger">
              {problem}
            </p>
          ) : null}
        </div>
      </form>
      <LeaveGuard when={dirty && !save.isPending} what={`the changes to ${household.name}`} />
      {household.kind === "portable" ? <HereDialog household={household} open={hereOpen} onOpenChange={setHereOpen} /> : null}
      {kind === "fixed" ? <HomePlaceDialog household={household} open={homeOpen} onOpenChange={setHomeOpen} /> : null}
    </Section>
  );
}

function PeopleForm({ household, households }: { household: HouseholdDto; households: HouseholdDto[] }) {
  const people = usePeople();
  const all = people.data ?? [];
  const byId = new Map(all.map((person) => [person.id, person]));
  const original = household.personIds.map((id) => byId.get(id)).filter((person) => person !== undefined);
  const [members, setMembers] = useState<MemberDraft[]>(() => original.map(toDraft));
  const [problem, setProblem] = useState<string | null>(null);
  const save = useSaveHouseholdPeople(household.id);
  const saved = JSON.stringify(original.map(toDraft));
  const dirty = JSON.stringify(members) !== saved;
  const others = all.filter((person) => !members.some((member) => member.id === person.id));
  const energyTable: EnergyTable = household.country === "GB" ? "uk" : "international";

  const submit = () => {
    const list = [];
    const changed = new Set<string>();
    for (const member of members) {
      const person = draftToPerson(member);
      if (typeof person === "string") return setProblem(person);
      if (person.id) {
        const before = byId.get(person.id);
        if (before && JSON.stringify(toDraft(before)) !== JSON.stringify({ ...member, key: before.id })) changed.add(person.id);
      }
      list.push(person);
    }
    setProblem(null);
    settle(
      save,
      { people: list, changed },
      {
        onSuccess: () => toast.success(`The people of ${household.name} saved.`),
        onError: (error) => setProblem(errorMessage(error)),
      },
    );
  };

  return (
    <form
      id="people"
      className={`mt-10 scroll-mt-20 ${SAVE_BAR_ROOM}`}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <PeopleEditor
        title="People"
        description="Who lives or travels with it. Taking someone out never deletes them: they stay on the People list."
        members={members}
        onChange={setMembers}
        energyTable={energyTable}
        drinking={DEFAULT_HOUSEHOLD.drinkingLitres}
        allUses={DEFAULT_HOUSEHOLD.allUsesLitres}
        listLabel={`People of ${household.name}`}
        removeLabel={(label) => `Take ${label} out of ${household.name}`}
        under={(draft) => {
          const person = draft.id ? byId.get(draft.id) : undefined;
          return person ? alsoInWords(person, households, household.id) : null;
        }}
        empty="Nobody yet. Add a person or a pet, or someone already in another household."
        actions={
          others.length > 0 ? (
            <Menu>
              <MenuTrigger asChild>
                <Button>
                  <UserRoundPlus />
                  Add someone already here
                </Button>
              </MenuTrigger>
              <MenuContent align="end" className="max-w-[min(22rem,calc(100vw-2rem))]">
                {others.map((person) => (
                  <MenuItem key={person.id} onSelect={() => setMembers((list) => [...list, toDraft(person)])}>
                    <span className="min-w-0">
                      <span className="block text-ink">{person.name || (person.kind === "pet" ? "A pet" : "Someone")}</span>
                      <span className="block text-micro text-ink-muted">
                        {person.householdIds.length > 0
                          ? `In ${listWords(
                              person.householdIds
                                .map((id) => households.find((entry) => entry.id === id)?.name)
                                .filter((entry): entry is string => Boolean(entry)),
                            )}`
                          : "In no household"}
                      </span>
                    </span>
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          ) : null
        }
      />
      <SaveBar stuck={dirty || Boolean(problem)}>
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save people
        </Button>
        {dirty ? <span className="text-small text-ink-muted">Not saved yet</span> : null}
        {problem ? (
          <p role="alert" className="w-full text-small text-danger">
            {problem}
          </p>
        ) : null}
      </SaveBar>
      <LeaveGuard when={dirty && !save.isPending} what={`the people of ${household.name}`} />
    </form>
  );
}

function Positions({ household }: { household: HouseholdDto }) {
  const positions = usePositions(household.id);
  return (
    <Section title="Where it has been" description="Each place you said it was, newest first. The last 50 are kept.">
      {positions.isPending ? (
        <Skeleton className="h-10" />
      ) : positions.isError ? (
        <ErrorState error={positions.error} onRetry={() => positions.refetch()} />
      ) : positions.data.length === 0 ? (
        <p className="border-y border-border py-4 text-body text-ink-muted">Nowhere yet. Press "We're here now" to say where it is.</p>
      ) : (
        <Rows aria-label={`Where ${household.name} has been`}>
          {positions.data.map((position) => (
            <li key={position.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
              <Link
                to={`/maps?lat=${position.lat}&lon=${position.lon}&z=14`}
                className="text-body text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2 max-md:min-h-11"
              >
                {positionName(position)}
              </Link>
              <span className="text-small text-ink-muted">
                <Joined
                  parts={[
                    formatDateTime(position.at),
                    { device: "From the device", map: "Chosen on the map", place: "A saved place" }[position.source],
                  ]}
                />
              </span>
            </li>
          ))}
        </Rows>
      )}
    </Section>
  );
}

function Things({ household, current }: { household: HouseholdDto; current: boolean }) {
  const setCurrent = useSetCurrentHousehold();
  return (
    <Section title="Its supplies and papers">
      {current ? null : (
        <Notice
          className="mb-3"
          action={
            <Button size="sm" loading={setCurrent.isPending} onClick={() => settle(setCurrent, { id: household.id })}>
              Make current
            </Button>
          }
        >
          These screens show the current household's. Make {household.name} current to see its own; that changes it for everyone using this
          Outpost.
        </Notice>
      )}
      <Rows aria-label={`${household.name}'s supplies and papers`}>
        {HOUSEHOLD_THINGS.map((thing) => (
          <li key={thing.to}>
            <Link to={thing.to} className="group flex min-h-11 items-center gap-3 py-2.5">
              <span className="flex-1 text-body text-ink group-hover:text-primary">{thing.label}</span>
              <ChevronRight aria-hidden className="size-4 text-ink-faint" />
            </Link>
          </li>
        ))}
      </Rows>
    </Section>
  );
}

function Remove({ household, last }: { household: HouseholdDto; last: boolean }) {
  const [holds, setHolds] = useState<HouseholdHolds | null>(null);
  const [asking, setAsking] = useState(false);
  const remove = useDeleteHousehold();
  const navigate = useNavigate();
  const words = holds ? holdsWords(holds) : null;
  return (
    <Section title="Delete this household">
      {last ? (
        <p className="text-small text-ink-muted">Outpost always keeps one household. Rename this one instead.</p>
      ) : (
        <>
          <p className="max-w-[65ch] text-small text-ink-muted">
            Deletes its supplies, plans, log, checks and papers. Nobody is deleted from the People list.
          </p>
          <Button
            variant="danger-ghost"
            className="mt-3"
            loading={asking}
            onClick={() => {
              setAsking(true);
              householdHolds(household.id)
                .then((found) => {
                  if (found) setHolds(found);
                })
                .catch((error) => notify.error(errorMessage(error)))
                .finally(() => setAsking(false));
            }}
          >
            <Trash2 /> Delete {household.name}
          </Button>
        </>
      )}
      <ConfirmDialog
        open={holds !== null}
        onOpenChange={(open) => (open ? null : setHolds(null))}
        title={`Delete ${household.name}?`}
        description={
          words ? (
            <>
              <p>
                {words.goes.length > 0 ? `Deleted with it: ${listWords(words.goes)}.` : "It holds no supplies, plans or papers of its own."}
              </p>
              {words.stays ? <p className="mt-2">{words.stays}</p> : null}
              <p className="mt-2">This cannot be undone. Export everything first if you may want any of it.</p>
            </>
          ) : (
            ""
          )
        }
        confirmLabel={`Delete ${household.name}`}
        loading={remove.isPending}
        onConfirm={() => {
          // Off its page first, so that nothing on it asks for the household once it has gone.
          setHolds(null);
          navigate(HOUSEHOLDS_PATH);
          settle(remove, household.id, {
            onSuccess: () => {
              toast.success(`${household.name} deleted.`);
              remove.refresh();
            },
            onError: (error) => notify.error(errorMessage(error)),
          });
        }}
      />
    </Section>
  );
}

export default function HouseholdPage() {
  const { id = "" } = useParams();
  const households = useHouseholds();
  const people = usePeople();
  const setCurrent = useSetCurrentHousehold();
  const { hash } = useLocation();
  const ready = households.isSuccess && people.isSuccess;
  // Arriving from a step of Getting ready (#people, #place): the part it names, once it is drawn.
  useEffect(() => {
    if (!ready || !hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [ready, hash]);
  const back = { to: HOUSEHOLDS_PATH, label: "Households" };
  if (households.isPending || people.isPending)
    return (
      <Page width="reading">
        <PageHeader back={back} title={<Skeleton className="h-9 w-56" />} />
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </Page>
    );
  if (households.isError || people.isError)
    return (
      <Page width="reading">
        <PageHeader back={back} title="Household" />
        <ErrorState
          error={households.error ?? people.error}
          onRetry={() => {
            households.refetch();
            people.refetch();
          }}
        />
      </Page>
    );
  const household = households.data.households.find((entry) => entry.id === id);
  if (!household)
    return (
      <Page width="reading">
        <PageHeader back={back} title="Household" />
        <EmptyState
          title="This household is not here"
          action={
            <Button asChild>
              <Link to={HOUSEHOLDS_PATH}>All households</Link>
            </Button>
          }
        >
          It may have been deleted on another device.
        </EmptyState>
      </Page>
    );
  const current = household.id === households.data.currentId;
  return (
    <Page width="reading">
      <PageHeader
        back={back}
        title={household.name}
        description={<Joined parts={[KIND_LABEL[household.kind], whereWords(household)]} />}
        actions={
          current ? (
            <Badge tone="primary">Current</Badge>
          ) : (
            <Button
              loading={setCurrent.isPending}
              onClick={() =>
                settle(setCurrent, { id: household.id }, { onSuccess: () => toast.success(`${household.name} is the current household.`) })
              }
            >
              Make current
            </Button>
          )
        }
      />
      {/* Drawn again when it is saved elsewhere, so that the form holds what is stored. */}
      <DetailsForm key={`details-${household.updatedAt}`} household={household} />
      <PeopleForm key={`people-${household.personIds.join(",")}`} household={household} households={households.data.households} />
      {household.kind === "portable" ? <Positions household={household} /> : null}
      <Things household={household} current={current} />
      <Remove household={household} last={households.data.households.length <= 1} />
    </Page>
  );
}
