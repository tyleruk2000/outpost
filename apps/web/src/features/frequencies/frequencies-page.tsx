/**
 * Radio → Frequencies to listen to: where to tune to hear the time, news, warnings,
 * weather and other people when the internet is out.
 *
 * The set is bundled with the app (`RADIO_FREQUENCIES` in @outpost/shared) and loaded
 * as a chunk of its own, so the screen has a moment of loading and can fail to load
 * when the server goes away between screens. Nothing is fetched from anywhere else: a
 * source's address is a plain link a person may open when they have the internet.
 *
 * The filters live in the address (`?kind=time-signals&place=GB&band=hf&set=shortwave&q=wwv`),
 * so a link can open one kind. With no `place` the list starts from the home place's
 * country, when there is a home place; `place=any` is every place.
 */
import {
  bandById,
  checkedOn,
  entryChecked,
  FREQUENCY_BANDS,
  FREQUENCY_KINDS,
  type FrequencyEntry,
  type FrequencyGuide,
  type FrequencyKindId,
  filterFrequencies,
  formatFrequency,
  kindLabel,
  localDay,
  modeLabel,
  placeName,
  placesIn,
  RECEIVER_PROFILES,
  receiverById,
  scheduleState,
  setChecked,
} from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileDown, Info } from "lucide-react";
import { type ReactNode, useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { EmptyState, ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Badge, Select, Skeleton } from "@/components/ui/misc";
import { useCatalogue } from "@/features/layers/data";
import { madePdf } from "@/features/library/made/made-pdf";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { useMarkers } from "@/features/maps/data";
import { cn, plural } from "@/lib/utils";
import { frequenciesPdf, frequenciesTitle, frequencyLine, scheduleWords, statusWords } from "./document";
import { homeCountry } from "./home-country";

const ANY = "any";
const PATH = "/radio/frequencies";
const linkClass = "text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2";

/** The set, from a chunk of its own. */
const useFrequencies = () =>
  useQuery({
    queryKey: ["frequencies", "bundled"],
    queryFn: () => import("./bundled").then((module) => module.bundled()),
    staleTime: Number.POSITIVE_INFINITY,
  });

const isKind = (value: string | null): value is FrequencyKindId => FREQUENCY_KINDS.some((kind) => kind.id === value);

/** The order the list is in: kind by kind, what names the chosen place itself before what applies to a region, closed ones last. */
function ordered(entries: FrequencyEntry[], place: string | null): FrequencyEntry[] {
  const kindOrder = new Map(FREQUENCY_KINDS.map((kind, index) => [kind.id, index]));
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const kind = (kindOrder.get(a.entry.kind) ?? 0) - (kindOrder.get(b.entry.kind) ?? 0);
      if (kind !== 0) return kind;
      const closed = Number(a.entry.status === "closed") - Number(b.entry.status === "closed");
      if (closed !== 0) return closed;
      if (place) {
        const own = Number(!a.entry.where.includes(place)) - Number(!b.entry.where.includes(place));
        if (own !== 0) return own;
      }
      return a.index - b.index;
    })
    .map(({ entry }) => entry);
}

/** How many frequencies a row shows before "and N more". */
const SHOWN = 4;

function FrequencyRow({ entry, today }: { entry: FrequencyEntry; today: string }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const schedule = scheduleState(entry, today);
  const status = statusWords(entry);
  const shown = entry.frequencies.slice(0, SHOWN);
  const more = entry.frequencies.length - shown.length;
  return (
    <li className="py-3" data-testid="frequency-row" data-entry={entry.id}>
      {/* The frequencies are text to select and copy, outside the button that opens the entry. */}
      <p className="tabular font-mono text-lead text-ink select-text [overflow-wrap:anywhere]">
        {shown.map((frequency, index) => (
          <span key={`${frequency.khz}-${frequency.channel ?? index}`} className="mr-4 inline-block">
            {formatFrequency(frequency)}
            {frequency.channel ? <span className="ml-1.5 font-sans text-small text-ink-muted">ch {frequency.channel}</span> : null}
          </span>
        ))}
        {more > 0 ? <span className="font-sans text-small text-ink-muted">and {more} more</span> : null}
      </p>
      <h3 className="mt-0.5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((was) => !was)}
          className="group -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-control px-2 text-left hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        >
          <span className="min-w-0 flex-1 text-body font-semibold text-ink group-hover:text-primary">{entry.name}</span>
          <ChevronRight
            aria-hidden
            className={cn("size-4 shrink-0 text-ink-faint transition-transform duration-150", open && "rotate-90")}
          />
        </button>
      </h3>
      <p className="text-small text-ink-muted">
        {[entry.modes.map(modeLabel).join(", "), entry.hours, entry.where.map(placeName).join(", ")].filter(Boolean).join(" · ")}
      </p>
      {status || schedule === "expired" ? (
        <p className="mt-1 flex flex-wrap gap-1.5">
          {status ? <Badge tone={entry.status === "closed" ? "warning" : "neutral"}>{status}</Badge> : null}
          {schedule === "expired" ? <Badge tone="warning">Schedule expired</Badge> : null}
        </p>
      ) : null}
      {open ? <EntryDetail id={detailId} entry={entry} today={today} /> : null}
    </li>
  );
}

function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-small font-medium text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-small text-ink">{children}</dd>
    </div>
  );
}

function EntryDetail({ id, entry, today }: { id: string; entry: FrequencyEntry; today: string }) {
  const schedule = scheduleWords(entry, today);
  return (
    <div id={id} className="mt-2 grid max-w-[70ch] gap-3 pb-2" data-testid="frequency-detail">
      <p className="text-body text-ink">{entry.what}</p>
      {schedule ? (
        <Notice tone={scheduleState(entry, today) === "expired" ? "warning" : "info"} icon={<Info />}>
          {schedule}
        </Notice>
      ) : null}
      <dl className="grid gap-2.5">
        <Term label={entry.frequencies.length === 1 ? "Frequency" : "Frequencies"}>
          <ul className="grid gap-0.5">
            {entry.frequencies.map((frequency, index) => (
              <li key={`${frequency.khz}-${frequency.channel ?? index}`} className="tabular select-text">
                <span className="font-mono">{formatFrequency(frequency)}</span>
                {frequencyLine(frequency) !== formatFrequency(frequency) ? (
                  <span className="text-ink-muted">{frequencyLine(frequency).slice(formatFrequency(frequency).length)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Term>
        <Term label="Mode">{entry.modes.map(modeLabel).join(", ")}</Term>
        <Term label="Band">{entry.bands.map((band) => bandById(band)?.name ?? band).join(", ")}</Term>
        {entry.operator ? <Term label="Run by">{entry.operator}</Term> : null}
        {entry.site ? <Term label="Sent from">{entry.site}</Term> : null}
        {entry.hours ? <Term label="When">{entry.hours}</Term> : null}
        <Term label="Where it applies">{entry.where.map(placeName).join(", ")}</Term>
        <Term label="What you hear">{entry.expect}</Term>
        {entry.reception ? <Term label="Where it is heard">{entry.reception}</Term> : null}
        {entry.layout?.length ? (
          <Term label="How the signal goes">
            <div className="grid gap-1.5">
              {entry.layout.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </Term>
        ) : null}
        {entry.timeGiven ? <Term label="Which time">{entry.timeGiven}</Term> : null}
        {entry.listening ? <Term label="Listening">{entry.listening}</Term> : null}
        {entry.status === "closed" && entry.closed ? <Term label="Closed">{checkedOn(entry.closed)}</Term> : null}
        {entry.notes?.length ? (
          <Term label="Notes">
            <div className="grid gap-1.5">
              {entry.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          </Term>
        ) : null}
        {entry.links?.length ? (
          <Term label="In Outpost">
            {entry.links.map((link, index) => (
              <span key={link.to}>
                {index > 0 ? ", " : ""}
                <Link to={link.to} className={linkClass}>
                  {link.label}
                </Link>
              </span>
            ))}
          </Term>
        ) : null}
        <Term label={entry.sources.length === 1 ? "Source" : "Sources"}>
          <ul className="grid gap-1">
            {entry.sources.map((source) => (
              <li key={source.url}>
                {source.publisher}, {source.title}:{" "}
                <a href={source.url} target="_blank" rel="noreferrer noopener" className={cn(linkClass, "[overflow-wrap:anywhere]")}>
                  {source.url}
                </a>{" "}
                <span className="text-ink-muted">(checked {checkedOn(source.checked)})</span>
              </li>
            ))}
          </ul>
        </Term>
        <Term label="Checked">{checkedOn(entryChecked(entry))}</Term>
      </dl>
    </div>
  );
}

function Guide({ guide }: { guide: FrequencyGuide }) {
  return (
    <li>
      <details className="group" data-guide={guide.id}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-faint transition-transform duration-150 group-open:rotate-90" />
          <span className="text-body text-ink group-hover:text-primary">{guide.title}</span>
        </summary>
        <div className="grid max-w-[70ch] gap-2 pb-3 pl-7 text-small text-ink">
          {guide.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <p className="text-ink-muted">
            {guide.sources.length === 1 ? "Source: " : "Sources: "}
            {guide.sources.map((source, index) => (
              <span key={source.url}>
                {index > 0 ? "; " : ""}
                {source.publisher},{" "}
                <a href={source.url} target="_blank" rel="noreferrer noopener" className={cn(linkClass, "[overflow-wrap:anywhere]")}>
                  {source.title}
                </a>{" "}
                (checked {checkedOn(source.checked)})
              </span>
            ))}
          </p>
        </div>
      </details>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-5 py-3" role="status" aria-label="Loading the frequencies">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="grid gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="w-72 max-w-full" />
        </div>
      ))}
    </div>
  );
}

/** The filters in words, for the PDF and its title. */
function chosenWords(kind: FrequencyKindId | null, place: string | null, band: string | null, set: string | null, text: string): string {
  const parts = [kind ? kindLabel(kind) : "Every kind"];
  if (place) parts.push(`for ${placeName(place)}`);
  if (band) parts.push(`on ${bandById(band)?.name ?? band}`);
  if (set) parts.push(`that a ${receiverById(set)?.label ?? set} can receive`);
  if (text.trim()) parts.push(`matching “${text.trim()}”`);
  return parts.join(", ");
}

function PdfDialog({
  open,
  onOpenChange,
  entries,
  chosen,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: FrequencyEntry[];
  chosen: string;
  today: string;
}) {
  // Made when the dialog opens, from the list as it is then.
  const pdf = useMemo(() => {
    if (!open || entries.length === 0) return null;
    const written = new Date();
    return madePdf(frequenciesPdf({ entries, chosen, today, written }), frequenciesTitle(chosen, written), "Frequencies", {
      what: "the list of frequencies to listen to",
      path: PATH,
    });
  }, [open, entries, chosen, today]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="This list as a PDF" description={`${plural(entries.length, "entry", "entries")}: ${chosen}.`}>
        <DialogBody className="grid gap-4">
          <p className="text-small text-ink-muted">
            A paper copy to keep by the radio: each entry's frequencies, mode, hours and place, how each time signal goes, and where each
            came from and when it was checked. Made on this device.
          </p>
          <PdfActions pdf={pdf} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export default function FrequenciesPage() {
  const data = useFrequencies();
  const [params, setParams] = useSearchParams();
  const markers = useMarkers();
  const catalogue = useCatalogue();
  const home = homeCountry(markers.data, catalogue.data?.countries);
  const [pdfOpen, setPdfOpen] = useState(false);
  const today = localDay();

  const kindParam = params.get("kind");
  const kind = isKind(kindParam) ? kindParam : null;
  const placeParam = params.get("place");
  const place = placeParam === ANY ? null : (placeParam ?? home);
  const placeIsHome = placeParam === null && home !== null;
  const band = params.get("band") || null;
  const set = params.get("set") || null;
  const text = params.get("q") ?? "";

  const change = (key: string, value: string | null) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const entries = data.data?.entries ?? [];
  const guides = data.data?.guides ?? [];
  const shown = useMemo(
    () => ordered(filterFrequencies(entries, { kind, place, band, receiver: set, text }), place),
    [entries, kind, place, band, set, text],
  );
  const places = useMemo(() => placesIn(entries), [entries]);
  const bands = useMemo(() => {
    const used = new Set(entries.flatMap((entry) => entry.bands));
    return FREQUENCY_BANDS.filter((item) => used.has(item.id));
  }, [entries]);
  const checked = setChecked(entries);
  const chosen = chosenWords(kind, place, band, set, text);
  const kindGuides = guides.filter((guide) => (kind ? guide.kind === kind : false));
  const filtered = kind !== null || place !== null || band !== null || set !== null || text.trim() !== "";
  const profile = set ? receiverById(set) : undefined;

  return (
    <Page>
      <PageHeader
        title="Frequencies to listen to"
        description="Where to tune to hear the time, news, warnings, weather and other people when the internet is out. The list comes with Outpost; nothing is fetched."
      />

      {data.isPending ? (
        <ListSkeleton />
      ) : data.isError ? (
        <ErrorState error={data.error} onRetry={() => void data.refetch()} />
      ) : (
        <>
          <Notice icon={<Info />} title={checked.to ? `Last checked ${checkedOn(checked.to)}` : undefined} className="mb-6">
            Each entry was checked against the page it names, on the day it gives
            {checked.from && checked.from !== checked.to ? ` (the oldest on ${checkedOn(checked.from)})` : ""}. Stations close and schedules
            change, and shortwave schedules change twice a year, at the end of March and the end of October: a frequency here is somewhere
            to try. Times are UTC unless an entry says otherwise. Listening is lawful in most places; transmitting needs a licence or the
            rules of where you are.
          </Notice>

          <section aria-label="Find and filter" className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-6">
            <Field label="Find" className="col-span-2">
              {(ids) => (
                <Input
                  {...ids}
                  type="search"
                  value={text}
                  onChange={(event) => change("q", event.target.value)}
                  placeholder="A station, a frequency or a channel"
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </Field>
            <Field label="Kind" className="max-sm:col-span-2">
              {(ids) => (
                <Select
                  {...ids}
                  value={kind ?? ANY}
                  onChange={(value) => change("kind", value === ANY ? null : value)}
                  options={[{ value: ANY, label: "Every kind" }, ...FREQUENCY_KINDS.map((item) => ({ value: item.id, label: item.label }))]}
                />
              )}
            </Field>
            <Field label="Country or region" className="max-sm:col-span-2">
              {(ids) => (
                <Select
                  {...ids}
                  value={place ?? ANY}
                  onChange={(value) => change("place", value)}
                  options={[
                    { value: ANY, label: "Every place" },
                    ...places.map((item) => ({
                      value: item.code,
                      label: item.code === home ? `${item.name} (home)` : item.name,
                    })),
                  ]}
                />
              )}
            </Field>
            <Field label="Band">
              {(ids) => (
                <Select
                  {...ids}
                  value={band ?? ANY}
                  onChange={(value) => change("band", value === ANY ? null : value)}
                  options={[{ value: ANY, label: "Every band" }, ...bands.map((item) => ({ value: item.id, label: item.name }))]}
                />
              )}
            </Field>
            <Field label="A set like mine">
              {(ids) => (
                <Select
                  {...ids}
                  value={set ?? ANY}
                  onChange={(value) => change("set", value === ANY ? null : value)}
                  options={[
                    { value: ANY, label: "Any radio" },
                    ...RECEIVER_PROFILES.map((item) => ({ value: item.id, label: item.label, description: item.about })),
                  ]}
                />
              )}
            </Field>
          </section>
          <div className="mt-2 grid gap-1 text-small text-ink-muted">
            {placeIsHome && place ? (
              <p>
                Starting from {placeName(place)}, where your home place is, with what applies to its region and everywhere.{" "}
                <button
                  type="button"
                  className={cn(linkClass, "rounded-control max-md:-my-3 max-md:py-3")}
                  onClick={() => change("place", ANY)}
                >
                  Show every place
                </button>
              </p>
            ) : null}
            {profile ? <p>{profile.about} A particular set may tune more or less: its own manual is what counts.</p> : null}
          </div>

          {kindGuides.length > 0 ? (
            <Section className="mt-8" title="Guides">
              <Rows>
                {kindGuides.map((guide) => (
                  <Guide key={guide.id} guide={guide} />
                ))}
              </Rows>
            </Section>
          ) : null}

          <Section
            className="mt-8"
            title={
              <span className="tabular" aria-live="polite">
                {filtered ? `${plural(shown.length, "entry", "entries")} of ${entries.length}` : plural(shown.length, "entry", "entries")}
              </span>
            }
            actions={
              <Button size="sm" onClick={() => setPdfOpen(true)} disabled={shown.length === 0}>
                <FileDown /> Make a PDF
              </Button>
            }
          >
            {shown.length === 0 ? (
              <EmptyState
                compact
                seed={11}
                title={entries.length === 0 ? "No frequencies in this copy" : "Nothing matches"}
                action={
                  entries.length > 0 ? (
                    <Button onClick={() => setParams(new URLSearchParams({ place: ANY }), { replace: true })}>Clear the filters</Button>
                  ) : undefined
                }
              >
                {entries.length === 0
                  ? "This copy of Outpost was built without the list of frequencies."
                  : "No entry matches all of these filters. Fewer filters, or every place, will find more."}
              </EmptyState>
            ) : (
              <Rows>
                {shown.map((entry) => (
                  <FrequencyRow key={entry.id} entry={entry} today={today} />
                ))}
              </Rows>
            )}
          </Section>

          <p className="mt-8 max-w-[70ch] text-small text-ink-muted">
            For amateur repeaters near you, see{" "}
            <Link to="/radio/repeaters" className={linkClass}>
              Repeaters
            </Link>
            ; for whether a shortwave band is likely to be open now, see{" "}
            <Link to="/radio/propagation" className={linkClass}>
              HF propagation
            </Link>
            ; for what to say and when, between your own stations, see{" "}
            <Link to="/radio/plans" className={linkClass}>
              Communication plans
            </Link>
            . General information, not legal advice: transmitting on a distress frequency other than in distress is an offence nearly
            everywhere.
          </p>

          <PdfDialog open={pdfOpen} onOpenChange={setPdfOpen} entries={shown} chosen={chosen} today={today} />
        </>
      )}
    </Page>
  );
}
