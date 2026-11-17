/**
 * Where to meet, how to communicate if the phones fail, the power plan, where things are
 * in the home, and notes and links: the parts of a plan that point at other things in
 * Outpost. Each link is kept by id and shown as it is now; one deleted since is said to
 * be missing.
 */
import {
  type EmergencyPlanLink,
  PLACE_ROLES,
  type PlaceRole,
  type PlanBody,
  type PlanComms,
  type PlanPlace,
  type PlanResolved,
  type PlanWhere,
  type SearchResult,
  templateById,
} from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, Skeleton } from "@/components/ui/misc";
import { workOut } from "@/features/power/calc/plan";
import { inputOf as powerInputOf } from "@/features/power/data";
import { hoursText } from "@/features/power/document";
import { api, errorMessage } from "@/lib/api";
import { localId } from "@/lib/utils";
import { useCommPlans, useMarkers, usePowerPlans } from "./data";
import { move, RowTools, removeAt, replaceAt } from "./list-edit";
import { SourceLine } from "./steps-section";

const NONE = "none";
const mapPath = (lat: number, lon: number) => `/maps?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&z=15`;

function PlaceDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (place: PlanPlace) => void;
}) {
  const markers = useMarkers(open);
  const [role, setRole] = useState<PlaceRole>("near");
  const [markerId, setMarkerId] = useState<string>(NONE);
  const [name, setName] = useState("");
  const close = (next: boolean) => {
    if (!next) {
      setRole("near");
      setMarkerId(NONE);
      setName("");
    }
    onOpenChange(next);
  };
  const marker = markers.data?.find((each) => each.id === markerId);
  const ready = marker !== undefined || name.trim().length > 0;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title="Add a place to meet"
        description="Choose one of your saved places on the map, so that the offline map opens on it, or describe it."
      >
        <DialogBody className="grid gap-4">
          <Field label="For when">
            {(ids) => (
              <Select<PlaceRole>
                {...ids}
                value={role}
                onChange={setRole}
                options={PLACE_ROLES.map((each) => ({ value: each.id, label: each.label, description: each.about }))}
              />
            )}
          </Field>
          <Field
            label="Saved place"
            hint={
              markers.data && markers.data.length === 0
                ? "There are no saved places yet. Add one on the Maps screen, or describe it below."
                : undefined
            }
          >
            {(ids) =>
              markers.isPending ? (
                <Skeleton className="h-9" />
              ) : markers.isError ? (
                <p role="alert" className="text-small text-danger">
                  {errorMessage(markers.error)}
                </p>
              ) : (
                <Select<string>
                  {...ids}
                  value={markerId}
                  onChange={setMarkerId}
                  options={[
                    { value: NONE, label: "None: describe it instead" },
                    ...markers.data.map((each) => ({ value: each.id, label: each.name })),
                  ]}
                />
              )
            }
          </Field>
          {marker ? null : (
            <Field label="Where it is">
              {(ids) => (
                <Input
                  {...ids}
                  value={name}
                  maxLength={120}
                  placeholder="The end of the road, by the post box"
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => {
              onAdd({ id: localId(), role, markerId: marker?.id ?? null, name: marker?.name ?? name.trim(), note: "" });
              close(false);
            }}
          >
            Add place
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlacesSection({
  places,
  resolved,
  onChange,
}: {
  places: PlanPlace[];
  resolved: PlanResolved;
  onChange: (places: PlanPlace[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <Section
      title="Where to meet"
      description="One place near home if the home cannot be used, and one further away if the neighbourhood cannot."
      actions={<Button onClick={() => setAdding(true)}>Add a place</Button>}
    >
      {places.length === 0 ? (
        <p className="text-small text-ink-muted">No places yet. Where would you meet if you could not go home?</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {places.map((place, index) => {
            const now = place.markerId ? resolved.places[place.markerId] : undefined;
            return (
              <li key={place.id} className="flex gap-2 py-3">
                <div className="grid min-w-0 flex-1 gap-2">
                  <p className="text-small text-ink-muted">{PLACE_ROLES.find((each) => each.id === place.role)?.label}</p>
                  {place.markerId ? (
                    now === null ? (
                      <p className="flex items-center gap-1.5 text-small text-warning">
                        <CircleAlert aria-hidden className="size-4 shrink-0" /> {place.name}: no longer on the map. Remove it or choose
                        another.
                      </p>
                    ) : (
                      <Link
                        to={now ? mapPath(now.lat, now.lon) : `/maps?marker=${place.markerId}`}
                        className="inline-flex min-h-11 items-center gap-1.5 text-primary underline underline-offset-2"
                      >
                        <MapPin aria-hidden className="size-4" /> {now?.name ?? place.name}
                      </Link>
                    )
                  ) : (
                    <Input
                      aria-label={`Where: ${PLACE_ROLES.find((each) => each.id === place.role)?.label}`}
                      value={place.name}
                      maxLength={120}
                      onChange={(event) => onChange(replaceAt(places, index, { ...place, name: event.target.value }))}
                    />
                  )}
                  <Input
                    aria-label={`Note on ${place.name || "this place"}`}
                    placeholder="How to get there, what to bring"
                    value={place.note}
                    maxLength={600}
                    onChange={(event) => onChange(replaceAt(places, index, { ...place, note: event.target.value }))}
                  />
                </div>
                <RowTools
                  name={place.name}
                  first={index === 0}
                  last={index === places.length - 1}
                  onMove={(by) => onChange(move(places, index, by))}
                  onRemove={() => onChange(removeAt(places, index))}
                />
              </li>
            );
          })}
        </ul>
      )}
      <PlaceDialog open={adding} onOpenChange={setAdding} onAdd={(place) => onChange([...places, place])} />
    </Section>
  );
}

export function CommsSection({
  comms,
  resolved,
  onChange,
}: {
  comms: PlanComms;
  resolved: PlanResolved;
  onChange: (comms: PlanComms) => void;
}) {
  const plans = useCommPlans();
  return (
    <Section
      title="If the phones fail"
      description="How the household will reach each other: a time and place to meet, a radio, a note left on the door."
    >
      <div className="grid gap-3">
        <Field label="What we will do">
          {(ids) => (
            <Textarea
              {...ids}
              rows={3}
              value={comms.text}
              maxLength={2400}
              placeholder="Meet at the village hall at noon each day. Leave a note on the inside of the front door."
              onChange={(event) => onChange({ ...comms, text: event.target.value })}
            />
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Radio frequency or channel" hint="A PMR446 channel, or an amateur frequency.">
            {(ids) => (
              <Input
                {...ids}
                value={comms.frequency}
                maxLength={120}
                onChange={(event) => onChange({ ...comms, frequency: event.target.value })}
              />
            )}
          </Field>
          <Field label="When to listen">
            {(ids) => (
              <Input
                {...ids}
                value={comms.schedule}
                maxLength={120}
                placeholder="On the hour, for ten minutes"
                onChange={(event) => onChange({ ...comms, schedule: event.target.value })}
              />
            )}
          </Field>
        </div>
        <Field label="Communication plan under Radio">
          {(ids) =>
            plans.isPending ? (
              <Skeleton className="h-9" />
            ) : plans.isError ? (
              <p className="text-small text-danger">{errorMessage(plans.error)}</p>
            ) : (
              <Select<string>
                {...ids}
                value={comms.commPlanId ?? NONE}
                onChange={(value) => onChange({ ...comms, commPlanId: value === NONE ? null : value })}
                options={[
                  { value: NONE, label: "None" },
                  ...plans.data.map((plan) => ({ value: plan.id, label: plan.name })),
                  ...(comms.commPlanId && !plans.data.some((plan) => plan.id === comms.commPlanId)
                    ? [{ value: comms.commPlanId, label: "A plan no longer in Outpost" }]
                    : []),
                ]}
              />
            )
          }
        </Field>
        {resolved.commPlan === null ? (
          <p className="text-small text-warning">The communication plan this linked to has been deleted.</p>
        ) : resolved.commPlan ? (
          <Link to={`/radio/plans/${resolved.commPlan.id}`} className="text-small text-primary underline underline-offset-2">
            Open “{resolved.commPlan.name}”
          </Link>
        ) : null}
      </div>
    </Section>
  );
}

/** A power plan's headline figure: how long the battery runs the loads with no charging. */
export function PowerSection({ powerPlanId, onChange }: { powerPlanId: string | null; onChange: (id: string | null) => void }) {
  const plans = usePowerPlans();
  const chosen = plans.data?.find((plan) => plan.id === powerPlanId);
  const answers = useMemo(() => (chosen ? workOut(powerInputOf(chosen)) : null), [chosen]);
  return (
    <Section title="Power" description="A power plan from Tools, Power and batteries: what the batteries will run, and for how long.">
      {plans.isPending ? (
        <Skeleton className="h-9" />
      ) : plans.isError ? (
        <p className="text-small text-danger">{errorMessage(plans.error)}</p>
      ) : plans.data.length === 0 && !powerPlanId ? (
        <p className="text-small text-ink-muted">
          There are no power plans yet.{" "}
          <Link to="/tools/power" className="text-primary underline underline-offset-2">
            Make one under Power and batteries
          </Link>
          .
        </p>
      ) : (
        <div className="grid gap-2">
          <Field label="Power plan">
            {(ids) => (
              <Select<string>
                {...ids}
                value={powerPlanId ?? NONE}
                onChange={(value) => onChange(value === NONE ? null : value)}
                options={[
                  { value: NONE, label: "None" },
                  ...plans.data.map((plan) => ({ value: plan.id, label: plan.name })),
                  ...(powerPlanId && !chosen ? [{ value: powerPlanId, label: "A power plan no longer in Outpost" }] : []),
                ]}
              />
            )}
          </Field>
          {powerPlanId && !chosen ? <p className="text-small text-warning">The power plan this linked to has been deleted.</p> : null}
          {chosen && answers ? (
            <p className="text-small text-ink">
              <Link to={`/tools/power/plans/${chosen.id}`} className="text-primary underline underline-offset-2">
                {chosen.name}
              </Link>
              :{" "}
              {answers.runtimeHours === null
                ? "no loads in it yet."
                : `runs its loads for ${hoursText(answers.runtimeHours)} with no charging.`}{" "}
              <span className="text-ink-muted">An estimate from the figures typed into it.</span>
            </p>
          ) : null}
        </div>
      )}
    </Section>
  );
}

export function WhereSection({
  where,
  templateId,
  onChange,
}: {
  where: PlanWhere[];
  templateId: string | null;
  onChange: (where: PlanWhere[]) => void;
}) {
  const template = templateById(templateId);
  return (
    <Section
      title="Where things are"
      description="So that whoever is home can find them in the dark. Photos cannot be added here yet; a note with photos can be linked below."
      actions={<Button onClick={() => onChange([...where, { id: localId(), what: "", where: "", origin: null }])}>Add a thing</Button>}
    >
      {where.length === 0 ? (
        <p className="text-small text-ink-muted">Nothing yet: the stopcock, the fuse board, the torch, the first-aid kit.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {where.map((item, index) => {
            const from = item.origin ? template?.where.find((each) => each.id === item.origin) : undefined;
            return (
              <li key={item.id} className="flex gap-2 py-3">
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                  <Input
                    aria-label={`Thing ${index + 1}`}
                    value={item.what}
                    maxLength={120}
                    placeholder="The torch"
                    onChange={(event) => onChange(replaceAt(where, index, { ...item, what: event.target.value }))}
                  />
                  <Input
                    aria-label={`Where ${item.what || `thing ${index + 1}`} is`}
                    value={item.where}
                    maxLength={600}
                    placeholder="Where it is"
                    onChange={(event) => onChange(replaceAt(where, index, { ...item, where: event.target.value }))}
                  />
                  {from ? (
                    <p className="text-small text-ink-muted sm:col-span-2">
                      Knowing where it is: <SourceLine source={from.source} />.
                    </p>
                  ) : null}
                </div>
                <RowTools
                  name={item.what || `thing ${index + 1}`}
                  first={index === 0}
                  last={index === where.length - 1}
                  onMove={(by) => onChange(move(where, index, by))}
                  onRemove={() => onChange(removeAt(where, index))}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

const useLinkSearch = (text: string) =>
  useQuery({
    queryKey: ["search", "emergency-plan-link", text],
    enabled: text.trim().length >= 2,
    queryFn: () =>
      api
        .get<{ results: SearchResult[] }>("/api/search", {
          q: text.trim(),
          kinds: "note,document",
          mode: "keyword",
          reference: "later",
          limit: 10,
        })
        .then((data) => data.results),
  });

const linkPath = (link: PlanResolved["links"][number]) =>
  link.kind === "note"
    ? `/notes/${link.id}`
    : link.kind === "document"
      ? `/library/documents/${link.id}`
      : mapPath(link.lat ?? 0, link.lon ?? 0);

export function NotesSection({
  body,
  resolved,
  onChange,
}: {
  body: Pick<PlanBody, "notes" | "links">;
  resolved: PlanResolved;
  onChange: (patch: { notes?: string; links?: EmergencyPlanLink[] }) => void;
}) {
  const [text, setText] = useState("");
  const [asked, setAsked] = useState("");
  const found = useLinkSearch(asked);
  const markers = useMarkers();
  const has = (kind: string, id: string) => body.links.some((link) => link.kind === kind && link.id === id);
  const [mapPick, setMapPick] = useState(NONE);
  return (
    <Section title="Notes and links" description="The first-aid manual, saved official guidance, a page of notes, a map.">
      <Field label="Notes">
        {(ids) => (
          <Textarea {...ids} rows={4} value={body.notes} maxLength={20_000} onChange={(event) => onChange({ notes: event.target.value })} />
        )}
      </Field>
      {/* A scenario is shown as an illustration in a section of its own (features/nuclear/plan-illustrations.tsx). */}
      {resolved.links.some((link) => link.kind !== "scenario") ? (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {resolved.links
            .filter((link) => link.kind !== "scenario")
            .map((link) => (
              <li key={`${link.kind}:${link.id}`} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  {link.title === null ? (
                    <span className="text-warning">A {link.kind === "place" ? "saved place" : link.kind} that is no longer in Outpost</span>
                  ) : (
                    <Link to={linkPath(link)} className="text-primary underline underline-offset-2">
                      {link.title}
                    </Link>
                  )}
                  <span className="ml-2 text-small text-ink-muted">
                    {link.kind === "note" ? "Note" : link.kind === "document" ? "Document" : "Map"}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  onClick={() => onChange({ links: body.links.filter((each) => !(each.kind === link.kind && each.id === link.id)) })}
                >
                  Unlink
                </Button>
              </li>
            ))}
        </ul>
      ) : null}
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setAsked(text);
        }}
      >
        <Field label="Find a note or document to link" className="min-w-0 flex-1 basis-56">
          {(ids) => (
            <Input {...ids} value={text} onChange={(event) => setText(event.target.value)} placeholder="Words from its title or text" />
          )}
        </Field>
        <Button type="submit" loading={found.isFetching}>
          Find
        </Button>
      </form>
      {found.isError ? (
        <p role="alert" className="mt-2 text-small text-danger">
          {errorMessage(found.error)}
        </p>
      ) : found.data && asked.trim().length >= 2 ? (
        found.data.length === 0 ? (
          <p className="mt-2 text-small text-ink-muted">No note or document matches “{asked}”.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border border-y border-border" aria-label="Notes and documents found">
            {found.data.map((item) => (
              <li key={`${item.kind}:${item.entityId}`} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{item.title}</span>
                  <span className="text-small text-ink-muted">{item.kind === "note" ? "Note" : "Document"}</span>
                </span>
                <Button
                  disabled={has(item.kind, item.entityId)}
                  onClick={() => onChange({ links: [...body.links, { kind: item.kind as "note" | "document", id: item.entityId }] })}
                >
                  {has(item.kind, item.entityId) ? "Linked" : "Link"}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
      {markers.data && markers.data.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Field label="Link a saved place on the map" className="min-w-0 flex-1 basis-56">
            {(ids) => (
              <Select<string>
                {...ids}
                value={mapPick}
                onChange={setMapPick}
                options={[
                  { value: NONE, label: "Choose a place" },
                  ...markers.data.map((marker) => ({ value: marker.id, label: marker.name })),
                ]}
              />
            )}
          </Field>
          <Button
            disabled={mapPick === NONE || has("place", mapPick)}
            onClick={() => {
              onChange({ links: [...body.links, { kind: "place", id: mapPick }] });
              setMapPick(NONE);
            }}
          >
            Link place
          </Button>
        </div>
      ) : null}
    </Section>
  );
}
