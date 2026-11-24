/**
 * Directions on a phone: the start it is given, the answer's first line, the route cut into
 * steps; and the bar, the picker and the sheet together, planning as soon as both ends are
 * known, with Cancel, a swap that plans again, and one press to save.
 */
import type { MarkerDto, RoadCoverageResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHANNEL_TRIP } from "../road-route/test-route";
import { WALK } from "../road-route/test-streets";
import { DirectionsPicker } from "./picker";
import { DirectionsBar } from "./route-bar";
import { DirectionsSheet } from "./route-sheet";
import { useDirections } from "./use-directions";
import { defaultStart, endsTitle, planKey, pointLabel, routeSteps, routeSummary } from "./words";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const HOME = { name: "Home", lat: 51.3, lon: -0.34, at: null };
const REIMS = { name: "Reims", lat: 49.27, lon: 4.06, from: "place" as const };

describe("the words of Directions", () => {
  it("names the points From, Stop n and To", () => {
    expect([0, 1, 2, 3].map((index) => pointLabel(index, 4))).toEqual(["From", "Stop 1", "Stop 2", "To"]);
  });

  it("starts from a point handed in, else where the device is, else home; never from the end itself", () => {
    const handed = { name: "Box Hill", lat: 51.25, lon: -0.31, from: "map" as const };
    expect(defaultStart({ handed, here: { lat: 1, lon: 1 }, home: HOME })).toBe(handed);
    expect(defaultStart({ here: { lat: 51.1, lon: -0.2 }, home: HOME })?.name).toBe("Where you are");
    expect(defaultStart({ home: HOME })).toEqual({ name: "Home", lat: 51.3, lon: -0.34, from: "place" });
    expect(defaultStart({})).toBeNull();
    expect(defaultStart({ home: HOME, to: { name: "Home", lat: 51.3001, lon: -0.3401, from: "place" } })).toBeNull();
  });

  it("puts the answer first: the distance, the time, and how in one line", () => {
    expect(routeSummary(CHANNEL_TRIP)).toEqual({
      distance: expect.stringMatching(/^\d[\d,]* km$/),
      time: expect.stringMatching(/^about \d+ h/),
      how: "Driving, with the Eurotunnel, through United Kingdom and France.",
    });
    expect(routeSummary(WALK).how).toMatch(/^Walking/);
    expect(endsTitle([{ ...REIMS, name: "Home" }, REIMS])).toBe("Home → Reims");
  });

  it("cuts a drive into its roads and crossings, and a walk into its turns", () => {
    const steps = routeSteps(CHANNEL_TRIP);
    expect(steps.map((step) => step.title)).toEqual(CHANNEL_TRIP.legs.filter((leg) => leg.kind !== "via").map((leg) => leg.title));
    expect(steps.every((step) => step.leg !== null && step.bounds[0] <= step.bounds[2])).toBe(true);
    expect(routeSteps(WALK).map((step) => step.title)).toEqual(WALK.streets!.lines.map((line) => line.text));
  });

  it("keeps a plan by its request: the same ends, way, units and crossing are the same plan", () => {
    const points = [{ ...REIMS, name: "Home", lat: 51.3, lon: -0.34 }, REIMS];
    const one = planKey({ mode: "drive", units: "km", crossing: "any", points });
    expect(planKey({ mode: "drive", units: "km", crossing: "any", points: [...points] })).toBe(one);
    expect(planKey({ mode: "drive", units: "miles", crossing: "any", points })).not.toBe(one);
    expect(planKey({ mode: "drive", units: "km", crossing: "any", points: [...points].reverse() })).not.toBe(one);
  });
});

// ── The bar, the picker and the sheet together ──

const marker = (id: string, name: string, lat: number, lon: number): MarkerDto =>
  ({ id, name, note: "", lat, lon, color: "red", icon: "pin", isFavorite: false }) as unknown as MarkerDto;
const MARKERS = [marker("m1", "Home", 51.3, -0.34), marker("m2", "Reims", 49.27, 4.06), marker("m3", "Chamonix", 45.92, 6.87)];
const READY: RoadCoverageResponse = {
  points: [{ country: "GB" }, { country: "FR" }],
  countries: [
    { code: "GB", name: "United Kingdom", state: "ready", regionId: null, parts: [], dataDate: null, progress: null },
    { code: "FR", name: "France", state: "ready", regionId: null, parts: [], dataDate: null, progress: null },
  ],
  seaCrossing: false,
};

let planned: unknown[] = [];
let saved: unknown[] = [];
/** The server, with the route held until `release` is called when `hold` is set. */
function serve({ hold = false }: { hold?: boolean } = {}) {
  planned = [];
  saved = [];
  let release: () => void = () => {};
  const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).split("?")[0];
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      if (path === "/api/roads/networks") return json({ networks: [], building: [], credit: CHANNEL_TRIP.credit });
      if (path === "/api/streets/status") return json({ installed: false });
      if (path === "/api/roads/coverage") return json(READY);
      if (path === "/api/roads/routes" && init?.method === "POST") {
        saved.push(body);
        return json({ id: "r1", name: body.name, fromTo: "Home to Reims", route: CHANNEL_TRIP });
      }
      if (path === "/api/roads/route") {
        planned.push(body);
        if (hold)
          await new Promise<void>((resolve, reject) => {
            release = resolve;
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")));
          });
        return json({ ...CHANNEL_TRIP, plannedAt: Date.now() + planned.length });
      }
      return new Response(JSON.stringify({ error: { code: "not_found", message: "Not found." } }), { status: 404 });
    }),
  );
  return { release: () => release() };
}

const engine = { getCenter: () => ({ lat: 50, lon: 2 }), fitBounds: vi.fn() };

function Harness() {
  const directions = useDirections({ engine, home: HOME, enabled: true, onShow: () => {} });
  return (
    <>
      <button type="button" onClick={() => directions.start({})}>
        Open directions
      </button>
      {directions.active ? <DirectionsBar directions={directions} /> : null}
      {directions.active ? (
        <div style={{ position: "relative" }}>
          <DirectionsSheet
            directions={directions}
            onHeight={() => {}}
            onOpenNetworks={() => {}}
            onOpenStreets={() => {}}
            onFitLine={() => {}}
          />
        </div>
      ) : null}
      <DirectionsPicker directions={directions} markers={MARKERS} home={HOME} getCenter={() => ({ lat: 50, lon: 2 })} />
    </>
  );
}

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("Directions on a phone", () => {
  it("asks where to with the field focused, starts from home, and plans as soon as the end is chosen", async () => {
    serve();
    show();
    await userEvent.click(screen.getByRole("button", { name: "Open directions" }));
    const picker = screen.getByRole("dialog", { name: "Where to?" });
    expect(within(picker).getByRole("combobox", { name: /^To: / })).toHaveFocus();
    expect(within(picker).getAllByRole("option")[0]).toHaveTextContent("Choose on the map");
    await userEvent.click(within(picker).getByRole("option", { name: /^Reims/ }));
    expect(screen.queryByRole("dialog", { name: "Where to?" })).toBeNull();
    expect(screen.getByRole("button", { name: "From: Home. Change" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "To: Reims. Change" })).toBeInTheDocument();
    // No button to press: the answer comes, distance first.
    const sheet = screen.getByRole("region", { name: "Directions" });
    expect(await within(sheet).findByRole("heading", { name: /\d km/ })).toBeInTheDocument();
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({ points: [{ name: "Home" }, { name: "Reims" }] });
  });

  it("plans again when the ends are swapped, and keeps each plan for the visit", async () => {
    serve();
    show();
    await userEvent.click(screen.getByRole("button", { name: "Open directions" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Where to?" })).getByRole("option", { name: /^Reims/ }));
    const sheet = screen.getByRole("region", { name: "Directions" });
    await within(sheet).findByRole("heading", { name: /\d km/ });
    await userEvent.click(screen.getByRole("button", { name: "Swap the start and the end" }));
    expect(screen.getByRole("button", { name: "From: Reims. Change" })).toBeInTheDocument();
    await waitFor(() => expect(planned).toHaveLength(2));
    await userEvent.click(screen.getByRole("button", { name: "Swap the start and the end" }));
    await within(sheet).findByRole("heading", { name: /\d km/ });
    expect(planned).toHaveLength(2);
  });

  it("says it is planning, and Cancel stops it until asked again", async () => {
    const server = serve({ hold: true });
    show();
    await userEvent.click(screen.getByRole("button", { name: "Open directions" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Where to?" })).getByRole("option", { name: /^Reims/ }));
    const sheet = screen.getByRole("region", { name: "Directions" });
    expect(await within(sheet).findByText("Planning the route")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(within(sheet).getByText("Planning stopped.")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Plan the route" }));
    await waitFor(() => expect(planned).toHaveLength(2));
    act(() => server.release());
    expect(await within(sheet).findByRole("heading", { name: /\d km/ })).toBeInTheDocument();
  });

  it("saves with one press under the route's own name, and says so where it was pressed", async () => {
    serve();
    show();
    await userEvent.click(screen.getByRole("button", { name: "Open directions" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Where to?" })).getByRole("option", { name: /^Reims/ }));
    const sheet = screen.getByRole("region", { name: "Directions" });
    await within(sheet).findByRole("heading", { name: /\d km/ });
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await within(sheet).findByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
    expect(saved).toHaveLength(1);
    expect(within(sheet).getByText(/^Saved as “/)).toBeInTheDocument();
  });

  it("walks the steps one at a time from the list", async () => {
    serve();
    show();
    await userEvent.click(screen.getByRole("button", { name: "Open directions" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Where to?" })).getByRole("option", { name: /^Reims/ }));
    const sheet = screen.getByRole("region", { name: "Directions" });
    await within(sheet).findByRole("heading", { name: /\d km/ });
    await userEvent.click(within(sheet).getByRole("button", { name: "Steps" }));
    const list = within(sheet).getByRole("list", { name: "Directions" });
    await userEvent.click(within(list).getAllByRole("button")[0]!);
    expect(within(sheet).getByText(/^Step 1 of \d+$/)).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Previous step" })).toBeDisabled();
    await userEvent.click(within(sheet).getByRole("button", { name: /^Next/ }));
    expect(within(sheet).getByText(/^Step 2 of \d+$/)).toBeInTheDocument();
  });

  it("asks for the start when the end chosen is where it would have started", async () => {
    serve();
    show();
    await userEvent.click(screen.getByRole("button", { name: "Open directions" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Where to?" })).getByRole("option", { name: /^Home/ }));
    expect(screen.getByRole("dialog", { name: "Where from?" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^From: / })).toHaveFocus();
  });
});
