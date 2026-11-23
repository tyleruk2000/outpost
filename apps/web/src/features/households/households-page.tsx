/**
 * Prepare › Households: every household (a home, the family's home, a caravan), which is
 * current for the whole Outpost, a new one, and the People list of everyone in any of them.
 */
import { ENERGY_BANDS, type HouseholdDto, type HouseholdKind, type PersonDto } from "@outpost/shared";
import { House, Plus, Trash2, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Joined, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Badge, Segmented, Select, Skeleton } from "@/components/ui/misc";
import { useMarkers } from "@/features/maps/data";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { plural } from "@/lib/utils";
import { settle, useCreateHousehold, useDeletePerson, useHouseholds, usePeople, useSetCurrentHousehold } from "./data";
import { HOUSEHOLDS_PATH } from "./for-household";
import { type HereChoice, HereChooser, HereDialog } from "./here";
import { inWords, KIND_ABOUT, KIND_LABEL, peopleWords, whereWords } from "./words";

const NOBODY = "nobody";

/** A saved place to choose as home or base, with a way to the map to save one. */
export function PlaceSelect({
  label,
  value,
  onChange,
  hint,
  optional,
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  hint?: string;
  optional?: boolean;
}) {
  const markers = useMarkers();
  const places = markers.data ?? [];
  const NONE = "none";
  return (
    <Field
      label={label}
      optional={optional}
      hint={
        <>
          {hint ? `${hint} ` : null}
          <Link
            to="/maps"
            className="inline-flex min-h-6 items-center text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2 max-md:min-h-11 md:pointer-coarse:min-h-11"
          >
            Save a place on the Maps screen
          </Link>
        </>
      }
    >
      {(ids) =>
        markers.isPending ? (
          <Skeleton className="h-9" />
        ) : (
          <Select<string>
            {...ids}
            value={value ?? NONE}
            onChange={(id) => onChange(id === NONE ? null : id)}
            options={[
              { value: NONE, label: places.length === 0 ? "No saved places yet" : "None" },
              ...places.map((place) => ({ value: place.id, label: place.name || "A saved place" })),
            ]}
          />
        )
      }
    </Field>
  );
}

function NewHouseholdDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const households = useHouseholds();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<HouseholdKind>("fixed");
  const [homePlaceId, setHomePlaceId] = useState<string | null>(null);
  const [here, setHere] = useState<HereChoice | null>(null);
  const [copyFrom, setCopyFrom] = useState<string>(NOBODY);
  const [problem, setProblem] = useState<string | null>(null);
  const create = useCreateHousehold();
  const navigate = useNavigate();
  const close = (next: boolean) => {
    if (!next) {
      setName("");
      setKind("fixed");
      setHomePlaceId(null);
      setHere(null);
      setCopyFrom(NOBODY);
      setProblem(null);
    }
    onOpenChange(next);
  };
  const submit = () => {
    if (!name.trim()) return setProblem("Give the household a name.");
    setProblem(null);
    settle(
      create,
      {
        name: name.trim(),
        kind,
        homePlaceId: kind === "fixed" ? homePlaceId : null,
        copyPeopleFrom: copyFrom === NOBODY ? null : copyFrom,
        here: kind === "portable" && here ? { ...here, name: here.name?.trim() || null } : null,
      },
      {
        onSuccess: ({ household }) => {
          toast.success(`${household.name} made.`);
          close(false);
          navigate(`${HOUSEHOLDS_PATH}/${household.id}`);
        },
        onError: (error) => setProblem(errorMessage(error)),
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        size="lg"
        title="New household"
        description="Another home, the family's home, or a caravan or group on the move. Its supplies, plans and papers are its own."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="contents"
        >
          <DialogBody className="grid gap-5">
            <Field label="Name" hint="Such as Gran's, the flat in town, or the caravan.">
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
              <PlaceSelect label="Home place" optional value={homePlaceId} onChange={setHomePlaceId} />
            ) : (
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-small font-medium text-ink">
                  We're here now <span className="font-normal text-ink-muted">(optional)</span>
                </legend>
                <HereChooser value={here} onChange={setHere} />
              </fieldset>
            )}
            {households.data && households.data.households.length > 0 ? (
              <Field label="Start with the people of" hint="They stay in the other household too. You can change who is in it afterwards.">
                {(ids) => (
                  <Select<string>
                    {...ids}
                    value={copyFrom}
                    onChange={setCopyFrom}
                    options={[
                      { value: NOBODY, label: "Nobody: add them afterwards" },
                      ...households.data.households.map((household) => ({
                        value: household.id,
                        label: `${household.name} (${peopleWords(household.personIds.length).toLowerCase()})`,
                      })),
                    ]}
                  />
                )}
              </Field>
            ) : null}
            {problem ? (
              <p role="alert" className="text-small text-danger">
                {problem}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Make the household
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HouseholdRow({ household, current }: { household: HouseholdDto; current: boolean }) {
  const setCurrent = useSetCurrentHousehold();
  const [hereOpen, setHereOpen] = useState(false);
  return (
    <li className="group relative flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-60">
        <h3 className="flex flex-wrap items-center gap-2 font-title text-lead text-ink">
          <Link
            to={`${HOUSEHOLDS_PATH}/${household.id}`}
            className="decoration-primary decoration-1 underline-offset-[0.22em] after:absolute after:inset-0 group-hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center"
          >
            {household.name}
          </Link>
          {current ? <Badge tone="primary">Current</Badge> : null}
        </h3>
        <p className="mt-0.5 text-small text-ink-muted">
          <Joined parts={[KIND_LABEL[household.kind], whereWords(household), peopleWords(household.personIds.length)]} />
        </p>
      </div>
      <div className="relative flex flex-wrap gap-2">
        {household.kind === "portable" ? (
          <Button onClick={() => setHereOpen(true)} aria-label={`We're here now: ${household.name}`}>
            We're here now
          </Button>
        ) : null}
        {current ? null : (
          <Button
            loading={setCurrent.isPending}
            aria-label={`Make current: ${household.name}`}
            onClick={() =>
              settle(setCurrent, { id: household.id }, { onSuccess: () => toast.success(`${household.name} is the current household.`) })
            }
          >
            Make current
          </Button>
        )}
      </div>
      {household.kind === "portable" ? <HereDialog household={household} open={hereOpen} onOpenChange={setHereOpen} /> : null}
    </li>
  );
}

const bandLabel = (person: PersonDto) =>
  person.kind === "pet" ? "Pet" : (ENERGY_BANDS.find((band) => band.id === person.band)?.label ?? "Person");

function PeopleList({ households, currentId }: { households: HouseholdDto[]; currentId: string }) {
  const people = usePeople();
  const remove = useDeletePerson();
  const [doomed, setDoomed] = useState<PersonDto | null>(null);
  const name = (person: PersonDto) => person.name || (person.kind === "pet" ? "A pet" : "Someone");
  return (
    <Section
      title="People"
      description="Everyone in any household, and which they are in. Someone can be in several; their needs are the same in each."
    >
      {people.isPending ? (
        <div className="grid gap-2" aria-busy>
          <Skeleton className="h-10" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ) : people.isError ? (
        <ErrorState error={people.error} onRetry={() => people.refetch()} />
      ) : people.data.length === 0 ? (
        <EmptyState
          compact
          level={3}
          title="Nobody yet"
          action={
            households.some((household) => household.id === currentId) ? (
              <Button asChild>
                <Link to={`${HOUSEHOLDS_PATH}/${currentId}#people`}>
                  <UserRoundPlus /> Add people to {households.find((household) => household.id === currentId)?.name}
                </Link>
              </Button>
            ) : null
          }
        >
          Add people and pets on a household's page. Each one's needs count towards that household's supplies.
        </EmptyState>
      ) : (
        <Rows aria-label="People">
          {people.data.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-body text-ink">{name(person)}</p>
                <p className="text-small text-ink-muted">
                  <Joined
                    parts={[
                      bandLabel(person),
                      inWords(person, households),
                      person.medicalSheets > 0 ? plural(person.medicalSheets, "medical sheet") : null,
                    ]}
                  />
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${name(person)} from the People list`}
                onClick={() => setDoomed(person)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </Rows>
      )}
      <ConfirmDialog
        open={doomed !== null}
        onOpenChange={(open) => (open ? null : setDoomed(null))}
        title={`Delete ${doomed ? name(doomed) : ""} from the People list?`}
        description={
          doomed ? (
            <>
              <p>
                {doomed.householdIds.length > 0
                  ? `They are taken out of ${inWords(doomed, households).replace(/^In /, "")}, and their needs no longer count towards any supplies.`
                  : "They are in no household."}
              </p>
              {doomed.medicalSheets > 0 ? (
                <p className="mt-2 font-medium text-danger">
                  {doomed.medicalSheets === 1
                    ? "They have a medical sheet. It is"
                    : `They have ${doomed.medicalSheets} medical sheets. They are`}{" "}
                  kept, linked to nobody, under Medical sheets.
                </p>
              ) : null}
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Delete from People"
        loading={remove.isPending}
        onConfirm={() => {
          if (!doomed) return;
          settle(remove, doomed.id, {
            onSuccess: () => {
              toast.success(`${name(doomed)} deleted from the People list.`);
              setDoomed(null);
            },
            onError: (error) => notify.error(errorMessage(error)),
          });
        }}
      />
    </Section>
  );
}

export default function HouseholdsPage() {
  const households = useHouseholds();
  const [creating, setCreating] = useState(false);
  // The first fixed household with no home place, the current one first.
  const homeless = households.data
    ? [...households.data.households]
        .sort((a, b) => Number(b.id === households.data.currentId) - Number(a.id === households.data.currentId))
        .find((household) => household.kind === "fixed" && !household.home)
    : undefined;
  return (
    <Page width="reading">
      <PageHeader
        title="Households"
        description="The homes Outpost keeps things for, and the people in each: your own, the family's, a second place, a caravan or a group on the move."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New household
          </Button>
        }
      />
      {households.isPending ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : households.isError ? (
        <ErrorState error={households.error} onRetry={() => households.refetch()} />
      ) : (
        <>
          <Section
            title="Households"
            description={
              households.data.households.length > 1
                ? "One is current: its supplies, plans and papers are the ones every screen shows. Making another current changes it for everyone using this Outpost."
                : "Most Outposts keep one. Add another for a second home, the family's, or a caravan; then choose which is current."
            }
          >
            <Rows aria-label="Households">
              {households.data.households.map((household) => (
                <HouseholdRow key={household.id} household={household} current={household.id === households.data.currentId} />
              ))}
            </Rows>
          </Section>
          {homeless ? (
            <Notice
              tone="info"
              icon={<House />}
              className="mt-4"
              action={
                <Button size="sm" asChild>
                  <Link to={`${HOUSEHOLDS_PATH}/${homeless.id}#place`}>Mark home</Link>
                </Button>
              }
            >
              A household with no home place takes no weather, tides or country of its own.{" "}
              {households.data.households.filter((household) => household.kind === "fixed" && !household.home).length > 1
                ? `${homeless.name} is one.`
                : null}
            </Notice>
          ) : null}
          <PeopleList households={households.data.households} currentId={households.data.currentId} />
        </>
      )}
      <NewHouseholdDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
}
