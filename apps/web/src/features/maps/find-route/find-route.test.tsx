import type {
  Bbox,
  RoutePreview,
  RouteSearchResponse,
  RouteSearchResult,
  RouteSourcesResponse,
  TrackDto,
  TrackSource,
  TrackWithGeometryDto,
} from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type FindRouteMap, FindRoutePanel } from "./find-route-panel";
import { anyFoundRoute, FoundRouteFacts, foundRouteSource } from "./source-credit";
import { continuity, continuityNote, isStale, PREVIEW_TRACK_ID, previewTrack, resultSummary, searchBlocker, whereFrom } from "./words";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const credit: TrackSource = {
  provider: "openstreetmap",
  attribution: "© OpenStreetMap contributors",
  license: "Open Database Licence (ODbL) 1.0",
  licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
  creditUrl: "https://www.openstreetmap.org/copyright",
  url: "https://www.openstreetmap.org/relation/9001",
  element: "relation 9001",
  relationId: 9001,
  wayIds: [],
  fetchedAt: "2026-11-16T10:00:00.000Z",
  dataAsOf: "2026-11-15T21:22:28Z",
  server: "routes.example.org",
};

const result = (change: Partial<RouteSearchResult> = {}): RouteSearchResult => ({
  key: "r9001",
  ref: { type: "relation", id: 9001 },
  name: "Kestrel Ridge Path",
  otherNames: [],
  kind: "walking",
  network: "local",
  from: null,
  to: null,
  lengthMeters: 3413,
  bounds: [-3.105, 54.5, -3.09, 54.523],
  wayCount: null,
  ...change,
});

const preview = (change: Partial<RoutePreview> = {}): RoutePreview => ({
  token: "token-1",
  expiresAt: Date.now() + 900_000,
  ref: { type: "relation", id: 9001 },
  name: "Kestrel Ridge Path",
  otherNames: [],
  kind: "walking",
  lines: [
    [
      [-3.1, 54.5],
      [-3.1, 54.504],
    ],
    [
      [-3.0931, 54.5192],
      [-3.09, 54.523],
    ],
  ],
  lengthMeters: 3060,
  pointCount: 4,
  wayCount: 2,
  bounds: [-3.105, 54.5, -3.09, 54.523],
  gaps: 1,
  largestGapMeters: 146,
  branches: 0,
  alternatives: {
    lines: [
      [
        [-3.1, 54.504],
        [-3.104, 54.506],
      ],
    ],
    lengthMeters: 844,
  },
  sections: [],
  skipped: { points: 0, unusableWays: 0 },
  dataAsOf: "2026-11-15T21:22:28Z",
  source: { id: "example", name: "Example", host: "routes.example.org" },
  credit,
  ...change,
});

const sources: RouteSourcesResponse = {
  defaultId: "example",
  problems: [],
  sources: [
    {
      id: "example",
      name: "Example",
      host: "routes.example.org",
      operator: "an example association",
      coverage: "The whole world",
      bbox: null,
      termsUrl: "https://routes.example.org/terms",
      data: {
        name: "OpenStreetMap",
        attribution: "© OpenStreetMap contributors",
        license: "Open Database Licence (ODbL) 1.0",
        licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
        url: "https://www.openstreetmap.org/copyright",
      },
    },
  ],
};

// ── Words ───────────────────────────────────────────────────────────────────

describe("what the view says", () => {
  const centre = { lat: 54.49, lon: -3.15 };

  it("says what a result is, how far-reaching, and where it lies from the middle of the map", () => {
    expect(resultSummary(result(), centre)).toBe("Walking route · local · 4.15 km north-east of the map centre");
    expect(resultSummary(result({ kind: "path", network: null, wayCount: 3 }), null)).toBe("Named path, 3 ways");
    expect(resultSummary(result({ kind: "cycling", network: "national", bounds: null }), centre)).toBe("Cycle route · national");
    expect(whereFrom(centre, [-3.151, 54.489, -3.149, 54.491])).toBe("At the map centre");
  });

  it("says why Search would do nothing", () => {
    const valley: Bbox = [-3.3, 54.4, -3, 54.6];
    const country: Bbox = [-6, 50, 2, 56];
    expect(searchBlocker("", "view", valley)).toBeNull();
    expect(searchBlocker("Kestrel", "view", valley)).toBeNull();
    expect(searchBlocker("Kestrel", "anywhere", country)).toBeNull();
    expect(searchBlocker("", "anywhere", valley)).toBe("Type a name to search for it anywhere.");
    expect(searchBlocker("ab", "view", valley)).toBe("Type at least 3 letters of the name.");
    expect(searchBlocker("?!…", "view", valley)).toBe("Type at least 3 letters of the name.");
    expect(searchBlocker("Kestrel", "view", country)).toBe(
      "This view is too wide to search. Zoom in to about a day's walk across, or search by name anywhere.",
    );
    expect(searchBlocker("Kestrel", "view", null)).toBe("The map is not ready yet.");
  });

  it("says how whole a line is, and that gaps are left open", () => {
    expect(continuity(preview({ lines: [[[0, 0]]], gaps: 0, branches: 0 }))).toBe("One unbroken line");
    expect(continuity(preview())).toBe("2 lines: 1 gap (the widest 146 m)");
    expect(continuity(preview({ lines: [[], [], []], gaps: 1, branches: 1 }))).toBe("3 lines: 1 gap (the widest 146 m) and 1 branch");
    expect(continuity(preview({ lines: [[], [], []], gaps: 0, branches: 2 }))).toBe("3 lines: 2 branches");
    expect(continuityNote(preview())).toContain("never joined with a straight line");
    expect(continuityNote(preview({ gaps: 0, branches: 0 }))).toBeNull();
  });

  it("notices a copy of the map that is months old", () => {
    const now = Date.parse("2026-11-16T12:00:00Z");
    expect(isStale("2026-07-28T02:16:18Z", now)).toBe(true);
    expect(isStale("2026-11-15T21:22:28Z", now)).toBe(false);
    expect(isStale(null, now)).toBe(false);
    expect(isStale("not a date", now)).toBe(false);
  });

  it("draws a preview as separate lines, with the alternative legs only when asked", () => {
    const drawn = previewTrack(preview(), false);
    expect(drawn.id).toBe(PREVIEW_TRACK_ID);
    expect(drawn.geojson.features).toHaveLength(2);
    expect(previewTrack(preview(), true).geojson.features).toHaveLength(3);
  });
});

// ── A route's own panel ─────────────────────────────────────────────────────

describe("the credit a found route keeps", () => {
  const geojson = (source: unknown): TrackWithGeometryDto["geojson"] =>
    ({ type: "FeatureCollection", features: [], source }) as TrackWithGeometryDto["geojson"];

  it("is read from the route, and anything that is not exactly a credit is no credit", () => {
    expect(foundRouteSource(geojson(credit))).toEqual(credit);
    expect(foundRouteSource(geojson(undefined))).toBeNull();
    expect(foundRouteSource(geojson({ ...credit, provider: "somewhere-else" }))).toBeNull();
    expect(foundRouteSource(geojson({ ...credit, attribution: 7 }))).toBeNull();
    // The only links a credit may carry are OpenStreetMap's own pages and the licence's.
    expect(foundRouteSource(geojson({ ...credit, url: "javascript:alert(1)" }))?.url).toBeNull();
    expect(foundRouteSource(geojson({ ...credit, url: "https://www.openstreetmap.org.example.net/relation/9001" }))?.url).toBeNull();
    expect(foundRouteSource(geojson({ ...credit, url: "https://www.openstreetmap.org/relation/9001/../../login" }))?.url).toBeNull();
    expect(foundRouteSource(geojson({ ...credit, creditUrl: "javascript:alert(1)" }))).toBeNull();
    expect(foundRouteSource(geojson({ ...credit, creditUrl: "https://example.net/copyright" }))).toBeNull();
    expect(foundRouteSource(geojson({ ...credit, licenseUrl: "https://example.net/licence" }))).toBeNull();
    expect(anyFoundRoute([{ geojson: geojson(undefined) }, { geojson: geojson(credit) }])).toBe(true);
    expect(anyFoundRoute([{ geojson: geojson(undefined) }])).toBe(false);
  });

  it("is shown with the route: what it is in OpenStreetMap, when it was fetched, and the licence", () => {
    render(
      <dl>
        <FoundRouteFacts source={credit} />
      </dl>,
    );
    expect(screen.getByRole("link", { name: "OpenStreetMap relation 9001" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/relation/9001",
    );
    expect(screen.getByText("fetched 16 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("from routes.example.org")).toBeInTheDocument();
    expect(screen.getByText("as the map was on 15 Nov 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "© OpenStreetMap contributors" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
    expect(screen.getByRole("link", { name: "Open Database Licence (ODbL) 1.0" })).toHaveAttribute(
      "href",
      "https://opendatacommons.org/licenses/odbl/1-0/",
    );
  });
});

// ── The view ────────────────────────────────────────────────────────────────

interface Sent {
  path: string;
  body: unknown;
}
let sent: Sent[] = [];

/** Answers the view's requests. Each handler may throw a response to fail the request. */
function serve(handlers: { search?: (body: unknown) => unknown; preview?: (body: unknown) => unknown; add?: (body: unknown) => unknown }) {
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      if (init?.method === "POST") sent.push({ path, body });
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
      try {
        if (path === "/api/maps/route-sources") return json(declared);
        if (path === "/api/maps/route-search") return json(handlers.search?.(body) ?? found([]));
        if (path === "/api/maps/route-search/preview") return json(handlers.preview?.(body) ?? preview());
        if (path === "/api/maps/route-search/add") return json(handlers.add?.(body) ?? {});
      } catch (failure) {
        if (failure instanceof Response) return failure;
        throw failure;
      }
      return json({ error: { code: "not_found", message: "Not found." } }, 404);
    }),
  );
}

const fail = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ error: { code, message } }), { status, headers: { "content-type": "application/json" } });

const found = (results: RouteSearchResult[], change: Partial<RouteSearchResponse> = {}): RouteSearchResponse => ({
  results,
  truncated: false,
  dataAsOf: "2026-11-15T21:22:28Z",
  source: { id: "example", name: "Example", host: "routes.example.org" },
  includedPaths: true,
  ...change,
});

/** What `GET /api/maps/route-sources` answers; a test may put its own list here. */
let declared: RouteSourcesResponse = sources;

function show(view: Bbox = [-3.3, 54.4, -3, 54.6]) {
  const map: FindRouteMap = {
    getBounds: () => view,
    getCenter: () => ({ lat: (view[1] + view[3]) / 2, lon: (view[0] + view[2]) / 2 }),
    fitBounds: vi.fn(),
    on: () => () => true,
  };
  const props = { onClose: vi.fn(), onPreview: vi.fn(), onAdded: vi.fn(), onNeedMap: vi.fn() };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view_ = render(
    <QueryClientProvider client={client}>
      <FindRoutePanel engine={map} terrain={null} {...props} />
    </QueryClientProvider>,
  );
  return { map, ...props, ...view_ };
}

afterEach(() => {
  declared = sources;
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("finding a route", () => {
  it("says which server a search goes to before anything is sent, and sends nothing until Search is pressed", async () => {
    serve({});
    show();
    const note = await screen.findByText(/Search sends this name and the edges of the map view to/);
    expect(note).toHaveTextContent(
      "Search sends this name and the edges of the map view to routes.example.org (an example association), which answers from OpenStreetMap. It needs the internet. A route you add is kept here and works offline.",
    );
    expect(screen.getByRole("link", { name: "The server's terms" })).toHaveAttribute("href", "https://routes.example.org/terms");
    await userEvent.type(screen.getByLabelText("Name of the route"), "Kestrel");
    // Typing asks nobody: there is no search-as-you-type.
    expect(sent).toEqual([]);
  });

  it("asks the server for this part of the map unless the person chose another, and remembers their choice", async () => {
    const world = sources.sources[0]!;
    const europe = {
      ...world,
      id: "europe",
      name: "Europe server",
      host: "europe.example.org",
      coverage: "Europe only",
      bbox: [-11, 36, 32, 71.5] as Bbox,
    };
    declared = { sources: [world, europe], defaultId: null, problems: [] };
    serve({});
    const inEurope = show();
    expect(await screen.findByText(/Search sends this name and the edges of the map view to/)).toHaveTextContent(
      "to europe.example.org (an example association), which answers from OpenStreetMap. It knows: Europe only.",
    );
    inEurope.unmount();

    // Somewhere the regional server does not know: the one that is asked about anywhere.
    const elsewhere = show([170, -43.7, 170.2, -43.5]);
    expect(await screen.findByText(/Search sends this name and the edges of the map view to/)).toHaveTextContent("to routes.example.org (");
    await userEvent.click(screen.getByRole("button", { name: "Change server" }));
    await userEvent.click(screen.getByRole("combobox", { name: "Server to ask" }));
    await userEvent.click(await screen.findByRole("option", { name: /Europe server/ }));
    expect(screen.getByText(/Search sends this name and the edges of the map view to/)).toHaveTextContent("to europe.example.org (");
    elsewhere.unmount();

    // The choice is kept for next time, wherever the map is.
    show([170, -43.7, 170.2, -43.5]);
    expect(await screen.findByText(/Search sends this name and the edges of the map view to/)).toHaveTextContent("to europe.example.org (");
  });

  it("searches the map view by name, lists what was found, and shows the chosen route on the map", async () => {
    serve({
      search: () =>
        found([
          result(),
          result({
            key: "w21-22",
            ref: { type: "ways", ids: [21, 22] },
            name: "Heron Beck Track",
            kind: "path",
            network: null,
            lengthMeters: 766,
            wayCount: 2,
          }),
        ]),
    });
    const { map, onPreview, onNeedMap } = show();
    await userEvent.type(await screen.findByLabelText("Name of the route"), "kestrel{Enter}");
    expect(await screen.findByText("2 results. OpenStreetMap as it was on 15 Nov 2026")).toBeInTheDocument();
    expect(sent).toEqual([
      { path: "/api/maps/route-search", body: { sourceId: "example", text: "kestrel", bbox: [-3.3, 54.4, -3, 54.6] } },
    ]);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("3.41 km")).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/^Walking route · local · \d\.\d\d km east of the map centre$/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/^Named path, 2 ways/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Kestrel Ridge Path/ }));
    expect(await screen.findByText("2 lines: 1 gap (the widest 146 m)")).toBeInTheDocument();
    expect(sent[1]).toEqual({ path: "/api/maps/route-search/preview", body: { sourceId: "example", ref: { type: "relation", id: 9001 } } });
    expect(screen.getByText(/The gaps are left open, never joined with a straight line/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OpenStreetMap relation 9001" })).toBeInTheDocument();
    expect(screen.getByText(/No terrain is installed where this route runs/)).toBeInTheDocument();
    expect(map.fitBounds).toHaveBeenCalledWith([-3.105, 54.5, -3.09, 54.523]);
    expect(onNeedMap).toHaveBeenCalled();
    await waitFor(() => expect(onPreview.mock.lastCall?.[0]?.geojson.features).toHaveLength(2));

    // The alternative leg is drawn, and will be added, only when asked for.
    await userEvent.click(screen.getByRole("checkbox", { name: /Also add its alternative leg/ }));
    await waitFor(() => expect(onPreview.mock.lastCall?.[0]?.geojson.features).toHaveLength(3));
  });

  it("adds the previewed route without fetching it again, and hands it over to be opened", async () => {
    const track = { id: "t1", name: "Kestrel Ridge Path" } as TrackDto;
    serve({ search: () => found([result()]), add: () => ({ track, elevation: "none" }) });
    const { onAdded, onPreview, unmount } = show();
    await userEvent.type(await screen.findByLabelText("Name of the route"), "kestrel{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: /Kestrel Ridge Path/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Add to my routes" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(track));
    expect(sent.map((request) => request.path)).toEqual([
      "/api/maps/route-search",
      "/api/maps/route-search/preview",
      "/api/maps/route-search/add",
    ]);
    expect(sent[2]!.body).toEqual({ token: "token-1", includeAlternatives: false });
    // Leaving the view takes the preview off the map.
    unmount();
    expect(onPreview).toHaveBeenLastCalledWith(null);
  });

  it("fetches the route again when the server no longer holds its preview, and says only that", async () => {
    const track = { id: "t1", name: "Kestrel Ridge Path" } as TrackDto;
    let previews = 0;
    serve({
      search: () => found([result()]),
      preview: () => {
        previews += 1;
        return preview({ token: `token-${previews}` });
      },
      // The server may have let the preview go for more than one reason: time, room for newer ones, or a restart.
      add: (body) => {
        if ((body as { token: string }).token === "token-1") {
          throw fail(409, "conflict", "That preview is no longer held. Choose the route again to fetch it afresh, then add it.");
        }
        return { track, elevation: "none" };
      },
    });
    const { onAdded } = show();
    await userEvent.type(await screen.findByLabelText("Name of the route"), "kestrel{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: /Kestrel Ridge Path/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Add to my routes" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        "Outpost was no longer holding that preview, so the route is being fetched again. Add it once it is back.",
      ),
    );
    await waitFor(() => expect(previews).toBe(2));
    expect(onAdded).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Add to my routes" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(track));
    expect(sent.at(-1)!.body).toEqual({ token: "token-2", includeAlternatives: false });
  });

  it("lists the routes in the view when no name is given, and will not search a view that is too wide", async () => {
    serve({ search: () => found([result()], { includedPaths: false }) });
    const first = show();
    await userEvent.click(await screen.findByRole("button", { name: "Search" }));
    await screen.findByText(/^1 result/);
    expect(sent[0]!.body).toEqual({ sourceId: "example", bbox: [-3.3, 54.4, -3, 54.6] });
    first.unmount();

    serve({});
    show([-6, 50, 2, 56]);
    // A wide view starts on "Anywhere", which needs a name.
    expect(await screen.findByText("Type a name to search for it anywhere.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "This map view" }));
    expect(
      screen.getByText("This view is too wide to search. Zoom in to about a day's walk across, or search by name anywhere."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Anywhere" }));
    await userEvent.type(screen.getByLabelText("Name of the route"), "Kestrel{Enter}");
    await waitFor(() => expect(sent).toHaveLength(1));
    // Searching anywhere sends the name and not the map view.
    expect(sent[0]!.body).toEqual({ sourceId: "example", text: "Kestrel" });
    expect(await screen.findByText(/Search sends this name to/)).toBeInTheDocument();
  });

  it("says plainly when there is no connection, and when the source is busy", async () => {
    let failure = fail(
      503,
      "offline",
      "Outpost could not reach routes.example.org. Finding a route needs an internet connection; the routes already on your map do not.",
    );
    serve({
      search: () => {
        throw failure.clone();
      },
    });
    show();
    await userEvent.type(await screen.findByLabelText("Name of the route"), "kestrel{Enter}");
    const offline = await screen.findByRole("status", { name: "" }).catch(() => null);
    expect(offline).not.toBeNull();
    expect(await screen.findByText("No connection")).toBeInTheDocument();
    expect(screen.getByText(/Finding a route needs an internet connection; the routes already on your map do not\./)).toBeInTheDocument();

    failure = fail(
      502,
      "upstream",
      "routes.example.org is busy and turned the search away. Outpost will wait 30 seconds before asking it again.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("The search did not work")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Outpost will wait 30 seconds before asking it again.");
  });

  it("says when nothing was found, and offers to look anywhere", async () => {
    serve({ search: (body) => found((body as { bbox?: Bbox }).bbox ? [] : [result()]) });
    show();
    await userEvent.type(await screen.findByLabelText("Name of the route"), "kestrel{Enter}");
    expect(await screen.findByText("Nothing called “kestrel” was found in this map view.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Search anywhere for it" }));
    expect(await screen.findByRole("button", { name: /Kestrel Ridge Path/ })).toBeInTheDocument();
    expect(sent[1]!.body).toEqual({ sourceId: "example", text: "kestrel" });
  });

  it("offers the sections of a long route kept as sections, each to be looked at by itself", async () => {
    const section = result({
      key: "r9002",
      ref: { type: "relation", id: 9002 },
      name: "Kestrel Way, northern section",
      lengthMeters: null,
    });
    serve({
      search: () => found([result({ key: "r9100", ref: { type: "relation", id: 9100 }, name: "Kestrel Way" })]),
      preview: (body) =>
        (body as { ref: { id: number } }).ref.id === 9100
          ? preview({
              token: "",
              ref: { type: "relation", id: 9100 },
              name: "Kestrel Way",
              lines: [],
              gaps: 0,
              alternatives: { lines: [], lengthMeters: 0 },
              sections: [section],
            })
          : preview({ ref: { type: "relation", id: 9002 }, name: "Kestrel Way, northern section" }),
    });
    const { onPreview } = show();
    await userEvent.type(await screen.findByLabelText("Name of the route"), "kestrel way{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: /Kestrel Way/ }));
    expect(await screen.findByText(/keeps this route as 1 section, not as one line/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to my routes" })).not.toBeInTheDocument();
    expect(onPreview).toHaveBeenLastCalledWith(null);
    await userEvent.click(screen.getByRole("button", { name: /northern section/ }));
    expect(await screen.findByRole("button", { name: "Add to my routes" })).toBeInTheDocument();
    // Back goes to the route it is a section of, without asking for it again.
    await userEvent.click(screen.getByRole("button", { name: "Kestrel Way" }));
    expect(await screen.findByText(/keeps this route as 1 section/)).toBeInTheDocument();
    expect(sent.filter((request) => request.path.endsWith("/preview"))).toHaveLength(2);
  });
});
