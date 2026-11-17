/**
 * The screen's states with a small set of made-up entries in place of the bundled one:
 * loading, failing to load, nothing matching, a kind chosen by the address, the home
 * place's country chosen first, an entry opened to its source and date, and a schedule
 * shown as expired after its last day.
 */
import type { FrequencyEntry } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const source = { publisher: "NIST", title: "Radio station WWV", url: "https://www.nist.gov/wwv", checked: "2026-11-17" };
const ENTRIES: FrequencyEntry[] = [
  {
    id: "ts-wwv",
    kind: "time-signals",
    name: "WWV, NIST time signal station",
    what: "The time from Colorado.",
    expect: "Ticks each second and a voice each minute.",
    frequencies: [{ khz: 5000 }, { khz: 10_000 }],
    modes: ["AM"],
    bands: ["sfts"],
    where: ["US", "world"],
    hours: "Continuous",
    layout: ["A tick each second; the 29th and 59th are left out."],
    status: "on-air",
    sources: [source],
  },
  {
    id: "ts-msf",
    kind: "time-signals",
    name: "MSF, NPL time signal",
    what: "The UK's time signal.",
    expect: "A code for clocks.",
    frequencies: [{ khz: 60 }],
    modes: ["TIME-CODE-DIGITAL"],
    bands: ["lf"],
    where: ["GB"],
    status: "on-air",
    sources: [{ ...source, publisher: "NPL", url: "https://www.npl.co.uk/msf", checked: "2026-11-16" }],
  },
  {
    id: "bc-sw-old",
    kind: "broadcasters",
    name: "A broadcaster on shortwave",
    what: "News.",
    expect: "News in English.",
    frequencies: [{ khz: 9410 }],
    modes: ["AM"],
    bands: ["sw-31m"],
    where: ["itu-1"],
    schedule: { season: "A26", from: "2026-03-29", until: "2026-10-24" },
    status: "on-air",
    sources: [source],
  },
];

let load: () => Promise<{ entries: FrequencyEntry[]; guides: [] }> = async () => ({ entries: ENTRIES, guides: [] });
vi.mock("./bundled", () => ({ bundled: () => load() }));

import FrequenciesPage from "./frequencies-page";

let markers: unknown[] = [];
beforeEach(() => {
  load = async () => ({ entries: ENTRIES, guides: [] });
  markers = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = String(url).includes("/api/maps/markers")
        ? { markers }
        : String(url).includes("/api/reference/catalogue")
          ? { countries: [{ code: "GB", name: "United Kingdom", bbox: [-8.7, 49.8, 1.8, 60.9] }] }
          : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <FrequenciesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rows = () => screen.queryAllByTestId("frequency-row").map((row) => row.getAttribute("data-entry"));

describe("Frequencies to listen to", () => {
  it("shows that it is loading, then the list with the day the set was last checked", async () => {
    let release: (() => void) | undefined;
    load = () => new Promise((resolve) => (release = () => resolve({ entries: ENTRIES, guides: [] })));
    renderAt("/radio/frequencies");
    expect(screen.getByRole("heading", { level: 1, name: "Frequencies to listen to" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading the frequencies" })).toBeInTheDocument();
    await vi.waitFor(() => expect(release).toBeDefined());
    release!();
    expect(await screen.findByText("Last checked 17 November 2026")).toBeInTheDocument();
    expect(screen.getByText(/shortwave schedules change twice a year/)).toBeInTheDocument();
    expect(rows()).toEqual(["ts-wwv", "ts-msf", "bc-sw-old"]);
  });

  it("says when the list could not be loaded", async () => {
    load = () => Promise.reject(new Error("The server did not answer."));
    renderAt("/radio/frequencies");
    expect(await screen.findByText("This could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("The server did not answer.")).toBeInTheDocument();
  });

  it("opens on one kind from the address", async () => {
    renderAt("/radio/frequencies?kind=time-signals");
    await screen.findByText("Last checked 17 November 2026");
    expect(rows()).toEqual(["ts-wwv", "ts-msf"]);
    expect(screen.getByText("2 entries of 3")).toBeInTheDocument();
  });

  it("starts from the home place's country, and can show every place", async () => {
    markers = [
      {
        id: "h",
        name: "Home",
        note: "",
        lat: 51.5,
        lon: -0.12,
        color: "teal",
        icon: "home",
        isFavorite: false,
        noteId: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    renderAt("/radio/frequencies?kind=time-signals");
    expect(await screen.findByText(/Starting from United Kingdom, where your home place is/)).toBeInTheDocument();
    // WWV is heard worldwide and MSF is the UK's: both apply. The broadcaster is not a time signal.
    expect(rows()).toEqual(["ts-msf", "ts-wwv"]);
    fireEvent.click(screen.getByRole("button", { name: "Show every place" }));
    expect(screen.queryByText(/Starting from United Kingdom/)).not.toBeInTheDocument();
  });

  it("finds by frequency, and says when nothing matches with a way back", async () => {
    renderAt("/radio/frequencies?q=9410");
    await screen.findByText("Last checked 17 November 2026");
    expect(rows()).toEqual(["bc-sw-old"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nothing like this" } });
    expect(await screen.findByText("Nothing matches")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear the filters" }));
    expect(rows()).toHaveLength(3);
  });

  it("opens an entry to show the rest, with its source and the day it was checked; the frequencies are text", async () => {
    renderAt("/radio/frequencies");
    await screen.findByText("Last checked 17 November 2026");
    const row = screen.getAllByTestId("frequency-row")[0]!;
    expect(within(row).getByText("5000 kHz")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "WWV, NIST time signal station" }));
    const detail = within(row).getByTestId("frequency-detail");
    expect(within(detail).getByText("A tick each second; the 29th and 59th are left out.")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: "https://www.nist.gov/wwv" })).toHaveAttribute("href", "https://www.nist.gov/wwv");
    expect(within(detail).getAllByText(/17 November 2026/).length).toBeGreaterThan(0);
  });

  it("shows a schedule as expired after its last day", async () => {
    renderAt("/radio/frequencies?kind=broadcasters");
    await screen.findByText("Last checked 17 November 2026");
    const row = screen.getAllByTestId("frequency-row")[0]!;
    expect(within(row).getByText("Schedule expired")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "A broadcaster on shortwave" }));
    expect(within(row).getByText(/Schedule for A26 ran out on 24 October 2026/)).toBeInTheDocument();
  });

  it("leaves out what could not be checked, says so, and shows it when asked", async () => {
    load = async () => ({
      entries: [...ENTRIES, { ...ENTRIES[1]!, id: "ts-unchecked", name: "A station not checked", status: "not-verified" as const }],
      guides: [],
    });
    renderAt("/radio/frequencies");
    await screen.findByText("Last checked 17 November 2026");
    expect(rows()).not.toContain("ts-unchecked");
    expect(screen.getByText(/1 entry could not be checked against a primary source and is left out/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show them" }));
    expect(rows()).toContain("ts-unchecked");
    expect(screen.getAllByText("Not verified against a primary source").length).toBeGreaterThan(0);
  });

  it("offers the list as a PDF, with Save as PDF and Add to library", async () => {
    renderAt("/radio/frequencies?kind=time-signals");
    await screen.findByText("Last checked 17 November 2026");
    fireEvent.click(screen.getByRole("button", { name: "Make a PDF" }));
    const dialog = await screen.findByRole("dialog", { name: "This list as a PDF" });
    expect(within(dialog).getByText(/2 entries: Time signals/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Add to library/ })).toBeInTheDocument();
    expect(within(dialog).getByText(/Save as PDF/)).toBeInTheDocument();
  });
});
