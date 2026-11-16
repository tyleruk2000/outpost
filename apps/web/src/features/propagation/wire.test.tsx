/**
 * End-fed wires of a stated length on the screens: the four that are offered, the
 * equipment form, a saved prediction opened again, and the three states of a level wire
 * on a band: a half-wave (VOACAP's dipole), longer (approximate figures, marked so) and
 * shorter (not modelled, which must never look like a band that does badly).
 */
import {
  ANTENNA_PRESETS,
  type AntennaProfile,
  type AntennaRunState,
  type AntennaSpec,
  type CommunicationPlan,
  HF_BANDS,
  type PlanResult,
  type PredictionCell,
  type PredictionHour,
  type PredictionRequest,
  type PredictionResult,
  pathRunOn,
  type SavedPrediction,
} from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HourGrid, ShareBars } from "./charts";
import { coverageRequestOf, emptyCoverageForm } from "./coverage-map/data";
import { AS_SAVED, antennaOf, antennaSummary, exampleForm, formOf, openSaved, requestOf, wireBandsNote, wireHint } from "./data";
import { Equipment } from "./equipment";
import { Planner } from "./planner";
import { pairNotModelled, planDocument, toMarkdown } from "./plans/document";
import { bestHour, Results } from "./results";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const preset = (id: string) => ANTENNA_PRESETS.find((item) => item.id === id)!;
const flat10 = preset("efhw-10m-horizontal").spec;
const upright10 = preset("efhw-10m-vertical").spec;
const dipole = preset("low-dipole").spec;

const profile = (spec: AntennaSpec, change: Partial<AntennaProfile> = {}): AntennaProfile => ({
  id: "w1",
  name: "Kite wire",
  ...spec,
  minMhz: 7,
  maxMhz: 30,
  notes: "",
  createdAt: 0,
  updatedAt: 0,
  ...change,
});

/** A server that keeps what was sent to it and answers with `answer`, or refuses. */
function server(
  options: { antennas?: AntennaProfile[]; saved?: SavedPrediction[]; answer?: (path: string, body: unknown) => unknown } = {},
) {
  const sent: Array<{ method: string; path: string; body: unknown }> = [];
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (init?.method && init.method !== "GET") {
        const body = init.body ? JSON.parse(String(init.body)) : null;
        sent.push({ method: init.method, path: pathname, body });
        const answer = options.answer?.(pathname, body);
        return answer === undefined
          ? json({ error: { code: "bad_request", message: "The test's server predicts nothing." } }, 400)
          : json(answer);
      }
      if (pathname === "/api/radio/propagation/engines")
        return json({ engines: [{ id: "voacap", name: "VOACAP", ready: true, problem: null }] });
      if (pathname === "/api/radio/profiles") return json({ radios: [], antennas: options.antennas ?? [] });
      if (pathname === "/api/radio/propagation/saved") return json({ saved: options.saved ?? [] });
      if (pathname === "/api/maps/markers") return json({ markers: [] });
      return json({}, 404);
    }),
  );
  return sent;
}

const shown = (node: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );

const requestWith = (change: Partial<PredictionRequest> = {}): PredictionRequest => {
  const built = requestOf({ ...exampleForm(), date: "2026-11-16" }, []);
  if (!("request" in built)) throw new Error("expected a request");
  return { ...built.request, ...change };
};

describe("the four wires", () => {
  it("are offered by name with the generic antennas, beside nothing that reads as the same thing", () => {
    const names = ANTENNA_PRESETS.map((item) => item.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "End-fed half-wave, 10 m wire, horizontal",
        "End-fed half-wave, 10 m wire, vertical",
        "End-fed half-wave, 5 m wire, horizontal",
        "End-fed half-wave, 5 m wire, vertical",
        "End-fed half-wave recut for every band, horizontal at 6 m",
      ]),
    );
    expect(names).not.toContain("End-fed half-wave, horizontal at 6 m");
  });

  it("are listed on the equipment screen, each saying how it is run and that the matching unit is not in it", async () => {
    server();
    shown(<Equipment />);
    const row = (await screen.findByText("End-fed half-wave, 10 m wire, horizontal")).closest("li")!;
    expect(row.textContent).toContain(
      "From 13.5 to 16.5 MHz, where it is about a half-wave, it is run as VOACAP's horizontal dipole (type 23)",
    );
    expect(row.textContent).toContain("Above 16.5 MHz, where it is longer, the figures are approximate");
    expect(row.textContent).toContain("Below 13.5 MHz, where it is shorter, no figure is given");
    // The 5 m wire is never longer than a half-wave below 30 MHz, and does not say it is.
    const five = screen.getByText("End-fed half-wave, 5 m wire, horizontal").closest("li")!;
    expect(five.textContent).not.toContain("approximate");
    expect(row.textContent).toContain("matching unit's loss is not modelled");
    const upright = screen.getByText("End-fed half-wave, 5 m wire, vertical").closest("li")!;
    expect(upright.textContent).toContain("a half-wave on the 10 m band");
    expect(upright.textContent).toContain("VOACAP's vertical monopole (type 22) 5 m high on every frequency");
  });

  it("go into a request with their length, and no other antenna is given one", () => {
    const built = requestOf({ ...exampleForm(), txAntennaId: "preset:efhw-10m-horizontal", rxAntennaId: "preset:efhw-5m-vertical" }, []);
    if (!("request" in built)) throw new Error("expected a request");
    expect(built.request.txAntenna).toEqual({
      kind: "end-fed-horizontal",
      heightM: 6,
      ground: "average",
      broadsideDeg: null,
      gainDb: 0,
      feedlineLossDb: 0,
      lengthM: 10,
    });
    expect(built.request.rxAntenna).toMatchObject({ kind: "end-fed-vertical", lengthM: 5, heightM: 0 });
    // A profile of a wire carries its length; a profile of anything else has none to carry.
    expect(antennaOf("w1", [profile({ ...upright10, lengthM: 20.5 })])!.spec.lengthM).toBe(20.5);
    expect("lengthM" in antennaOf("w1", [profile(dipole)])!.spec).toBe(false);
    expect("lengthM" in requestWith().txAntenna).toBe(false);
  });

  it("say under the antenna what the wire is on the frequency in the form, before anything is asked", async () => {
    localStorage.setItem(
      "outpost.propagation.form.v1",
      JSON.stringify({ ...exampleForm(), txAntennaId: "preset:efhw-10m-horizontal", rxAntennaId: "preset:efhw-10m-vertical" }),
    );
    server();
    shown(<Planner />);
    // 40 m: the level wire has no model, the upright one is run as a wire a quarter-wave long.
    const flat = (await screen.findByText(/^Not modelled: 10 m of wire is 0\.24 wavelengths at 7\.1 MHz, shorter than a half-wave\./))
      .textContent!;
    expect(flat).toContain("about a half-wave from 13.5 to 16.5 MHz, and run as an approximation above 16.5 MHz");
    expect(flat).toContain("matching unit's loss is not modelled");
    expect(screen.getByText(/shorter than a half-wave\. The figure is VOACAP's vertical monopole \(type 22\)/)).toBeTruthy();
    // On 20 m both are a half-wave and say so.
    fireEvent.change(screen.getByLabelText("Frequency, MHz"), { target: { value: "14.18" } });
    expect(
      await screen.findByText(/0\.47 wavelengths at 14\.18 MHz, about a half-wave: run as VOACAP's horizontal dipole \(type 23\)/),
    ).toBeTruthy();
    expect(screen.getByText(/about a half-wave: run as VOACAP's vertical monopole \(type 22\) of that height/)).toBeTruthy();
    expect(screen.queryByText(/Not modelled/)).toBeNull();
    // On 15 m the level wire is longer than a half-wave: approximate, and said so before anything is asked.
    fireEvent.change(screen.getByLabelText("Frequency, MHz"), { target: { value: "21.22" } });
    const longer = (await screen.findByText(/^Approximate: 10 m of wire is 0\.71 wavelengths at 21\.22 MHz, longer than a half-wave\./))
      .textContent!;
    expect(longer).toContain("VOACAP's sloping long wire (type 41) laid level");
    expect(longer).toContain("reads about 1.3 dB below the dipole model at a half-wave");
  });

  it("are summed up in words wherever an antenna has no name", () => {
    expect(antennaSummary(flat10)).toBe(
      "End-fed wire 10 m long, horizontal (VOACAP type 23 where it is a half-wave, approximate where longer, no figure where shorter), 6 m up, average ground",
    );
    expect(antennaSummary(upright10)).toBe("End-fed wire 10 m long, vertical (VOACAP type 22 of that height), average ground");
    expect(wireHint(flat10, "7.1")).toMatchObject({ notModelled: true });
    expect(wireHint(flat10, "14.2")).toMatchObject({ notModelled: false, approximate: false });
    expect(wireHint(flat10, "21.2")).toMatchObject({ notModelled: false, approximate: true });
    expect(wireHint(flat10, "")).toBeNull();
    expect(wireHint(dipole, "7.1")).toBeNull();
    expect(wireBandsNote(flat10)).toBe(
      "10 m of level wire is about a half-wave on 20 m, and given VOACAP's dipole there. On 17 m, 15 m, 12 m, 10 m it is longer, and its figures are approximate: VOACAP's sloping long wire, laid level, whose level is unchecked. On 80 m, 60 m, 40 m, 30 m it is shorter, and not modelled: no figure.",
    );
    expect(wireBandsNote({ ...upright10, lengthM: 12 })).toContain("from 11.2 to 13.7 MHz, which is none of the amateur bands");
    expect(wireBandsNote(dipole)).toBeNull();
  });
});

describe("the equipment form", () => {
  const pick = async (label: string, option: string | RegExp) => {
    await userEvent.click(screen.getByRole("combobox", { name: label }));
    await userEvent.click(await screen.findByRole("option", { name: option }));
  };

  it("takes a wire's length, says where that is a half-wave, and saves it with the antenna", async () => {
    const sent = server({ answer: () => ({ antenna: {} }) });
    shown(<Equipment />);
    await userEvent.click((await screen.findAllByRole("button", { name: "Add an antenna" }))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Add an antenna" });
    // A dipole has no length to give.
    expect(within(dialog).queryByLabelText("Length of the wire, m")).toBeNull();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Garden wire");
    await pick("Kind", "End-fed half-wave wire, horizontal");
    const length = within(dialog).getByLabelText("Length of the wire, m");
    expect(dialog.textContent).toContain(
      "About a half-wave from 13.5 to 16.5 MHz (20 m). Approximate above 16.5 MHz. No figure below 13.5 MHz.",
    );
    expect(dialog.textContent).toContain("The matching unit's loss is not modelled: add it here.");
    await userEvent.clear(length);
    await userEvent.type(length, "20.2");
    expect(dialog.textContent).toContain("About a half-wave from 6.7 to 8.2 MHz (40 m)");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add antenna" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      method: "POST",
      path: "/api/radio/profiles/antennas",
      body: { name: "Garden wire", kind: "end-fed-horizontal", lengthM: 20.2, heightM: 5, broadsideDeg: null },
    });
  });

  it("refuses a length outside the bounds, in words, and sends nothing", async () => {
    const sent = server({ answer: () => ({ antenna: {} }) });
    shown(<Equipment />);
    await userEvent.click((await screen.findAllByRole("button", { name: "Add an antenna" }))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Add an antenna" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "Too short");
    await pick("Kind", "End-fed half-wave wire, vertical");
    // An upright wire stands on the ground: it has a length and no height or bearing.
    expect(within(dialog).queryByLabelText("Height of the wire, m")).toBeNull();
    const length = within(dialog).getByLabelText("Length of the wire, m");
    await userEvent.clear(length);
    await userEvent.type(length, "3");
    expect(dialog.textContent).toContain("Between 4.5 and 82 m.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add antenna" }));
    expect(within(dialog).getByRole("alert").textContent).toContain("Give the length of the wire in metres, between 4.5 and 82");
    expect(sent).toHaveLength(0);
  });

  it("opens a wire to be changed with its length, and drops the length when it becomes another kind", async () => {
    const sent = server({ antennas: [profile({ ...upright10, lengthM: 20.5 })], answer: () => ({ antenna: {} }) });
    shown(<Equipment />);
    expect((await screen.findByText("Kite wire")).closest("li")!.textContent).toContain(
      "End-fed wire 20.5 m long, vertical (VOACAP type 22 of that height)",
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit antenna" });
    expect((within(dialog).getByLabelText("Length of the wire, m") as HTMLInputElement).value).toBe("20.5");
    await pick("Kind", "Horizontal dipole");
    expect(within(dialog).queryByLabelText("Length of the wire, m")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save antenna" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      method: "PATCH",
      path: "/api/radio/profiles/antennas/w1",
      body: { kind: "horizontal-dipole", heightM: 6 },
    });
    expect("lengthM" in (sent[0]!.body as object)).toBe(false);
  });
});

describe("a saved prediction", () => {
  const savedOf = (request: PredictionRequest): SavedPrediction => ({
    id: "s1",
    name: "Saved",
    request,
    key: "",
    noteId: null,
    createdAt: 0,
    updatedAt: 0,
  });

  it("opens on the wire it was saved with and asks exactly what was saved", () => {
    const saved = savedOf(requestWith({ txAntenna: flat10, rxAntenna: preset("efhw-5m-vertical").spec, frequencyMhz: 14.18 }));
    const opened = openSaved(saved, []);
    expect(opened.form.txAntennaId).toBe("preset:efhw-10m-horizontal");
    expect(opened.form.rxAntennaId).toBe("preset:efhw-5m-vertical");
    expect(opened).toMatchObject({ request: saved.request });
    expect(requestOf(opened.form, [])).toEqual({ request: saved.request });
  });

  it("opens a wire of a person's own length on the profile that is exactly it, and as saved once the profile's length has changed", () => {
    const own: AntennaSpec = { ...upright10, lengthM: 20.5, feedlineLossDb: 1 };
    const saved = savedOf(requestWith({ txAntenna: own }));
    expect(formOf(saved.request, "40m", [profile(own)]).txAntennaId).toBe("w1");
    // Another length is another antenna: the saved one is kept and run as it was.
    const opened = openSaved(saved, [profile({ ...own, lengthM: 19 })]);
    expect(opened.form.txAntennaId).toBe(AS_SAVED);
    expect(opened).toMatchObject({ request: { txAntenna: own } });
    expect(requestOf(opened.form, [])).toEqual({ request: saved.request });
    // And it is not mistaken for the generic wire of the same kind either.
    expect(openSaved(saved, []).form.txAntennaId).toBe(AS_SAVED);
  });

  it("saved before lengths existed opens on the antenna it was, renamed, and asks what it always asked", () => {
    // As the planner wrote it when the antenna was called "End-fed half-wave, horizontal at 6 m": no length in it.
    const before: AntennaSpec = {
      kind: "end-fed-half-wave",
      heightM: 6,
      ground: "average",
      broadsideDeg: null,
      gainDb: 0,
      feedlineLossDb: 0,
    };
    const saved = savedOf(requestWith({ txAntenna: before }));
    const opened = openSaved(saved, []);
    expect(opened.form.txAntennaId).toBe("preset:efhw");
    expect(antennaOf(opened.form.txAntennaId, [])!.name).toBe("End-fed half-wave recut for every band, horizontal at 6 m");
    expect(opened).toMatchObject({ request: saved.request });
    const again = requestOf(opened.form, []);
    expect(again).toEqual({ request: saved.request });
    expect("request" in again && "lengthM" in again.request.txAntenna).toBe(false);
    // A profile made then, which the server still gives with no length, is still that antenna.
    expect(
      formOf(savedOf(requestWith({ txAntenna: { ...before, heightM: 8 } })).request, "40m", [profile({ ...before, heightM: 8 })])
        .txAntennaId,
    ).toBe("w1");
  });
});

// ── A result on the screen ──────────────────────────────────────────────────

const cell = (mhz: number, reliability: number): PredictionCell => ({
  mhz,
  path: "1F2",
  hops: 1,
  layer: "F2",
  takeoffDeg: 70,
  virtualHeightKm: 300,
  mufDays: 0.9,
  fieldDbuV: 10,
  signalDbw: -110,
  noiseDbwHz: -150,
  snrDbHz: 40,
  snrLowDb: 10,
  snrUpDb: 8,
  reliability,
  txGainDbi: 3,
  rxGainDbi: 3,
  lossDb: 110,
});
const blank = (mhz: number): PredictionCell => ({
  ...cell(mhz, 0),
  path: null,
  hops: 0,
  layer: "",
  snrDbHz: 0,
  signalDbw: 0,
  notModelled: true,
});

/**
 * A result as the server gives one: figures where the antennas are modelled, figures
 * marked approximate where they are run as an approximation, blanks marked not modelled
 * elsewhere. By default each frequency is in the state the shared rule gives it.
 */
function resultOf(
  request: PredictionRequest,
  stateOf: (mhz: number) => AntennaRunState = (mhz) => pathRunOn(request.txAntenna, request.rxAntenna, mhz),
): PredictionResult {
  const sweepMhz = Array.from({ length: 29 }, (_, index) => index + 2);
  const modelled = (mhz: number) => stateOf(mhz) !== "not-modelled";
  const at = (mhz: number, reliability: number): PredictionCell =>
    stateOf(mhz) === "not-modelled"
      ? blank(mhz)
      : stateOf(mhz) === "approximate"
        ? { ...cell(mhz, reliability), approximate: true }
        : cell(mhz, reliability);
  const hours: PredictionHour[] = Array.from({ length: 24 }, (_, index) => ({
    utc: index + 1,
    localTime: index + 1,
    mufMhz: 9.5,
    fotMhz: 8,
    hpfMhz: 11,
    lufMhz: 4,
    ionosphere: { foF2: 8, foE: 3, foF1: 0, hmF2: 280, virtualHeightF2Km: 300, m3000: 3, sunZenithDeg: 70 },
    asked: at(request.frequencyMhz, 0.4),
    bands: HF_BANDS.map((band) => at(band.mhz, band.id === "20m" ? (index === 14 ? 0.8 : 0.6) : 0.2)),
    sweepReliability: sweepMhz.map((mhz) => (modelled(mhz) ? 0.5 : 0)),
    sweepSnrDbHz: sweepMhz.map((mhz) => (modelled(mhz) ? 40 : 0)),
    modeReliability: [0.4, 0.9, 1, 1, null],
    reply: null,
  }));
  const mode = {
    id: "ssb" as const,
    label: "SSB voice",
    requiredSnrDb: 45,
    referenceBandwidthHz: 1,
    requiredSnrDbHz: 45,
    source: "A guide",
  };
  return {
    key: "k".repeat(40),
    request,
    computedAt: Date.UTC(2026, 10, 16, 12),
    cached: false,
    engine: {
      id: "voacap",
      name: "VOACAP",
      model: "VOACAP Version 16.1207W",
      implementation: "hfcast 2.14.0",
      licence: "Apache-2.0",
      sha256: "0".repeat(64),
      gives: { reliability: true, luf: true, ionosphere: true, measuredFoF2: false, coverage: true },
      minMhz: 2,
      maxMhz: 30,
    },
    datasets: [{ id: "voacap-data", version: "1" }],
    basis: {
      kind: "recent-solar",
      ssn: 83,
      summary: "Monthly median for November 2026.",
      tableDate: "2026-11-01",
      tableAgeDays: 15,
      ssnLow: null,
      ssnHigh: null,
    },
    path: {
      distanceKm: 162,
      bearingDeg: 313,
      backBearingDeg: 131,
      midpoint: { lat: 52, lon: -1 },
      txLocator: "IO91WM",
      rxLocator: "IO92BL",
    },
    mode,
    modes: [mode],
    sweepMhz,
    hours,
    antennas: { tx: "How the transmitting antenna was run.", rx: "How the receiving antenna was run." },
    deck: "",
    limits: ["A limit."],
  };
}

const halfOnly = (mhz: number): AntennaRunState => (mhz >= 13.5 && mhz <= 16.5 ? "modelled" : "not-modelled");

describe("a prediction on a frequency the wire is not modelled on", () => {
  const request = requestWith({ txAntenna: flat10 });
  const result = resultOf(request);

  it("says there is no figure and why, and shows none of the figures a blank would otherwise fill", () => {
    server();
    shown(<Results result={result} hour={12} onHour={() => {}} />);
    const notice = screen.getByText("No figure for 7.10 MHz: an antenna is not modelled there").closest('[role="status"], [role="alert"]')!;
    expect(notice.textContent).toContain(
      "The transmitting antenna: 10 m of wire is 0.24 wavelengths at 7.1 MHz, shorter than a half-wave.",
    );
    expect(notice.textContent).toContain(
      "This wire is about a half-wave from 13.5 to 16.5 MHz, and run as an approximation above 16.5 MHz.",
    );
    expect(notice.textContent).toContain(
      "The bands below that have figures are 20 m, 17 m (approximate), 15 m (approximate), 12 m (approximate), 10 m (approximate).",
    );
    // No reliability, ratio, signal or hop count for 7.1 MHz: a blank is not 0% and not "no path".
    expect(screen.queryByText("7.10 MHz at 12:00 UTC")).toBeNull();
    expect(screen.queryByText(/0% for SSB voice/)).toBeNull();
    expect(screen.queryByText("No path found")).toBeNull();
    expect(screen.queryByText(/the engine finds no way/)).toBeNull();
    expect(screen.queryByText(/with one thing changed/)).toBeNull();
    expect(screen.getAllByText("No figure: an antenna is not modelled on 7.10 MHz.")).toHaveLength(2);
    // What does not depend on the antenna is still read.
    expect(screen.getByText(/the path's MUF is 9\.50 MHz\. Nothing is said here about 7\.10 MHz/)).toBeTruthy();
  });

  it("shows the three states in the band table, each in words and marks as well as shade", () => {
    server();
    shown(<Results result={result} hour={12} onHour={() => {}} />);
    const ranked = screen.getByRole("list", { name: "Bands ranked by reliability at 12:00 UTC" });
    const rows = [...ranked.querySelectorAll("li")];
    // The half-wave band first, then the approximate ones, then every band without a figure, saying so with no percentage.
    expect(rows).toHaveLength(9);
    expect(rows[0]!.textContent).toContain("20 m");
    expect(rows[0]!.textContent).toContain("60%");
    expect(rows[0]!.textContent).toContain("wire 0.47 λ");
    expect(rows[0]!.querySelector("[data-not-modelled], [data-approximate]")).toBeNull();
    for (const row of rows.slice(1, 5)) {
      expect(row.querySelector("[data-approximate]")).not.toBeNull();
      expect(row.textContent).toContain("approximately ≈20%");
      expect(row.textContent).toContain("Approximate.");
    }
    expect(rows.slice(1, 5).map((row) => row.textContent!.slice(0, 4))).toEqual(["17 m", "15 m", "12 m", "10 m"]);
    for (const row of rows.slice(5)) {
      expect(row.querySelector("[data-not-modelled]")!.textContent).toBe("Not modelled");
      expect(row.textContent).not.toContain("%");
      expect(row.textContent).toMatch(/MHz, wire 0\.\d\d λ$/);
    }
    // The day on each band: read out and tabled as approximate or not modelled, never a blank as 0%.
    const table = screen.getByRole("table", { name: "Reliability of SSB voice on each band by hour" });
    expect(table.querySelector("tbody tr")!.textContent).toBe(
      `01:00${HF_BANDS.map((band) => (band.id === "20m" ? "60%" : band.mhz > 16.5 ? "20% (approximate)" : "not modelled for this antenna")).join("")}`,
    );
    const grid = screen.getByRole("region", { name: /Reliability of SSB voice on each band by hour/ });
    expect(grid.querySelectorAll("rect[data-not-modelled]")).toHaveLength(4);
    expect(grid.querySelectorAll("rect[data-approximate]")).toHaveLength(4);
    expect(within(grid).getByText("15 m ≈")).toBeTruthy();
    // The legend names all three: the shades, the approximate frame and the hatching.
    const legends = screen.getAllByRole("list", { name: "What the shades mean" }).map((item) => item.textContent);
    expect(
      legends.some((text) => text!.includes("≈ in a dashed frame: approximate figures") && text!.includes("not modelled for this antenna")),
    ).toBe(true);
    // The arrow keys start from the band asked about, 40 m, and the row below it is 30 m; up from there is 17 m.
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(within(grid).getByText("12:00 UTC, 30 m (10.1 MHz): not modelled for this antenna")).toBeTruthy();
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(within(grid).getByText("12:00 UTC, 17 m (18.1 MHz): approximate, 20% of days")).toBeTruthy();
    // And the wire's length on every band, in wavelengths, with how it was run.
    const lengths = screen.getByRole("list", { name: "The wire on each band" });
    expect(lengths.querySelectorAll("li")).toHaveLength(9);
    expect(within(lengths).getByText("20 m").closest("li")!.textContent).toBe(
      "20 m0.47 wavelengths, about a half-wave. Half-wave: VOACAP's dipole",
    );
    expect(within(lengths).getByText("15 m").closest("li")!.textContent).toBe(
      "15 m0.71 wavelengths, longer than a half-wave. Approximate: VOACAP's sloping long wire, laid level; its level is unchecked and reads about 1.3 dB below the dipole model at a half-wave",
    );
    expect(within(lengths).getByText("40 m").closest("li")!.textContent).toBe(
      "40 m0.24 wavelengths, shorter than a half-wave. Not modelled: no figure",
    );
    expect(screen.getByText(/No figure is given on 80 m, 60 m, 40 m, 30 m:/)).toBeTruthy();
    expect(screen.getByText(/The figures on 17 m, 15 m, 12 m, 10 m are approximate\./)).toBeTruthy();
    // Where the two models stand side by side, the step between them is said beside the bands, not in a footnote.
    const join = screen.getByText("Two of VOACAP's models side by side").closest('[role="status"], [role="alert"]')!;
    expect(join.textContent).toContain("The level wire is VOACAP's dipole on 20 m and an approximation on 17 m, 15 m, 12 m, 10 m.");
    expect(join.textContent).toContain("0.7 to 1.0 dB below the dipole there and about 1.3 dB below it at a half-wave");
    expect(within(lengths.parentElement!).getAllByText(/Neither is adjusted to meet the other/).length).toBeGreaterThan(0);
  });

  it("hatches the frequencies with no figure on the heat map and gives no LUF from part of a range", () => {
    server();
    // On 20 m, where the question itself has figures.
    const twenty = resultOf({ ...request, frequencyMhz: 14.18 }, halfOnly);
    shown(<Results result={twenty} hour={12} onHour={() => {}} />);
    const sweep = screen.getByRole("region", { name: /Reliability of SSB voice from 2 to 30 MHz by hour/ });
    // 14, 15 and 16 MHz have the dipole's figures; 17 to 30 approximate ones, framed; 2 to 13 none.
    expect(sweep.querySelectorAll("rect[data-not-modelled]")).toHaveLength(12);
    expect(sweep.querySelectorAll("rect[data-approximate]")).toHaveLength(14);
    expect(screen.getByText(/A hatched row is a frequency an antenna is not modelled on/)).toBeTruthy();
    expect(screen.getAllByText("not modelled for this antenna: no figure").length).toBeGreaterThan(0);
    expect(screen.getByText(/LUF not given: an antenna is modelled on only part of the range/)).toBeTruthy();
    // The frequency asked about is a half-wave: its figures are there, and how the wire was run on it.
    expect(screen.getByText("14.2 MHz at 12:00 UTC")).toBeTruthy();
    expect(screen.getByText("40% for SSB voice")).toBeTruthy();
    expect(screen.getByText("The transmitting antenna on 14.2 MHz").closest("li")!.textContent).toContain(
      "10 m of wire is 0.47 wavelengths at 14.18 MHz, about a half-wave: run as VOACAP's horizontal dipole (type 23) of that length.",
    );
    expect(screen.queryByText(/No figure for/)).toBeNull();
  });

  it("opens on the hour at which the best band with figures does best, not on an hour of blanks", () => {
    expect(bestHour(result)).toBe(15);
  });
});

describe("a prediction with an upright wire off its half-wave band", () => {
  it("has figures on every band and says how long the wire is on each", () => {
    server();
    const result = resultOf(requestWith({ txAntenna: upright10 }), () => "modelled");
    shown(<Results result={result} hour={12} onHour={() => {}} />);
    expect(screen.queryByText(/No figure for/)).toBeNull();
    expect(screen.getByText("The transmitting antenna on 7.10 MHz").closest("li")!.textContent).toContain(
      "10 m of wire is 0.24 wavelengths at 7.1 MHz, shorter than a half-wave. The figure is VOACAP's vertical monopole (type 22) of that height, which is fed against the ground at its base",
    );
    const lengths = screen.getByRole("list", { name: "The wire on each band" });
    expect(within(lengths).getByText("80 m").closest("li")!.textContent).toBe(
      "80 m0.12 wavelengths, not a half-wave; run as a wire of this length",
    );
    expect(within(lengths).getByText("20 m").closest("li")!.textContent).toBe("20 m0.47 wavelengths, about a half-wave");
    expect(document.querySelectorAll("[data-not-modelled]")).toHaveLength(0);
  });

  it("shows nothing about wires for antennas that are not wires of a stated length", () => {
    server();
    shown(<Results result={resultOf(requestWith(), () => "modelled")} hour={12} onHour={() => {}} />);
    expect(screen.queryByRole("list", { name: "The wire on each band" })).toBeNull();
    expect(screen.queryByText(/wavelengths/)).toBeNull();
    expect(screen.getByText(/LUF 4\.00 MHz/)).toBeTruthy();
  });
});

describe("charts", () => {
  it("draw a row that is not modelled as one hatched bar, name it in the legend, and never write it as a share", () => {
    render(
      <HourGrid
        name="By band"
        hour={12}
        onHour={() => {}}
        rows={[
          { label: "40 m", values: Array(24).fill(0), notModelled: true },
          { label: "20 m", values: Array(24).fill(0) },
        ]}
      />,
    );
    const grid = screen.getByRole("region", { name: /By band/ });
    expect(grid.querySelectorAll("rect[data-not-modelled]")).toHaveLength(1);
    expect(screen.getByRole("list", { name: "What the shades mean" }).textContent).toContain("not modelled for this antenna: no figure");
    // A poor band and a band with no figure read differently, cell by cell.
    expect(screen.getByRole("table", { name: "By band" }).querySelector("tbody tr")!.textContent).toBe(
      "01:00not modelled for this antenna0%",
    );
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(screen.getByText("13:00 UTC, 40 m: not modelled for this antenna")).toBeTruthy();
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(screen.getByText("13:00 UTC, 20 m: 0% of days")).toBeTruthy();
  });

  it("leave the legend as it was when every row has figures", () => {
    render(<HourGrid name="By band" hour={12} onHour={() => {}} rows={[{ label: "20 m", values: Array(24).fill(0.5) }]} />);
    expect(screen.getByRole("list", { name: "What the shades mean" }).textContent).not.toContain("not modelled");
  });

  it("write a ranked band with no figure as not modelled, with no bar and no percentage", () => {
    render(
      <ShareBars
        name="Bands"
        rows={[
          { label: "20 m", share: 0, detail: "14.2 MHz, 1F2, 20 dB" },
          { label: "40 m", share: 0, detail: "7.10 MHz, the wire is 0.24 wavelengths", notModelled: true },
        ]}
      />,
    );
    const [poor, none] = [...screen.getByRole("list", { name: "Bands" }).querySelectorAll("li")];
    expect(poor!.textContent).toContain("0%");
    expect(none!.textContent).toBe("40 mNot modelled7.10 MHz, the wire is 0.24 wavelengths");
  });
});

describe("a coverage map", () => {
  it("is not asked for on a frequency the wire is not modelled on, and says why under the antenna", () => {
    const area = { west: -8, south: 49, east: 4, north: 59 };
    const form = { ...emptyCoverageForm(), tx: { text: "51.5074, -0.1278", name: "London" }, txAntennaId: "preset:efhw-10m-horizontal" };
    expect(coverageRequestOf(form, [], area)).toMatchObject({
      field: "txAntennaId",
      problem: expect.stringContaining("No map can be made on 7.1 MHz with this antenna. Not modelled: 10 m of wire is 0.24 wavelengths"),
    });
    expect(
      coverageRequestOf({ ...form, txAntennaId: "preset:low-dipole", rxAntennaId: "preset:efhw-5m-horizontal" }, [], area),
    ).toMatchObject({
      field: "rxAntennaId",
    });
    const asked = coverageRequestOf({ ...form, band: "20m", frequencyMhz: "14.18" }, [], area);
    expect(asked).toMatchObject({ request: { frequencyMhz: 14.18, txAntenna: { kind: "end-fed-horizontal", lengthM: 10 } } });
    // An upright wire is run on any frequency.
    expect(coverageRequestOf({ ...form, txAntennaId: "preset:efhw-10m-vertical" }, [], area)).toMatchObject({
      request: { txAntenna: { kind: "end-fed-vertical", lengthM: 10 } },
    });
  });
});

describe("a communication plan written out", () => {
  const day = (value: number | null) => Array.from({ length: 24 }, () => value);
  const plan = {
    name: "Wires",
    notes: "",
    stations: [
      {
        id: "a",
        name: "Home",
        lat: 51.5,
        lon: -0.1,
        powerWatts: 20,
        antenna: flat10,
        antennaName: "End-fed half-wave, 10 m wire, horizontal",
        noise: "rural",
      },
      {
        id: "b",
        name: "Hill",
        lat: 54.4,
        lon: -3.1,
        powerWatts: 20,
        antenna: dipole,
        antennaName: "Low horizontal dipole, 5 m",
        noise: "rural",
      },
    ],
    date: "2026-11-16",
    fromUtc: 9,
    toUtc: 11,
    linked: [],
  } as unknown as CommunicationPlan;
  const pair = {
    a: "a",
    b: "b",
    distanceKm: 380,
    bearingDeg: 330,
    backBearingDeg: 148,
    problem: null,
    bands: [
      // As the server gives a band the wire is not modelled on: nothing at any hour.
      {
        bandId: "40m",
        mhz: 7.1,
        forward: { reliability: day(null), snrDbHz: day(null) },
        back: { reliability: day(null), snrDbHz: day(null) },
      },
      {
        bandId: "20m",
        mhz: 14.18,
        forward: { reliability: day(0.7), snrDbHz: day(50) },
        back: { reliability: day(0.6), snrDbHz: day(48) },
      },
    ],
  };
  const result = {
    mode: { id: "cw", label: "CW (Morse)", requiredSnrDb: 24, referenceBandwidthHz: 1, requiredSnrDbHz: 24, source: "" },
    basis: { summary: "Monthly median." },
    pairs: [pair],
    limits: [],
    engine: { model: "VOACAP", implementation: "hfcast" },
    datasets: [],
    computedAt: Date.UTC(2026, 10, 16),
  } as unknown as PlanResult;

  it("says which station's wire is not modelled on a band", () => {
    expect(pairNotModelled(plan, pair, 7.1)).toBe(
      "Home's 10 m level wire (about a half-wave from 13.5 to 16.5 MHz) is not modelled on this band",
    );
    expect(pairNotModelled(plan, pair, 14.18)).toBeNull();
  });

  it("writes such a band as n/m with the reason, not as hours with no path, and recommends the band with figures", () => {
    const text = toMarkdown(planDocument(plan, result, new Date(Date.UTC(2026, 10, 16))));
    expect(text).toMatch(/\| 40 m +\| +n\/m \| +n\/m \| +n\/m \|/);
    expect(text).toMatch(/\| 20 m +\| +60 \| +60 \| +60 \|/);
    expect(text).toContain(
      "n/m is not modelled: the engine has no model of that antenna on that band, so there is no figure and the band cannot be recommended. 40 m: Home's 10 m level wire (about a half-wave from 13.5 to 16.5 MHz) is not modelled on this band.",
    );
    expect(text).toContain("Primary: 20 m (14.18 MHz)");
    expect(text).toContain("Alternate: none.");
  });
});

// ── A sloping wire, and choosing among the antennas ──────────────────────────

const sloper = preset("efhw-20m-sloping").spec;

describe("choosing an antenna", () => {
  it("lists the person's own first, then the generic ones under headings, and finds one by typing", async () => {
    localStorage.setItem("outpost.propagation.form.v1", JSON.stringify({ ...exampleForm(), date: "2026-11-16" }));
    server({ antennas: [profile(dipole, { name: "Garden dipole", id: "g1" })] });
    shown(<Planner />);
    const trigger = await screen.findByRole("button", { name: "Transmitting antenna" });
    await userEvent.click(trigger);
    const list = await screen.findByRole("listbox", { name: "Antennas" });
    const headings = within(list)
      .getAllByRole("group")
      .map((group) => group.firstElementChild!.textContent);
    expect(headings).toEqual([
      "Your antennas",
      "Dipoles",
      "End-fed wire, 20 m (a half-wave on 40 m)",
      "End-fed wire, 10 m (a half-wave on 20 m)",
      "End-fed wire, 5 m (a half-wave on 10 m)",
      "Verticals and others",
    ]);
    const twenty = within(list).getByRole("group", { name: "End-fed wire, 20 m (a half-wave on 40 m)" });
    expect(
      within(twenty)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Sloping 25°, from 1.5 m up to 10 m", "Horizontal, level 6 m up", "SPOOLTENNA, 19.8 m, sloping 17° from 1.8 m to 7.6 m"]);
    // Typing narrows the list, heading and all.
    await userEvent.type(screen.getByRole("searchbox", { name: "Find an antenna" }), "20 m slop");
    expect(
      within(list)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Sloping 25°, from 1.5 m up to 10 m", "SPOOLTENNA, 19.8 m, sloping 17° from 1.8 m to 7.6 m"]);
    // Down from the box and Enter chooses it.
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(screen.queryByRole("listbox", { name: "Antennas" })).toBeNull());
    expect(trigger.textContent).toBe("End-fed half-wave, 20 m wire, sloping 25° from 1.5 m to 10 m");
    // Under it, what the wire is on the frequency in the form: approximate on 40 m.
    expect(await screen.findByText(/^Approximate: 20 m of wire is 0\.47 wavelengths at 7\.1 MHz, about a half-wave\./)).toBeTruthy();
  });

  it("finds the SPOOLTENNA by its name in any case, and nothing for words no antenna has", async () => {
    localStorage.setItem("outpost.propagation.form.v1", JSON.stringify({ ...exampleForm(), date: "2026-11-16" }));
    server();
    shown(<Planner />);
    await userEvent.click(await screen.findByRole("button", { name: "Receiving antenna" }));
    const search = await screen.findByRole("searchbox", { name: "Find an antenna" });
    await userEvent.type(search, "spooltenna");
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(1);
    await userEvent.clear(search);
    await userEvent.type(search, "magnetic loop");
    expect(screen.getByText("No antenna has those words.")).toBeTruthy();
  });
});

describe("a sloping wire", () => {
  const pick = async (label: string, option: string | RegExp) => {
    await userEvent.click(screen.getByRole("combobox", { name: label }));
    await userEvent.click(await screen.findByRole("option", { name: option }));
  };

  it("is made in the equipment form with its low end, slope and the way it rises, said in words", async () => {
    const sent = server({ answer: () => ({ antenna: {} }) });
    shown(<Equipment />);
    await userEvent.click((await screen.findAllByRole("button", { name: "Add an antenna" }))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Add an antenna" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "Pole sloper");
    await pick("Kind", "End-fed half-wave wire, sloping");
    const length = within(dialog).getByLabelText("Length of the wire, m");
    await userEvent.clear(length);
    await userEvent.type(length, "20");
    expect(dialog.textContent).toContain("Approximate figures from 6.7 MHz up. No figure below 6.7 MHz.");
    const slope = within(dialog).getByRole("group", { name: "How it slopes" });
    const low = within(slope).getByLabelText("Low end (the feed), m up");
    await userEvent.clear(low);
    await userEvent.type(low, "1.5");
    expect(slope.textContent).toContain("Its high end is about 10.0 m up.");
    expect(slope.textContent).toContain("Empty: the low end faces the other station and the wire rises away from it.");
    // A slope the model was not run at is refused, in words, and nothing is sent.
    const angle = within(slope).getByLabelText("Slope, ° above level");
    await userEvent.clear(angle);
    await userEvent.type(angle, "75");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add antenna" }));
    expect(within(dialog).getByRole("alert").textContent).toContain("10 to 60");
    expect(sent).toHaveLength(0);
    await userEvent.clear(angle);
    await userEvent.type(angle, "30");
    await userEvent.type(within(slope).getByLabelText("Its high end points towards, °"), "45");
    expect(slope.textContent).toContain("weakest towards 45°");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add antenna" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toMatchObject({
      kind: "end-fed-sloping",
      lengthM: 20,
      heightM: 1.5,
      slopeDeg: 30,
      highEndDeg: 45,
      broadsideDeg: null,
    });
  });

  it("is listed among the generic antennas under its wire's length", async () => {
    server();
    shown(<Equipment />);
    const row = (await screen.findByText("End-fed half-wave, 20 m wire, sloping 25° from 1.5 m to 10 m")).closest("li")!;
    expect(row.closest("div")!.querySelector("h3")!.textContent).toBe("End-fed wire, 20 m (a half-wave on 40 m)");
    expect(row.textContent).toContain("every figure is approximate");
    const maker = screen.getByText("SPOOLTENNA (PARKS or ULTRA), 65 ft wire, sloping as its manual shows").closest("li")!;
    expect(maker.textContent).toContain("trade mark");
    expect(maker.textContent).toContain("49:1 transformer");
    expect(maker.textContent).toContain("The transformer's loss");
  });

  it("goes into a request with its slope and no bearing of its high end, and is summed up in words", () => {
    const built = requestOf({ ...exampleForm(), txAntennaId: "preset:efhw-20m-sloping" }, []);
    if (!("request" in built)) throw new Error("expected a request");
    expect(built.request.txAntenna).toEqual(sloper);
    expect(antennaSummary(sloper)).toContain("sloping 25° from 1.5 m to 10 m, high end away from the other station");
    expect(wireBandsNote(sloper)).toBe(
      "20 m of sloping wire is about a half-wave on 40 m. On 40 m, 30 m, 20 m, 17 m, 15 m, 12 m, 10 m its figures are approximate: VOACAP's sloping long wire at its slope, whose level is unchecked. On 80 m, 60 m it is shorter than a half-wave, and not modelled: no figure.",
    );
  });

  it("shows its states in the band table: approximate from 40 m up, not modelled below, and no join between two models", () => {
    server();
    const request = requestWith({ txAntenna: sloper, frequencyMhz: 14.18 });
    shown(<Results result={resultOf(request)} hour={12} onHour={() => {}} />);
    const ranked = screen.getByRole("list", { name: "Bands ranked by reliability at 12:00 UTC" });
    const rows = [...ranked.querySelectorAll("li")];
    expect(rows.filter((row) => row.querySelector("[data-approximate]")).length).toBe(7);
    expect(rows.filter((row) => row.querySelector("[data-not-modelled]")).map((row) => row.textContent!.slice(0, 4))).toEqual([
      "80 m",
      "60 m",
    ]);
    const lengths = screen.getByRole("list", { name: "The wire on each band" });
    expect(within(lengths).getByText("40 m").closest("li")!.textContent).toBe(
      "40 m0.47 wavelengths, about a half-wave. Approximate: VOACAP's sloping long wire, at the wire's slope; its level is unchecked, a few decibels either way",
    );
    expect(within(lengths).getByText("10 m").closest("li")!.textContent).toContain("longer than a half-wave. Approximate");
    expect(within(lengths).getByText("80 m").closest("li")!.textContent).toBe(
      "80 m0.24 wavelengths, shorter than a half-wave. Not modelled: no figure",
    );
    // One model on every band with figures: no step between two models to speak of.
    expect(screen.queryByText("Two of VOACAP's models side by side")).toBeNull();
    // The first line of the answer says approximate, and how the wire was run.
    const headline = screen.getByText(/^Approximate figures for 14\.2 MHz\.$/).closest("p")!;
    expect(headline.textContent).toContain("sloping long wire (at the wire's slope)");
  });

  it("is turned by its high end on a coverage map, when a bearing is given", () => {
    const form = {
      ...emptyCoverageForm(),
      tx: { text: "51.5, -0.12", name: "Park" },
      txAntennaId: "preset:efhw-20m-sloping",
      frequencyMhz: "14.18",
      txBearing: "200",
    };
    const built = coverageRequestOf(form, [], { west: -8, south: 49, east: 4, north: 59 });
    if (!("request" in built)) throw new Error(`expected a request: ${JSON.stringify(built)}`);
    expect(built.request.txAntenna).toMatchObject({ kind: "end-fed-sloping", highEndDeg: 200, broadsideDeg: null });
  });
});
