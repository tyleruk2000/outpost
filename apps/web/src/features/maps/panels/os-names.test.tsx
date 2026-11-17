import type { OsNamesCheck, PlaceDto, PlacesDataset } from "@outpost/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { download, fakeServer, installBrowserStubs, location, renderScreen } from "@/features/downloads/test-support";
import { buildSearchResults } from "../lib/search";
import { OsNamesSection } from "./os-names";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

const STATEMENT = "Contains OS data © Crown Copyright and database rights 2026";

const held = (over: Partial<PlacesDataset> = {}): PlacesDataset => ({
  id: "c1",
  name: "Place names for Great Britain (OS Open Names, October 2026)",
  dataset: "os-open-names",
  countries: ["GB"],
  count: 2_956_719,
  sizeBytes: 103_312_081,
  installedAt: 1,
  source: "os",
  edition: "2026-10",
  roads: true,
  credit: STATEMENT,
  locationName: "This computer",
  available: true,
  ...over,
});

const check = (over: Partial<OsNamesCheck> = {}): OsNamesCheck => ({
  edition: "2026-10",
  editionLabel: "October 2026",
  sizeBytes: 103_312_081,
  md5: "bba5aa44ba375d39de60584099e335cd",
  fileName: "opname_csv_gb.zip",
  host: "api.os.uk",
  installed: null,
  updateAvailable: false,
  checkedAt: 1,
  ...over,
});

describe("Place names for Great Britain", () => {
  it("asks nothing of Ordnance Survey until Check the size is pressed, then says the size and where it comes from", async () => {
    installBrowserStubs();
    const server = fakeServer({
      "POST /api/maps/places/os-names/check": check(),
      "GET /api/storage/locations": { roots: ["/srv"], locations: [location()] },
      "POST /api/maps/places/os-names": { download: download({ kind: "places" }) },
    });
    renderScreen(<OsNamesSection datasets={[]} downloads={[]} />);
    expect(screen.getByText(/Northern Ireland, the Isle of Man and the Channel Islands are not covered/)).toBeInTheDocument();
    expect(server.calls.filter((call) => call.includes("os-names"))).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Check the size" }));
    await screen.findByRole("button", { name: "Download 103 MB" });
    expect(document.body).toHaveTextContent(/October 2026 edition, a 103 MB download from api\.os\.uk\. Once read it takes about 5\d\d MB/);

    // Leaving streets out says how much smaller it is.
    await userEvent.click(screen.getByRole("checkbox", { name: /Include streets and road numbers/ }));
    expect(document.body).toHaveTextContent(/takes about 3\d\d MB/);

    await userEvent.click(await screen.findByRole("button", { name: "Download 103 MB" }));
    await waitFor(() => expect(server.calls).toContain("POST /api/maps/places/os-names"));
    const sent = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/api/maps/places/os-names"))!;
    expect(JSON.parse(String(sent[1]!.body))).toEqual({ locationId: "loc1", roads: false });
  });

  it("says plainly when Ordnance Survey cannot be reached, and tries again", async () => {
    fakeServer({
      "POST /api/maps/places/os-names/check": {
        status: 503,
        error: {
          code: "offline",
          message: "Outpost could not reach Ordnance Survey. Checking for place names needs an internet connection.",
        },
      },
    });
    renderScreen(<OsNamesSection datasets={[]} downloads={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Check the size" }));
    expect(await screen.findByText(/could not reach Ordnance Survey/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });

  it("shows a download on its way with its progress", () => {
    renderScreen(
      <OsNamesSection
        datasets={[]}
        downloads={[
          download({ kind: "places", title: "Place names for Great Britain (OS Open Names, October 2026)", state: "running" }),
          download({ id: "other", kind: "places", title: "Place names: GB in detail" }),
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Place names for Great Britain on their way" });
    expect(list).toHaveTextContent("OS Open Names, October 2026");
    expect(list).not.toHaveTextContent("GB in detail");
    expect(screen.queryByRole("button", { name: "Check the size" })).not.toBeInTheDocument();
  });

  it("shows the edition held, credits OS, offers a newer edition and removes it with one press", async () => {
    installBrowserStubs();
    const server = fakeServer({
      "POST /api/maps/places/os-names/check": check({
        edition: "2027-01",
        editionLabel: "January 2027",
        installed: { id: "c1", edition: "2026-10", editionLabel: "October 2026" },
        updateAvailable: true,
      }),
      "GET /api/storage/locations": { roots: ["/srv"], locations: [location()] },
      "DELETE /api/maps/places/datasets/c1": { ok: true },
    });
    renderScreen(<OsNamesSection datasets={[held({ available: false })]} downloads={[]} />);
    expect(screen.getByText("OS Open Names, October 2026 edition").closest("li")).toHaveTextContent("2,956,719 names, 103 MB file");
    expect(screen.getByText(/Not connected; search still works/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(STATEMENT))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Check for a newer edition" }));
    await screen.findByRole("button", { name: "Update to January 2027" });
    expect(document.body).toHaveTextContent(/A newer edition is out: January 2027 edition/);
    expect(document.body).toHaveTextContent(/replaces the edition you have/);
    expect(await screen.findByRole("button", { name: "Update to January 2027" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Remove Place names for Great Britain/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Remove place names" }));
    await waitFor(() => expect(server.calls).toContain("DELETE /api/maps/places/datasets/c1"));
  });

  it("says when the edition held is the newest", async () => {
    fakeServer({
      "POST /api/maps/places/os-names/check": check({ installed: { id: "c1", edition: "2026-10", editionLabel: "October 2026" } }),
    });
    renderScreen(<OsNamesSection datasets={[held()]} downloads={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Check for a newer edition" }));
    expect(await screen.findByText(/You have the newest edition \(October 2026\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Download|^Update/ })).not.toBeInTheDocument();
  });
});

describe("OS place names in the search list", () => {
  it("says what each is and where, in OS's words for the area", () => {
    const place = (over: Partial<PlaceDto>): PlaceDto => ({
      id: 1,
      source: "os",
      name: "SY23 3BY",
      country: "GB",
      admin1: "Aberystwyth, Ceredigion, Wales",
      featureCode: "os:Postcode",
      kindLabel: "Postcode",
      lat: 52.41,
      lon: -4.08,
      population: 0,
      elevation: null,
      ...over,
    });
    const results = buildSearchResults({
      query: "sy233by",
      coordinate: null,
      places: [place({}), place({ id: 2, name: "Ben Nevis", kindLabel: "Hill or mountain", admin1: "Highland, Scotland" })],
      markers: [],
      tracks: [],
      center: null,
    });
    expect(results.map((result) => [result.title, result.detail])).toEqual([
      ["SY23 3BY", "Postcode · Aberystwyth, Ceredigion, Wales"],
      ["Ben Nevis", "Hill or mountain · Highland, Scotland"],
    ]);
  });
});
