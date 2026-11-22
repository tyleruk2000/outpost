/**
 * Garden, under Tools: what to sow, plant and harvest in a month in the UK, from the RHS
 * calendar, with tender crops kept back until after the household's last frost; and the
 * household's record of what it sowed. The calendar is worked out here (`gardenMonth` in
 * `@outpost/shared`); the server keeps the record and the last-frost date. See docs/garden.md.
 *
 * The record, the last frost and the country the calendar is checked against are the
 * current household's (`useHousehold`).
 */
import {
  type CalendarMonth,
  GARDEN_CALENDAR_SOURCE,
  GARDEN_CROP_IDS,
  GARDEN_CROPS,
  type GardenCrop,
  type GardenCropId,
  type GardenMonth,
  type GardenSowing,
  type GardenSowingInput,
  gardenMonth,
  LAST_FROST_SOURCE,
  MONTH_NAMES_LONG,
  monthDayText,
  monthsText,
  parseMonthDay,
} from "@outpost/shared";
import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { Disclosure, EmptyState, ErrorState, Joined, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, Skeleton } from "@/components/ui/misc";
import { ForHousehold } from "@/features/households/for-household";
import { NoHome, useHome } from "@/features/households/home";
import { useCatalogue } from "@/features/layers/data";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { SourceList } from "../tools/kit";
import { useGarden, useRemoveSowing, useSaveLastFrost, useSaveSowing } from "./data";

const monthOptions = MONTH_NAMES_LONG.map((name, index) => ({ value: String(index + 1), label: name }));

/** "12 Apr 2026" for a stored day, "2026-04-12". */
export function dayText(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return formatDate(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime());
}

/** Today on this device, "2026-04-12". */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** What a held-back tender crop's line says. */
export function heldBackText(from: string | null): string {
  return from
    ? `Not before your last frost has passed: plant out from ${monthDayText(from)}.`
    : "Your last frost is after the months the RHS gives for planting it out: keep it under cover, or grow it in a greenhouse.";
}

function CropLine({ crop, children }: { crop: GardenCrop; children?: React.ReactNode }) {
  return (
    <li className="py-2.5">
      <p className="text-body text-ink">{crop.name}</p>
      {children ? <p className="text-small text-ink-muted">{children}</p> : null}
    </li>
  );
}

function MonthList({ title, empty, children, count }: { title: string; empty: string; children: React.ReactNode; count: number }) {
  return (
    <div>
      <h3 className="mb-1 text-body font-semibold text-ink">{title}</h3>
      {count === 0 ? <p className="text-small text-ink-muted">{empty}</p> : <Rows>{children}</Rows>}
    </div>
  );
}

function ThisMonth({ month, plan }: { month: CalendarMonth; plan: GardenMonth }) {
  const name = MONTH_NAMES_LONG[month - 1];
  return (
    <div className="grid gap-8 md:grid-cols-3">
      <MonthList title="Sow" empty={`Nothing on the calendar is sown in ${name}.`} count={plan.sow.length}>
        {plan.sow.map((crop) => (
          <CropLine key={crop.id} crop={crop}>
            {crop.frostNote}
          </CropLine>
        ))}
      </MonthList>
      <MonthList
        title="Plant or plant out"
        empty={`Nothing on the calendar is planted in ${name}.`}
        count={plan.plant.length + plan.heldBack.length}
      >
        {plan.plant.map((line) => (
          <CropLine key={line.crop.id} crop={line.crop}>
            {[line.crop.plantWord, line.fromDay ? `from ${line.fromDay} ${name}, after your last frost` : null].filter(Boolean).join(" ")}
          </CropLine>
        ))}
        {plan.heldBack.map((held) => (
          <CropLine key={held.crop.id} crop={held.crop}>
            {heldBackText(held.from)}
          </CropLine>
        ))}
      </MonthList>
      <MonthList title="Harvest" empty={`Nothing on the calendar is harvested in ${name}.`} count={plan.harvest.length}>
        {plan.harvest.map((crop) => (
          <CropLine key={crop.id} crop={crop} />
        ))}
      </MonthList>
    </div>
  );
}

function LastFrost({ value, updatedAt, loading }: { value: string | null; updatedAt: number | null; loading: boolean }) {
  const save = useSaveLastFrost();
  const parsed = value ? parseMonthDay(value) : null;
  const [month, setMonth] = useState<string>(parsed ? String(parsed.month) : "5");
  const [day, setDay] = useState<string>(parsed ? String(parsed.day) : "");
  const dayNumber = Number(day);
  const candidate = `${month.padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
  const valid = day.trim() !== "" && Number.isInteger(dayNumber) && parseMonthDay(candidate) !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) save.mutate({ lastFrost: candidate, baseUpdatedAt: updatedAt });
  };

  return (
    <div className="max-w-[60ch]">
      {loading ? (
        <Skeleton className="h-6 w-64" />
      ) : (
        <p className="text-body text-ink">
          {value
            ? `Your last frost is usually about ${monthDayText(value)}.`
            : "No last-frost date is set, so the RHS months are shown as they are."}
        </p>
      )}
      <p className="mt-2 text-small text-ink-muted">
        Tender crops are kept back until the day after it. A date earlier than the RHS months does not bring planting forward, and sowing
        and harvest months are not moved. The Met Office says the last air frost usually comes before the end of April in the south and near
        the coast, and well into May, or even June, further north and on higher ground. Ground frost can come later than air frost.
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Month" className="w-40">
          {(ids) => <Select {...ids} value={month} onChange={setMonth} options={monthOptions} />}
        </Field>
        <Field label="Day" className="w-24" error={day.trim() && !valid ? "Not a day of that month." : undefined}>
          {(ids) => <Input {...ids} inputMode="numeric" value={day} onChange={(event) => setDay(event.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" disabled={!valid} loading={save.isPending}>
          Save last frost
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => save.mutate({ lastFrost: null, baseUpdatedAt: updatedAt })}
            disabled={save.isPending}
          >
            Clear it
          </Button>
        ) : null}
      </form>
    </div>
  );
}

const OTHER = "other";

function blankInput(): GardenSowingInput {
  return { cropId: null, name: "", sownOn: today(), place: "", amount: "", plantedOutOn: null, harvestedOn: null, notes: "" };
}

function SowingDialog({
  sowing,
  open,
  onOpenChange,
}: {
  sowing: GardenSowing | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveSowing();
  // Only the sowing's fields, and the time it was read: the server refuses anything else,
  // and a sowing changed elsewhere since is not saved over.
  const [input, setInput] = useState<GardenSowingInput>(() => {
    if (!sowing) return blankInput();
    const { id: _id, createdAt: _createdAt, updatedAt, ...fields } = sowing;
    return { ...fields, baseUpdatedAt: updatedAt };
  });
  const set = <K extends keyof GardenSowingInput>(key: K, value: GardenSowingInput[K]) => setInput((was) => ({ ...was, [key]: value }));
  const cropOptions = [
    ...GARDEN_CROP_IDS.map((id) => ({ value: id as string, label: GARDEN_CROPS[id].name })),
    { value: OTHER, label: "Something else" },
  ];
  const nameMissing = input.cropId === null && !input.name.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (nameMissing || !input.sownOn) return;
    save.mutate({ id: sowing?.id ?? null, input }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={sowing ? "Change this sowing" : "Record a sowing"}>
        <form onSubmit={submit}>
          <DialogBody className="grid gap-4">
            <Field label="Crop">
              {(ids) => (
                <Select
                  {...ids}
                  value={input.cropId ?? OTHER}
                  onChange={(value) => set("cropId", value === OTHER ? null : (value as GardenCropId))}
                  options={cropOptions}
                />
              )}
            </Field>
            <Field
              label={input.cropId ? "Variety or name" : "What was sown"}
              optional={input.cropId !== null}
              hint={input.cropId ? `Left empty, it is called ${GARDEN_CROPS[input.cropId].name}.` : undefined}
              error={save.isError ? errorMessage(save.error) : undefined}
            >
              {(ids) => <Input {...ids} value={input.name} maxLength={120} onChange={(event) => set("name", event.target.value)} />}
            </Field>
            <Field label="Sown or planted on">
              {(ids) => (
                <Input {...ids} type="date" required value={input.sownOn} onChange={(event) => set("sownOn", event.target.value)} />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Where" optional>
                {(ids) => <Input {...ids} value={input.place} maxLength={200} onChange={(event) => set("place", event.target.value)} />}
              </Field>
              <Field label="How much" optional>
                {(ids) => <Input {...ids} value={input.amount} maxLength={200} onChange={(event) => set("amount", event.target.value)} />}
              </Field>
              <Field label="Planted out on" optional>
                {(ids) => (
                  <Input
                    {...ids}
                    type="date"
                    value={input.plantedOutOn ?? ""}
                    onChange={(event) => set("plantedOutOn", event.target.value || null)}
                  />
                )}
              </Field>
              <Field label="First harvest on" optional>
                {(ids) => (
                  <Input
                    {...ids}
                    type="date"
                    value={input.harvestedOn ?? ""}
                    onChange={(event) => set("harvestedOn", event.target.value || null)}
                  />
                )}
              </Field>
            </div>
            <Field label="Notes" optional>
              {(ids) => <Textarea {...ids} value={input.notes} maxLength={2000} onChange={(event) => set("notes", event.target.value)} />}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={nameMissing || !input.sownOn} loading={save.isPending}>
              {sowing ? "Save changes" : "Record it"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The facts on a sowing's second line: where, how much, what came of it, and when the RHS harvests the crop. */
export function sowingParts(sowing: GardenSowing): string[] {
  const crop = sowing.cropId ? GARDEN_CROPS[sowing.cropId] : null;
  return [
    `Sown ${dayText(sowing.sownOn)}`,
    sowing.place,
    sowing.amount,
    sowing.plantedOutOn ? `planted out ${dayText(sowing.plantedOutOn)}` : "",
    sowing.harvestedOn ? `first harvest ${dayText(sowing.harvestedOn)}` : crop ? `the RHS harvests it ${monthsText(crop.harvest)}` : "",
  ].filter(Boolean);
}

function Record({ sowings }: { sowings: GardenSowing[] }) {
  const [editing, setEditing] = useState<GardenSowing | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<GardenSowing | null>(null);
  const remove = useRemoveSowing();
  const add = (
    <Button variant="primary" onClick={() => setAdding(true)}>
      <Plus /> Record a sowing
    </Button>
  );
  return (
    <Section title="What you sowed" description="Kept on this Outpost for the household." actions={sowings.length ? add : undefined}>
      {sowings.length === 0 ? (
        <EmptyState compact level={3} title="Nothing recorded yet" action={add}>
          Write down what you sow and where, and when it was planted out and first picked, so next year you know what worked.
        </EmptyState>
      ) : (
        <Rows>
          {sowings.map((sowing) => (
            <li key={sowing.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-body text-ink">{sowing.name}</p>
                <p className="text-small text-ink-muted">
                  <Joined parts={sowingParts(sowing)} />
                </p>
                {sowing.notes ? <p className="mt-1 whitespace-pre-wrap text-small text-ink">{sowing.notes}</p> : null}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(sowing)}>
                  Change
                </Button>
                <Button size="sm" variant="danger-ghost" onClick={() => setRemoving(sowing)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </Rows>
      )}
      {adding ? <SowingDialog sowing={null} open onOpenChange={setAdding} /> : null}
      {editing ? <SowingDialog key={editing.id} sowing={editing} open onOpenChange={(open) => !open && setEditing(null)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this sowing?"
        description={
          removing ? `“${removing.name}”, sown ${dayText(removing.sownOn)}, is taken out of the record. This cannot be undone.` : ""
        }
        confirmLabel="Remove sowing"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
      />
    </Section>
  );
}

export default function GardenPage() {
  const garden = useGarden();
  const current = useHome();
  const catalogue = useCatalogue();
  const [month, setMonth] = useState<CalendarMonth>(() => (new Date().getMonth() + 1) as CalendarMonth);

  // The current household's home and its country (its own choice, else the country home is in).
  const home = current.home;
  const countries = catalogue.data?.countries ?? [];
  const code = current.country;
  const elsewhere = code !== null && code !== "GB" ? (countries.find((country) => country.code === code)?.name ?? code) : null;
  // With one household it is "Home", as it always was; with several, the household by name.
  const who = (current.several || current.household?.kind === "portable") && current.household ? current.household.name : "Home";
  const lastFrost = garden.data?.settings.lastFrost ?? null;
  const plan = gardenMonth(month, lastFrost);

  return (
    <Page width="wide">
      <PageHeader
        title="Garden"
        description="What to sow, plant and harvest this month in the UK, from the Royal Horticultural Society's calendar, and a record of what you sowed."
      />
      <ForHousehold className="-mt-6 mb-6" />

      <Section
        title={`In ${MONTH_NAMES_LONG[month - 1]}`}
        description={
          lastFrost
            ? `Tender crops are kept back until after your last frost, ${monthDayText(lastFrost)}.`
            : "The RHS months for the UK, with no last-frost date set."
        }
        actions={
          <Field label="Month" className="w-44">
            {(ids) => (
              <Select
                {...ids}
                value={String(month)}
                onChange={(value) => setMonth(Number(value) as CalendarMonth)}
                options={monthOptions}
              />
            )}
          </Field>
        }
      >
        {/* The calendar needs the country; with several households, or a moving one, say whose is missing. */}
        {!current.isPending && !current.isError && current.household && code === null ? (
          home || current.several || current.household.kind === "portable" ? (
            <p className="mb-4 text-small text-ink-muted">
              Outpost cannot tell which country {who} is in
              {home ? "." : ": it has no home place set."}{" "}
              <Link to="/prepare/households" className="text-primary underline underline-offset-2">
                Open Households
              </Link>
            </p>
          ) : (
            <NoHome className="mb-4" />
          )
        ) : null}
        {elsewhere ? (
          <Notice tone="warning" className="mb-4" title={`${who} is in ${elsewhere}, not the UK`}>
            This calendar is the RHS's, for the UK. Outpost has no published calendar for {elsewhere} yet, so the months below may be wrong
            there. Ask a local growers' society or agricultural service for one.
          </Notice>
        ) : null}
        {garden.isError ? (
          <Notice tone="warning" className="mb-4">
            The last-frost date could not be read, so the RHS months are shown as they are.
          </Notice>
        ) : null}
        <ThisMonth month={month} plan={plan} />
        <p className="mt-6 text-small text-ink-muted">
          Months from the RHS's grow-your-own pages, read {dayText(GARDEN_CALENDAR_SOURCE.read)}, for {GARDEN_CALENDAR_SOURCE.region}. A
          cold or late spring, or a warm sheltered garden, moves them.
        </p>
      </Section>

      <Section title="Your last frost" description="The date tender crops wait for. Set it once for where you garden.">
        {garden.isError ? (
          <ErrorState error={garden.error} onRetry={() => garden.refetch()} />
        ) : (
          <LastFrost
            key={lastFrost ?? "none"}
            value={lastFrost}
            updatedAt={garden.data?.settings.updatedAt ?? null}
            loading={garden.isPending}
          />
        )}
      </Section>

      {garden.isPending ? (
        <Section title="What you sowed">
          <div className="grid gap-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Section>
      ) : garden.isError ? (
        <Section title="What you sowed">
          <ErrorState error={garden.error} onRetry={() => garden.refetch()} />
        </Section>
      ) : (
        <Record sowings={garden.data.sowings} />
      )}

      <div className="mt-10 border-t border-border pt-4 text-small">
        <SourceList sources={[GARDEN_CALENDAR_SOURCE, LAST_FROST_SOURCE]} />
        <Disclosure summary="The RHS page for each crop" className="mt-3">
          <SourceList
            sources={GARDEN_CROP_IDS.map((id) => ({
              name: GARDEN_CROPS[id].name,
              url: GARDEN_CROPS[id].source,
              read: GARDEN_CALENDAR_SOURCE.read,
            }))}
          />
        </Disclosure>
      </div>
    </Page>
  );
}
