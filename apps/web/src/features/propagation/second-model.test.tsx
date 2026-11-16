/**
 * The comparison with the second model, in each of its states: not set up, running,
 * both models answered, and P.533 failing. Every figure here is made up for the test.
 */
import { HF_BANDS, type PredictionResult, SECOND_MODEL_NOTES, type SecondModelComparison, type SecondModelStatus } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecondModel } from "./second-model";

afterEach(() => vi.unstubAllGlobals());

const status = (offered: boolean, change: Partial<SecondModelStatus["maps"]> = {}): SecondModelStatus => ({
  offered,
  line: offered ? null : "The second model (ITU P.533) is not set up here. To use it, download the ITU's P.533 maps (137 MB).",
  engine: {
    built: true,
    file: "/x/iturhfprop.wasm",
    problem: null,
    sha256: "e".repeat(64),
    repository: "https://github.com/ITU-R-Study-Group-3/ITU-R-HF",
    commit: "8".repeat(40),
    howToBuild: "",
  },
  maps: {
    installed: offered,
    bytes: 137_270_856,
    files: 25,
    collectionId: null,
    where: null,
    downloading: false,
    problem: null,
    source: "",
    ...change,
  },
  terms: "The ITU's own terms, not an open-source licence.",
});

const result = { key: "k1", request: { frequencyMhz: 7.1 } } as unknown as PredictionResult;

function comparison(): SecondModelComparison {
  const labels = ["7.10 MHz (asked)", ...HF_BANDS.map((band) => band.label)];
  const side = (open: boolean, signal: number) => ({ open, mufMhz: 10, fieldDbuV: 5, signalDbw: signal, snrDbHz: 30, noiseDbwHz: -150 });
  return {
    key: "c1",
    cached: false,
    computedAt: 0,
    basis: { kind: "recent-solar", ssn: 83, summary: "", tableDate: null, tableAgeDays: null, ssnLow: null, ssnHigh: null },
    distanceKm: 162.4,
    antennas: "Isotropic, 0 dBi, at both ends, for both models",
    requiredSnrDbHz: 45,
    noise: { label: "Urban (city, industrial)", p533: "CITY" },
    rows: labels.map((label, i) => ({
      label,
      mhz: i,
      hoursAgreeOnOpen: 23,
      hoursOpenInBoth: 10,
      signalDifferenceDb: { min: -8, max: -4 },
    })),
    hours: Array.from({ length: 24 }, (_, h) => ({
      utc: h + 1,
      cells: labels.map((_label, i) => ({
        mhz: i,
        voacap: { ...side(h === 11 || h > 12, -110), reliability: 0.6 },
        p533: { ...side(h > 12, -116), basicCircuitReliabilityPercent: 41, operationalMufMhz: 12 },
        difference: { mufMhz: 0.2, fieldDb: -6, signalDb: -6, snrDb: -6 },
        agreeOnOpen: h !== 11,
      })),
    })),
    engines: {
      voacap: { model: "VOACAP Version 16.1207W", sha256: "a".repeat(64), implementation: "hfcast", licence: "Apache-2.0" },
      p533: {
        model: "Recommendation ITU-R P.533-14",
        sha256: "e".repeat(64),
        implementation: "ITURHFProp",
        licence: "Not an open-source licence.",
      },
    } as never,
    datasets: [{ id: "p533-maps", version: "1" }],
    notes: [...SECOND_MODEL_NOTES],
  };
}

function show(statusBody: SecondModelStatus, compare: () => Promise<Response> | Response) {
  const posted: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, code = 200) =>
        new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
      if (init?.method === "POST") {
        posted.push(pathname);
        if (pathname.endsWith("/compare")) return compare();
        return json({ download: { id: "d1" } });
      }
      if (pathname === "/api/radio/propagation/second-model") return json(statusBody);
      if (pathname === "/api/storage/locations")
        return json({ locations: [{ id: "l1", name: "Here", status: "available", isDefault: true }] });
      return json({}, 404);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <SecondModel result={result} hour={12} onHour={() => {}} />
    </QueryClientProvider>,
  );
  return posted;
}

describe("comparing with a second model", () => {
  it("is not offered without the maps, says in one line what to get and how big, and fetches only when pressed", async () => {
    const posted = show(status(false), () => new Response("{}"));
    expect(await screen.findByText(/download the ITU's P.533 maps \(137 MB\)/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Compare with a second model (ITU P.533)" })).toBeNull();
    expect(posted).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /Download the P.533 maps/ }));
    await waitFor(() => expect(posted).toEqual(["/api/radio/propagation/second-model/maps/download"]));
  });

  it("says the maps are on their way while they download", async () => {
    show(status(false, { downloading: true }), () => new Response("{}"));
    expect(await screen.findByText(/The maps are downloading/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Download the P.533 maps/ })).toBeNull();
  });

  it("runs only when asked, and shows that it is running", async () => {
    const posted = show(status(true), () => new Promise<Response>(() => {}));
    const button = await screen.findByRole("button", { name: "Compare with a second model (ITU P.533)" });
    expect(posted).toEqual([]);
    fireEvent.click(button);
    expect(await screen.findByText("Running both models for this path…")).toBeTruthy();
    expect(posted).toEqual(["/api/radio/propagation/second-model/compare"]);
  });

  it("shows both models side by side, isotropic, each under its own name, with the difference", async () => {
    show(status(true), () => new Response(JSON.stringify(comparison()), { headers: { "content-type": "application/json" } }));
    fireEvent.click(await screen.findByRole("button", { name: "Compare with a second model (ITU P.533)" }));
    expect(await screen.findByText("Both models with isotropic antennas, 0 dBi")).toBeTruthy();
    expect(screen.getByText(/Neither model is the right answer/)).toBeTruthy();
    const hourTable = screen.getByRole("table", { name: "At 12:00 UTC, each model's own figures" });
    // Reliability and P.533's basic circuit reliability are separate columns, never one under the other's name.
    expect(within(hourTable).getByRole("columnheader", { name: "VOACAP reliability" })).toBeTruthy();
    expect(within(hourTable).getByRole("columnheader", { name: "P.533 basic circuit reliability" })).toBeTruthy();
    const asked = within(hourTable).getByRole("rowheader", { name: "7.10 MHz (asked)" }).closest("tr")!;
    expect(asked.textContent).toContain("Open / Shut");
    expect(asked.textContent).toContain("−110.0 / −116.0");
    // Open in one model only: no difference of signal is given for that hour.
    expect(asked.textContent).not.toContain("−6.0");
    expect(asked.textContent).toContain("60% of days");
    expect(asked.textContent).toContain("41%");
    const grid = screen.getByRole("table", { name: /Open or shut by hour/ });
    expect(within(grid).getAllByText("open in VOACAP only").length).toBeGreaterThan(0);
    expect(within(grid).getAllByText("−8.0 to −4.0 dB").length).toBe(1 + HF_BANDS.length);
  });

  it("says P.533 gave no answer when it fails, and that the VOACAP prediction is not affected", async () => {
    show(
      status(true),
      () =>
        new Response(
          JSON.stringify({
            error: { code: "bad_request", message: "P.533 could not work this out: P.533 takes a sunspot number from 1 to 311." },
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Compare with a second model (ITU P.533)" }));
    expect(await screen.findByText("P.533 gave no answer")).toBeTruthy();
    expect(screen.getByText(/sunspot number from 1 to 311/).textContent).toContain("is VOACAP's and is not affected");
  });
});
