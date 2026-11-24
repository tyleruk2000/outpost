/**
 * Plan a route's ways of travelling and the streets they need: nothing to choose where the
 * streets service is not installed, a calm line with the step that puts it right where a way
 * cannot be used yet, the owner's lines with the turns at each end folded in for door to
 * door, a walk's short list, the plain text and the printed card; reachable areas' legend
 * and words; and building streets, said plainly before it starts.
 */
import type { RoadCoverageCountry, RoadCoverageResponse, StreetsEstimate, StreetsStatusResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contentText } from "@/features/print-kit";
import { StreetsNotInstalled, WalkDetails, walkCostLine } from "../data-page/streets-build";
import { PRINT_OVERLAYS } from "../print/overlays";
import { reachData, reachSentence, setReachShown } from "../reach/reach-map";
import { useReach } from "../reach/reach-tool";
import { streetsRouteData } from "./layers";
import { RoadRoutePanel } from "./road-route-panel";
import { routeCardDocument } from "./route-card";
import { endTurnsTitle, reachTimeText, streetsAsPlainText, turnsSummary } from "./street-words";
import { DOOR_TRIP, NO_STREETS, NOT_INSTALLED, REACH_MAIN_ROADS, READY, WALK } from "./test-streets";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

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
  setReachShown(null);
});

const country = (code: string, name: string, state: RoadCoverageCountry["state"]): RoadCoverageCountry => ({
  code,
  name,
  state,
  regionId: null,
  parts: [],
  dataDate: null,
  progress: null,
});
const COVERAGE_GB: RoadCoverageResponse = {
  points: [{ country: "GB" }],
  countries: [country("GB", "United Kingdom", "ready")],
  seaCrossing: false,
};

let sent: Array<{ path: string; body: unknown }> = [];
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

function serve(status: StreetsStatusResponse, answers: Record<string, unknown> = {}) {
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).split("?")[0]!;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      if (init?.method === "POST") sent.push({ path, body });
      if (init?.method === "POST" && `POST ${path}` in answers) return json(answers[`POST ${path}`]);
      if (path in answers) return json(answers[path]);
      if (path === "/api/streets/status") return json(status);
      if (path === "/api/roads/networks") return json({ networks: [{ id: "n1", name: "Great Britain", country: "GB" }], building: [] });
      if (path === "/api/roads/crossings") return json({ crossings: [] });
      if (path === "/api/roads/coverage") return json(COVERAGE_GB);
      if (path === "/api/roads/routes") return json({ routes: [] });
      if (path === "/api/storage/locations")
        return json({
          roots: [],
          locations: [
            { id: "sd", name: "This device", kind: "internal", status: "available", freeBytes: 80e9, isDefault: true },
            { id: "nas", name: "NAS", kind: "network", status: "available", freeBytes: 900e9, isDefault: false },
          ],
        });
      return json({ error: { code: "not_found", message: "Not found." } }, 404);
    }),
  );
}

const markers = [
  { id: "m1", name: "Fetcham", lat: 51.2905, lon: -0.3555 },
  { id: "m2", name: "Chamonix", lat: 45.9237, lon: 6.8694 },
].map((marker) => ({
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

async function choosePlace(label: string, name: string) {
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.click(within(screen.getByRole("list", { name: "Saved places" })).getByRole("button", { name }));
}

describe("ways of travelling", () => {
  it("offers no choice where the streets service is not installed, and says once how to add it", async () => {
    serve(NOT_INSTALLED);
    panel();
    expect(await screen.findByRole("heading", { name: "Directions" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Plan route" });
    expect(await screen.findByText(/come with an optional add-on for the streets/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How to turn it on" })).toHaveAttribute(
      "href",
      "/help/road-routes#h-door-to-door-walking-and-cycling",
    );
    expect(screen.queryByRole("radiogroup", { name: "Way of travelling" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Walk" })).toBeNull();
  });

  it("says in one line why a way cannot be used yet, with the step that puts it right", async () => {
    serve(NO_STREETS);
    const { onOpenStreets } = panel();
    const ways = await screen.findByRole("radiogroup", { name: "Way of travelling" });
    for (const name of ["Drive", "Door to door", "Walk", "Cycle"]) expect(within(ways).getByRole("radio", { name })).toBeInTheDocument();
    await userEvent.click(within(ways).getByRole("radio", { name: "Walk" }));
    expect(screen.getByText("Walking routes need street detail, built once on this device.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Plan route" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add walking and cycling" }));
    expect(onOpenStreets).toHaveBeenCalled();
    // Drive still plans on the main roads, as before.
    await userEvent.click(within(ways).getByRole("radio", { name: "Drive" }));
    expect(await screen.findByRole("button", { name: "Plan route" })).toBeInTheDocument();
  });

  it("says a build under way, with its step", async () => {
    serve({
      ...NO_STREETS,
      build: {
        jobId: "j1",
        state: "building",
        stage: "tiles",
        stageLabel: "Building the streets",
        step: { at: 3, of: 5 },
        message: null,
        startedAt: 1,
        expectedMs: 3_600_000,
      },
    });
    panel();
    await userEvent.click(
      within(await screen.findByRole("radiogroup", { name: "Way of travelling" })).getByRole("radio", { name: "Cycle" }),
    );
    expect(screen.getByText(/Street detail is being built on this device, step 3 of 5/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See its progress" })).toBeInTheDocument();
  });
});

describe("door to door", () => {
  it("plans with the owner's lines, the turns at each end folded under them", async () => {
    serve(READY, { "/api/streets/route": DOOR_TRIP });
    const { onShow } = panel();
    await userEvent.click(
      within(await screen.findByRole("radiogroup", { name: "Way of travelling" })).getByRole("radio", { name: "Door to door" }),
    );
    await choosePlace("From", "Fetcham");
    await choosePlace("To", "Chamonix");
    await userEvent.click(screen.getByRole("button", { name: "Plan route" }));
    expect(await screen.findByRole("heading", { name: "Leatherhead to Chamonix" })).toBeInTheDocument();
    expect(sent.find((each) => each.path === "/api/streets/route")?.body).toEqual({
      points: [
        { lat: 51.2905, lon: -0.3555, name: "Fetcham" },
        { lat: 45.9237, lon: 6.8694, name: "Chamonix" },
      ],
      mode: "drive-door",
      units: "km",
      crossing: "any",
    });
    expect(onShow).toHaveBeenLastCalledWith(DOOR_TRIP, null);
    const directions = screen.getByRole("list", { name: "Directions" });
    for (const title of ["M25", "M20 - Folkestone", "N205 - Chamonix"])
      expect(within(directions).getAllByText(title).length).toBeGreaterThan(0);
    // The ends, folded: what they are and how many turns.
    const start = within(directions).getByTestId("door-start");
    expect(start).toHaveTextContent("From your door to the A24");
    expect(start).toHaveTextContent("2 turns, 2.1 km");
    expect(start).not.toHaveAttribute("open");
    await userEvent.click(within(start).getByText("From your door to the A24"));
    expect(start).toHaveAttribute("open");
    expect(within(start).getByRole("button", { name: /Turn left onto Guildford Road \(B2122\)/ })).toBeVisible();
    expect(within(directions).getByTestId("door-end")).toHaveTextContent("From the N205 to your door");
    // And in the plain text, 48 characters a line at most.
    const text = (screen.getByLabelText("The route as plain text") as HTMLTextAreaElement).value;
    expect(text).toContain("From your door to the A24 (2 turns, 2.1 km)");
    expect(text).toContain("  Turn left onto Guildford Road (B2122), 800 m");
    expect(text).toContain("M20 - Folkestone");
    expect(Math.max(...text.split("\n").map((each) => each.length))).toBeLessThanOrEqual(48);
  });

  it("names the ends and counts their turns", () => {
    expect(endTurnsTitle(DOOR_TRIP, "start")).toBe("From your door to the A24");
    expect(endTurnsTitle(DOOR_TRIP, "end")).toBe("From the N205 to your door");
    expect(turnsSummary(DOOR_TRIP.end!, "km")).toBe("1 turn, 0.7 km");
  });

  it("draws the streets thinner than the main roads, and prints the turns on the card", () => {
    const data = streetsRouteData(DOOR_TRIP, null);
    expect(data.features.filter((each) => each.properties?.kind === "street")).toHaveLength(2);
    expect(data.features.some((each) => each.properties?.kind === "road")).toBe(true);
    const card = contentText(
      routeCardDocument({ route: DOOR_TRIP, name: "To the Alps", paper: "a4", map: null, made: new Date(0) }).content,
    );
    expect(card).toContain("From your door to the A24 (2 turns, 2.1 km)");
    expect(card).toContain("At the roundabout, take the 2nd exit onto Leatherhead Road (A24)");
    expect(card).toContain("M20 - Folkestone");
    expect(card).toContain("routed by Valhalla");
  });
});

describe("a walk", () => {
  it("is a short list of plain turns", async () => {
    serve(READY, { "/api/streets/route": WALK });
    panel();
    await userEvent.click(
      within(await screen.findByRole("radiogroup", { name: "Way of travelling" })).getByRole("radio", { name: "Walk" }),
    );
    await choosePlace("From", "Fetcham");
    await choosePlace("To", "Chamonix");
    await userEvent.click(screen.getByRole("button", { name: "Plan route" }));
    const list = await screen.findByRole("list", { name: "Directions" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((each) => each.textContent),
    ).toEqual([
      "Take the steps40 m",
      "Turn left onto Church Street (B2450)600 m",
      "Continue onto Downs Lane3.2 km",
      "Arrive at the end, on the left",
    ]);
    expect(screen.getByText(/about 1 h walking|about 1 hour walking/)).toBeInTheDocument();
    expect(streetsAsPlainText(WALK)).toContain("Continue onto Downs Lane, 3.2 km");
    const card = contentText(routeCardDocument({ route: WALK, name: "Box Hill", paper: "a4", map: null, made: new Date(0) }).content);
    expect(card).toContain("Take the steps");
  });

  it("saves under a name like a drive, and opens again as planned, with Save GPX", async () => {
    const saved = {
      id: "r1",
      name: "Fetcham to Chamonix",
      mode: "walk",
      plannedAt: WALK.plannedAt,
      fromTo: "Leatherhead to Box Hill",
      distanceM: WALK.summary.distanceM,
      durationS: WALK.summary.durationS,
      createdAt: WALK.plannedAt,
      updatedAt: WALK.plannedAt,
      route: WALK,
    };
    serve(READY, { "/api/streets/route": WALK, "POST /api/roads/routes": saved, "/api/roads/routes/r1": saved });
    panel();
    await userEvent.click(
      within(await screen.findByRole("radiogroup", { name: "Way of travelling" })).getByRole("radio", { name: "Walk" }),
    );
    await choosePlace("From", "Fetcham");
    await choosePlace("To", "Chamonix");
    await userEvent.click(screen.getByRole("button", { name: "Plan route" }));
    expect(await screen.findByRole("button", { name: "Save GPX" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name to save it under")).toHaveValue("Leatherhead to Box Hill");
    await userEvent.click(screen.getByRole("button", { name: "Save route" }));
    await waitFor(() =>
      expect(sent.find((each) => each.path === "/api/roads/routes")?.body).toEqual({ name: "Leatherhead to Box Hill", route: WALK }),
    );
    // The saved walk: its own directions, the date it was planned, and nothing planned again.
    expect(await screen.findByRole("heading", { name: "Fetcham to Chamonix" })).toBeInTheDocument();
    expect(screen.getByText("Walk")).toBeInTheDocument();
    expect(screen.getByText(/Kept as it was planned/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Directions" })).getByText("Take the steps")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save GPX" })).toBeInTheDocument();
    expect(sent.filter((each) => each.path === "/api/streets/route")).toHaveLength(1);
  });
});

const reachEngine = { setOverlay: vi.fn(), fitBounds: vi.fn(), getCenter: () => ({ lat: 51.296, lon: -0.33 }) };

/** Reachable from Paris, to see what is offered for France. */
function AtParis({ onOpenNetworks }: { onOpenNetworks: (countries?: readonly string[]) => void }) {
  const tool = useReach({ engine: reachEngine as never, where: () => "Paris", onOpenStreets: () => {}, onOpenNetworks });
  return (
    <>
      <button type="button" onClick={() => tool.start({ lat: 48.85, lon: 2.35 }, "Paris")}>
        Start
      </button>
      {tool.card}
    </>
  );
}

function Harness() {
  const tool = useReach({
    engine: reachEngine as never,
    where: () => "51.29600, -0.33000",
    onOpenStreets: () => {},
    onOpenNetworks: () => {},
  });
  return (
    <>
      <button type="button" onClick={() => tool.start({ lat: 51.296, lon: -0.33 })}>
        Start
      </button>
      {tool.card}
    </>
  );
}

describe("reachable areas", () => {
  it("shows a legend for each time and says where the areas come from", async () => {
    serve(NOT_INSTALLED, { "/api/streets/reach": REACH_MAIN_ROADS });
    show(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByRole("heading", { name: "Reachable from here" })).toBeInTheDocument();
    // Without streets, only a drive: no choice of way.
    expect(screen.queryByRole("radiogroup", { name: "Way of travelling" })).toBeNull();
    const legend = await screen.findByRole("list", { name: "Legend" });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((each) => each.textContent),
    ).toEqual(["Within 15 min", "Within 30 min"]);
    expect(screen.getByText("Main roads only")).toBeInTheDocument();
    expect(screen.getByText(/Free-flowing traffic, no stops/)).toBeInTheDocument();
    expect(sent.find((each) => each.path === "/api/streets/reach")?.body).toEqual({
      point: { lat: 51.296, lon: -0.33 },
      mode: "drive",
      minutes: [15, 30],
    });
    // An hour asks for all three.
    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Time" })).getByRole("radio", { name: "1 hour" }));
    await waitFor(() => expect(sent.at(-1)?.body).toMatchObject({ minutes: [15, 30, 60] }));
  });

  it("gives each way its own times, up to 2 hours by car or bicycle and 8 hours on foot, kept apart", async () => {
    serve(READY, { "/api/streets/reach": REACH_MAIN_ROADS });
    show(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    const ways = await screen.findByRole("radiogroup", { name: "Way of travelling" });
    const times = () =>
      within(screen.getByRole("radiogroup", { name: "Time" }))
        .getAllByRole("radio")
        .map((each) => each.textContent);
    // Short on the button, in full for a screen reader.
    expect(times()).toEqual(["15 min15 min", "30 min30 min", "1 h1 hour", "1½ h1½ hours", "2 h2 hours"]);
    expect(within(screen.getByRole("radiogroup", { name: "Time" })).getByRole("radio", { name: "2 hours" })).toBeInTheDocument();
    await waitFor(() => expect(sent.at(-1)?.body).toMatchObject({ mode: "drive", minutes: [15, 30] }));

    await userEvent.click(within(ways).getByRole("radio", { name: "Walk" }));
    expect(times()).toEqual(["30 min30 min", "1 h1 hour", "2 h2 hours", "4 h4 hours", "6 h6 hours", "8 h8 hours"]);
    // An hour on foot to begin with: half an hour inside it.
    await waitFor(() => expect(sent.at(-1)?.body).toMatchObject({ mode: "walk", minutes: [30, 60] }));
    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Time" })).getByRole("radio", { name: "8 hours" }));
    // Never more than three areas: 2, 4 and 8 hours.
    await waitFor(() => expect(sent.at(-1)?.body).toMatchObject({ mode: "walk", minutes: [120, 240, 480] }));

    await userEvent.click(within(ways).getByRole("radio", { name: "Cycle" }));
    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Time" })).getByRole("radio", { name: "2 hours" }));
    await waitFor(() => expect(sent.at(-1)?.body).toMatchObject({ mode: "cycle", minutes: [30, 60, 120] }));
    await userEvent.click(within(ways).getByRole("radio", { name: "Drive" }));
    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Time" })).getByRole("radio", { name: "1½ hours" }));
    await waitFor(() => expect(sent.at(-1)?.body).toMatchObject({ mode: "drive", minutes: [30, 60, 90] }));
    // Back to walking: its 8 hours were kept.
    await userEvent.click(within(ways).getByRole("radio", { name: "Walk" }));
    expect(within(screen.getByRole("radiogroup", { name: "Time" })).getByRole("radio", { name: "8 hours" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(reachTimeText(480)).toBe("8 hours");
    expect(reachTimeText(90)).toBe("1½ hours");
    expect(reachTimeText(60)).toBe("1 hour");
  });

  it("offers roads for the point's own country where it has none, never another", async () => {
    serve(NOT_INSTALLED, {
      "/api/streets/reach": REACH_MAIN_ROADS,
      "/api/roads/coverage": { points: [{ country: "FR" }], countries: [country("FR", "France", "missing")], seaCrossing: false },
    });
    const onOpenNetworks = vi.fn();
    show(<AtParis onOpenNetworks={onOpenNetworks} />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("France has no roads yet.")).toBeInTheDocument();
    expect(screen.queryByText(/United Kingdom/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add roads for France" }));
    expect(onOpenNetworks).toHaveBeenCalledWith(["FR"]);
    // Nothing is asked of the server for a country with no roads.
    expect(sent.some((each) => each.path === "/api/streets/reach")).toBe(false);
  });

  it("offers cycling and walking with streets, and says what they need without", async () => {
    serve(NO_STREETS, { "/api/streets/reach": REACH_MAIN_ROADS });
    show(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    const ways = await screen.findByRole("radiogroup", { name: "Way of travelling" });
    await userEvent.click(within(ways).getByRole("radio", { name: "Walk" }));
    expect(await screen.findByText("Walking areas in United Kingdom need street detail, built once on this device.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add walking and cycling for United Kingdom" })).toBeInTheDocument();
  });

  it("puts the largest area under, and prints with the map", () => {
    const data = reachData(REACH_MAIN_ROADS);
    expect(data.features.map((each) => each.properties?.label)).toEqual(["30 min", "15 min", "30 min", "15 min", undefined]);
    // Each time written at the top of its own outline.
    expect((data.features[2]!.geometry as { coordinates: number[] }).coordinates[1]).toBeCloseTo(51.416);
    expect(reachSentence(REACH_MAIN_ROADS)).toBe("Reachable by car within 15 min and 30 min (main roads only).");
    const overlay = PRINT_OVERLAYS.find((each) => each.id === "reach")!;
    const context = {} as never;
    expect(overlay.unavailable?.(context)).toMatch(/No reachable areas/);
    setReachShown(REACH_MAIN_ROADS);
    expect(overlay.unavailable?.(context)).toBeUndefined();
    const draft = { data: {}, sources: {}, layers: [], notes: [] as string[] } as never as Parameters<typeof overlay.apply>[0];
    overlay.apply(draft, context, new Set());
    expect(draft.data["o-reach"]?.features).toHaveLength(5);
    expect(draft.notes[0]).toMatch(/Outlines: solid, 15 min; dashed, 30 min\. Free-flowing traffic, no stops/);
    // The outlines go by step, whatever the times: an 8 hour walk's three areas are solid, dashed and dotted too.
    const walk = {
      ...REACH_MAIN_ROADS,
      mode: "walk" as const,
      areas: {
        ...REACH_MAIN_ROADS.areas,
        features: [120, 240, 480].map((minutes) => ({ ...REACH_MAIN_ROADS.areas.features[0]!, properties: { minutes } })),
      },
    };
    expect(reachData(walk).features.map((each) => each.properties?.step)).toEqual([2, 1, 0, undefined, undefined, undefined, undefined]);
    setReachShown(walk);
    const longer = { data: {}, sources: {}, layers: [], notes: [] as string[] } as never as Parameters<typeof overlay.apply>[0];
    overlay.apply(longer, context, new Set());
    expect(longer.notes[0]).toMatch(/within 2 hours, 4 hours and 8 hours .*Outlines: solid, 2 hours; dashed, 4 hours; dotted, 8 hours\./);
  });
});

describe("walking and cycling in Add a place", () => {
  const estimate: StreetsEstimate = {
    regions: [{ regionId: "europe/great-britain", name: "Great Britain", country: "GB", dataDate: "2026-11-22" }],
    inputBytes: 2_205_301_182,
    joined: false,
    minutes: 56,
    memoryBytes: 2.3e9,
    writtenBytes: 53e9,
    freeSpaceBytes: 6.6e9,
    resultBytes: 2.73e9,
    measured: true,
    warnings: [],
  };

  it("says what building takes once ticked in Add a place, and can work on the NAS to spare the card", async () => {
    serve(NO_STREETS, { "/api/streets/tiles/estimate": estimate });
    const onWhere = vi.fn();
    show(<WalkDetails request={{ regions: ["europe/great-britain"], coming: [] }} where="own" onWhere={onWhere} />);
    const what = await screen.findByTestId("streets-estimate");
    expect(what).toHaveTextContent("Takes about an hour on a Raspberry Pi 5");
    expect(what).toHaveTextContent(/memory/);
    expect(what).toHaveTextContent(/Writes about 53(\.0)? GB to the disk it works on/);
    expect(sent.find((each) => each.path === "/api/streets/tiles/estimate")?.body).toEqual({
      regions: ["europe/great-britain"],
      coming: [],
    });
    await userEvent.click(await screen.findByRole("radio", { name: /NAS/ }));
    expect(onWhere).toHaveBeenCalledWith("nas");
  });

  it("says the source file is downloaded and kept first where none is held", () => {
    expect(walkCostLine("France", 4_900_000_000, false)).toMatch(/^Needs France's source file, 4\.9\d? GB: downloaded and kept first/);
    expect(walkCostLine("France", null, true)).toMatch(/from the kept source file: nothing to download/);
  });

  it("where the service is not installed, says it is an optional add-on and how to turn it on", () => {
    show(<StreetsNotInstalled />);
    expect(screen.getByText(/come with an optional add-on/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How to turn it on" })).toHaveAttribute("href", "/help/deployment#h-street-routes");
  });
});
