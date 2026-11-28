/**
 * Road routes on the Maps screen: the words round the server's lines, the directions as
 * the owner writes them, the condensed plain text, the panel in each of its states, and
 * the printed route card.
 */
import type { RoadCoverageCountry, RoadCoverageResponse, RoadCrossingDto, RoadNetworksResponse, RoadRouteResult } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contentText } from "@/features/print-kit";
import { DirectionsList } from "./directions";
import { roadRouteData } from "./layers";
import { PlainTextBox } from "./plain-text";
import { RoadRoutePanel } from "./road-route-panel";
import { routeCardDocument } from "./route-card";
import { routeOverlay } from "./route-map";
import { addRoadsLink, missingTitle, namesText, progressText } from "./route-needs";
import { CHANNEL_TRIP } from "./test-route";
import { crossingOptions, endLine, legLines, startLine, suggestedName } from "./words";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const OWNER_STYLE = [
  "M25",
  "M20 - Folkestone",
  "Eurotunnel, Folkestone – Calais",
  "A26 (E17) - Reims (A4)",
  "Via Reims",
  "A26 (E17) - Troyes",
  "A5 (E17 - E54)",
  "A31 - Dijon",
  "A39 - Genève",
  "A40 (E21 E62) - Geneve",
  "A40 (E25) - Chamonix",
  "N205 - Chamonix",
];

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const show = (ui: ReactElement) =>
  render(
    <QueryClientProvider client={client()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("the words round the lines", () => {
  it("starts at the door and ends with local roads", () => {
    expect(startLine(CHANNEL_TRIP)).toEqual({ role: "start", title: "Leatherhead", detail: "Join the A24" });
    expect(endLine(CHANNEL_TRIP)).toEqual({ role: "end", title: "Chamonix", detail: "Leave the N205, then local roads" });
    const far: RoadRouteResult = {
      ...CHANNEL_TRIP,
      snapped: CHANNEL_TRIP.snapped.map((point, index) => (index === 0 ? { ...point, distanceM: 1200 } : point)),
    };
    expect(startLine(far)?.detail).toBe("Local roads to the A24, about 1.2 km");
  });

  it("names a route by its ends and via points", () => {
    expect(suggestedName(CHANNEL_TRIP)).toBe("Leatherhead to Chamonix, via Reims");
  });

  it("offers any crossing, Eurotunnel, then each ferry by name, and says which cannot be reached", () => {
    const crossing = (change: Partial<RoadCrossingDto>): RoadCrossingDto => ({
      id: "way/1",
      kind: "ferry",
      name: "Dover (UK) - Calais (F)",
      operator: "P&O Ferries",
      durationS: 5400,
      durationSource: "tagged",
      lengthM: 40_000,
      ends: [
        [1.3, 51.1],
        [1.8, 50.9],
      ],
      joined: true,
      ...change,
    });
    const options = crossingOptions([
      crossing({ id: "eurotunnel", kind: "shuttle", name: "Eurotunnel Le Shuttle (Folkestone – Calais)" }),
      crossing({}),
      crossing({ id: "way/2", name: "Portsmouth - Caen", joined: false }),
    ]);
    expect(options.map((option) => [option.value, option.label, Boolean(option.disabled)])).toEqual([
      ["any", "Any", false],
      ["eurotunnel", "Eurotunnel", false],
      ["way/1", "Dover (UK) - Calais (F)", false],
      ["way/2", "Portsmouth - Caen", true],
    ]);
  });

  it("names the countries a route needs together, and says where one on its way stands in Map data's words", () => {
    expect(missingTitle([{ name: "France", state: "missing" }])).toBe("France has no roads yet");
    expect(
      missingTitle([
        { name: "France", state: "missing" },
        { name: "Switzerland", state: "missing" },
      ]),
    ).toBe("France and Switzerland have no roads yet");
    expect(missingTitle([{ name: "France", state: "part" }])).toBe("Only part of France has roads");
    expect(namesText(["France", "Italy", "Switzerland"])).toBe("France, Italy and Switzerland");
    expect(addRoadsLink(["FR", "CH"])).toBe("/maps/data?add=1&kinds=roads&countries=FR,CH");
    expect(addRoadsLink([])).toBe("/maps/data");
    const on = { jobId: "d1", name: "France", state: "running", message: null };
    expect(progressText({ ...on, phase: "downloading", receivedBytes: 1.2e9, totalBytes: 4.9e9, etaSeconds: 1080 })).toBe(
      "Downloading 1.2 of 4.9 GB, 18 min left",
    );
    expect(progressText({ ...on, phase: "downloading", receivedBytes: 412e6, totalBytes: 4.9e9, etaSeconds: null })).toBe(
      "Downloading 0.4 of 4.9 GB",
    );
    expect(progressText({ ...on, phase: "waiting" })).toBe("Waiting");
    expect(progressText({ ...on, phase: "building", message: null })).toBe("Building");
    expect(progressText({ ...on, phase: "failed", error: "The connection dropped" })).toBe("Failed: The connection dropped. Add it again");
  });

  it("cuts the drawn line into each leg's part, the crossing its own", () => {
    const parts = legLines(CHANNEL_TRIP);
    expect(parts).toHaveLength(CHANNEL_TRIP.legs.length);
    CHANNEL_TRIP.legs.forEach((leg, index) => {
      if (leg.kind === "via") {
        expect(parts[index]).toEqual([]);
        return;
      }
      const line = parts[index]!.flat();
      expect(line.length).toBeGreaterThanOrEqual(2);
      const close = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01;
      expect(close(line[0]!, leg.start), `${leg.title} starts where it should`).toBe(true);
      expect(close(line.at(-1)!, leg.end), `${leg.title} ends where it should`).toBe(true);
    });
    // On the map: the crossing dashed (its own kind), the points named.
    const data = roadRouteData(CHANNEL_TRIP, 2);
    const crossing = data.features.filter((feature) => feature.properties.kind === "crossing");
    expect(crossing.length).toBeGreaterThan(0);
    expect(crossing.every((feature) => feature.properties.selected === true)).toBe(true);
    expect(data.features.filter((feature) => feature.properties.kind === "point").map((feature) => feature.properties.label)).toEqual([
      "Start",
      "Via 1",
      "End",
    ]);
  });
});

describe("the directions", () => {
  it("are each road's line in bold exactly as written, the detail under it, a crossing in its own band", async () => {
    const onLeg = vi.fn();
    show(<DirectionsList route={CHANNEL_TRIP} selected={null} onLeg={onLeg} />);
    const list = screen.getByRole("list", { name: "Directions" });
    const rows = within(list).getAllByRole("listitem");
    // Start, the twelve lines (with the via point), the end.
    expect(rows).toHaveLength(OWNER_STYLE.length + 2);
    expect(rows[0]).toHaveTextContent("StartLeatherheadJoin the A24");
    expect(rows.at(-1)).toHaveTextContent("EndChamonixLeave the N205, then local roads");
    for (const title of OWNER_STYLE) expect(within(list).getByText(title)).toBeInTheDocument();
    expect(within(list).getByText("M25")).toHaveClass("font-bold");
    expect(within(list).getByText(/^Anticlockwise, join at J9 \(Leatherhead\)/)).toHaveClass("text-ink-muted");
    const crossing = within(list).getByRole("button", { name: /Eurotunnel, Folkestone – Calais/ });
    expect(crossing).toHaveTextContent("Crossing");
    expect(crossing.closest("li")).toHaveClass("bg-surface");
    // A via point is a band, not a button.
    expect(within(list).queryByRole("button", { name: /Via Reims/ })).toBeNull();
    await userEvent.click(within(list).getByRole("button", { name: /A26 \(E17\) - Troyes/ }));
    expect(onLeg).toHaveBeenCalledWith(5);
  });
});

describe("the condensed plain text", () => {
  it("is 48 characters wide at most, copies, and takes the accents off when asked", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    vi.stubGlobal("isSecureContext", true);
    show(<PlainTextBox route={CHANNEL_TRIP} />);
    const box = screen.getByLabelText("The route as plain text") as HTMLTextAreaElement;
    const lines = box.value.split("\n");
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(48);
    expect(lines[0]).toBe("Leatherhead to Chamonix");
    expect(box.value).toContain("A39 - Genève");
    expect(box.value).not.toMatch(/receipt/i);
    await userEvent.click(screen.getByLabelText(/Plain letters only/));
    expect(box.value).toContain("A39 - Geneve");
    expect(box.value).not.toContain("Genève");
    expect(/^[\x20-\x7e\n]*$/.test(box.value)).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(box.value));
  });
});

// ── The panel ───────────────────────────────────────────────────────────────

const credit = CHANNEL_TRIP.credit;
const network = {
  id: "n1",
  regionId: "great-britain",
  name: "Great Britain",
  country: "GB",
  dataDate: "2026-11-20",
  builtAt: Date.parse("2026-11-21"),
  sizeBytes: 30_000_000,
  nodes: 10,
  edges: 10,
  crossings: 3,
  extract: { kept: false, locationId: null, relPath: null, bytes: 0 },
  source: "https://download.geofabrik.de/europe/great-britain-latest.osm.pbf",
  bbox: null,
  northernIreland: false,
  available: true,
};

interface Sent {
  path: string;
  body: unknown;
}
let sent: Sent[] = [];

const country = (code: string, name: string, state: RoadCoverageCountry["state"], more: Partial<RoadCoverageCountry> = {}) => ({
  code,
  name,
  state,
  regionId: null,
  parts: [],
  dataDate: null,
  progress: null,
  ...more,
});
/** Leatherhead to Chamonix with both countries' roads kept: over the Channel. */
const BOTH_READY: RoadCoverageResponse = {
  points: [{ country: "GB" }, { country: "FR" }],
  countries: [country("GB", "United Kingdom", "ready"), country("FR", "France", "ready")],
  seaCrossing: true,
};

function serve(handlers: {
  networks?: RoadNetworksResponse;
  route?: (body: unknown) => unknown;
  coverage?: (body: { points: unknown[] }) => RoadCoverageResponse;
}) {
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).split("?")[0];
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      if (init?.method === "POST") sent.push({ path: path!, body });
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
      try {
        if (path === "/api/roads/networks") return json(handlers.networks ?? { networks: [network], building: [], credit });
        if (path === "/api/roads/crossings") return json({ crossings: [] });
        if (path === "/api/roads/coverage") return json(handlers.coverage?.(body as { points: unknown[] }) ?? BOTH_READY);
        if (path === "/api/roads/routes" && init?.method === "POST")
          return json({ id: "r1", name: (body as { name: string }).name, fromTo: "Leatherhead to Chamonix", route: CHANNEL_TRIP });
        if (path === "/api/roads/routes") return json({ routes: [] });
        if (path === "/api/roads/route") return json(handlers.route?.(body) ?? CHANNEL_TRIP);
      } catch (failure) {
        if (failure instanceof Response) return failure;
        throw failure;
      }
      return json({ error: { code: "not_found", message: "Not found." } }, 404);
    }),
  );
}

const fail = (status: number, message: string, details?: unknown) =>
  new Response(JSON.stringify({ error: { code: "bad_request", message, details } }), {
    status,
    headers: { "content-type": "application/json" },
  });

const LEATHERHEAD = { id: "m1", name: "Leatherhead", lat: 51.296, lon: -0.33 };
const CHAMONIX = { id: "m2", name: "Chamonix", lat: 45.9237, lon: 6.8694 };
const markers = [LEATHERHEAD, CHAMONIX].map((marker) => ({
  ...marker,
  note: "",
  color: "teal" as const,
  icon: "pin" as never,
  isFavorite: false,
  noteId: null,
  createdAt: 0,
  updatedAt: 0,
}));

function panel() {
  const props = {
    onClose: vi.fn(),
    onShow: vi.fn(),
    onNeedMap: vi.fn(),
    onOpenNetworks: vi.fn(),
    onOpenStreets: vi.fn(),
    onIntentHandled: vi.fn(),
  };
  const engine = { getCenter: () => ({ lat: 49, lon: 2 }), fitBounds: vi.fn() };
  show(<RoadRoutePanel engine={engine} markers={markers} intent={null} {...props} />);
  return { ...props, engine };
}

/** Chooses a saved place for a point, from the list shown before anything is typed. */
async function choosePlace(label: string, name: string) {
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.click(within(screen.getByRole("list", { name: "Saved places" })).getByRole("button", { name: name }));
}

describe("the road route panel", () => {
  it("with no roads kept, still shows the form and says what happens once the ends are chosen", async () => {
    serve({ networks: { networks: [], building: [], credit } });
    panel();
    expect(
      await screen.findByText("Choose where from and where to. Outpost then says which countries' roads it needs."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan route" })).toBeEnabled();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    // No country is offered before the route says which: never the home country.
    expect(screen.queryByRole("button", { name: /^Add roads for/ })).toBeNull();
  });

  it("names the country a route has no roads for before Plan route, and adds exactly that one", async () => {
    serve({
      networks: { networks: [network], building: [], credit },
      coverage: () => ({
        points: [{ country: "GB" }, { country: "FR" }],
        countries: [country("GB", "Great Britain", "ready"), country("FR", "France", "missing")],
        seaCrossing: true,
      }),
    });
    const { onOpenNetworks } = panel();
    await screen.findByRole("button", { name: "Plan route" });
    await choosePlace("From", "Leatherhead");
    await choosePlace("To", "Chamonix");
    expect(await screen.findByText("France has no roads yet")).toBeInTheDocument();
    expect(screen.getByText("This route runs through France. Great Britain is ready.")).toBeInTheDocument();
    expect(screen.getByText("Asks the size first. Needs a connection once.")).toBeInTheDocument();
    const plan = screen.getByRole("button", { name: "Plan route" });
    expect(plan).toBeDisabled();
    expect(plan).toHaveAccessibleDescription("Add France first");
    await userEvent.click(screen.getByRole("button", { name: "Add roads for France" }));
    expect(onOpenNetworks).toHaveBeenCalledWith(["FR"]);
    expect(sent.filter((each) => each.path === "/api/roads/coverage").at(-1)?.body).toEqual({
      points: [
        { lat: 51.296, lon: -0.33 },
        { lat: 45.9237, lon: 6.8694 },
      ],
    });
    expect(sent.some((each) => each.path === "/api/roads/route")).toBe(false);
  });

  it("names several countries together, with one press for all of them", async () => {
    serve({
      networks: { networks: [], building: [], credit },
      coverage: () => ({
        points: [{ country: "FR" }, { country: "CH" }],
        countries: [country("FR", "France", "missing"), country("CH", "Switzerland", "missing")],
        seaCrossing: false,
      }),
    });
    const { onOpenNetworks } = panel();
    await screen.findByRole("button", { name: "Plan route" });
    await choosePlace("From", "Leatherhead");
    await choosePlace("To", "Chamonix");
    expect(await screen.findByText("France and Switzerland have no roads yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan route" })).toHaveAccessibleDescription("Add France and Switzerland first");
    await userEvent.click(screen.getByRole("button", { name: "Add roads for France and Switzerland" }));
    expect(onOpenNetworks).toHaveBeenCalledWith(["FR", "CH"]);
  });

  it("shows a country's roads on their way with real progress, once, then says it is ready and lets the route be planned", async () => {
    let state: "downloading" | "ready" = "downloading";
    const downloading = {
      jobId: "d1",
      name: "France",
      state: "running",
      message: null,
      country: "FR",
      regionId: "france",
      phase: "downloading" as const,
      receivedBytes: 1.2e9,
      totalBytes: 4.9e9,
      etaSeconds: 1080,
    };
    serve({
      networks: { networks: [network], building: [downloading, downloading], credit },
      coverage: () => ({
        points: [{ country: "GB" }, { country: "FR" }],
        countries: [
          country("GB", "United Kingdom", "ready"),
          state === "ready" ? country("FR", "France", "ready") : country("FR", "France", "downloading", { progress: downloading }),
        ],
        seaCrossing: true,
      }),
    });
    panel();
    await screen.findByRole("button", { name: "Plan route" });
    await choosePlace("From", "Leatherhead");
    await choosePlace("To", "Chamonix");
    expect(await screen.findByText("Downloading 1.2 of 4.9 GB, 18 min left", { exact: false })).toBeInTheDocument();
    // One download, said once, with Offline maps' own progress.
    expect(screen.getAllByText(/Downloading 1\.2 of 4\.9 GB/)).toHaveLength(1);
    expect(screen.getByText("You can leave this screen.")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progress of Routes for France" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add roads for/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Plan route" })).toHaveAccessibleDescription("Wait for France");
    state = "ready";
    expect(await screen.findByText("France is ready.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan route" })).toBeEnabled();
  });

  it("asks about a sea crossing only when the route crosses the sea", async () => {
    let sea = false;
    serve({
      coverage: () => ({
        points: [{ country: "FR" }, { country: "FR" }],
        countries: [country("FR", "France", "ready")],
        seaCrossing: sea,
      }),
    });
    const view = panel();
    await screen.findByRole("button", { name: "Plan route" });
    expect(screen.queryByText("Crossing the Channel")).toBeNull();
    await choosePlace("From", "Leatherhead");
    await choosePlace("To", "Chamonix");
    await waitFor(() => expect(sent.some((each) => each.path === "/api/roads/coverage")).toBe(true));
    expect(screen.queryByLabelText("Sea crossing")).toBeNull();
    // Over water: the choice is there.
    sea = true;
    cleanup();
    void view;
    panel();
    await screen.findByRole("button", { name: "Plan route" });
    await choosePlace("From", "Leatherhead");
    await choosePlace("To", "Chamonix");
    expect(await screen.findByText("Sea crossing")).toBeInTheDocument();
    expect(screen.queryByText("Crossing the Channel")).toBeNull();
  });

  it("asks for a start and an end before planning", async () => {
    serve({});
    panel();
    await userEvent.click(await screen.findByRole("button", { name: "Plan route" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a start and an end.");
    expect(sent.filter((each) => each.path === "/api/roads/route")).toEqual([]);
  });

  it("plans from the points in order, says it is planning, then shows the lines and saves the route", async () => {
    let answer: (value: unknown) => void = () => {};
    serve({});
    vi.stubGlobal(
      "fetch",
      ((original) =>
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input) === "/api/roads/route") {
            sent.push({ path: "/api/roads/route", body: JSON.parse(String(init?.body)) });
            await new Promise((resolve) => (answer = resolve));
            return new Response(JSON.stringify(CHANNEL_TRIP), { status: 200, headers: { "content-type": "application/json" } });
          }
          return original(input, init);
        }))(globalThis.fetch as typeof fetch),
    );
    const { onShow, engine } = panel();
    await screen.findByRole("button", { name: "Plan route" });
    await choosePlace("From", "Leatherhead");
    await userEvent.click(screen.getByRole("button", { name: "Add a via point" }));
    await userEvent.click(screen.getByRole("button", { name: "Via 1: the middle of the map" }));
    await choosePlace("To", "Chamonix");
    await userEvent.click(screen.getByRole("button", { name: "Plan route" }));
    expect(await screen.findByText("Planning the route on the roads kept for routes.")).toBeInTheDocument();
    expect(sent.find((each) => each.path === "/api/roads/route")?.body).toEqual({
      points: [
        { lat: 51.296, lon: -0.33, name: "Leatherhead" },
        { lat: 49, lon: 2, name: "Point at 49.0000, 2.0000" },
        { lat: 45.9237, lon: 6.8694, name: "Chamonix" },
      ],
      crossing: "any",
      units: "km",
    });
    answer(null);
    expect(await screen.findByRole("heading", { name: "Leatherhead to Chamonix" })).toBeInTheDocument();
    for (const title of OWNER_STYLE) expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    expect(onShow).toHaveBeenLastCalledWith(CHANNEL_TRIP, null);
    expect(engine.fitBounds).toHaveBeenCalled();
    // A line shows that leg on the map.
    await userEvent.click(screen.getByRole("button", { name: /M20 - Folkestone/ }));
    expect(onShow).toHaveBeenLastCalledWith(CHANNEL_TRIP, 1);
    // Saved under the name given.
    const name = screen.getByLabelText("Name to save it under");
    expect(name).toHaveValue("Leatherhead to Chamonix, via Reims");
    await userEvent.clear(name);
    await userEvent.type(name, "Alps by the tunnel");
    await userEvent.click(screen.getByRole("button", { name: "Save route" }));
    await waitFor(() =>
      expect(sent.find((each) => each.path === "/api/roads/routes")?.body).toEqual({ name: "Alps by the tunnel", route: CHANNEL_TRIP }),
    );
  });

  it("says what went wrong when a route cannot be planned, and adds the countries the server names", async () => {
    serve({
      route: () => {
        throw fail(400, "“Chamonix” is more than 40 km from any main road kept for France: only Nord-Pas-de-Calais is kept.", {
          missing: [],
          far: [{ index: 1, name: "Chamonix", country: { code: "FR", name: "France", regionId: "france" }, distanceM: 40_000 }],
          reason: "point",
        });
      },
    });
    const { onOpenNetworks } = panel();
    await screen.findByRole("button", { name: "Plan route" });
    await choosePlace("From", "Leatherhead");
    await choosePlace("To", "Chamonix");
    await userEvent.click(screen.getByRole("button", { name: "Plan route" }));
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("The route could not be planned");
    expect(notice).toHaveTextContent("more than 40 km from any main road kept for France");
    await userEvent.click(within(notice).getByRole("button", { name: "Add roads for all of France" }));
    expect(onOpenNetworks).toHaveBeenCalledWith(["FR"]);
    expect(within(notice).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("the printed route card", () => {
  it("has the overview first, then the lines as written with distance and time, the notes and the credit", () => {
    const doc = routeCardDocument({
      route: CHANNEL_TRIP,
      name: "Alps by the tunnel",
      paper: "a4",
      map: { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>', width: 500, missing: null },
      made: new Date(CHANNEL_TRIP.plannedAt),
    });
    const text = contentText(doc.content);
    expect(text).toContain("Alps by the tunnel");
    expect(text).toContain("Leatherhead, via Reims, to Chamonix");
    for (const title of OWNER_STYLE) expect(text).toContain(title.replace("–", "–"));
    expect(text).toContain("Start: Leatherhead");
    expect(text).toContain("End: Chamonix");
    expect(text).toContain("Planned in advance, not live");
    expect(text).toContain("22 November 2026");
    expect(text).toContain("Check the signs and closures");
    expect(text).toContain("© OpenStreetMap contributors");
    expect(text).toContain("249 km");
    expect(text).toContain("2 h 26 min");
    expect(doc.pageSize).toEqual({ width: 595.28, height: 841.89 });
    const letter = routeCardDocument({ route: CHANNEL_TRIP, name: "x", paper: "letter", map: null, made: new Date() });
    expect(letter.pageSize).toEqual({ width: 612, height: 792 });
  });

  it("draws the route over the overview map bold, the crossing dashed, and names the points and the crossing", () => {
    const svg = routeOverlay(CHANNEL_TRIP, ([lon, lat]) => [lon * 10, -lat * 10]);
    expect(svg).toContain('stroke-dasharray="5 3"');
    expect(svg).toContain('stroke-width="3"');
    expect(svg).toContain("Start: Leatherhead");
    expect(svg).toContain("Via 1: Reims");
    expect(svg).toContain("End: Chamonix");
    expect(svg).toContain("Eurotunnel");
  });
});
