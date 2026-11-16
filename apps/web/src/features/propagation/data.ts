/**
 * What the HF planner asks the server for, and the form a person fills in.
 *
 * The form is remembered in this browser between visits (a convenience, nothing more);
 * a prediction worth keeping is saved on the server by name.
 */
import {
  ANTENNA_PRESETS,
  type AntennaProfile,
  type AntennaProfileInput,
  type AntennaSpec,
  type CompareResult,
  type CompareWhat,
  type EngineStatus,
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
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";

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
    onError: (error) => toast.error(errorMessage(error)),
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
  /** "preset:<id>" or a profile's id. */
  txAntennaId: string;
  rxAntennaId: string;
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

export const todayUtc = () => new Date().toISOString().slice(0, 10);

export const emptyForm = (): PlannerForm => ({
  tx: { text: "", name: "" },
  rx: { text: "", name: "" },
  date: todayUtc(),
  radioId: "",
  powerWatts: "5",
  txAntennaId: "preset:low-dipole",
  rxAntennaId: "preset:low-dipole",
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

export function rememberedForm(): PlannerForm {
  try {
    const stored = localStorage.getItem(STORE);
    if (stored) return { ...emptyForm(), ...(JSON.parse(stored) as Partial<PlannerForm>) };
  } catch {
    // Private windows and blocked storage: start from the empty form.
  }
  return emptyForm();
}

export function rememberForm(form: PlannerForm): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(form));
  } catch {
    // Nothing depends on it.
  }
}

export function antennaOf(id: string, profiles: AntennaProfile[]): { spec: AntennaSpec; name: string } | null {
  if (id.startsWith("preset:")) {
    const preset = ANTENNA_PRESETS.find((item) => `preset:${item.id}` === id);
    return preset ? { spec: preset.spec, name: preset.name } : null;
  }
  const profile = profiles.find((item) => item.id === id);
  if (!profile) return null;
  const { kind, heightM, ground, broadsideDeg, gainDb, feedlineLossDb } = profile;
  return { spec: { kind, heightM, ground, broadsideDeg, gainDb, feedlineLossDb }, name: profile.name };
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
  const txAntenna = antennaOf(form.txAntennaId, profiles);
  const rxAntenna = antennaOf(form.rxAntennaId, profiles);
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
  if (form.requiredSnrDb.trim() !== "") {
    const snr = number(form.requiredSnrDb);
    const bandwidth = form.referenceBandwidthHz.trim() === "" ? undefined : number(form.referenceBandwidthHz);
    if (!Number.isFinite(snr) || (bandwidth !== undefined && !(bandwidth >= 1)))
      return {
        field: "requiredSnrDb",
        problem: "Give the signal-to-noise ratio the mode needs as a number of decibels, and its bandwidth in hertz.",
      };
    request.requiredSnrDb = snr;
    if (bandwidth !== undefined) request.referenceBandwidthHz = bandwidth;
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

/** The form that asks a saved request again. Antennas that match a preset are shown as that preset. */
export function formOf(request: PredictionRequest, band: string): PlannerForm {
  const antennaId = (spec: AntennaSpec) => {
    const preset = ANTENNA_PRESETS.find((item) => JSON.stringify(item.spec) === JSON.stringify(spec));
    return preset ? `preset:${preset.id}` : "preset:low-dipole";
  };
  return {
    ...emptyForm(),
    tx: { text: `${request.tx.lat}, ${request.tx.lon}`, name: request.tx.name },
    rx: { text: `${request.rx.lat}, ${request.rx.lon}`, name: request.rx.name },
    date: request.date,
    powerWatts: String(request.powerWatts),
    txAntennaId: antennaId(request.txAntenna),
    rxAntennaId: antennaId(request.rxAntenna),
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
