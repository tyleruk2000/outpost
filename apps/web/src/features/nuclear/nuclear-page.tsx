/**
 * Nuclear preparedness: a workspace over the offline map for civil preparedness and
 * education. It holds:
 *
 * - the educational effects simulator: up to six scenarios on the map at once (A to F),
 *   each with its own ground zero, yield, burst and wind, one of them selected to edit
 *   and drawn at full strength; rings and an idealised fallout pattern from Glasstone
 *   and Dolan, each kind of effect in a hue of its own; the people a population grid
 *   counts inside each ring of the selected scenario, never added up across rings or
 *   scenarios;
 * - the reference layers of the Maps screen (features/layers), mounted unchanged: the
 *   layer switches, legend, filters, search, the record card and the dataset manager;
 * - a browser of historical records;
 * - planning: the household's emergency plans for a radiation emergency, its places,
 *   supplies and ways to keep in touch, from the screens that hold them.
 *
 * The reference layers are not joined to the scenarios: a press on the map moves ground
 * zero only in the Scenario tab, and opens a record only in the others; nothing counts,
 * lists or highlights mapped features inside a ring, and ground zero is only ever where
 * the person put it.
 *
 * On a wide screen the panel sits beside the map and can be put away; on a phone the
 * map comes first and the panel follows it on the page, so that nothing lies over the
 * map but its own column (docs/development/web-screens.md, "Things over a map").
 */

import {
  type Bbox,
  computeEffects,
  EFFECTS_ASSUMPTIONS,
  EFFECTS_CAVEAT,
  EFFECTS_LIMITATIONS,
  EFFECTS_SOURCE,
  type EffectRing,
  type EffectsResult,
  MAX_SCENARIOS_SHOWN,
  type NuclearScenario,
  type NuclearSet,
  roundDistance,
  SCENARIO_LETTERS,
  type ScenarioLetter,
} from "@outpost/shared";
import { CloudOff, Eye, EyeOff, PanelRightClose, PanelRightOpen, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { lazy, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented, Select, Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { useLayersSummary } from "@/features/layers/data";
import { ReferenceDataSection } from "@/features/layers/dataset-manager";
import { useReferenceLayers } from "@/features/layers/use-reference-layers";
import { useMapOverview, useMapSources, useMarkers } from "@/features/maps/data";
import { hasImagery } from "@/features/maps/imagery/style";
import type { MapEngine } from "@/features/maps/map/engine";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn, formatDateTime, localId, plural } from "@/lib/utils";
import { scenarioConflictOf, useDeleteScenario, useDeleteSet, useSaveScenario, useSaveSet, useScenarios, useSets } from "./data";
import type { Written } from "./document";
import { COMPASS_POINTS, falloutState, fitArea, fromTowards, pointOf } from "./fallout";
import { type Checked, checkForm, EMPTY_FORM, type FormField, formOf, type ScenarioForm } from "./form";
import { placeAgainst } from "./geometry";
import { ALL_VISIBLE, type Drawn, FAMILY_LINES, familyColour, nuclearData, type Visible } from "./layers";
import { ScenarioExport } from "./pdf-export";
import { PlanningPanel } from "./planning";
import { PROVENANCE, ProvenanceBadge, ProvenanceKey } from "./provenance";
import { RecordsBrowser } from "./records";
import { RingPeople } from "./ring-people";
import { WindOffer } from "./wind-offer";
import { burstText, distanceText, placeSentence, windText, yieldText } from "./words";

// The map library is large; it is fetched when the map is first drawn.
const PlanMap = lazy(() => import("@/features/propagation/map/plan-map").then((module) => ({ default: module.PlanMap })));

/** No saved places: one list, so that the map is not handed a new one on every render. */
const NO_PLACES: never[] = [];

/**
 * The value kept from the last render while its key is the same: what is drawn is worked
 * out afresh on every change to a form, and typing a name or notes must not redraw the map.
 */
function useSame<T>(value: T, key: string): T {
  const kept = useRef({ key, value });
  if (kept.current.key !== key) kept.current = { key, value };
  return kept.current.value;
}

/** One scenario on the map. */
export interface Slot {
  key: string;
  letter: ScenarioLetter;
  form: ScenarioForm;
  /** The saved scenario it holds, or null for one not saved. */
  savedId: string | null;
  /** When this scenario was last changed here or saved. */
  updatedAt: number;
  /** The saved version's `updatedAt` this one was opened or last saved at: sent with a change so that a newer one is not overwritten. */
  baseUpdatedAt: number;
  hidden: boolean;
  /** Saving was tried: a missing name or place is said from then on. */
  triedSave: boolean;
}

const newSlot = (letter: ScenarioLetter, form: ScenarioForm = EMPTY_FORM, savedId: string | null = null, updatedAt = Date.now()): Slot => ({
  key: localId(),
  letter,
  form,
  savedId,
  updatedAt,
  baseUpdatedAt: updatedAt,
  hidden: false,
  triedSave: false,
});

const freeLetter = (slots: Slot[]): ScenarioLetter | null =>
  SCENARIO_LETTERS.find((letter) => !slots.some((slot) => slot.letter === letter)) ?? null;

const AT_LIMIT = `${MAX_SCENARIOS_SHOWN} scenarios is the most the map shows at once: more and their labels collide and the list no longer fits a phone. Remove one to add another.`;

interface Worked {
  slot: Slot;
  checked: Checked;
  result: EffectsResult | null;
  refusals: string[];
}

export default function NuclearPage() {
  const scenarios = useScenarios();
  const sets = useSets();
  const markers = useMarkers();
  const overview = useMapOverview();
  const sources = useMapSources();
  const summary = useLayersSummary();
  const save = useSaveScenario();
  const saveSet = useSaveSet();
  const remove = useDeleteScenario();
  const removeSet = useDeleteSet();
  const location = useLocation();

  const [slots, setSlots] = useState<Slot[]>(() => [newSlot("A")]);
  const [selectedKey, setSelectedKey] = useState<string>(() => slots[0]!.key);
  const [openSet, setOpenSet] = useState<{ id: string; name: string } | null>(null);
  const [visible, setVisible] = useState<Visible>(ALL_VISIBLE);
  const [showPlaces, setShowPlaces] = useState(true);
  const [satellite, setSatellite] = useState(false);
  const [panel, setPanel] = useState(true);
  const [tab, setTab] = useState("scenario");
  const [deleting, setDeleting] = useState<NuclearScenario | null>(null);
  const [deletingSet, setDeletingSet] = useState<NuclearSet | null>(null);
  /** A save refused because the scenario was saved elsewhere since it was opened: which slot, and the newer version. */
  const [conflict, setConflict] = useState<{ key: string; updatedAt: number; name: string } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [fit, setFit] = useState<Bbox | null>(null);
  const [engine, setEngine] = useState<MapEngine | null>(null);

  const worked = useMemo<Worked[]>(
    () =>
      slots.map((slot) => {
        const checked = checkForm(slot.form);
        const answer = checked.effects ? computeEffects(checked.effects) : null;
        return {
          slot,
          checked,
          result: answer?.ok ? answer.result : null,
          refusals: answer && !answer.ok ? answer.problems : checked.refused,
        };
      }),
    [slots],
  );
  const current = worked.find((entry) => entry.slot.key === selectedKey) ?? worked[0]!;
  const { slot, checked, result, refusals } = current;
  const form = slot.form;

  const shown = worked.filter((entry) => !entry.slot.hidden && entry.result && entry.checked.at);
  // What is drawn depends on each shown scenario's letter, ground zero, figures and whether it is selected; not its name or notes.
  const drawnKey = shown
    .map(
      ({ slot, checked }) =>
        `${slot.letter}|${slot.key === selectedKey}|${checked.at!.lat},${checked.at!.lon}|${JSON.stringify(checked.effects)}`,
    )
    .join(";");
  const drawn = useSame<Drawn[]>(
    shown.map((entry) => ({
      letter: entry.slot.letter,
      at: entry.checked.at!,
      result: entry.result!,
      selected: entry.slot.key === selectedKey,
    })),
    drawnKey,
  );
  const mapData = useMemo(() => nuclearData(drawn, visible), [drawn, visible]);

  const patch = useCallback((key: string, change: (slot: Slot) => Slot) => {
    setSlots((list) => list.map((each) => (each.key === key ? change(each) : each)));
  }, []);
  const set = <K extends keyof ScenarioForm>(field: K, value: ScenarioForm[K]) =>
    patch(selectedKey, (each) => ({ ...each, form: { ...each.form, [field]: value }, updatedAt: Date.now() }));

  // A missing name or place is said only once saving was tried; a field typed wrongly is said at once.
  const fieldError = (field: FormField) =>
    slot.triedSave || (field !== "name" && (field !== "where" || form.where.trim() !== "")) ? checked.problems[field] : undefined;

  const places = markers.data ?? NO_PLACES;
  const installedRegions = overview.data?.regions?.length ?? 0;
  const imagery = hasImagery(sources.data);

  const fitTo = useCallback(
    (shown: EffectsResult, at: { lat: number; lon: number }, upToRate: number) => setFit(fitArea(shown, at, upToRate)),
    [],
  );

  // When a fallout pattern is first drawn, or its wind changes, the map is fitted to the rings and the 100 rads per hour contour.
  const plumeKey =
    result?.fallout.drawn && checked.at ? `${slot.key}:${result.fallout.fromDegrees}:${result.fallout.kmh}:${result.yieldKt}` : null;
  const lastPlume = useRef<string | null>(null);
  useEffect(() => {
    if (plumeKey && plumeKey !== lastPlume.current && result && checked.at) fitTo(result, checked.at, 100);
    lastPlume.current = plumeKey;
  }, [plumeKey, result, checked.at, fitTo]);

  // Reference layers: the Maps screen's own pieces. A press opens a record only outside the Scenario tab.
  const onManage = useCallback(() => {
    setTab("layers");
    window.setTimeout(() => document.getElementById("reference-data")?.scrollIntoView({ block: "start" }), 80);
  }, []);
  const reference = useReferenceLayers({ engine, browsing: tab !== "scenario", onManage });
  const cardRef = useRef<HTMLDivElement>(null);
  const openRecord = (id: number, layer: Parameters<typeof reference.open>[1], at: Parameters<typeof reference.open>[2]) => {
    reference.open(id, layer, at);
    window.setTimeout(() => cardRef.current?.scrollIntoView({ block: "nearest" }), 120);
  };

  function select(key: string) {
    setSelectedKey(key);
    setTab("scenario");
  }

  function addSlot(form: ScenarioForm = EMPTY_FORM, savedId: string | null = null, updatedAt = Date.now()) {
    const letter = freeLetter(slots);
    if (!letter) {
      notify.error(AT_LIMIT);
      return null;
    }
    const added = newSlot(letter, form, savedId, updatedAt);
    setSlots((list) => [...list, added]);
    setSelectedKey(added.key);
    setTab("scenario");
    return added;
  }

  function addAnother() {
    const centre = engine?.getCenter();
    addSlot({ ...EMPTY_FORM, where: centre ? `${centre.lat.toFixed(5)}, ${centre.lon.toFixed(5)}` : "" });
  }

  function removeSlot(key: string) {
    setSlots((list) => {
      const rest = list.filter((each) => each.key !== key);
      if (rest.length === 0) {
        const blank = newSlot("A");
        setSelectedKey(blank.key);
        return [blank];
      }
      if (key === selectedKey) setSelectedKey(rest[0]!.key);
      return rest;
    });
  }

  /** A saved scenario onto the map: selected if it is there already, replacing a blank first scenario, or added. */
  function putOnMap(scenario: NuclearScenario) {
    const already = slots.find((each) => each.savedId === scenario.id);
    if (already) {
      select(already.key);
    } else {
      const blank =
        slots.length === 1 && !slots[0]!.savedId && !slots[0]!.form.where.trim() && !slots[0]!.form.name.trim() ? slots[0]! : null;
      if (blank) {
        patch(blank.key, (each) => ({
          ...each,
          form: formOf(scenario),
          savedId: scenario.id,
          updatedAt: scenario.updatedAt,
          baseUpdatedAt: scenario.updatedAt,
          triedSave: false,
        }));
        setSelectedKey(blank.key);
        setTab("scenario");
      } else if (!addSlot(formOf(scenario), scenario.id, scenario.updatedAt)) return;
    }
    const opened = computeEffects(scenario.effects);
    if (opened.ok) fitTo(opened.result, scenario, 100);
  }
  const putRef = useRef(putOnMap);
  putRef.current = putOnMap;

  // A link from an emergency plan: /prepare/nuclear?scenario=<id>.
  const linked = new URLSearchParams(location.search).get("scenario");
  const handledLink = useRef<string | null>(null);
  useEffect(() => {
    if (!linked || handledLink.current === linked || !scenarios.data) return;
    handledLink.current = linked;
    const found = scenarios.data.find((each) => each.id === linked);
    if (found) putRef.current(found);
    else notify.error("That scenario is no longer saved.");
  }, [linked, scenarios.data]);

  function openSetOnMap(saved: NuclearSet) {
    const opened = saved.members.map((member) => ({
      ...newSlot(
        member.letter,
        formOf({ ...member, id: "", createdAt: saved.createdAt, updatedAt: saved.updatedAt }),
        null,
        saved.updatedAt,
      ),
      hidden: member.hidden,
    }));
    setSlots(opened);
    setSelectedKey(opened[0]!.key);
    setOpenSet({ id: saved.id, name: saved.name });
    setTab("scenario");
    const first = saved.members.find((member) => !member.hidden) ?? saved.members[0]!;
    const answer = computeEffects(first.effects);
    if (answer.ok) fitTo(answer.result, first, 100);
  }

  /** Saves the selected scenario; a saved one with the version it was opened at, or `base` to keep this version over a newer one. */
  async function onSave(base = slot.baseUpdatedAt) {
    patch(selectedKey, (each) => ({ ...each, triedSave: true }));
    if (!checked.input) {
      notify.error("The scenario cannot be saved yet. See what the form says.");
      return;
    }
    const key = selectedKey;
    try {
      const saved = await save.mutateAsync({
        id: slot.savedId,
        input: slot.savedId ? { ...checked.input, baseUpdatedAt: base } : checked.input,
      });
      patch(key, (each) => ({ ...each, savedId: saved.id, updatedAt: saved.updatedAt, baseUpdatedAt: saved.updatedAt }));
      setConflict(null);
      toast.success(slot.savedId ? "Changes saved." : "Scenario saved.");
    } catch (error) {
      const newer = scenarioConflictOf(error);
      if (newer) setConflict({ key, ...newer });
      else notify.error(errorMessage(error));
    }
  }

  /** After a conflict: puts the newer saved version in the form, in place of this one. */
  async function loadOther() {
    if (!slot.savedId) return;
    const key = selectedKey;
    setChoosing(true);
    try {
      const fresh = await api.get<NuclearScenario>(`/api/nuclear/scenarios/${slot.savedId}`);
      patch(key, (each) => ({
        ...each,
        form: formOf(fresh),
        updatedAt: fresh.updatedAt,
        baseUpdatedAt: fresh.updatedAt,
        triedSave: false,
      }));
      setConflict(null);
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setChoosing(false);
    }
  }

  async function onSaveSet(name: string, asNew: boolean) {
    const unready = worked.filter((entry) => !entry.checked.input);
    if (unready.length > 0) {
      setSlots((list) => list.map((each) => ({ ...each, triedSave: true })));
      notify.error(
        `Each scenario needs a name, a ground zero and figures the model can work with before the set is saved: see ${unready.map((entry) => entry.slot.letter).join(", ")}.`,
      );
      return;
    }
    const input = {
      name,
      members: worked.map((entry) => ({ ...entry.checked.input!, letter: entry.slot.letter, hidden: entry.slot.hidden })),
    };
    try {
      const saved = await saveSet.mutateAsync({ id: asNew ? null : (openSet?.id ?? null), input });
      setOpenSet({ id: saved.id, name: saved.name });
      toast.success(asNew || !openSet ? "Set saved." : "Changes to the set saved.");
    } catch (error) {
      notify.error(errorMessage(error));
    }
  }

  const written = useMemo(() => {
    const list: Written[] = [];
    for (const entry of worked) {
      if (entry.slot.hidden || !entry.result || !entry.checked.at || !entry.checked.effects) continue;
      list.push({
        letter: entry.slot.letter,
        scenario: {
          name: entry.slot.form.name.trim() || `Scenario ${entry.slot.letter}`,
          notes: entry.slot.form.notes,
          lat: entry.checked.at.lat,
          lon: entry.checked.at.lon,
          effects: entry.checked.effects,
        },
        result: entry.result,
      });
    }
    return list;
  }, [worked]);
  const dated = Math.max(...slots.map((each) => each.updatedAt));

  // How much of each class the provenance key counts.
  const held = useMemo(() => {
    const counts = {
      public: 0,
      historical: 0,
      unverified: 0,
      own: places.length + (scenarios.data?.length ?? 0) + (sets.data?.length ?? 0),
      model: drawn.length,
    };
    for (const layer of summary.data?.layers ?? [])
      for (const entry of layer.provenance) {
        if (entry.provenance === "public-infrastructure") counts.public += entry.count;
        else if (entry.provenance === "historical") counts.historical += entry.count;
        else if (entry.provenance === "unverified") counts.unverified += entry.count;
        else counts.own += entry.count;
      }
    return counts;
  }, [summary.data, places.length, scenarios.data, sets.data, drawn.length]);

  const atLimit = slots.length >= MAX_SCENARIOS_SHOWN;

  return (
    <Page width="full">
      <PageHeader
        title="Nuclear preparedness"
        description="An educational workspace over the offline map: what a published model says a nuclear detonation of a stated size does at a distance, published reference data, historical records, and your household's own plans. Nothing here is a forecast or an instruction."
      />
      <OfflineLine regions={installedRegions} loading={overview.isPending} />

      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-6",
          panel ? "lg:grid-cols-[minmax(0,1fr)_25rem]" : "lg:grid-cols-[minmax(0,1fr)]",
        )}
      >
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-2 lg:sticky lg:top-4 lg:self-start">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-small text-ink-muted">
              {tab === "scenario"
                ? `Press the map to ${checked.at ? "move" : "put"} ground zero ${slot.letter} there.`
                : "Press a mark on the map to open its record. Ground zero moves only from the Scenario tab."}
            </p>
            <Button variant="ghost" size="sm" className="max-lg:hidden" onClick={() => setPanel((shown) => !shown)} aria-expanded={panel}>
              {panel ? <PanelRightClose aria-hidden /> : <PanelRightOpen aria-hidden />}
              {panel ? "Hide the panel" : "Show the panel"}
            </Button>
          </div>
          <Suspense fallback={<Skeleton className="h-[min(52dvh,40rem)] w-full lg:h-[min(76dvh,52rem)]" />}>
            <PlanMap
              label="The offline map, with the scenarios' rings and fallout patterns"
              className="h-[min(52dvh,40rem)] lg:h-[min(76dvh,52rem)]"
              nuclear={mapData}
              places={showPlaces ? places : undefined}
              satellite={satellite && imagery}
              fit={fit}
              fitMaxZoom={15}
              onEngine={setEngine}
              credits={reference.credits}
              onPress={({ position, place }) => {
                if (tab !== "scenario") return;
                set("where", `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}`);
                if (place && !form.name.trim()) set("name", `Near ${place.name}`);
              }}
            />
          </Suspense>
          {slots.length > 1 ? (
            <div className="lg:hidden">
              <Segmented
                label="Scenario being edited"
                value={slot.letter}
                onChange={(letter) => {
                  const found = slots.find((each) => each.letter === letter);
                  if (found) select(found.key);
                }}
                options={slots.map((each) => ({ value: each.letter, label: each.letter }))}
              />
            </div>
          ) : null}
          {reference.card ? (
            <section ref={cardRef} aria-label="The record pressed" className="grid">
              {reference.card}
            </section>
          ) : null}
          {drawn.length > 0 ? <MapKey drawn={drawn} slots={slots} /> : null}
        </div>

        <aside
          className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4", !panel && "lg:hidden")}
          aria-label="Scenarios, layers, records and plans"
        >
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="scenario">Scenario</TabsTrigger>
              <TabsTrigger value="saved">Saved{scenarios.data?.length ? ` (${scenarios.data.length})` : ""}</TabsTrigger>
              <TabsTrigger value="layers">Layers</TabsTrigger>
              <TabsTrigger value="records">Records</TabsTrigger>
              <TabsTrigger value="planning">Plans</TabsTrigger>
            </TabsList>

            <TabsContent value="scenario" className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4">
              <OnTheMap
                worked={worked}
                selectedKey={selectedKey}
                onSelect={select}
                onHide={(key, hidden) => patch(key, (each) => ({ ...each, hidden }))}
                onRemove={removeSlot}
              />
              <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
                <div>
                  <Button onClick={addAnother} disabled={atLimit}>
                    <Plus aria-hidden /> Add another scenario
                  </Button>
                </div>
                <p className="text-small text-ink-muted">
                  {atLimit
                    ? AT_LIMIT
                    : "It is put at the middle of the map; press the map to move it. Each scenario is worked out on its own, and nothing is added up across them."}
                </p>
              </div>

              <h2 className="flex items-center gap-2 border-t border-border pt-4 text-lead font-semibold text-ink">
                <LetterBadge letter={slot.letter} selected />
                {form.name.trim() || `Scenario ${slot.letter}`}
              </h2>
              <ScenarioFields
                form={form}
                set={set}
                places={places}
                fieldError={fieldError}
                at={checked.at}
                result={result}
                refusals={refusals}
              />
              {refusals.filter((reason) => !/wind/i.test(reason)).length > 0 ? (
                <Notice tone="warning" title="The model cannot answer this">
                  {refusals.filter((reason) => !/wind/i.test(reason)).join(" ")}
                </Notice>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => void onSave()} loading={save.isPending}>
                  {slot.savedId ? "Save changes" : "Save scenario"}
                </Button>
              </div>
              {conflict && conflict.key === slot.key ? (
                <Notice tone="warning" icon={<TriangleAlert />} title="This scenario was changed somewhere else">
                  <p>
                    Another tab or device saved a newer version at {formatDateTime(conflict.updatedAt)}. Your version is still here,
                    unsaved, and nothing has been overwritten. Choose which one to keep.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={choosing || save.isPending}
                      onClick={() => void onSave(conflict.updatedAt)}
                    >
                      Keep my version
                    </Button>
                    <Button size="sm" loading={choosing} onClick={() => void loadOther()}>
                      Load the other version
                    </Button>
                  </div>
                </Notice>
              ) : null}
              {result && checked.at ? (
                <>
                  <Results result={result} letter={slot.letter} onFit={() => fitTo(result, checked.at!, 1)} />
                  <RingPeople at={checked.at} result={result} onGetData={onManage} />
                  <PlacesAgainst places={places} at={checked.at} result={result} loading={markers.isPending} letter={slot.letter} />
                </>
              ) : (
                <p className="text-small text-ink-muted">
                  {checked.at ? "" : "Put ground zero on the map to see the rings. "}The results appear here as you type.
                </p>
              )}
              {written.length > 0 ? (
                <ScenarioExport written={written} dated={dated} places={places} sources={sources.data} regions={overview.data?.regions} />
              ) : null}
            </TabsContent>

            <TabsContent value="saved" className="mt-4 grid gap-8">
              <SavedList
                query={scenarios}
                onMap={new Set(slots.map((each) => each.savedId).filter((id): id is string => !!id))}
                atLimit={atLimit}
                onPut={putOnMap}
                onDelete={setDeleting}
              />
              <SetsSection
                query={sets}
                openSet={openSet}
                count={slots.length}
                saving={saveSet.isPending}
                onSave={onSaveSet}
                onOpen={openSetOnMap}
                onDelete={setDeletingSet}
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
              />
              <Section
                title="Reference layers"
                description="Published data you downloaded or imported, as on the Maps screen. None of it is joined to a scenario."
              >
                <div className="-mx-4 grid">{reference.panel}</div>
              </Section>
              <Section title="Reference data">
                <ReferenceDataSection engine={engine} />
              </Section>
              <Section title="Where things come from">
                <ProvenanceKey held={held} />
              </Section>
            </TabsContent>

            <TabsContent value="records" className="mt-4 grid gap-4">
              <RecordsBrowser onOpen={openRecord} onImport={onManage} />
            </TabsContent>

            <TabsContent value="planning" className="mt-4 grid gap-4">
              <PlanningPanel places={places} placesLoading={markers.isPending} scenarios={scenarios.data ?? []} openId={slot.savedId} />
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
            setSlots((list) => list.map((each) => (each.savedId === deleting.id ? { ...each, savedId: null } : each)));
            toast.success("Scenario deleted.");
          } catch (error) {
            notify.error(errorMessage(error));
          }
          setDeleting(null);
        }}
      />
      <ConfirmDialog
        open={deletingSet !== null}
        onOpenChange={(next) => !next && setDeletingSet(null)}
        title="Delete this set?"
        description={
          deletingSet ? `The set “${deletingSet.name}” will be deleted from this device. Scenarios saved on their own are kept.` : ""
        }
        confirmLabel="Delete set"
        loading={removeSet.isPending}
        onConfirm={async () => {
          if (!deletingSet) return;
          try {
            await removeSet.mutateAsync(deletingSet.id);
            if (openSet?.id === deletingSet.id) setOpenSet(null);
            toast.success("Set deleted.");
          } catch (error) {
            notify.error(errorMessage(error));
          }
          setDeletingSet(null);
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
        Works offline: the map, the model, the reference data you installed and your plans are on this device, and nothing here uses the
        internet unless you press Download.{" "}
        {loading
          ? ""
          : regions > 0
            ? `${plural(regions, "offline map region")} installed.`
            : "No offline map region is installed, so the map shows coastlines and borders only. Add a region under Maps, Offline maps, for streets and names."}
      </span>
    </p>
  );
}

/** A scenario's letter, as it is on the map: a ring with the letter, bold for the one being worked on. */
function LetterBadge({ letter, selected }: { letter: ScenarioLetter; selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full text-micro font-semibold text-ink",
        selected ? "border-2 border-ink" : "border border-ink-faint",
      )}
    >
      {letter}
    </span>
  );
}

/** The scenarios on the map: each selected to edit, hidden, or removed from the map. On a phone this is the switcher between them. */
function OnTheMap({
  worked,
  selectedKey,
  onSelect,
  onHide,
  onRemove,
}: {
  worked: Worked[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onHide: (key: string, hidden: boolean) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <section aria-label="Scenarios on the map" className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
      <h2 className="text-body font-semibold text-ink">On the map</h2>
      <ul className="divide-y divide-border border-y border-border" aria-label="Scenarios on the map">
        {worked.map(({ slot, checked }) => {
          const selected = slot.key === selectedKey;
          const name = slot.form.name.trim() || `Scenario ${slot.letter}`;
          const what = checked.effects ? `${yieldText(checked.effects.yieldKt)}, ${burstText(checked.effects)}` : "Not worked out yet";
          const where = checked.at ? `${checked.at.lat.toFixed(3)}, ${checked.at.lon.toFixed(3)}` : "no ground zero yet";
          return (
            <li key={slot.key} className={cn("flex items-center gap-1", selected && "bg-surface")}>
              <button
                type="button"
                onClick={() => onSelect(slot.key)}
                aria-pressed={selected}
                aria-label={`${slot.letter}: ${name}${selected ? ", being edited" : ""}`}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-1.5 py-1.5 text-left"
              >
                <LetterBadge letter={slot.letter} selected={selected} />
                <span className="min-w-0">
                  <span className={cn("block truncate text-small text-ink", selected && "font-semibold")}>{name}</span>
                  <span className="block truncate text-micro text-ink-muted">
                    {what}, {where}
                    {slot.hidden ? ", hidden" : ""}
                  </span>
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={slot.hidden ? `Show ${slot.letter} on the map` : `Hide ${slot.letter} on the map`}
                aria-pressed={slot.hidden}
                onClick={() => onHide(slot.key, !slot.hidden)}
              >
                {slot.hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Remove ${slot.letter} from the map`} onClick={() => onRemove(slot.key)}>
                <X aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ScenarioFields({
  form,
  set,
  places,
  fieldError,
  at,
  result,
  refusals,
}: {
  form: ScenarioForm;
  set: <K extends keyof ScenarioForm>(key: K, value: ScenarioForm[K]) => void;
  places: Array<{ id: string; name: string; lat: number; lon: number }>;
  fieldError: (field: FormField) => string | undefined;
  at: { lat: number; lon: number } | null;
  result: EffectsResult | null;
  refusals: string[];
}) {
  const state = falloutState(form, result, refusals);
  const fromNumber = Number(form.windFrom.trim());
  const point = form.windFrom.trim() && Number.isFinite(fromNumber) ? pointOf(fromNumber) : null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
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
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
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
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
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
      <fieldset className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2" aria-describedby="fallout-state">
        <legend className="mb-1 flex items-center gap-2 text-small font-medium text-ink">
          <LineSample family="fallout" />
          Wind, for the fallout pattern
        </legend>
        <p className="text-small text-ink-muted">Where the wind blows from. A wind from the west carries fallout east.</p>
        <Segmented
          label="Wind blows from"
          value={point?.label ?? ""}
          onChange={(label) => {
            const chosen = COMPASS_POINTS.find((each) => each.label === label);
            if (chosen) set("windFrom", String(chosen.degrees));
          }}
          options={COMPASS_POINTS.map((each) => ({ value: each.label, label: <span title={`from the ${each.name}`}>{each.label}</span> }))}
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
            <span aria-hidden className="text-small text-ink">
              From, in degrees
            </span>
            <Input
              aria-label="Wind from, degrees"
              value={form.windFrom}
              onChange={(event) => set("windFrom", event.target.value)}
              inputMode="decimal"
              placeholder="0 to 360"
              className="tabular w-28"
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
            <span aria-hidden className="text-small text-ink">
              Speed
            </span>
            <Input
              aria-label="Wind speed"
              value={form.windSpeed}
              onChange={(event) => set("windSpeed", event.target.value)}
              inputMode="decimal"
              placeholder={form.windUnit === "mph" ? "8 to 45" : "13 to 72"}
              className="tabular w-28"
            />
          </div>
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
        {form.windFrom.trim() && Number.isFinite(fromNumber) ? (
          <p className="text-small text-ink-muted">Wind {fromTowards(fromNumber)}.</p>
        ) : null}
        <p
          id="fallout-state"
          data-testid="fallout-state"
          role="status"
          className={cn("text-small", state.drawn ? "text-ink" : "text-ink-muted")}
        >
          {state.text}
        </p>
        <WindOffer
          at={at}
          onUse={(fromDegrees, kmh) => {
            set("windFrom", String(fromDegrees));
            set("windUnit", "kmh");
            set("windSpeed", String(kmh));
          }}
        />
        <p className="text-small text-ink-muted">
          No wind is filled in for you: the wind that carries fallout differs by place, season and height. Forecasts you fetch under Weather
          and hazards are offered here when one is near ground zero.
        </p>
      </fieldset>
      <Field label="Notes" optional>
        {(ids) => <Textarea {...ids} value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={3} />}
      </Field>
    </div>
  );
}

/** A line drawn the way the map draws a kind of effect, in its hue, for the legend and beside its name. */
export function LineSample({ family, quiet = false }: { family: EffectRing["family"] | "fallout"; quiet?: boolean }) {
  const style = family === "fallout" ? { dash: [3, 1.5], width: 1.4 } : FAMILY_LINES[family];
  const scale = 2;
  const width = style.width * (quiet ? 0.6 : 1);
  return (
    <svg
      aria-hidden
      width="36"
      height="12"
      viewBox="0 0 36 12"
      className="shrink-0"
      style={{ color: familyColour(family) }}
      data-family={family}
    >
      {family === "fallout" ? <rect x="1" y="2" width="34" height="8" fill="currentColor" opacity={quiet ? 0.12 : 0.25} /> : null}
      <line
        x1="1"
        y1="6"
        x2="35"
        y2="6"
        stroke="currentColor"
        strokeOpacity={quiet ? 0.6 : 1}
        strokeWidth={width}
        strokeDasharray={style.dash ? style.dash.map((part) => part * style.width * scale).join(" ") : undefined}
        strokeLinecap={family === "radiation" ? "round" : "butt"}
      />
    </svg>
  );
}

export const LEGEND_FAMILIES = [
  ["blast", "Blast"],
  ["thermal", "Burns (heat)"],
  ["radiation", "Initial radiation"],
  ["fireball", "Fireball, crater"],
  ["fallout", "Fallout (idealised)"],
] as const;

function MapKey({ drawn, slots }: { drawn: Drawn[]; slots: Slot[] }) {
  const families = new Set<string>();
  for (const item of drawn) {
    for (const ring of item.result.rings) if (ring.metres !== null) families.add(ring.family === "crater" ? "fireball" : ring.family);
    if (item.result.fallout.drawn) families.add("fallout");
  }
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-1.5" aria-label="Key to the map">
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-small text-ink-muted" aria-label="How the map draws each kind of effect">
        {LEGEND_FAMILIES.filter(([family]) => families.has(family)).map(([family, label]) => (
          <li key={family} className="flex items-center gap-2">
            <LineSample family={family} />
            {label}
          </li>
        ))}
      </ul>
      {drawn.length > 1 ? (
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-small text-ink-muted" aria-label="Scenarios drawn, by letter">
          {drawn.map((item) => (
            <li key={item.letter} className="flex items-center gap-2">
              <LetterBadge letter={item.letter} selected={item.selected} />
              {slots.find((each) => each.letter === item.letter)?.form.name.trim() || `Scenario ${item.letter}`}
              {item.selected ? " (being edited: full strength)" : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const FAMILY_TITLES: Record<EffectRing["family"], string> = {
  fireball: "Fireball",
  crater: "Crater",
  blast: "Blast: peak overpressure",
  thermal: "Heat: burns to exposed skin",
  radiation: "Initial nuclear radiation",
};

function Results({ result, letter, onFit }: { result: EffectsResult; letter: ScenarioLetter; onFit: () => void }) {
  const families = [...new Set(result.rings.map((ring) => ring.family))];
  return (
    <section aria-label="What the model gives" className="grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lead font-semibold text-ink">What the model gives for {letter}</h2>
        <Button size="sm" variant="ghost" onClick={onFit}>
          Fit the map to it
        </Button>
      </div>
      <Notice tone="info" title="An educational estimate">
        {EFFECTS_CAVEAT}
      </Notice>
      {families.map((family) => (
        <div key={family} className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <h3 className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
            <LineSample family={family} />
            {FAMILY_TITLES[family]}
            <ProvenanceBadge kind="model" className="ml-auto" />
          </h3>
          <Rows className="border-y border-border">
            {result.rings
              .filter((ring) => ring.family === family)
              .map((ring) => (
                <li key={ring.id} className="grid grid-cols-[minmax(0,1fr)] gap-1 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-body text-ink">{ring.label}</span>
                    <span className="tabular text-body text-ink">
                      {ring.metres === null ? "Not given" : distanceText(roundDistance(ring.metres))}
                    </span>
                  </div>
                  {ring.why ? <p className="text-small text-ink-muted">{ring.why}</p> : null}
                  <details className="text-small text-ink-muted">
                    <summary className="min-h-11 cursor-pointer py-2.5 text-ink-muted hover:text-ink md:min-h-0 md:py-0">
                      What this means, and its source
                    </summary>
                    <p className="mt-1">{ring.meaning}</p>
                    <p className="mt-1">Source: {ring.source}.</p>
                  </details>
                </li>
              ))}
          </Rows>
        </div>
      ))}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        <h3 className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
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
              100, 10 and 1 rads per hour contours, each labelled along its edge; the book gives where each reaches and how wide it is, and
              the drawing places the widest point two thirds of the way along, as its Fig. 9.93 does.
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
      {result.notes.length > 0 ? (
        <ul className="grid grid-cols-[minmax(0,1fr)] list-disc gap-1 pl-5 text-small text-ink-muted">
          {result.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <details className="text-small text-ink-muted">
        <summary className="min-h-11 cursor-pointer py-2.5 font-medium text-ink md:min-h-0 md:py-0">
          How this is worked out: assumptions, limits and source
        </summary>
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
  letter,
}: {
  places: Array<{ id: string; name: string; lat: number; lon: number }>;
  at: { lat: number; lon: number };
  result: EffectsResult;
  loading: boolean;
  letter: ScenarioLetter;
}) {
  return (
    <Section
      title="Your saved places"
      description={`How far each of your places on the Maps screen is from ground zero ${letter}, and which of its rings it falls inside. Kept on this device.`}
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
              <li key={place.id} className="grid grid-cols-[minmax(0,1fr)] gap-0.5 py-2.5">
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

function SavedList({
  query,
  onMap,
  atLimit,
  onPut,
  onDelete,
}: {
  query: ReturnType<typeof useScenarios>;
  onMap: Set<string>;
  atLimit: boolean;
  onPut: (scenario: NuclearScenario) => void;
  onDelete: (scenario: NuclearScenario) => void;
}) {
  let body: ReactNode;
  if (query.isPending)
    body = (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  else if (query.isError) body = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  else if (query.data.length === 0)
    body = (
      <EmptyState title="No saved scenarios">
        Fill in the Scenario tab and press Save scenario. Saved scenarios can be put on the map again, several at once.
      </EmptyState>
    );
  else
    body = (
      <Rows className="border-y border-border">
        {query.data.map((scenario) => {
          const shown = onMap.has(scenario.id);
          return (
            <li key={scenario.id} className="grid grid-cols-[minmax(0,1fr)] gap-2 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-body text-ink">
                    {scenario.name}
                    {shown ? <span className="text-small text-ink-muted"> · on the map</span> : null}
                  </p>
                  <p className="text-small text-ink-muted">
                    {yieldText(scenario.effects.yieldKt)}, {burstText(scenario.effects)}. Changed {formatDateTime(scenario.updatedAt)}.
                  </p>
                </div>
                <ProvenanceBadge kind="own" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => onPut(scenario)} disabled={!shown && atLimit}>
                  {shown ? "Edit it on the map" : "Put it on the map"}
                </Button>
                <Button variant="danger-ghost" onClick={() => onDelete(scenario)} aria-label={`Delete ${scenario.name}`}>
                  <Trash2 aria-hidden />
                  Delete
                </Button>
              </div>
            </li>
          );
        })}
      </Rows>
    );
  return (
    <Section title="Saved scenarios" description={atLimit ? AT_LIMIT : "Each can be put on the map beside the others there."}>
      {body}
    </Section>
  );
}

function SetsSection({
  query,
  openSet,
  count,
  saving,
  onSave,
  onOpen,
  onDelete,
}: {
  query: ReturnType<typeof useSets>;
  openSet: { id: string; name: string } | null;
  count: number;
  saving: boolean;
  onSave: (name: string, asNew: boolean) => void;
  onOpen: (set: NuclearSet) => void;
  onDelete: (set: NuclearSet) => void;
}) {
  const [name, setName] = useState("");
  useEffect(() => setName(openSet?.name ?? ""), [openSet]);
  return (
    <Section
      title="Sets of scenarios"
      description="The scenarios on the map kept together, to open again as they were. Each stays a separate illustration: nothing is added up across them."
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <Field label="Name of the set">
          {(ids) => (
            <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} placeholder="Three yields at the lake" />
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading={saving} disabled={!name.trim()} onClick={() => onSave(name.trim(), !openSet)}>
            {openSet ? "Save changes to the set" : `Save the ${plural(count, "scenario")} on the map as a set`}
          </Button>
          {openSet ? (
            <Button disabled={!name.trim()} onClick={() => onSave(name.trim(), true)}>
              Save as a new set
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-4">
        {query.isPending ? (
          <Skeleton className="h-14 w-full" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data.length === 0 ? (
          <p className="text-small text-ink-muted">No saved sets.</p>
        ) : (
          <Rows className="border-y border-border">
            {query.data.map((saved) => (
              <li key={saved.id} className="grid grid-cols-[minmax(0,1fr)] gap-2 py-3">
                <div>
                  <p className="text-body text-ink">
                    {saved.name}
                    {openSet?.id === saved.id ? <span className="text-small text-ink-muted"> · open</span> : null}
                  </p>
                  <p className="text-small text-ink-muted">
                    {saved.members.map((member) => `${member.letter}, ${member.name}`).join("; ")}. Changed{" "}
                    {formatDateTime(saved.updatedAt)}.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => onOpen(saved)}>Open the set</Button>
                  <Button variant="danger-ghost" onClick={() => onDelete(saved)} aria-label={`Delete the set ${saved.name}`}>
                    <Trash2 aria-hidden />
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </Rows>
        )}
      </div>
    </Section>
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
}: {
  visible: Visible;
  onVisible: (visible: Visible) => void;
  showPlaces: boolean;
  onShowPlaces: (on: boolean) => void;
  places: number;
  imagery: boolean;
  satellite: boolean;
  onSatellite: (on: boolean) => void;
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
          {row("thermal", "Burns (heat)", visible.thermal, (on) => onVisible({ ...visible, thermal: on }), "thermal")}
          {row("radiation", "Initial radiation", visible.radiation, (on) => onVisible({ ...visible, radiation: on }), "radiation")}
          {row("fireball", "Fireball and crater", visible.fireball, (on) => onVisible({ ...visible, fireball: on }), "fireball")}
          {row("fallout", "Fallout (idealised)", visible.fallout, (on) => onVisible({ ...visible, fallout: on }), "fallout")}
        </ul>
        <p className="mt-2 text-small text-ink-muted">
          Each kind has a colour of its own and a line of its own; within a kind, the stronger level is darker. No ring is a line of safety.
        </p>
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
    </>
  );
}
