/**
 * What the coverage screen asks the server for, and the form a person fills in. The
 * form is remembered in this browser between visits, all but its date, as the
 * planner's is.
 */
import {
  type AntennaProfile,
  type Bbox,
  COVERAGE_MAX_LAT,
  COVERAGE_MIN_SPAN_DEG,
  type CoverageArea,
  type CoverageOverview,
  type CoverageRequest,
  type CoverageResolution,
  type CoverageResponse,
  type CoverageResult,
  isSlopingAntenna,
  type JobDto,
  type ModeId,
  type NoiseEnvironment,
  parseCoordinates,
  wireOn,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { parseOklch, tokenToHex } from "@/features/maps/lib/color";
import { api, errorMessage } from "@/lib/api";
import { antennaOf, type PlaceField, todayUtc } from "../data";

export const coverageKeys = {
  overview: ["propagation", "coverage"] as const,
  job: (id: string) => ["jobs", "propagation-coverage", id] as const,
};

export const useCoverageOverview = () =>
  useQuery({ queryKey: coverageKeys.overview, queryFn: () => api.get<CoverageOverview>("/api/radio/propagation/coverage") });

export const useAskCoverage = () =>
  useMutation({ mutationFn: (request: CoverageRequest) => api.post<CoverageResponse>("/api/radio/propagation/coverage", request) });

export const fetchCoverage = (key: string) =>
  api.get<{ coverage: CoverageResult }>(`/api/radio/propagation/coverage/${key}`).then((data) => data.coverage);

/**
 * The job working a map out. The live-events stream refreshes it as the job moves (its key is under
 * "jobs"); the slow poll is only for when that stream is down.
 */
export const useCoverageJob = (id: string | null) =>
  useQuery({
    queryKey: coverageKeys.job(id ?? ""),
    queryFn: () => api.get<{ job: JobDto }>(`/api/jobs/${id}`).then((data) => data.job),
    enabled: id !== null,
    refetchInterval: (query) => (["succeeded", "failed", "cancelled"].includes(query.state.data?.state ?? "") ? false : 5_000),
  });

export const stopJob = (id: string) => api.post(`/api/jobs/${id}/cancel`);

function useChange<T>(run: (input: T) => Promise<unknown>, done?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: coverageKeys.overview });
      if (done) toast.success(done);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
export const useSaveCoverage = () =>
  useChange(
    (input: { name: string; key: string }) => api.post("/api/radio/propagation/coverage/saved", input),
    "Saved. It is listed under Saved coverage maps.",
  );
export const useRemoveCoverage = () => useChange((id: string) => api.delete(`/api/radio/propagation/coverage/saved/${id}`));

// ── The form ────────────────────────────────────────────────────────────────

export interface CoverageForm {
  tx: PlaceField;
  date: string;
  powerWatts: string;
  txAntennaId: string;
  /** The bearing the transmitting antenna's broadside faces; empty to turn it to each cell. */
  txBearing: string;
  rxAntennaId: string;
  noise: NoiseEnvironment;
  band: string;
  frequencyMhz: string;
  mode: ModeId;
  solar: "table" | "manual";
  ssn: string;
  resolution: CoverageResolution;
}

export const emptyCoverageForm = (): CoverageForm => ({
  tx: { text: "", name: "" },
  date: todayUtc(),
  powerWatts: "5",
  txAntennaId: "preset:low-dipole",
  txBearing: "",
  rxAntennaId: "preset:low-dipole",
  noise: "residential",
  band: "40m",
  frequencyMhz: "7.1",
  mode: "ssb",
  solar: "table",
  ssn: "",
  resolution: "coarse",
});

/** The owner's acceptance transmitter, offered as a first thing to try. */
export const exampleCoverageForm = (): CoverageForm => ({
  ...emptyCoverageForm(),
  tx: { text: "51.5074, -0.1278", name: "London" },
  noise: "city",
});
/** Britain and Ireland: the area the example is worked out over. */
export const EXAMPLE_AREA: CoverageArea = { west: -11, south: 49, east: 3, north: 59 };

const STORE = "outpost.propagation.coverage.v1";

export function rememberedCoverageForm(): CoverageForm {
  try {
    const stored = localStorage.getItem(STORE);
    if (stored) {
      const { rememberedOn, ...kept } = JSON.parse(stored) as Partial<CoverageForm> & { rememberedOn?: string };
      const today = todayUtc();
      return { ...emptyCoverageForm(), ...kept, date: rememberedOn === today && kept.date ? kept.date : today };
    }
  } catch {
    // Private windows and blocked storage: start from the empty form.
  }
  return emptyCoverageForm();
}

export function rememberCoverageForm(form: CoverageForm): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...form, rememberedOn: todayUtc() }));
  } catch {
    // Nothing depends on it.
  }
}

/**
 * The area a map shows, as an area a grid can be laid over: kept clear of the poles,
 * no wider than the Earth, and with its west edge between −180 and 180. Null when what
 * is on screen is too small to cut into cells.
 */
export function areaOf(bounds: Bbox): CoverageArea | null {
  const south = Math.max(-COVERAGE_MAX_LAT, bounds[1]);
  const north = Math.min(COVERAGE_MAX_LAT, bounds[3]);
  const span = Math.min(360, bounds[2] - bounds[0]);
  if (north - south < COVERAGE_MIN_SPAN_DEG || span < COVERAGE_MIN_SPAN_DEG) return null;
  const west = span >= 360 ? -180 : ((((bounds[0] + 180) % 360) + 360) % 360) - 180;
  const fix = (value: number) => Number(value.toFixed(2));
  return { west: fix(west), south: fix(south), east: fix(west + span), north: fix(north) };
}

/** A box around a place, for when there is no map to say what area is meant: about 1 300 km each way. */
export function areaAround(lat: number, lon: number): CoverageArea {
  const south = Math.max(-COVERAGE_MAX_LAT, lat - 6);
  const north = Math.min(COVERAGE_MAX_LAT, lat + 6);
  const half = Math.min(60, 6 / Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const west = ((((lon - half + 180) % 360) + 360) % 360) - 180;
  const fix = (value: number) => Number(value.toFixed(2));
  return { west: fix(west), south: fix(south), east: fix(west + 2 * half), north: fix(north) };
}

export function coverageRequestOf(
  form: CoverageForm,
  profiles: AntennaProfile[],
  area: CoverageArea,
): { request: CoverageRequest } | { problem: string; field: keyof CoverageForm } {
  const found = parseCoordinates(form.tx.text);
  if (!found)
    return {
      field: "tx",
      problem:
        "Say where the transmitter is: choose a saved place, press it on the map, or type coordinates (51.5074, -0.1278) or a locator (IO91WM).",
    };
  const number = (text: string) => (text.trim() === "" ? Number.NaN : Number(text));
  const powerWatts = number(form.powerWatts);
  if (!(powerWatts >= 0.1)) return { field: "powerWatts", problem: "Give the transmitter power in watts, at least 0.1." };
  const frequencyMhz = number(form.frequencyMhz);
  if (!(frequencyMhz >= 2 && frequencyMhz <= 30))
    return { field: "frequencyMhz", problem: "Give a frequency between 2 and 30 MHz, the range the engine covers." };
  const txAntenna = antennaOf(form.txAntennaId, profiles);
  const rxAntenna = antennaOf(form.rxAntennaId, profiles);
  if (!txAntenna) return { field: "txAntennaId", problem: "Choose the transmitting antenna." };
  if (!rxAntenna) return { field: "rxAntennaId", problem: "Choose the antenna assumed at the receiving end." };
  // A map is of one frequency. Where a wire is not modelled on it there is nothing to draw, and nothing is asked.
  for (const [field, chosen] of [
    ["txAntennaId", txAntenna],
    ["rxAntennaId", rxAntenna],
  ] as const) {
    const wire = wireOn(chosen.spec, frequencyMhz);
    if (wire?.state === "not-modelled")
      return { field, problem: `No map can be made on ${frequencyMhz} MHz with this antenna. ${wire.note}` };
  }
  let broadsideDeg = txAntenna.spec.broadsideDeg;
  let txSpec = txAntenna.spec;
  if (form.txBearing.trim() !== "") {
    const bearing = number(form.txBearing);
    if (!(bearing >= 0 && bearing <= 360)) return { field: "txBearing", problem: "Give the bearing as degrees from north, 0 to 360." };
    // For a sloping wire the bearing is its high end's; for a level antenna, its broadside's.
    if (isSlopingAntenna(txSpec.kind)) txSpec = { ...txSpec, highEndDeg: bearing };
    else broadsideDeg = bearing;
  }
  const request: CoverageRequest = {
    tx: { name: form.tx.name || "Transmitter", lat: found.lat, lon: found.lon },
    date: form.date,
    powerWatts,
    txAntenna: { ...txSpec, broadsideDeg },
    rxAntenna: rxAntenna.spec,
    noise: form.noise,
    frequencyMhz,
    mode: form.mode,
    solar: { source: "table" },
    area,
    resolution: form.resolution,
  };
  if (form.solar === "manual") {
    const ssn = number(form.ssn);
    if (!(ssn >= 0 && ssn <= 300)) return { field: "ssn", problem: "Give a smoothed sunspot number between 0 and 300." };
    request.solar = { source: "manual", ssn };
  }
  return { request };
}

// ── Shades ──────────────────────────────────────────────────────────────────

/** Used when the tokens cannot be read (no stylesheet, as in tests): the light theme's ramp. */
const FALLBACK_SHADES = ["#d5ecee", "#a8d4d8", "#6fb2b8", "#3f8a91", "#1f5a61"];

/**
 * The five shades of the sequential ramp (`--chart-seq-1` to `-5`) as the browser has
 * resolved them for the theme in use: one hue, light to dark on a light map and dark
 * to light on a dark one, so that "more" always stands further from the ground colour.
 */
export function readShades(): string[] {
  const styles = getComputedStyle(document.documentElement);
  return FALLBACK_SHADES.map((fallback, index) => {
    const token = styles.getPropertyValue(`--chart-seq-${index + 1}`);
    return parseOklch(token) ? tokenToHex(token, fallback) : fallback;
  });
}

/** The shades for the theme in use, read again when the theme changes. */
export function useShades(): string[] {
  const [shades, setShades] = useState(readShades);
  useEffect(() => {
    const update = () => setShades((current) => (readShades().join() === current.join() ? current : readShades()));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return shades;
}
