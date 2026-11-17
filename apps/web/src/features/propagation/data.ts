/**
 * What the HF planner asks the server for, and the form a person fills in.
 *
 * The form is remembered in this browser between visits (a convenience, nothing more),
 * all but its date; a prediction worth keeping is saved on the server by name.
 */
import {
  ANTENNA_PRESETS,
  type AntennaProfile,
  type AntennaProfileInput,
  type AntennaSpec,
  antennaModelLabel,
  antennaSpecOf,
  bandOf,
  type CompareResult,
  type CompareWhat,
  type EngineStatus,
  groundSetting,
  HALF_WAVE_FROM,
  HALF_WAVE_TO,
  HF_BANDS,
  halfWaveRangeMhz,
  hasStatedLength,
  isHorizontalAntenna,
  isSlopingAntenna,
  type MarkerDto,
  type ModeId,
  type NoiseEnvironment,
  type PredictionRequest,
  type PredictionResult,
  type PropagationDatasets,
  parseCoordinates,
  type RadioProfile,
  type RadioProfileInput,
  type SavedPrediction,
  sameAntennaSpec,
  slopeWords,
  wireOn,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";

export const keys = {
  engines: ["propagation", "engines"] as const,
  datasets: ["propagation", "datasets"] as const,
  profiles: ["propagation", "profiles"] as const,
  saved: ["propagation", "saved"] as const,
};

export const useEngines = () =>
  useQuery({
    queryKey: keys.engines,
    queryFn: () => api.get<{ engines: EngineStatus[] }>("/api/radio/propagation/engines"),
    select: (data) => data.engines,
    // While VOACAP's data is downloading, look again now and then; the end of it also says so.
    refetchInterval: (query) => (query.state.data?.engines[0]?.data?.downloading ? 3_000 : false),
  });
export const useDatasets = () =>
  useQuery({ queryKey: keys.datasets, queryFn: () => api.get<PropagationDatasets>("/api/radio/propagation/datasets") });
export const useProfiles = () =>
  useQuery({
    queryKey: keys.profiles,
    queryFn: () => api.get<{ radios: RadioProfile[]; antennas: AntennaProfile[] }>("/api/radio/profiles"),
  });
export const useSaved = () =>
  useQuery({
    queryKey: keys.saved,
    queryFn: () => api.get<{ saved: SavedPrediction[] }>("/api/radio/propagation/saved"),
    select: (data) => data.saved,
  });
/** Saved places are the map's markers: there is one list of places in Outpost, not two. */
export const usePlaces = () =>
  useQuery({
    queryKey: ["maps", "markers"],
    queryFn: () => api.get<{ markers: MarkerDto[] }>("/api/maps/markers"),
    select: (data) => data.markers,
  });

/**
 * A transmitter not yet given starts at the home place (the saved place with the home
 * icon), once, so that the first thing to say is where the other station is. A position
 * typed, or kept from last time, is left alone.
 */
export function useHomeAsTransmitter<F extends { tx: PlaceField }>(places: MarkerDto[] | undefined, setForm: Dispatch<SetStateAction<F>>) {
  const home = places?.find((place) => place.icon === "home");
  const offered = useRef(false);
  useEffect(() => {
    if (!home || offered.current) return;
    offered.current = true;
    setForm((current) =>
      current.tx.text.trim() === ""
        ? { ...current, tx: { text: `${home.lat.toFixed(5)}, ${home.lon.toFixed(5)}`, name: home.name } }
        : current,
    );
  }, [home, setForm]);
}

export const usePredict = () =>
  useMutation({ mutationFn: (request: PredictionRequest) => api.post<PredictionResult>("/api/radio/propagation/predict", request) });
export const useCompare = () =>
  useMutation({
    mutationFn: (input: { base: PredictionRequest; what: CompareWhat }) => api.post<CompareResult>("/api/radio/propagation/compare", input),
  });
export const useListing = () =>
  useMutation({ mutationFn: (request: PredictionRequest) => api.post<{ listing: string }>("/api/radio/propagation/listing", request) });

function useChange<T>(run: (input: T) => Promise<unknown>, key: readonly string[], done?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key });
      if (done) toast.success(done);
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
}

export const useSaveRadio = () =>
  useChange(
    ({ id, input }: { id?: string; input: RadioProfileInput }) =>
      id ? api.patch(`/api/radio/profiles/radios/${id}`, input) : api.post("/api/radio/profiles/radios", input),
    keys.profiles,
  );
export const useRemoveRadio = () => useChange((id: string) => api.delete(`/api/radio/profiles/radios/${id}`), keys.profiles);
export const useSaveAntenna = () =>
  useChange(
    ({ id, input }: { id?: string; input: AntennaProfileInput }) =>
      id ? api.patch(`/api/radio/profiles/antennas/${id}`, input) : api.post("/api/radio/profiles/antennas", input),
    keys.profiles,
  );
export const useRemoveAntenna = () => useChange((id: string) => api.delete(`/api/radio/profiles/antennas/${id}`), keys.profiles);
export const useSavePrediction = () =>
  useChange(
    (input: { name: string; request: PredictionRequest; key: string }) => api.post("/api/radio/propagation/saved", input),
    keys.saved,
    "Saved. It is listed under Saved predictions.",
  );
export const useRemoveSaved = () => useChange((id: string) => api.delete(`/api/radio/propagation/saved/${id}`), keys.saved);
export const useDownloadSolar = () =>
  useChange(
    (locationId: string | undefined) => api.post("/api/radio/propagation/datasets/solar-cycle/download", { locationId }),
    keys.datasets,
    "Fetching the solar cycle table. Progress is under Downloads.",
  );

// ── The form ────────────────────────────────────────────────────────────────

export interface PlaceField {
  /** What the person typed or chose: coordinates, a locator, or a saved place's name. */
  text: string;
  /** Set when a saved place was chosen, so that its name is kept. */
  name: string;
}

export interface PlannerForm {
  tx: PlaceField;
  rx: PlaceField;
  date: string;
  /** A radio profile's id, or "" for none. */
  radioId: string;
  powerWatts: string;
  /** "preset:<id>", a profile's id, or `AS_SAVED` for the antenna kept below. */
  txAntennaId: string;
  rxAntennaId: string;
  /**
   * The antennas of a saved prediction that was opened, when no generic antenna and no
   * profile is exactly that antenna any more. They are run as they were saved.
   */
  txAntennaSaved: AntennaSpec | null;
  rxAntennaSaved: AntennaSpec | null;
  noise: NoiseEnvironment;
  /** A band's id, or "other" for a typed frequency. */
  band: string;
  frequencyMhz: string;
  mode: ModeId;
  /** The person's own requirement for the mode; empty to use the published figure. */
  requiredSnrDb: string;
  referenceBandwidthHz: string;
  solar: "table" | "manual" | "fof2";
  ssn: string;
  fof2Mhz: string;
  fof2Hour: string;
  reply: boolean;
  replyPowerWatts: string;
  replyNoise: NoiseEnvironment;
}

/** The antenna a saved prediction was made with, chosen in the form under this id. */
export const AS_SAVED = "as-saved";

export const todayUtc = () => new Date().toISOString().slice(0, 10);

export const emptyForm = (): PlannerForm => ({
  tx: { text: "", name: "" },
  rx: { text: "", name: "" },
  date: todayUtc(),
  radioId: "",
  powerWatts: "5",
  txAntennaId: "preset:low-dipole",
  rxAntennaId: "preset:low-dipole",
  txAntennaSaved: null,
  rxAntennaSaved: null,
  noise: "residential",
  band: "40m",
  frequencyMhz: "7.1",
  mode: "ssb",
  requiredSnrDb: "",
  referenceBandwidthHz: "",
  solar: "table",
  ssn: "",
  fof2Mhz: "",
  fof2Hour: "12",
  reply: false,
  replyPowerWatts: "5",
  replyNoise: "residential",
});

/** The owner's acceptance scenario, offered as a first thing to try. */
export const exampleForm = (): PlannerForm => ({
  ...emptyForm(),
  tx: { text: "51.5074, -0.1278", name: "London" },
  rx: { text: "52.4862, -1.8904", name: "Birmingham" },
  noise: "city",
});

const STORE = "outpost.propagation.form.v1";

/**
 * The form as it was left, on today's date. The date is the one thing that goes stale:
 * brought back weeks later it would ask about a month gone by, on a screen that reads
 * as a plan for now. It is kept only through the day (UTC) it was chosen on, so that
 * leaving the planner for the equipment and coming back does not lose it.
 */
export function rememberedForm(): PlannerForm {
  try {
    const stored = localStorage.getItem(STORE);
    if (stored) {
      const { rememberedOn, ...kept } = JSON.parse(stored) as Partial<PlannerForm> & { rememberedOn?: string };
      const today = todayUtc();
      return { ...emptyForm(), ...kept, date: rememberedOn === today && kept.date ? kept.date : today };
    }
  } catch {
    // Private windows and blocked storage: start from the empty form.
  }
  return emptyForm();
}

export function rememberForm(form: PlannerForm): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...form, rememberedOn: todayUtc() }));
  } catch {
    // Nothing depends on it.
  }
}

/** An antenna in a few words, for one that has no name of its own. */
export function antennaSummary(spec: AntennaSpec): string {
  const parts = [antennaModelLabel(spec.kind, spec.lengthM)];
  if (spec.kind !== "isotropic") {
    if (isHorizontalAntenna(spec.kind)) parts.push(`${spec.heightM} m up`);
    if (isSlopingAntenna(spec.kind))
      parts.push(
        slopeWords(spec),
        spec.highEndDeg === null || spec.highEndDeg === undefined
          ? "high end away from the other station"
          : `high end towards ${spec.highEndDeg}°`,
      );
    parts.push(`${groundSetting(spec.ground).label.toLowerCase()} ground`);
  }
  if (spec.broadsideDeg !== null) parts.push(`broadside to ${spec.broadsideDeg}°`);
  if (spec.gainDb !== 0) parts.push(`${spec.gainDb} dB gain`);
  if (spec.feedlineLossDb !== 0) parts.push(`${spec.feedlineLossDb} dB lost in the feedline`);
  return parts.join(", ");
}

export function antennaOf(
  id: string,
  profiles: AntennaProfile[],
  saved: AntennaSpec | null = null,
): { spec: AntennaSpec; name: string } | null {
  if (id === AS_SAVED) return saved ? { spec: saved, name: "As saved" } : null;
  if (id.startsWith("preset:")) {
    const preset = ANTENNA_PRESETS.find((item) => `preset:${item.id}` === id);
    return preset ? { spec: preset.spec, name: preset.name } : null;
  }
  const profile = profiles.find((item) => item.id === id);
  if (!profile) return null;
  return { spec: antennaSpecOf(profile), name: profile.name };
}

/**
 * What a wire of a stated length is on the frequency in the form, said under the
 * antenna before anything is asked: a half-wave, a wire of another length, or not
 * modelled there. Nothing for an antenna that is not such a wire, or with no frequency.
 */
export function wireHint(spec: AntennaSpec, frequencyText: string): { note: string; notModelled: boolean; approximate: boolean } | null {
  const mhz = frequencyText.trim() === "" ? Number.NaN : Number(frequencyText);
  if (!(mhz >= 2 && mhz <= 30)) return null;
  const wire = wireOn(spec, mhz);
  return wire ? { note: wire.note, notModelled: wire.state === "not-modelled", approximate: wire.state === "approximate" } : null;
}

/** The amateur bands a wire of a stated length is about a half-wave on, as "20 m"; empty for a wire that is one on none of them. */
export const halfWaveBands = (spec: AntennaSpec): string[] =>
  HF_BANDS.filter((band) => {
    const wavelengths = wireOn(spec, band.mhz)?.wavelengths ?? 0;
    return wavelengths >= HALF_WAVE_FROM && wavelengths <= HALF_WAVE_TO;
  }).map((band) => band.label);

/**
 * Which bands a wire of a stated length has figures on, where the question is about
 * several bands at once (a plan). Nothing for an antenna that is not such a wire.
 */
export function wireBandsNote(spec: AntennaSpec): string | null {
  if (!hasStatedLength(spec.kind) || spec.lengthM === undefined) return null;
  const bands = halfWaveBands(spec);
  const { fromMhz, toMhz } = halfWaveRangeMhz(spec.lengthM);
  const where =
    bands.length > 0
      ? `on ${bands.join(" and ")}`
      : `from ${fromMhz.toFixed(1)} to ${toMhz.toFixed(1)} MHz, which is none of the amateur bands`;
  if (spec.kind === "end-fed-sloping") {
    const run = HF_BANDS.filter((band) => wireOn(spec, band.mhz)?.state === "approximate").map((band) => band.label);
    const none = HF_BANDS.filter((band) => wireOn(spec, band.mhz)?.state === "not-modelled").map((band) => band.label);
    return [
      `${spec.lengthM} m of sloping wire is about a half-wave ${where}.`,
      run.length > 0
        ? `On ${run.join(", ")} its figures are approximate: VOACAP's sloping long wire at its slope, whose level is unchecked.`
        : "",
      none.length > 0 ? `On ${none.join(", ")} it is shorter than a half-wave, and not modelled: no figure.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (spec.kind === "end-fed-vertical")
    return `${spec.lengthM} m of upright wire is about a half-wave ${where}. On other bands it is run as a wire of that length, which an end-fed half-wave's matching unit is not made for.`;
  const longer = HF_BANDS.filter((band) => wireOn(spec, band.mhz)?.state === "approximate").map((band) => band.label);
  const shorter = HF_BANDS.filter((band) => wireOn(spec, band.mhz)?.state === "not-modelled").map((band) => band.label);
  return [
    `${spec.lengthM} m of level wire is about a half-wave ${where}, and given VOACAP's dipole there.`,
    longer.length > 0
      ? `On ${longer.join(", ")} it is longer, and its figures are approximate: VOACAP's sloping long wire, laid level, whose level is unchecked.`
      : "",
    shorter.length > 0 ? `On ${shorter.join(", ")} it is shorter, and not modelled: no figure.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The request a form stands for, or the first thing wrong with it, in words for the person. */
export function requestOf(
  form: PlannerForm,
  profiles: AntennaProfile[],
): { request: PredictionRequest } | { problem: string; field: keyof PlannerForm } {
  const place = (field: PlaceField, which: "tx" | "rx") => {
    const found = parseCoordinates(field.text);
    return found ? { name: field.name || (which === "tx" ? "Transmitter" : "Receiver"), lat: found.lat, lon: found.lon } : null;
  };
  const tx = place(form.tx, "tx");
  if (!tx)
    return {
      field: "tx",
      problem: "Say where the transmitter is: choose a saved place, or type coordinates (51.5074, -0.1278) or a locator (IO91WM).",
    };
  const rx = place(form.rx, "rx");
  if (!rx) return { field: "rx", problem: "Say where the receiver is: choose a saved place, or type coordinates or a locator." };
  const number = (text: string) => (text.trim() === "" ? Number.NaN : Number(text));
  const powerWatts = number(form.powerWatts);
  if (!(powerWatts >= 0.1)) return { field: "powerWatts", problem: "Give the transmitter power in watts, at least 0.1." };
  const frequencyMhz = number(form.frequencyMhz);
  if (!(frequencyMhz >= 2 && frequencyMhz <= 30))
    return { field: "frequencyMhz", problem: "Give a frequency between 2 and 30 MHz, the range the engine covers." };
  const txAntenna = antennaOf(form.txAntennaId, profiles, form.txAntennaSaved);
  const rxAntenna = antennaOf(form.rxAntennaId, profiles, form.rxAntennaSaved);
  if (!txAntenna) return { field: "txAntennaId", problem: "Choose the transmitting antenna." };
  if (!rxAntenna) return { field: "rxAntennaId", problem: "Choose the receiving antenna." };
  const request: PredictionRequest = {
    tx,
    rx,
    date: form.date,
    powerWatts,
    txAntenna: txAntenna.spec,
    rxAntenna: rxAntenna.spec,
    noise: form.noise,
    frequencyMhz,
    mode: form.mode,
    solar: { source: "table" },
  };
  // Each of the two is sent whenever it is filled in. A bandwidth on its own goes with
  // the mode's own figure, which the server has: what the form shows is what is asked.
  if (form.requiredSnrDb.trim() !== "") {
    const snr = number(form.requiredSnrDb);
    if (!Number.isFinite(snr))
      return { field: "requiredSnrDb", problem: "Give the signal-to-noise ratio the mode needs as a number of decibels." };
    request.requiredSnrDb = snr;
  }
  if (form.referenceBandwidthHz.trim() !== "") {
    const bandwidth = number(form.referenceBandwidthHz);
    if (!(bandwidth >= 1))
      return {
        field: "referenceBandwidthHz",
        problem: "Give the bandwidth the figure is measured in as a number of hertz, at least 1.",
      };
    request.referenceBandwidthHz = bandwidth;
  }
  if (form.solar === "manual") {
    const ssn = number(form.ssn);
    if (!(ssn >= 0 && ssn <= 300)) return { field: "ssn", problem: "Give a smoothed sunspot number between 0 and 300." };
    request.solar = { source: "manual", ssn };
  } else if (form.solar === "fof2") {
    const fof2Mhz = number(form.fof2Mhz);
    if (!(fof2Mhz >= 0.5 && fof2Mhz <= 25)) return { field: "fof2Mhz", problem: "Give the foF2 you measured, in MHz." };
    request.solar = { source: "fof2", fof2Mhz, utcHour: Number(form.fof2Hour) };
  }
  if (form.reply) {
    const reply = number(form.replyPowerWatts);
    if (!(reply >= 0.1)) return { field: "replyPowerWatts", problem: "Give the other station's power in watts, at least 0.1." };
    request.reply = { powerWatts: reply, noise: form.replyNoise };
  }
  return { request };
}

/**
 * The form that asks a saved request again. An antenna is shown as the generic antenna
 * or the profile that is exactly it; one that is neither any more (a profile since
 * changed or deleted) is kept in the form and run as it was saved, never replaced.
 */
export function formOf(request: PredictionRequest, band: string, profiles: AntennaProfile[]): PlannerForm {
  const antennaId = (spec: AntennaSpec) => {
    const preset = ANTENNA_PRESETS.find((item) => sameAntennaSpec(item.spec, spec));
    if (preset) return `preset:${preset.id}`;
    return profiles.find((item) => sameAntennaSpec(item, spec))?.id ?? AS_SAVED;
  };
  const txAntennaId = antennaId(request.txAntenna);
  const rxAntennaId = antennaId(request.rxAntenna);
  return {
    ...emptyForm(),
    tx: { text: `${request.tx.lat}, ${request.tx.lon}`, name: request.tx.name },
    rx: { text: `${request.rx.lat}, ${request.rx.lon}`, name: request.rx.name },
    date: request.date,
    powerWatts: String(request.powerWatts),
    txAntennaId,
    rxAntennaId,
    txAntennaSaved: txAntennaId === AS_SAVED ? request.txAntenna : null,
    rxAntennaSaved: rxAntennaId === AS_SAVED ? request.rxAntenna : null,
    noise: request.noise,
    band,
    frequencyMhz: String(request.frequencyMhz),
    mode: request.mode,
    requiredSnrDb: request.requiredSnrDb === undefined ? "" : String(request.requiredSnrDb),
    referenceBandwidthHz: request.referenceBandwidthHz === undefined ? "" : String(request.referenceBandwidthHz),
    solar: request.solar.source,
    ssn: request.solar.source === "manual" ? String(request.solar.ssn) : "",
    fof2Mhz: request.solar.source === "fof2" ? String(request.solar.fof2Mhz) : "",
    fof2Hour: request.solar.source === "fof2" ? String(request.solar.utcHour) : "12",
    reply: request.reply !== undefined,
    replyPowerWatts: String(request.reply?.powerWatts ?? 5),
    replyNoise: request.reply?.noise ?? "residential",
  };
}

/** What a prediction depends on, in the words used when a saved one cannot be asked again. */
const ASKED: Array<[string, (request: PredictionRequest) => unknown]> = [
  ["the transmitter's position", (r) => [r.tx.lat, r.tx.lon]],
  ["the receiver's position", (r) => [r.rx.lat, r.rx.lon]],
  ["the date", (r) => r.date],
  ["the power", (r) => r.powerWatts],
  ["the transmitting antenna", (r) => r.txAntenna],
  ["the receiving antenna", (r) => r.rxAntenna],
  ["the noise", (r) => r.noise],
  ["the frequency", (r) => r.frequencyMhz],
  ["the mode and what it needs", (r) => [r.mode, r.requiredSnrDb ?? null, r.referenceBandwidthHz ?? null]],
  ["the sunspot number", (r) => r.solar],
  ["the reply", (r) => (r.reply ? [r.reply.powerWatts, r.reply.noise] : null)],
];
/** The same words for the field of the form that could not be read back. */
const FIELD_ASKED: Partial<Record<keyof PlannerForm, string>> = {
  tx: "the transmitter's position",
  rx: "the receiver's position",
  powerWatts: "the power",
  txAntennaId: "the transmitting antenna",
  rxAntennaId: "the receiving antenna",
  frequencyMhz: "the frequency",
  requiredSnrDb: "the mode and what it needs",
  referenceBandwidthHz: "the mode and what it needs",
  ssn: "the sunspot number",
  fof2Mhz: "the sunspot number",
  replyPowerWatts: "the reply",
};
/** A value written so that two of them can be compared whatever order their fields are in. */
const written = (value: unknown) => JSON.stringify(value && typeof value === "object" ? Object.entries(value).sort() : value);

/**
 * A saved prediction, opened: the form that shows it and the request to send, which is
 * the question that was saved. If the form cannot ask exactly that question, there is
 * no request, and the reason is given instead: a different question is never sent
 * under the saved name.
 */
export function openSaved(
  saved: SavedPrediction,
  profiles: AntennaProfile[],
): { form: PlannerForm; request: PredictionRequest } | { form: PlannerForm; problem: string } {
  const form = formOf(saved.request, bandOf(saved.request.frequencyMhz)?.id ?? "other", profiles);
  const built = requestOf(form, profiles);
  const differs =
    "request" in built
      ? ASKED.filter(([, read]) => written(read(built.request)) !== written(read(saved.request))).map(([words]) => words)
      : [FIELD_ASKED[built.field] ?? "something in it"];
  if ("request" in built && differs.length === 0) return { form, request: built.request };
  return {
    form,
    problem: `The form cannot ask exactly what was saved: ${differs.join(", ")} would not be the same. Nothing was predicted. The form shows the nearest it can ask; check it before pressing Predict.`,
  };
}
