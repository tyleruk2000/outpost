/**
 * Nuclear preparedness: a workspace over the offline map. In this version it holds the
 * educational effects simulator (rings and an idealised fallout plume from Glasstone
 * and Dolan), the person's saved places measured against a scenario, saved scenarios
 * and a side-by-side comparison of two. The layers panel is where the data layers of
 * later versions (infrastructure, historical records, shelters, downloads) go.
 *
 * On a wide screen the panel sits beside the map and can be put away; on a phone the
 * map comes first and the panel follows it on the page, so that nothing lies over the
 * map but its own column (docs/development/web-screens.md, "Things over a map").
 */

import type { Bbox } from "@outpost/shared";
import {
  computeEffects,
  EFFECTS_ASSUMPTIONS,
  EFFECTS_CAVEAT,
  EFFECTS_LIMITATIONS,
  EFFECTS_SOURCE,
  type EffectRing,
  type EffectsResult,
  type NuclearScenario,
  roundDistance,
} from "@outpost/shared";
import { CloudOff, FileDown, PanelRightClose, PanelRightOpen, Plus, Trash2 } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented, Select, Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { madePdf } from "@/features/library/made/made-pdf";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { useMapOverview, useMapSources, useMarkers } from "@/features/maps/data";
import { hasImagery } from "@/features/maps/imagery/style";
import { pdfFileName } from "@/features/maps/print/pdf";
import { saveFile } from "@/features/propagation/plans/document";
import { errorMessage } from "@/lib/api";
import { cn, formatDateTime, plural } from "@/lib/utils";
import { useDeleteScenario, useSaveScenario, useScenarios } from "./data";
import { scenarioMarkdown, scenarioPdf, scenarioTitle, type Written } from "./document";
import { checkForm, EMPTY_FORM, type FormField, formOf, type ScenarioForm } from "./form";
import { destination, placeAgainst } from "./geometry";
import { ALL_VISIBLE, type Drawn, FAMILY_LINES, nuclearData, type Visible } from "./layers";
import { PROVENANCE, ProvenanceBadge, ProvenanceKey } from "./provenance";
import { burstText, distanceText, placeSentence, windText, yieldText } from "./words";

// The map library is large; it is fetched when the map is first drawn.
const PlanMap = lazy(() => import("@/features/propagation/map/plan-map").then((module) => ({ default: module.PlanMap })));

const PATH = "/prepare/nuclear";

interface Open {
  /** The saved scenario the form holds, or null for a new one. */
  id: string | null;
  updatedAt: number;
}

export default function NuclearPage() {
  const scenarios = useScenarios();
  const markers = useMarkers();
  const overview = useMapOverview();
  const sources = useMapSources();
  const save = useSaveScenario();
  const remove = useDeleteScenario();

  const [form, setForm] = useState<ScenarioForm>(EMPTY_FORM);
  const [open, setOpen] = useState<Open>({ id: null, updatedAt: Date.now() });
  const [compareId, setCompareId] = useState<string | null>(null);
  const [visible, setVisible] = useState<Visible>(ALL_VISIBLE);
  const [showPlaces, setShowPlaces] = useState(true);
  const [satellite, setSatellite] = useState(false);
  const [panel, setPanel] = useState(true);
  const [tab, setTab] = useState("scenario");
  const [deleting, setDeleting] = useState<NuclearScenario | null>(null);
  const [triedSave, setTriedSave] = useState(false);
  const [fit, setFit] = useState<Bbox | null>(null);

  const checked = useMemo(() => checkForm(form), [form]);
  const answer = useMemo(() => (checked.effects ? computeEffects(checked.effects) : null), [checked.effects]);
  const result = answer?.ok ? answer.result : null;
  const refusals = answer && !answer.ok ? answer.problems : checked.refused;

  const compared = scenarios.data?.find((item) => item.id === compareId && item.id !== open.id) ?? null;
  const comparedAnswer = useMemo(() => (compared ? computeEffects(compared.effects) : null), [compared]);
  const comparedResult = comparedAnswer?.ok ? comparedAnswer.result : null;

  const drawn = useMemo<Drawn[]>(() => {
    const list: Drawn[] = [];
    if (result && checked.at) list.push({ letter: "A", at: checked.at, result });
    if (compared && comparedResult) list.push({ letter: "B", at: { lat: compared.lat, lon: compared.lon }, result: comparedResult });
    return list;
  }, [result, checked.at, compared, comparedResult]);
  const mapData = useMemo(() => nuclearData(drawn, visible), [drawn, visible]);

  const set = <K extends keyof ScenarioForm>(key: K, value: ScenarioForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setOpen((current) => ({ ...current, updatedAt: Date.now() }));
  };

  // A missing name or place is said only once saving was tried; a field typed wrongly is said at once.
  const fieldError = (field: FormField) =>
    triedSave || (field !== "name" && (field !== "where" || form.where.trim() !== "")) ? checked.problems[field] : undefined;

  const places = markers.data ?? [];
  const installedRegions = overview.data?.regions?.length ?? 0;
  const imagery = hasImagery(sources.data);

  function fitTo(result: EffectsResult, at: { lat: number; lon: number }) {
    // The rings, and the fallout as far as its 1,000 rads per hour contour: the farthest contours run tens of
    // kilometres and would shrink the rings to nothing.
    const hundred = result.fallout.drawn ? (result.fallout.contours.find((contour) => contour.rate === 1000)?.downwindM ?? 0) : 0;
    const reach = Math.max(...result.rings.map((ring) => ring.metres ?? 0), hundred);
    const north = destination(at, 0, reach * 1.1);
    const south = destination(at, 180, reach * 1.1);
    const east = destination(at, 90, reach * 1.1);
    const west = destination(at, 270, reach * 1.1);
    setFit([west.lon, south.lat, east.lon, north.lat]);
  }

  async function onSave() {
    setTriedSave(true);
    if (!checked.input) {
      toast.error("The scenario cannot be saved yet. See what the form says.");
      return;
    }
    try {
      const saved = await save.mutateAsync({ id: open.id, input: checked.input });
      setOpen({ id: saved.id, updatedAt: saved.updatedAt });
      toast.success(open.id ? "Changes saved." : "Scenario saved.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function openScenario(scenario: NuclearScenario) {
    setForm(formOf(scenario));
    setOpen({ id: scenario.id, updatedAt: scenario.updatedAt });
    if (compareId === scenario.id) setCompareId(null);
    setTriedSave(false);
    setTab("scenario");
    const opened = computeEffects(scenario.effects);
    if (opened.ok) fitTo(opened.result, scenario);
  }

  function newScenario() {
    setForm({ ...EMPTY_FORM, where: form.where });
    setOpen({ id: null, updatedAt: Date.now() });
    setTriedSave(false);
    setTab("scenario");
  }

  const written = useMemo(() => {
    const list: Written[] = [];
    if (result && checked.at && checked.effects)
      list.push({
        letter: "A",
        scenario: {
          name: form.name.trim() || "Unsaved scenario",
          notes: form.notes,
          lat: checked.at.lat,
          lon: checked.at.lon,
          effects: checked.effects,
        },
        result,
      });
    if (compared && comparedResult) list.push({ letter: "B", scenario: compared, result: comparedResult });
    return list;
  }, [result, checked.at, checked.effects, form.name, form.notes, compared, comparedResult]);

  return (
    <Page width="full">
      <PageHeader
        title="Nuclear preparedness"
        description="An educational workspace over the offline map. Its effects simulator draws what a published model says a nuclear detonation of a stated size does at a distance, for an idealised case. It is not a forecast and not instructions."
      />
      <OfflineLine regions={installedRegions} loading={overview.isPending} />

      <div className={cn("grid gap-x-8 gap-y-6", panel ? "lg:grid-cols-[minmax(0,1fr)_25rem]" : "lg:grid-cols-[minmax(0,1fr)]")}>
        <div className="grid content-start gap-2 lg:sticky lg:top-4 lg:self-start">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-small text-ink-muted">
              {checked.at ? "Press the map to move ground zero." : "Press the map to put ground zero there."}
            </p>
            <Button variant="ghost" size="sm" className="max-lg:hidden" onClick={() => setPanel((shown) => !shown)} aria-expanded={panel}>
              {panel ? <PanelRightClose aria-hidden /> : <PanelRightOpen aria-hidden />}
              {panel ? "Hide the panel" : "Show the panel"}
            </Button>
          </div>
          <Suspense fallback={<Skeleton className="h-[min(52dvh,40rem)] w-full lg:h-[min(76dvh,52rem)]" />}>
            <PlanMap
              label="The offline map, with the scenario's rings and fallout pattern"
              className="h-[min(52dvh,40rem)] lg:h-[min(76dvh,52rem)]"
              nuclear={mapData}
              places={showPlaces ? places : undefined}
              satellite={satellite && imagery}
              fit={fit}
              fitMaxZoom={15}
              onPress={({ position, place }) => {
                set("where", `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}`);
                if (place && !form.name.trim()) set("name", `Near ${place.name}`);
              }}
            />
          </Suspense>
          {drawn.length > 0 ? (
            <MapKey letters={drawn.map((item) => item.letter)} compared={compared?.name ?? null} current={form.name} />
          ) : null}
        </div>

        <aside className={cn("grid content-start gap-4", !panel && "lg:hidden")} aria-label="Scenarios and layers">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="scenario">Scenario</TabsTrigger>
              <TabsTrigger value="saved">Saved{scenarios.data?.length ? ` (${scenarios.data.length})` : ""}</TabsTrigger>
              <TabsTrigger value="layers">Layers</TabsTrigger>
            </TabsList>

            <TabsContent value="scenario" className="mt-4 grid gap-4">
              <ScenarioFields form={form} set={set} places={places} fieldError={fieldError} />
              {refusals.length > 0 ? (
                <Notice tone="warning" title="The model cannot answer this">
                  {refusals.join(" ")}
                </Notice>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={onSave} loading={save.isPending}>
                  {open.id ? "Save changes" : "Save scenario"}
                </Button>
                {open.id ? (
                  <Button onClick={newScenario}>
                    <Plus aria-hidden />
                    New scenario
                  </Button>
                ) : null}
              </div>
              {result && checked.at ? (
                <Results
                  result={result}
                  compared={comparedResult}
                  comparedName={compared?.name ?? null}
                  onFit={() => fitTo(result, checked.at!)}
                />
              ) : (
                <p className="text-small text-ink-muted">
                  {checked.at ? "" : "Put ground zero on the map to see the rings. "}The results appear here as you type.
                </p>
              )}
              {result && checked.at ? <PlacesAgainst places={places} at={checked.at} result={result} loading={markers.isPending} /> : null}
              {written.length > 0 ? (
                <Export written={written} dated={compared ? Math.max(open.updatedAt, compared.updatedAt) : open.updatedAt} />
              ) : null}
            </TabsContent>

            <TabsContent value="saved" className="mt-4">
              <SavedList
                query={scenarios}
                openId={open.id}
                compareId={compared?.id ?? null}
                onOpen={openScenario}
                onCompare={(scenario) => {
                  setCompareId(scenario ? scenario.id : null);
                  if (scenario) {
                    const opened = computeEffects(scenario.effects);
                    if (opened.ok) fitTo(opened.result, scenario);
                  }
                }}
                onDelete={setDeleting}
              />
            </TabsContent>

            <TabsContent value="layers" className="mt-4 grid gap-6">
              <LayersPanel
                visible={visible}
                onVisible={setVisible}
                showPlaces={showPlaces}
                onShowPlaces={setShowPlaces}
                places={places.length}
                imagery={imagery}
                satellite={satellite}
                onSatellite={setSatellite}
                scenarios={(scenarios.data?.length ?? 0) + (open.id ? 0 : result ? 1 : 0)}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title="Delete this scenario?"
        description={deleting ? `“${deleting.name}” and its notes will be deleted from this device. This cannot be undone.` : ""}
        confirmLabel="Delete scenario"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            if (open.id === deleting.id) setOpen({ id: null, updatedAt: Date.now() });
            if (compareId === deleting.id) setCompareId(null);
            toast.success("Scenario deleted.");
          } catch (error) {
            toast.error(errorMessage(error));
          }
          setDeleting(null);
        }}
      />
    </Page>
  );
}

/** The persistent line that says this screen works from this device. */
function OfflineLine({ regions, loading }: { regions: number; loading: boolean }) {
  return (
    <p className="mb-5 flex items-start gap-2 text-small text-ink-muted" data-testid="offline-line">
      <CloudOff aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        Works offline: the map, the model and your scenarios are on this device, and nothing here uses the internet.{" "}
        {loading
          ? ""
          : regions > 0
            ? `${plural(regions, "offline map region")} installed.`
            : "No offline map region is installed, so the map shows coastlines and borders only. Add a region under Maps, Offline maps, for streets and names."}
      </span>
    </p>
  );
}

function ScenarioFields({
  form,
  set,
  places,
  fieldError,
}: {
  form: ScenarioForm;
  set: <K extends keyof ScenarioForm>(key: K, value: ScenarioForm[K]) => void;
  places: Array<{ id: string; name: string; lat: number; lon: number }>;
  fieldError: (field: FormField) => string | undefined;
}) {
  return (
    <div className="grid gap-4">
      <Field label="Name" error={fieldError("name")}>
        {(ids) => (
          <Input
            {...ids}
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder="1 kiloton over the old quarry"
          />
        )}
      </Field>
      <Field
        label="Ground zero"
        hint="Press the map, choose a saved place, or type coordinates, a grid reference or a locator."
        error={fieldError("where")}
      >
        {(ids) => (
          <div className="grid gap-2">
            <Input
              {...ids}
              value={form.where}
              onChange={(event) => set("where", event.target.value)}
              placeholder="54.4600, -3.0900"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
            {places.length > 0 ? (
              <Select
                aria-label="Ground zero: choose a saved place"
                value={undefined}
                placeholder="Or choose a saved place"
                onChange={(id) => {
                  const place = places.find((item) => item.id === id);
                  if (place) set("where", `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`);
                }}
                options={places.map((place) => ({ value: place.id, label: place.name }))}
              />
            ) : null}
          </div>
        )}
      </Field>
      <Field label="Yield" hint="From 1 kiloton to 10 megatons: the range the model's curves are drawn for." error={fieldError("yield")}>
        {(ids) => (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              {...ids}
              value={form.yieldValue}
              onChange={(event) => set("yieldValue", event.target.value)}
              inputMode="decimal"
              className="tabular w-28"
            />
            <Segmented
              label="Yield unit"
              value={form.yieldUnit}
              onChange={(value) => set("yieldUnit", value)}
              options={[
                { value: "kt", label: "kilotons" },
                { value: "Mt", label: "megatons" },
              ]}
            />
          </div>
        )}
      </Field>
      <div className="grid gap-2">
        <span className="text-small font-medium text-ink" id="burst-label">
          Burst
        </span>
        <Segmented
          label="Burst"
          value={form.burst}
          onChange={(value) => set("burst", value)}
          className="flex-wrap"
          options={[
            { value: "surface", label: "On the surface" },
            { value: "height", label: "At a height" },
            { value: "optimum", label: "Farthest reach" },
          ]}
        />
        {form.burst === "height" ? (
          <Field
            label="Height of burst"
            error={fieldError("height")}
            hint="Up to 12,000 m (40,000 ft), and a scaled height of 5,000 ft (Fig. 3.73c)."
          >
            {(ids) => (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  {...ids}
                  value={form.heightValue}
                  onChange={(event) => set("heightValue", event.target.value)}
                  inputMode="decimal"
                  className="tabular w-28"
                />
                <Segmented
                  label="Height unit"
                  value={form.heightUnit}
                  onChange={(value) => set("heightUnit", value)}
                  options={[
                    { value: "m", label: "metres" },
                    { value: "ft", label: "feet" },
                  ]}
                />
              </div>
            )}
          </Field>
        ) : null}
        {form.burst === "optimum" ? (
          <Field
            label="The height that carries this overpressure farthest"
            hint="The tip of its curve in Glasstone and Dolan, Figs. 3.73b and c."
          >
            {(ids) => (
              <Select
                {...ids}
                value={form.psi}
                onChange={(value) => set("psi", value)}
                options={(["20", "10", "5", "2", "1"] as const).map((psi) => ({ value: psi, label: `${psi} psi` }))}
              />
            )}
          </Field>
        ) : null}
      </div>
      <Field
        label="Wind, for fallout"
        hint="The direction it blows from, in degrees (0 north, 90 east), and its speed: 13 to 72 km/h (8 to 45 mph). Leave both empty for no fallout pattern. Fallout is drawn only for a surface burst."
        error={fieldError("wind")}
      >
        {(ids) => (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              {...ids}
              aria-label="Wind from, degrees"
              value={form.windFrom}
              onChange={(event) => set("windFrom", event.target.value)}
              inputMode="decimal"
              placeholder="270"
              className="tabular w-20"
            />
            <span className="text-small text-ink-muted">° at</span>
            <Input
              aria-label="Wind speed"
              value={form.windSpeed}
              onChange={(event) => set("windSpeed", event.target.value)}
              inputMode="decimal"
              placeholder="24"
              className="tabular w-20"
            />
            <Segmented
              label="Wind speed unit"
              value={form.windUnit}
              onChange={(value) => set("windUnit", value)}
              options={[
                { value: "kmh", label: "km/h" },
                { value: "mph", label: "mph" },
              ]}
            />
          </div>
        )}
      </Field>
      <Field label="Notes">
        {(ids) => <Textarea {...ids} value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={3} />}
      </Field>
    </div>
  );
}

/** A line drawn the way the map draws a kind of effect, for the legend. */
function LineSample({ family, letter = "A" }: { family: EffectRing["family"] | "fallout"; letter?: "A" | "B" }) {
  const style = family === "fallout" ? { dash: [3, 1.5], width: 1 } : FAMILY_LINES[family];
  const scale = 2;
  return (
    <svg aria-hidden width="36" height="12" viewBox="0 0 36 12" className={cn("shrink-0", letter === "B" ? "text-primary" : "text-ink")}>
      {family === "fallout" ? <rect x="1" y="2" width="34" height="8" fill="currentColor" opacity="0.15" /> : null}
      <line
        x1="1"
        y1="6"
        x2="35"
        y2="6"
        stroke="currentColor"
        strokeWidth={style.width}
        strokeDasharray={style.dash ? style.dash.map((part) => part * style.width * scale).join(" ") : undefined}
        strokeLinecap={family === "radiation" ? "round" : "butt"}
      />
    </svg>
  );
}

function MapKey({ letters, compared, current }: { letters: Array<"A" | "B">; compared: string | null; current: string }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-small text-ink-muted" aria-label="How the map draws each kind of effect">
      {letters.includes("B") ? (
        <>
          <li className="flex items-center gap-2">
            <span className="grid size-5 place-items-center rounded-full border-2 border-ink text-micro text-ink">A</span>
            {current.trim() || "This scenario"}
          </li>
          <li className="flex items-center gap-2">
            <span className="grid size-5 place-items-center rounded-full border-2 border-primary text-micro text-ink">B</span>
            {compared}
          </li>
        </>
      ) : null}
      {(
        [
          ["blast", "Blast"],
          ["thermal", "Burns"],
          ["radiation", "Initial radiation"],
          ["fireball", "Fireball, crater"],
          ["fallout", "Fallout (idealised)"],
        ] as const
      ).map(([family, label]) => (
        <li key={family} className="flex items-center gap-2">
          <LineSample family={family} />
          {label}
        </li>
      ))}
    </ul>
  );
}

const FAMILY_TITLES: Record<EffectRing["family"], string> = {
  fireball: "Fireball",
  crater: "Crater",
  blast: "Blast: peak overpressure",
  thermal: "Heat: burns to exposed skin",
  radiation: "Initial nuclear radiation",
};

function Results({
  result,
  compared,
  comparedName,
  onFit,
}: {
  result: EffectsResult;
  compared: EffectsResult | null;
  comparedName: string | null;
  onFit: () => void;
}) {
  const families = [...new Set(result.rings.map((ring) => ring.family))];
  return (
    <section aria-label="What the model gives" className="grid gap-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lead font-semibold text-ink">What the model gives</h2>
        <Button size="sm" variant="ghost" onClick={onFit}>
          Fit the map to it
        </Button>
      </div>
      <Notice tone="info" title="An educational estimate">
        {EFFECTS_CAVEAT}
      </Notice>
      {compared ? (
        <p className="text-small text-ink-muted">
          Distances for B, <span className="text-ink">{comparedName}</span>, are given after A's.
        </p>
      ) : null}
      {families.map((family) => (
        <div key={family} className="grid gap-1.5">
          <h3 className="flex items-center gap-2 text-body font-semibold text-ink">
            <LineSample family={family} />
            {FAMILY_TITLES[family]}
            <ProvenanceBadge kind="model" className="ml-auto" />
          </h3>
          <Rows className="border-y border-border">
            {result.rings
              .filter((ring) => ring.family === family)
              .map((ring) => {
                const other = compared?.rings.find((item) => item.id === ring.id);
                return (
                  <li key={ring.id} className="grid gap-1 py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-body text-ink">{ring.label}</span>
                      <span className="tabular text-body text-ink">
                        {ring.metres === null ? "Not given" : distanceText(roundDistance(ring.metres))}
                        {compared ? (
                          <span className="text-ink-muted">
                            {" "}
                            · B {other?.metres == null ? "not given" : distanceText(roundDistance(other.metres))}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    {ring.why ? <p className="text-small text-ink-muted">{ring.why}</p> : null}
                    <details className="text-small text-ink-muted">
                      <summary className="cursor-pointer text-ink-muted hover:text-ink">What this means, and its source</summary>
                      <p className="mt-1">{ring.meaning}</p>
                      <p className="mt-1">Source: {ring.source}.</p>
                    </details>
                  </li>
                );
              })}
          </Rows>
        </div>
      ))}
      <div className="grid gap-1.5">
        <h3 className="flex items-center gap-2 text-body font-semibold text-ink">
          <LineSample family="fallout" />
          Fallout
          <ProvenanceBadge kind="model" className="ml-auto" />
        </h3>
        {result.fallout.drawn ? (
          <>
            <p className="text-small text-ink-muted">
              An idealised pattern for a steady wind, which real fallout never follows. Drawn from Table 9.93 for a{" "}
              {windText({
                yieldKt: result.yieldKt,
                burst: { kind: "surface" },
                wind: { fromDegrees: result.fallout.fromDegrees, kmh: result.fallout.kmh },
              })}
              , as dose rates one hour after the burst on smooth open ground, with all of the yield from fission. The map shows the 1,000,
              100, 10 and 1 rads per hour contours; the book gives where each reaches and how wide it is, and the drawing places the widest
              point two thirds of the way along, as its Fig. 9.93 does.
            </p>
            <Rows className="border-y border-border">
              {result.fallout.contours.map((contour) => (
                <li key={contour.rate} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                  <span className="text-small text-ink">{contour.rate.toLocaleString("en-GB")} rads per hour at 1 hour</span>
                  <span className="tabular text-small text-ink-muted">
                    {distanceText(contour.downwindM)} downwind, {distanceText(contour.maxWidthM)} wide
                  </span>
                </li>
              ))}
            </Rows>
            <p className="text-small text-ink-muted">
              Dose rates fall roughly tenfold for every sevenfold increase in time after the burst (§ 9.16). Real patterns have hot spots
              and gaps from changing winds, rain and the ground (§§ 9.99 to 9.102).
            </p>
          </>
        ) : (
          <p className="text-small text-ink-muted">{result.fallout.why}</p>
        )}
      </div>
      <div className="grid gap-1">
        <h3 className="text-body font-semibold text-ink">Affected population</h3>
        <p className="text-small text-ink-muted">
          Not estimated. It needs population data, which a later version of this workspace adds; this model makes no estimate without it.
        </p>
      </div>
      {result.notes.length > 0 ? (
        <ul className="grid list-disc gap-1 pl-5 text-small text-ink-muted">
          {result.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <details className="text-small text-ink-muted">
        <summary className="cursor-pointer font-medium text-ink">How this is worked out: assumptions, limits and source</summary>
        <h4 className="mt-2 font-medium text-ink">Assumptions</h4>
        <ul className="mt-1 grid list-disc gap-1 pl-5">
          {EFFECTS_ASSUMPTIONS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h4 className="mt-2 font-medium text-ink">Limitations</h4>
        <ul className="mt-1 grid list-disc gap-1 pl-5">
          {EFFECTS_LIMITATIONS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h4 className="mt-2 font-medium text-ink">Source</h4>
        <p className="mt-1">
          {EFFECTS_SOURCE} Every figure is read off the book's printed curves and tables; the section, figure or table is given beside each.
          The yield range is 1 kiloton to 10 megatons; height of burst up to 12,000 m. The full method and how it was checked are in the
          docs (nuclear-preparedness.md).
        </p>
      </details>
    </section>
  );
}

function PlacesAgainst({
  places,
  at,
  result,
  loading,
}: {
  places: Array<{ id: string; name: string; lat: number; lon: number }>;
  at: { lat: number; lon: number };
  result: EffectsResult;
  loading: boolean;
}) {
  return (
    <Section
      title="Your saved places"
      description="How far each of your places on the Maps screen is from ground zero, and which rings it falls inside. Kept on this device."
    >
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : places.length === 0 ? (
        <p className="text-small text-ink-muted">
          You have no saved places. Save home, work or a meeting point on the Maps screen to see it here.
        </p>
      ) : (
        <Rows className="border-y border-border">
          {places
            .map((place) => ({ place, against: placeAgainst(at, place, result) }))
            .sort((a, b) => a.against.distance - b.against.distance)
            .map(({ place, against }) => (
              <li key={place.id} className="grid gap-0.5 py-2.5">
                <span className="flex items-center gap-2 text-body text-ink">
                  {place.name}
                  <ProvenanceBadge kind="own" className="ml-auto" />
                </span>
                <span className="text-small text-ink-muted">{placeSentence(against.distance, against.rings, against.contours)}</span>
              </li>
            ))}
        </Rows>
      )}
    </Section>
  );
}

function Export({ written, dated }: { written: Written[]; dated: number }) {
  const made = useMemo(() => {
    try {
      const title = scenarioTitle(written);
      return {
        pdf: madePdf(scenarioPdf(written, dated), title, "Nuclear effects scenario", {
          what: "the nuclear preparedness workspace",
          path: PATH,
        }),
      };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [written, dated]);
  return (
    <section aria-label="This scenario on paper" className="grid gap-3 border-y border-border py-4">
      <div>
        <h2 className="text-body font-semibold text-ink">{written.length > 1 ? "Both scenarios on paper" : "This scenario on paper"}</h2>
        <p className="mt-0.5 text-small text-ink-muted">
          A PDF made on this device with every figure, what each level means, the assumptions, the limits and the source.
        </p>
      </div>
      {"error" in made ? (
        <Notice tone="danger" title="The PDF could not be made">
          {made.error}
        </Notice>
      ) : (
        <PdfActions pdf={made.pdf}>
          <Button
            onClick={() =>
              saveFile(
                pdfFileName(scenarioTitle(written)).replace(/\.pdf$/, ".md"),
                "text/markdown;charset=utf-8",
                scenarioMarkdown(written),
              )
            }
          >
            <FileDown aria-hidden />
            Export as Markdown
          </Button>
        </PdfActions>
      )}
    </section>
  );
}

function SavedList({
  query,
  openId,
  compareId,
  onOpen,
  onCompare,
  onDelete,
}: {
  query: ReturnType<typeof useScenarios>;
  openId: string | null;
  compareId: string | null;
  onOpen: (scenario: NuclearScenario) => void;
  onCompare: (scenario: NuclearScenario | null) => void;
  onDelete: (scenario: NuclearScenario) => void;
}) {
  if (query.isPending)
    return (
      <div className="grid gap-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data.length === 0)
    return (
      <EmptyState title="No saved scenarios">
        Fill in the Scenario tab and press Save scenario. Saved scenarios can be opened again and compared two at a time.
      </EmptyState>
    );
  return (
    <Rows className="border-y border-border">
      {query.data.map((scenario) => {
        const opened = scenario.id === openId;
        const comparing = scenario.id === compareId;
        return (
          <li key={scenario.id} className="grid gap-2 py-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-body text-ink">
                  {scenario.name}
                  {opened ? <span className="text-small text-ink-muted"> · open as A</span> : null}
                  {comparing ? <span className="text-small text-ink-muted"> · shown as B</span> : null}
                </p>
                <p className="text-small text-ink-muted">
                  {yieldText(scenario.effects.yieldKt)}, {burstText(scenario.effects)}. Changed {formatDateTime(scenario.updatedAt)}.
                </p>
              </div>
              <ProvenanceBadge kind="own" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onOpen(scenario)} disabled={opened}>
                Open
              </Button>
              <Button size="sm" onClick={() => onCompare(comparing ? null : scenario)} disabled={opened} aria-pressed={comparing}>
                {comparing ? "Stop comparing" : "Compare as B"}
              </Button>
              <Button size="sm" variant="danger-ghost" onClick={() => onDelete(scenario)} aria-label={`Delete ${scenario.name}`}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            </div>
          </li>
        );
      })}
    </Rows>
  );
}

function LayersPanel({
  visible,
  onVisible,
  showPlaces,
  onShowPlaces,
  places,
  imagery,
  satellite,
  onSatellite,
  scenarios,
}: {
  visible: Visible;
  onVisible: (visible: Visible) => void;
  showPlaces: boolean;
  onShowPlaces: (on: boolean) => void;
  places: number;
  imagery: boolean;
  satellite: boolean;
  onSatellite: (on: boolean) => void;
  scenarios: number;
}) {
  const row = (
    id: string,
    label: string,
    checked: boolean,
    onChange: (on: boolean) => void,
    sample?: EffectRing["family"] | "fallout",
    disabled = false,
  ) => (
    <li key={id} className="flex min-h-11 items-center gap-3">
      {sample ? <LineSample family={sample} /> : <span className="w-9" />}
      <label htmlFor={`layer-${id}`} className={cn("flex-1 text-body text-ink", disabled && "text-ink-faint")}>
        {label}
      </label>
      <Switch id={`layer-${id}`} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </li>
  );
  return (
    <>
      <Section title="Scenario layers" description={`Modelled effects, for each scenario on the map. ${PROVENANCE.model.about}`}>
        <ul className="grid">
          {row("blast", "Blast overpressure", visible.blast, (on) => onVisible({ ...visible, blast: on }), "blast")}
          {row("thermal", "Burns", visible.thermal, (on) => onVisible({ ...visible, thermal: on }), "thermal")}
          {row("radiation", "Initial radiation", visible.radiation, (on) => onVisible({ ...visible, radiation: on }), "radiation")}
          {row("fireball", "Fireball and crater", visible.fireball, (on) => onVisible({ ...visible, fireball: on }), "fireball")}
          {row("fallout", "Fallout (idealised)", visible.fallout, (on) => onVisible({ ...visible, fallout: on }), "fallout")}
        </ul>
      </Section>
      <Section title="Your layers">
        <ul className="grid">
          {row("places", places > 0 ? `Saved places (${places})` : "Saved places (none yet)", showPlaces, onShowPlaces)}
        </ul>
      </Section>
      <Section title="Base map">
        <ul className="grid">
          {row(
            "satellite",
            imagery ? "Satellite imagery" : "Satellite imagery (none downloaded)",
            satellite && imagery,
            onSatellite,
            undefined,
            !imagery,
          )}
        </ul>
      </Section>
      <Section
        title="Data layers"
        description="Publicly documented infrastructure, historical records, shelters and the downloads that bring them in are planned for later versions; none is installed in this one."
      >
        <p className="text-small text-ink-muted">Nothing to show yet.</p>
      </Section>
      <Section title="Where things come from">
        <ProvenanceKey held={{ model: scenarios > 0 ? 1 : 0, own: places + scenarios }} />
      </Section>
    </>
  );
}
