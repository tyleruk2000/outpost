/**
 * One communication plan: its stations, the hours and bands of interest, the matrix
 * the engine gives for every pair, the recommendation the stated rule draws from it,
 * and the plan written out as a PDF or as Markdown.
 */
import {
  type CommunicationPlan,
  HF_BANDS,
  hourRanges,
  MODEL_JOIN_NOTE,
  type ModeId,
  modeById,
  NOISE_ENVIRONMENTS,
  OPERATING_MODES,
  PLAN_MAX_STATIONS,
  type PlanInput,
  type PlanPair,
  type PlanResult,
  type PlanStation,
  planBandLabel,
  planHours,
  planRecommendation,
  planRule,
  planTwoWay,
  toMaidenhead,
  utcLabel,
  wireOn,
} from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { FileDown, TriangleAlert, Unlink } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Checkbox, Select, Skeleton } from "@/components/ui/misc";
import { PdfButtons } from "@/features/library/made/pdf-actions";
import { pdfFileName } from "@/features/maps/print/pdf";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { APPROXIMATE_SIGN, HourGrid } from "../charts";
import { useEngines, usePlaces, useProfiles } from "../data";
import { EngineNotReady } from "../engine-data";
import { BasisNotice } from "../results";
import { planKeys, useKeptMatrix, useLinkSearch, usePlan, useRemovePlan, useSavePlan, useWorkOut } from "./data";
import { bandApproximate, choiceWords, pairApproximate, pairNotModelled, planFigure, planMarkdown, saveFile } from "./document";
import { PlanPdfStatus, usePlanPdf } from "./plan-export";
import { StationDialog } from "./station-dialog";

const HOURS = Array.from({ length: 24 }, (_, index) => ({ value: String(index + 1), label: `${utcLabel(index + 1)} UTC` }));

/** One pair: what the rule recommends, the day on every band of the plan, and one hour read out each way. */
export function Pair({ pair, plan, result }: { pair: PlanPair; plan: CommunicationPlan; result: PlanResult }) {
  const hours = planHours(plan.fromUtc, plan.toUtc);
  const byRatio = result.mode.requiredSnrDbHz === null;
  const pick = useMemo(() => planRecommendation(pair, hours, byRatio), [pair, hours, byRatio]);
  const [hour, setHour] = useState(pick.primary?.bestHour ?? hours[0]!);
  const name = (id: string) => plan.stations.find((station) => station.id === id)?.name ?? id;
  const title = `${name(pair.a)} and ${name(pair.b)}`;
  if (pair.problem) {
    return (
      <li className="py-5">
        <h3 className="text-lead text-ink">{title}</h3>
        <p className="mt-1 text-small text-ink">Not worked out. {pair.problem}</p>
      </li>
    );
  }
  // A band on which a station's wire is not modelled has blanks for figures. They are said to be that, never "no path".
  const without = new Map(pair.bands.map((band) => [band.bandId, pairNotModelled(plan, pair, band.mhz)]));
  const blank = (bandId: string) => (without.get(bandId) ? "not modelled" : "no path");
  const share = (value: number | null, bandId: string) => (value === null ? blank(bandId) : `${Math.round(value * 100)}%`);
  const ratio = (value: number | null, bandId: string) => (value === null ? blank(bandId) : `${value.toFixed(1)} dB`);
  const notModelledBands = pair.bands.filter((band) => without.get(band.bandId));
  // A band whose figures are approximate: shown with the others, marked, and said to be that.
  const rough = new Map(pair.bands.map((band) => [band.bandId, bandApproximate(plan, pair, band)]));
  const roughBands = pair.bands.filter((band) => rough.get(band.bandId));
  const mixed =
    roughBands.length > 0 &&
    pair.bands.some(
      (band) =>
        !rough.get(band.bandId) &&
        [pair.a, pair.b].some((id) => {
          const station = plan.stations.find((item) => item.id === id);
          return station ? wireOn(station.antenna, band.mhz)?.state === "half-wave" : false;
        }),
    );
  const mark = (bandId: string, text: string) =>
    rough.get(bandId) && !text.startsWith("no ") && !text.startsWith("not ") ? `${APPROXIMATE_SIGN}${text}` : text;
  return (
    <li className="py-5">
      <h3 className="text-lead text-ink">{title}</h3>
      <p className="tabular mt-0.5 text-small text-ink-muted">
        {Math.round(pair.distanceKm)} km. Bearing {Math.round(pair.bearingDeg)}° from {name(pair.a)}, {Math.round(pair.backBearingDeg)}°
        from {name(pair.b)}.
      </p>
      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-small sm:grid-cols-[5.5rem_1fr]">
        <dt className="font-medium text-ink">Primary</dt>
        <dd className="tabular text-ink">{pick.primary ? choiceWords(pick.primary, byRatio) : `None. ${pick.none ?? ""}`}</dd>
        <dt className="font-medium text-ink">Alternate</dt>
        <dd className="tabular text-ink">
          {pick.alternate ? choiceWords(pick.alternate, byRatio) : "None. No second band of the plan qualifies."}
        </dd>
      </dl>
      {roughBands.length > 0 ? (
        <p data-approximate className="mt-2 max-w-[75ch] text-small text-ink">
          <strong className="font-semibold">Approximate on {roughBands.map((band) => planBandLabel(band.bandId)).join(", ")}.</strong>{" "}
          {roughBands
            .map(
              (band) =>
                `${planBandLabel(band.bandId)}: ${pairApproximate(plan, pair, band.mhz) ?? "an antenna is run as an approximation"}`,
            )
            .join("; ")}
          . These figures are VOACAP's sloping long wire, whose level is unchecked; they may be recommended, and say so.
          {mixed ? ` ${MODEL_JOIN_NOTE}` : ""}
        </p>
      ) : null}
      {notModelledBands.length > 0 ? (
        <p className="mt-2 max-w-[75ch] text-small text-ink-muted">
          No figure on {notModelledBands.map((band) => planBandLabel(band.bandId)).join(", ")}, so{" "}
          {notModelledBands.length > 1 ? "they are" : "it is"} not recommended:{" "}
          {notModelledBands.map((band) => `${planBandLabel(band.bandId)}, ${without.get(band.bandId)}`).join("; ")}. That is not the same as
          a band that does badly.
        </p>
      ) : null}
      {byRatio ? (
        <div className="scroll-quiet mt-4 overflow-x-auto">
          <table className="tabular w-full min-w-max text-small">
            <caption className="mb-1 text-left text-ink-muted">
              Two-way median signal-to-noise ratio in 1 Hz, dB, at each hour of the window (UTC)
            </caption>
            <thead>
              <tr className="border-b border-border text-ink-muted">
                <th scope="col" className="py-1 pr-3 text-left font-medium">
                  Band
                </th>
                {hours.map((item) => (
                  <th key={item} scope="col" className="px-1.5 py-1 text-right font-medium">
                    {String(item).padStart(2, "0")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pair.bands.map((band) => (
                <tr key={band.bandId} className="border-b border-border">
                  <th scope="row" className="whitespace-nowrap py-1 pr-3 text-left font-medium text-ink">
                    {planBandLabel(band.bandId)}
                    {rough.get(band.bandId) ? ` ${APPROXIMATE_SIGN}` : ""}
                  </th>
                  {without.get(band.bandId) ? (
                    <td colSpan={hours.length} className="px-1.5 py-1 text-left text-ink-muted">
                      Not modelled
                    </td>
                  ) : (
                    hours.map((item) => {
                      const value = planTwoWay(band, item, true);
                      return (
                        <td key={item} className="px-1.5 py-1 text-right text-ink">
                          {value === null ? "–" : mark(band.bandId, String(Math.round(value)))}
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4">
          <HourGrid
            name={`Two-way reliability between ${title} by band and hour`}
            what="of days, both ways"
            rowHeight={18}
            hour={hour}
            onHour={setHour}
            rows={pair.bands.map((band) => ({
              label: planBandLabel(band.bandId),
              values: Array.from({ length: 24 }, (_, index) => planTwoWay(band, index + 1, false)),
              marked: band.bandId === pick.primary?.bandId,
              notModelled: Boolean(without.get(band.bandId)),
              approximate: rough.get(band.bandId),
            }))}
          />
          <p className="mt-1 text-small text-ink-muted">
            All 24 hours are shown; the plan's window is {utcLabel(plan.fromUtc)} to {utcLabel(plan.toUtc)} UTC. Press an hour to read each
            direction.
          </p>
          <div className="scroll-quiet mt-3 max-w-xl overflow-x-auto">
            <table className="tabular w-full text-small">
              <caption className="mb-1 text-left font-medium text-ink">At {utcLabel(hour)} UTC, share of days</caption>
              <thead>
                <tr className="border-b border-border text-ink-muted">
                  <th scope="col" className="py-1 pr-3 text-left font-medium">
                    Band
                  </th>
                  <th scope="col" className="px-2 py-1 text-right font-medium">
                    {name(pair.a)} heard at {name(pair.b)}
                  </th>
                  <th scope="col" className="px-2 py-1 text-right font-medium">
                    {name(pair.b)} heard at {name(pair.a)}
                  </th>
                  <th scope="col" className="py-1 pl-2 text-right font-medium">
                    Both ways
                  </th>
                </tr>
              </thead>
              <tbody>
                {pair.bands.map((band) => (
                  <tr key={band.bandId} className="border-b border-border">
                    <th scope="row" className="whitespace-nowrap py-1 pr-3 text-left font-medium text-ink">
                      {planBandLabel(band.bandId)}
                      {rough.get(band.bandId) ? ` ${APPROXIMATE_SIGN}` : ""}
                    </th>
                    <td className="px-2 py-1 text-right text-ink">
                      {mark(band.bandId, share(band.forward.reliability[hour - 1] ?? null, band.bandId))}
                    </td>
                    <td className="px-2 py-1 text-right text-ink">
                      {mark(band.bandId, share(band.back.reliability[hour - 1] ?? null, band.bandId))}
                    </td>
                    <td className="py-1 pl-2 text-right text-ink">
                      {mark(band.bandId, share(planTwoWay(band, hour, false), band.bandId))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {byRatio ? (
        <p className="tabular mt-2 text-small text-ink-muted">
          {pair.bands
            .map((band) =>
              without.get(band.bandId)
                ? `${planBandLabel(band.bandId)}: not modelled`
                : `${planBandLabel(band.bandId)}${rough.get(band.bandId) ? " (approximate)" : ""} at ${utcLabel(hour)}: ${ratio(band.forward.snrDbHz[hour - 1] ?? null, band.bandId)} out, ${ratio(band.back.snrDbHz[hour - 1] ?? null, band.bandId)} back`,
            )
            .join("; ")}
          .
        </p>
      ) : null}
    </li>
  );
}

function Links({ plan, onChange, saving }: { plan: CommunicationPlan; onChange: (links: PlanInput["links"]) => void; saving: boolean }) {
  const [text, setText] = useState("");
  const [asked, setAsked] = useState("");
  const found = useLinkSearch(asked);
  const has = (kind: string, id: string) => plan.links.some((link) => link.kind === kind && link.id === id);
  return (
    <Section
      title="Linked notes and documents"
      description="A net procedure, a frequency list, a contact sheet: anything in Outpost that belongs with this plan."
    >
      {plan.linked.length > 0 ? (
        <Rows className="border-y border-border">
          {plan.linked.map((link) => (
            <li key={`${link.kind}:${link.id}`} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                {link.title === null ? (
                  <span className="text-ink-muted">A {link.kind} that is no longer in Outpost</span>
                ) : (
                  <Link
                    to={link.kind === "note" ? `/notes/${link.id}` : `/library/documents/${link.id}`}
                    className="text-primary underline underline-offset-2"
                  >
                    {link.title}
                  </Link>
                )}
                <span className="ml-2 text-small text-ink-muted">{link.kind === "note" ? "Note" : "Document"}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                aria-label={`Unlink ${link.title ?? `the missing ${link.kind}`}`}
                onClick={() => onChange(plan.links.filter((item) => !(item.kind === link.kind && item.id === link.id)))}
              >
                <Unlink aria-hidden />
                Unlink
              </Button>
            </li>
          ))}
        </Rows>
      ) : (
        <p className="text-small text-ink-muted">Nothing is linked yet.</p>
      )}
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
          <Rows className="mt-2 border-y border-border" aria-label="Notes and documents found">
            {found.data.map((item) => (
              <li key={`${item.kind}:${item.entityId}`} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{item.title}</span>
                  <span className="text-small text-ink-muted">{item.kind === "note" ? "Note" : "Document"}</span>
                </span>
                <Button
                  size="sm"
                  disabled={saving || has(item.kind, item.entityId)}
                  onClick={() => onChange([...plan.links, { kind: item.kind as "note" | "document", id: item.entityId }])}
                >
                  {has(item.kind, item.entityId) ? "Linked" : "Link"}
                </Button>
              </li>
            ))}
          </Rows>
        )
      ) : null}
    </Section>
  );
}

export default function PlanPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const plan = usePlan(id);
  const engines = useEngines();
  const profiles = useProfiles();
  const places = usePlaces();
  // A change refused because the plan was saved on another device meanwhile: the change, and the plan as it is now.
  const [clash, setClash] = useState<{ patch: Partial<PlanInput>; theirs: CommunicationPlan } | null>(null);
  const client = useQueryClient();
  const save = useSavePlan(id, (patch, theirs) => setClash({ patch, theirs }));
  /** Takes the plan as it is now; with `mine`, puts this screen's change on top of it. */
  const settle = (mine: boolean) => {
    if (!clash) return;
    client.setQueryData(planKeys.one(id), clash.theirs);
    if (mine) save.mutate(clash.patch, { onSuccess: () => toast.success("Your change was saved over theirs.") });
    setClash(null);
  };
  const remove = useRemovePlan();
  const work = useWorkOut(id);
  const kept = useKeptMatrix(id, plan.data?.workedOut === true);
  const [editing, setEditing] = useState<PlanStation | "new" | null>(null);
  const [removing, setRemoving] = useState<PlanStation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [ssn, setSsn] = useState("");
  const bandsId = useId();

  const current = plan.data;
  // The fields a person types in are kept here while they type and saved when they leave the field.
  useEffect(() => {
    if (!current) return;
    setName(current.name);
    setNotes(current.notes);
    setSsn(current.solar.source === "manual" ? String(current.solar.ssn) : "");
  }, [current]);
  // The plan's PDF, made as soon as there are figures to put in it.
  const pdf = usePlanPdf(current, current?.workedOut ? (work.data ?? kept.data ?? null) : null);

  if (plan.isPending) {
    return (
      <Page>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-8 h-64 w-full" />
      </Page>
    );
  }
  if (plan.isError || !current) {
    return (
      <Page>
        <PageHeader title="Communication plan" />
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
        <p className="mt-4 text-small">
          <Link to="/radio/plans" className="text-primary underline underline-offset-2">
            All communication plans
          </Link>
        </p>
      </Page>
    );
  }

  const engine = engines.data?.[0];
  const change = (patch: Partial<PlanInput>) => save.mutate(patch);
  const result = current.workedOut ? (work.data ?? kept.data ?? null) : null;
  const byRatio = result ? result.mode.requiredSnrDbHz === null : modeById(current.mode).requiredSnrDb === null;
  const hours = planHours(current.fromUtc, current.toUtc);
  const stationName = (stationId: string) => current.stations.find((station) => station.id === stationId)?.name ?? stationId;

  const exportMarkdown = () => {
    if (!result) return;
    const file = pdfFileName(`Communication plan ${current.name}`).replace(/\.pdf$/, "");
    saveFile(`${file}.md`, "text/markdown;charset=utf-8", planMarkdown(current, result, new Date()));
  };

  return (
    <Page>
      <PageHeader
        title={current.name}
        description={
          <>
            A communication plan.{" "}
            <Link to="/radio/plans" className="text-primary underline underline-offset-2">
              All plans
            </Link>
          </>
        }
        actions={
          <>
            <PdfButtons made={pdf.made} lead="none" />
            <Button
              disabled={!result}
              onClick={exportMarkdown}
              className="h-auto min-h-9 max-w-full py-2 whitespace-normal max-md:h-auto max-md:min-h-11"
            >
              <FileDown aria-hidden />
              Export as Markdown
            </Button>
            <Button variant="danger-ghost" onClick={() => setDeleting(true)}>
              Delete plan
            </Button>
          </>
        }
      />
      <PlanPdfStatus file={pdf} className="-mt-4 mb-6" />
      {clash ? (
        <Notice tone="warning" icon={<TriangleAlert />} title="This plan was changed somewhere else" className="mb-6">
          <p>
            Someone saved it on another device after this screen read it, so your last change was not saved. Keep yours to save it over
            theirs, or take theirs to see the plan as they left it.
          </p>
          <span className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => settle(true)}>
              Keep my change
            </Button>
            <Button size="sm" onClick={() => settle(false)}>
              Take theirs
            </Button>
          </span>
        </Notice>
      ) : null}
      <EngineNotReady engine={engine} title="The propagation engine cannot run, so the plan cannot be worked out" className="mb-6">
        The plan itself can still be written and changed.
      </EngineNotReady>

      <Section
        title="Stations"
        description={`Places, and the equipment at each. Up to ${PLAN_MAX_STATIONS}; every pair is worked out both ways.`}
        actions={
          <Button disabled={current.stations.length >= PLAN_MAX_STATIONS} onClick={() => setEditing("new")}>
            Add a station
          </Button>
        }
      >
        {current.stations.length === 0 ? (
          <p className="rounded-panel border border-border px-4 py-6 text-small text-ink-muted">
            No stations yet. Add the first: home, a shelter, a relative's house, a portable station, a rendezvous point.
          </p>
        ) : (
          <Rows className="border-y border-border">
            {current.stations.map((station) => (
              <li key={station.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{station.name}</span>
                  <span className="tabular block text-small text-ink-muted">
                    {station.lat.toFixed(2)}, {station.lon.toFixed(2)} · {toMaidenhead(station.lat, station.lon, 6)} · {station.powerWatts}{" "}
                    W · {station.antennaName || "An antenna with no name"} ·{" "}
                    {NOISE_ENVIRONMENTS.find((item) => item.id === station.noise)?.label.toLowerCase()} noise
                  </span>
                </span>
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => setEditing(station)} aria-label={`Change ${station.name}`}>
                    Change
                  </Button>
                  <Button size="sm" variant="danger-ghost" onClick={() => setRemoving(station)} aria-label={`Remove ${station.name}`}>
                    Remove
                  </Button>
                </span>
              </li>
            ))}
          </Rows>
        )}
      </Section>

      <Section title="When, and on what" description="Changes are saved as you make them.">
        {/* A column that may be narrower than the hours side by side in it, which with large text on a phone are wider than the screen. */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Name of the plan">
            {(ids) => (
              <Input
                {...ids}
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => name.trim() && name.trim() !== current.name && change({ name: name.trim() })}
              />
            )}
          </Field>
          <Field label="Date (UTC)" hint="The model works by month: every day of a month gets the same plan.">
            {(ids) => (
              <Input
                {...ids}
                type="date"
                value={current.date}
                onChange={(event) => /^\d{4}-\d{2}-\d{2}$/.test(event.target.value) && change({ date: event.target.value })}
                className="max-w-48"
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="From">
              {(ids) => (
                <Select {...ids} value={String(current.fromUtc)} onChange={(value) => change({ fromUtc: Number(value) })} options={HOURS} />
              )}
            </Field>
            <Field label="To">
              {(ids) => (
                <Select {...ids} value={String(current.toUtc)} onChange={(value) => change({ toUtc: Number(value) })} options={HOURS} />
              )}
            </Field>
          </div>
          <Field label="Mode" hint={modeById(current.mode).meaning}>
            {(ids) => (
              <Select<ModeId>
                {...ids}
                value={current.mode}
                onChange={(value) => change({ mode: value, requiredSnrDb: null, referenceBandwidthHz: null })}
                options={OPERATING_MODES.map((item) => ({ value: item.id, label: item.label }))}
              />
            )}
          </Field>
          <Field label="Sunspot number" hint="The one figure about the Sun the engine takes. Neither is a reading of today's conditions.">
            {(ids) => (
              <Select
                {...ids}
                value={current.solar.source}
                onChange={(value) =>
                  value === "table"
                    ? change({ solar: { source: "table" } })
                    : change({ solar: { source: "manual", ssn: Number(ssn) || 80 } })
                }
                options={[
                  { value: "table", label: "NOAA's forecast for the month", description: "From the solar cycle table installed" },
                  { value: "manual", label: "A sunspot number of my own" },
                ]}
              />
            )}
          </Field>
          {current.solar.source === "manual" ? (
            <Field label="Smoothed sunspot number">
              {(ids) => (
                <Input
                  {...ids}
                  value={ssn}
                  inputMode="decimal"
                  className="tabular max-w-32"
                  onChange={(event) => setSsn(event.target.value)}
                  onBlur={() => {
                    const value = Number(ssn);
                    if (ssn.trim() !== "" && value >= 0 && value <= 300) change({ solar: { source: "manual", ssn: value } });
                    else toast.error("Give a smoothed sunspot number between 0 and 300.");
                  }}
                />
              )}
            </Field>
          ) : null}
        </div>
        <fieldset className="mt-5">
          <legend className="text-small font-medium text-ink">Bands of interest</legend>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            {HF_BANDS.map((band) => {
              const on = current.bands.includes(band.id);
              return (
                <label
                  key={band.id}
                  htmlFor={`${bandsId}-${band.id}`}
                  className="flex min-h-11 items-center gap-2 text-small text-ink md:min-h-8"
                >
                  <Checkbox
                    id={`${bandsId}-${band.id}`}
                    checked={on}
                    // The last band cannot be taken away: a plan with none has nothing to work out.
                    disabled={on && current.bands.length === 1}
                    onCheckedChange={(checked) =>
                      change({ bands: checked === true ? [...current.bands, band.id] : current.bands.filter((item) => item !== band.id) })
                    }
                  />
                  {band.label}
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-small text-ink-muted">
            One frequency near the middle stands for each band. The edges are those of the United Kingdom licence.
          </p>
        </fieldset>
      </Section>

      <Section
        title="The matrix"
        description="For every pair of stations, each band of the plan through the day, both ways."
        actions={
          <Button
            variant="primary"
            loading={work.isPending}
            disabled={current.stations.length < 2 || (engine ? !engine.ready : false)}
            onClick={() => work.mutate()}
          >
            {result ? "Work it out again" : "Work out the plan"}
          </Button>
        }
      >
        {work.isError ? (
          <Notice tone="danger" title="The plan was not worked out" className="mb-4">
            {errorMessage(work.error)}
          </Notice>
        ) : null}
        {current.stations.length < 2 ? (
          <p className="text-small text-ink-muted">A plan needs at least two stations before there is a pair to work out.</p>
        ) : work.isPending || (current.workedOut && kept.isPending && !work.data) ? (
          <Skeleton className="h-64 w-full" />
        ) : !result ? (
          <p className="text-small text-ink-muted">
            {kept.isError
              ? errorMessage(kept.error)
              : "Not worked out for the plan as it stands. Nothing is shown until the engine has been asked."}
          </p>
        ) : (
          <>
            <BasisNotice basis={result.basis} />
            <div className="mt-5 max-w-[75ch]">
              <h3 className="text-body font-semibold text-ink">How the bands are chosen</h3>
              <ul className="mt-1.5 grid list-disc gap-1 pl-5 text-small text-ink-muted">
                {planRule(byRatio).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            {/* One table at every width: on a phone each pair is a block, and each figure carries its column's name. */}
            <table className="tabular mt-5 w-full text-small">
              <caption className="sr-only">The primary and alternate band for each pair of stations</caption>
              <thead className="max-sm:sr-only">
                <tr className="border-b border-border-strong text-left text-ink-muted">
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    Between
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">
                    Distance
                  </th>
                  <th scope="col" className="px-3 py-1.5 font-medium">
                    Primary
                  </th>
                  <th scope="col" className="py-1.5 pl-3 font-medium">
                    Alternate
                  </th>
                </tr>
              </thead>
              <tbody className="max-sm:border-t max-sm:border-border-strong">
                {result.pairs.map((pair) => {
                  const pick = planRecommendation(pair, hours, byRatio);
                  const cell = (choice: typeof pick.primary) =>
                    choice ? (
                      <>
                        <span className="font-medium text-ink">{planBandLabel(choice.bandId)}</span>, {hourRanges(choice.hours)}, up to{" "}
                        {planFigure(choice.best, byRatio)}
                      </>
                    ) : (
                      "None"
                    );
                  const labelled =
                    "max-sm:block max-sm:px-0 max-sm:py-0.5 max-sm:text-left max-sm:before:mr-2 max-sm:before:text-ink-muted max-sm:before:content-[attr(data-label)]";
                  return (
                    <tr key={`${pair.a}-${pair.b}`} className="border-b border-border align-top max-sm:block max-sm:py-2">
                      <th scope="row" className="py-1.5 pr-3 text-left font-medium text-ink max-sm:block max-sm:py-0.5">
                        {stationName(pair.a)} and {stationName(pair.b)}
                      </th>
                      <td data-label="Distance" className={`px-3 py-1.5 text-right text-ink ${labelled}`}>
                        {pair.problem ? "Not worked out" : `${Math.round(pair.distanceKm)} km`}
                      </td>
                      <td data-label="Primary" className={`px-3 py-1.5 text-ink ${labelled}`}>
                        {cell(pick.primary)}
                      </td>
                      <td data-label="Alternate" className={`py-1.5 pl-3 text-ink ${labelled}`}>
                        {cell(pick.alternate)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-small text-ink-muted">
              Hours are UTC. Mode: {result.mode.label}
              {result.mode.requiredSnrDbHz === null
                ? ", which has no stated requirement"
                : `, taken to need ${result.mode.requiredSnrDbHz} dB in 1 Hz`}
              . Worked out {formatDateTime(result.computedAt)}
              {result.cached ? "" : ` in ${(result.tookMs / 1000).toFixed(1)} s`} by {result.engine.model}.
            </p>
            <Rows className="mt-4 border-t border-border">
              {result.pairs.map((pair) => (
                <Pair
                  key={`${result.key}-${pair.a}-${pair.b}-${current.fromUtc}-${current.toUtc}`}
                  pair={pair}
                  plan={current}
                  result={result}
                />
              ))}
            </Rows>
            <ul className="mt-5 grid max-w-[75ch] list-disc gap-1.5 pl-5 text-small text-ink-muted">
              {result.limits.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="Notes" description="Call signs, times to listen, what to do if nothing is heard. Printed with the plan.">
        <Field label="Notes for this plan">
          {(ids) => (
            <Textarea
              {...ids}
              rows={5}
              value={notes}
              maxLength={8000}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => notes !== current.notes && change({ notes })}
            />
          )}
        </Field>
      </Section>

      <Links plan={current} saving={save.isPending} onChange={(links) => change({ links })} />

      {editing ? (
        <StationDialog
          station={editing === "new" ? null : editing}
          radios={profiles.data?.radios ?? []}
          antennas={profiles.data?.antennas ?? []}
          places={places.data ?? []}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(station) =>
            save.mutate(
              {
                stations:
                  editing === "new"
                    ? [...current.stations, station]
                    : current.stations.map((item) => (item.id === station.id ? station : item)),
              },
              { onSuccess: () => setEditing(null) },
            )
          }
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this station from the plan?"
        description={`“${removing?.name ?? ""}” will be taken out of this plan. Saved places and equipment profiles are not touched.`}
        confirmLabel="Remove"
        loading={save.isPending}
        onConfirm={() =>
          removing &&
          save.mutate({ stations: current.stations.filter((item) => item.id !== removing.id) }, { onSuccess: () => setRemoving(null) })
        }
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this plan?"
        description={`“${current.name}” will be deleted, with its stations and notes. Notes and documents it links to are not touched.`}
        confirmLabel="Delete plan"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(current.id, { onSuccess: () => navigate("/radio/plans") })}
      />
    </Page>
  );
}
