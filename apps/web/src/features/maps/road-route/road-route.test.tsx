/**
 * Road routes on the Maps screen: the words round the server's lines, the directions as
 * the owner writes them, the condensed plain text, the panel in each of its states, and
 * the printed route card.
 */
import type { RoadCrossingDto, RoadNetworksResponse, RoadRouteResult } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contentText } from "@/features/print-kit";
import { DirectionsList } from "./directions";
import { roadRouteData } from "./layers";
import { PlainTextBox } from "./plain-text";
import { RoadNetworksSection } from "./road-networks";
import { RoadRoutePanel } from "./road-route-panel";
import { routeCardDocument } from "./route-card";
import { routeOverlay } from "./route-map";
import { CHANNEL_TRIP } from "./test-route";
import { crossingOptions, endLine, legLines, startLine, suggestedName, wantsANetwork } from "./words";

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

  it("knows an error that a road network would put right", () => {
    expect(wantsANetwork("No road network is installed for Switzerland, where “Zürich” is: install it from Road networks.")).toBe(true);
    expect(wantsANetwork("“Chamonix” is more than 40 km from a main road in the networks installed (France).")).toBe(false);
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
  available: true,
};

interface Sent {
  path: string;
  body: unknown;
}
let sent: Sent[] = [];

function serve(handlers: { networks?: RoadNetworksResponse; route?: (body: unknown) => unknown }) {
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

const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { code: "bad_request", message } }), { status, headers: { "content-type": "application/json" } });

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
  it("with no networks installed, says so and leads to installing one", async () => {
    serve({ networks: { networks: [], building: [], credit } });
    const { onOpenNetworks } = panel();
    expect(await screen.findByRole("heading", { name: "No roads for routes yet" })).toBeInTheDocument();
    expect(screen.getByText(/a one-off download from Geofabrik, after which planning works offline/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Add roads for/ }));
    expect(onOpenNetworks).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Plan route" })).toBeNull();
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
    expect(await screen.findByText("Planning the route on the road networks installed.")).toBeInTheDocument();
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

  it("says what went wrong when a route cannot be planned, and leads to a missing network", async () => {
    serve({
      route: () => {
        throw fail(400, "No road network is installed for Switzerland, where “Zürich” is: install it from Road networks.");
      },
    });
    const { onOpenNetworks } = panel();
    await screen.findByRole("button", { name: "Plan route" });
    await choosePlace("From", "Leatherhead");
    await choosePlace("To", "Chamonix");
    await userEvent.click(screen.getByRole("button", { name: "Plan route" }));
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("The route could not be planned");
    expect(notice).toHaveTextContent("No road network is installed for Switzerland");
    await userEvent.click(within(notice).getByRole("button", { name: "Add a road network" }));
    expect(onOpenNetworks).toHaveBeenCalled();
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

describe("the road networks in Offline maps", () => {
  it("offers the countries the downloaded map areas cover first, says what the download is, and adds one", async () => {
    sent = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input).split("?")[0];
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
        if (init?.method === "POST") sent.push({ path: path!, body });
        const json = (value: unknown) =>
          new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
        if (path === "/api/roads/networks" && init?.method === "POST") return json({ downloadId: "d1", jobId: null });
        if (path === "/api/roads/networks") return json({ networks: [], building: [], credit });
        if (path === "/api/roads/countries") return json({ countries: ["FR"] });
        if (path === "/api/downloads") return json({ downloads: [], historyTotal: 0 });
        if (path === "/api/jobs") return json({ jobs: [] });
        if (path === "/api/reference/regions")
          return json({
            held: true,
            readAt: Date.parse("2026-11-20"),
            source: "https://download.geofabrik.de",
            suggested: [],
            regions: [
              { id: "france", name: "France", country: "FR", parent: null, depth: 0 },
              { id: "alsace", name: "Alsace", country: "FR", parent: "france", depth: 1 },
              { id: "great-britain", name: "Great Britain", country: "GB", parent: null, depth: 0 },
            ],
          });
        return new Response("{}", { status: 404 });
      }),
    );
    const region = {
      id: "c1",
      regionId: null,
      name: "Calais",
      tileType: "vector" as const,
      bounds: [1.6, 50.8, 2.2, 51.1] as [number, number, number, number],
      minZoom: 0,
      maxZoom: 14,
      sizeBytes: 1,
      sourceBuild: null,
      installedAt: 0,
      locationId: "l1",
      locationName: "Internal storage",
      available: true,
      status: "installed" as const,
    };
    const onAddingChange = vi.fn();
    const view = show(<RoadNetworksSection mapRegions={[region]} adding={false} onAddingChange={onAddingChange} />);
    expect(await screen.findByText(/a one-off download from Geofabrik \(OpenStreetMap data, under the ODbL\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add a road network" }));
    expect(onAddingChange).toHaveBeenCalledWith(true);
    view.unmount();
    show(<RoadNetworksSection mapRegions={[region]} adding onAddingChange={onAddingChange} />);
    const first = await screen.findByRole("region", { name: "For the map areas you have downloaded" });
    expect(within(first).getByText("The whole of France")).toBeInTheDocument();
    expect(within(first).queryByText("The whole of Great Britain")).toBeNull();
    expect(screen.getByText(/2\.2 GB\s+for Great Britain/)).toBeInTheDocument();
    expect(sent.find((each) => each.path === "/api/roads/countries")?.body).toEqual({ boxes: [[1.6, 50.8, 2.2, 51.1]] });
    await userEvent.click(within(first).getByRole("button", { name: "Add France" }));
    await waitFor(() => expect(sent.find((each) => each.path === "/api/roads/networks")?.body).toEqual({ regionId: "france" }));
  });
});
