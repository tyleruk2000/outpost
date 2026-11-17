import {
  type EmergencyPlanResponse,
  type EmergencyPlanSummary,
  type EmergencyPlanUpdate,
  type MarkerDto,
  type NuclearScenario,
  PLAN_TEMPLATES,
  planFromTemplate,
} from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanMapProps } from "@/features/propagation/map/plan-map";
import { localId } from "@/lib/utils";
import NuclearPage from "./nuclear-page";

// The map needs WebGL, which the test's browser has not got. What stands in for it
// shows what it was handed and lets a test press a place on it.
// Each overlay handed to the map that differs from the one before: the map redraws on each.
const overlays = vi.hoisted(() => [] as unknown[]);
const placesHanded = vi.hoisted(() => [] as unknown[]);
vi.mock("@/features/propagation/map/plan-map", () => ({
  PlanMap: ({ label, nuclear, places, onPress }: PlanMapProps) => {
    if (overlays.at(-1) !== nuclear) overlays.push(nuclear);
    if (placesHanded.at(-1) !== places) placesHanded.push(places);
    return (
      <section aria-label={label}>
        <output data-testid="drawn">
          {nuclear?.features
            .filter((feature) => feature.properties.kind !== "plume")
            .map((feature) => String(feature.properties.label))
            .join("|")}
        </output>
        <output data-testid="plumes">{nuclear?.features.filter((feature) => feature.properties.kind === "plume").length ?? 0}</output>
        <output data-testid="places">{places?.length ?? 0}</output>
        <button type="button" onClick={() => onPress?.({ position: { lat: 54.46, lon: -3.09 }, place: null })}>
          press the map
        </button>
      </section>
    );
  },
}));

// Drawing the PDF's maps needs WebGL too: what stands in keeps which scenarios it was asked to draw.
const printed = vi.hoisted(() => [] as Array<{ letters: string[]; places: unknown }>);
vi.mock("./print-maps", () => ({
  makeScenarioPdf: async (input: { written: Array<{ letter: string }>; places: unknown }) => {
    printed.push({ letters: input.written.map((item) => item.letter), places: input.places });
    return {
      bytes: new Uint8Array([37, 80, 68, 70]),
      pages: 2,
      maps: 1,
      pieces: 1,
      reduced: false,
      missing: [],
      figures: { overview: [], maps: {} },
    };
  },
}));

afterEach(() => {
  printed.length = 0;
  overlays.length = 0;
  placesHanded.length = 0;
  vi.unstubAllGlobals();
  localStorage.clear();
});

const home: MarkerDto = {
  id: "home",
  name: "Home",
  note: "",
  lat: 54.47,
  lon: -3.05,
  color: "teal",
  icon: "home",
  isFavorite: false,
  noteId: null,
  createdAt: 1,
  updatedAt: 1,
} as MarkerDto;

const saved: NuclearScenario = {
  id: "s1",
  name: "Megaton over the bay",
  notes: "",
  lat: 54.2,
  lon: -3.3,
  effects: { yieldKt: 1000, burst: { kind: "optimum", psi: 5 }, wind: null },
  createdAt: 1,
  updatedAt: Date.UTC(2026, 10, 16),
};

const layersSummary = (population: boolean) => ({
  layers: [
    {
      id: "historical",
      count: 1,
      countries: ["GB"],
      providers: [{ id: "import", name: "Imported", count: 1 }],
      kinds: [{ kind: "historical", label: "Historical record", count: 1 }],
      provenance: [{ provenance: "historical", count: 1 }],
    },
    {
      id: "shelters",
      count: 2,
      countries: ["GB"],
      providers: [{ id: "import", name: "Imported", count: 2 }],
      kinds: [{ kind: "Rest centre", label: "Rest centre", count: 2 }],
      provenance: [{ provenance: "public-infrastructure", count: 2 }],
    },
  ],
  population: population
    ? [
        {
          id: "pop",
          country: "United Kingdom",
          product: "Population counts, 1 km, unconstrained, UN-adjusted",
          year: 2020,
          bbox: [-4, 54, -2, 55],
          available: true,
          citation: "WorldPop citation",
        },
      ]
    : [],
  credits: [],
});

interface Options {
  scenarios?: NuclearScenario[] | "fails";
  regions?: number;
  markers?: MarkerDto[] | "fails";
  population?: boolean;
  path?: string;
  /** Answers a change to a saved scenario, given its body and which change it is (from 1); otherwise it is saved. */
  onPatch?: (body: Record<string, unknown>, count: number) => { status: number; body: unknown } | undefined;
  /** What one saved scenario is read as (`GET /api/nuclear/scenarios/:id`). */
  one?: NuclearScenario;
  /** Emergency plans: the list, and what each read of `/api/emergency-plans/:id` and each change to it answer. */
  plans?: {
    list: EmergencyPlanSummary[];
    read: (count: number) => EmergencyPlanResponse;
    put: (count: number) => { status: number; body: unknown };
  };
}

function serve(options: Options = {}) {
  const posted: Array<{ path: string; body: unknown }> = [];
  const asked: string[] = [];
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const { pathname } = url;
      asked.push(`${pathname}${url.search}`);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (init?.method === "POST" || init?.method === "PATCH") {
        const body = init.body ? JSON.parse(String(init.body)) : undefined;
        posted.push({ path: pathname, body });
        if (init.method === "PATCH") {
          const answer = options.onPatch?.(body, posted.filter((post) => post.path === pathname).length);
          if (answer) return json(answer.body, answer.status);
        }
        return json({ ...body, id: "new", createdAt: 5, updatedAt: 5 }, 201);
      }
      if (options.one && pathname === `/api/nuclear/scenarios/${options.one.id}`) return json(options.one);
      if (options.plans && pathname.startsWith("/api/emergency-plans/")) {
        if (init?.method === "PUT") {
          posted.push({ path: `PUT ${pathname}`, body: JSON.parse(String(init.body)) });
          const answer = options.plans.put(posted.filter((post) => post.path === `PUT ${pathname}`).length);
          return json(answer.body, answer.status);
        }
        asked.push(`read ${pathname}`);
        return json(options.plans.read(asked.filter((each) => each === `read ${pathname}`).length));
      }
      if (options.plans && pathname === "/api/emergency-plans") return json({ plans: options.plans.list });
      if (pathname === "/api/nuclear/scenarios") {
        if (options.scenarios === "fails") return json({ error: { code: "internal", message: "The database is busy." } }, 500);
        return json({ scenarios: options.scenarios ?? [] });
      }
      if (pathname === "/api/nuclear/sets") return json({ sets: [] });
      if (pathname === "/api/maps/markers") {
        if (options.markers === "fails") return json({ error: { code: "internal", message: "The database is busy." } }, 500);
        return json({ markers: options.markers ?? [] });
      }
      if (pathname === "/api/maps/overview")
        return json({ regions: Array.from({ length: options.regions ?? 0 }, (_, index) => ({ id: `r${index}` })), places: [] });
      if (pathname === "/api/maps/sources") return json({ hasTiles: (options.regions ?? 0) > 0, attributions: [], imagery: [] });
      if (pathname === "/api/reference/layers") return json(layersSummary(options.population ?? false));
      if (pathname === "/api/reference/population/sum") {
        const radiusKm = Number(url.searchParams.get("radiusKm"));
        return json({
          people: Math.round(radiusKm * radiusKm * 300),
          covered: 1,
          sets: [{ country: "United Kingdom", product: "Population counts, 1 km", year: 2020 }],
          note: "",
          cellKm2: 0.6,
        });
      }
      if (pathname === "/api/reference/packs") return json({ packs: [] });
      if (pathname === "/api/reference/catalogue") return json({ providers: [], linked: [] });
      if (pathname === "/api/reference/historical") return json({ total: 0, records: [] });
      if (pathname === "/api/weather") return json({ places: [], kept: [], sources: [], updateOnOpen: false, now: Date.now() });
      if (pathname === "/api/emergency-plans") return json({ plans: [] });
      return json({}, 404);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[options.path ?? "/prepare/nuclear"]}>
        <NuclearPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { posted, asked };
}

const openTab = (name: RegExp | string) => {
  fireEvent.mouseDown(screen.getByRole("tab", { name }));
  fireEvent.click(screen.getByRole("tab", { name }));
};

describe("Nuclear preparedness", () => {
  it("says it works offline, and that no offline map is installed when none is", async () => {
    serve({ regions: 0 });
    expect(screen.getByRole("heading", { level: 1, name: "Nuclear preparedness" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("offline-line")).toHaveTextContent(/No offline map region is installed/));
    expect(screen.getByTestId("offline-line")).toHaveTextContent(/nothing here uses the internet/);
  });

  it("gives the panel's tabs a 44 px touch target on a phone", () => {
    serve();
    for (const name of [/Scenario/, /Saved/, /Layers/, /Records/, /Plans/])
      expect(screen.getByRole("tab", { name })).toHaveClass("max-md:min-h-11");
  });

  it("names the installed regions when there are some", async () => {
    serve({ regions: 2 });
    await waitFor(() => expect(screen.getByTestId("offline-line")).toHaveTextContent("2 offline map regions installed."));
  });

  it("draws the rings with their levels and rounded distances once ground zero is pressed, with the caveat in words", async () => {
    serve();
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    await waitFor(() => expect(screen.getByTestId("drawn")).toHaveTextContent(/A · 5 psi · 1\.1 km/));
    expect(screen.getAllByText(/not a forecast and not instructions/).length).toBeGreaterThan(0);
    // A surface burst with no wind: no plume, and why, at the wind field.
    expect(screen.getByTestId("plumes")).toHaveTextContent("0");
    expect(screen.getByTestId("fallout-state")).toHaveTextContent(
      /No fallout pattern is drawn: give the direction the wind blows from and its speed/,
    );
  });

  it("keeps the rings and the results while a wind is half typed or out of range: only the pattern waits", async () => {
    serve();
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    await waitFor(() => expect(screen.getByTestId("drawn")).toHaveTextContent(/A · 5 psi · 1\.1 km/));
    // The direction alone.
    fireEvent.change(screen.getByLabelText("Wind from, degrees"), { target: { value: "270" } });
    await waitFor(() => expect(screen.getByTestId("fallout-state")).toHaveTextContent(/give the wind's speed/));
    expect(screen.getByTestId("drawn")).toHaveTextContent(/A · 5 psi · 1\.1 km/);
    expect(screen.getByRole("region", { name: "What the model gives" })).toBeInTheDocument();
    // The first digit of "24": a speed the model refuses.
    fireEvent.change(screen.getByLabelText("Wind speed"), { target: { value: "2" } });
    await waitFor(() => expect(screen.getByTestId("fallout-state")).toHaveTextContent(/13 to 72 km\/h/));
    expect(screen.getByTestId("drawn")).toHaveTextContent(/A · 5 psi · 1\.1 km/);
    expect(screen.getByRole("region", { name: "What the model gives" })).toBeInTheDocument();
    expect(screen.getByTestId("plumes")).toHaveTextContent("0");
    // Finished: the pattern joins the rings.
    fireEvent.change(screen.getByLabelText("Wind speed"), { target: { value: "24" } });
    await waitFor(() => expect(screen.getByTestId("plumes")).toHaveTextContent("4"));
    expect(screen.getByTestId("drawn")).toHaveTextContent(/A · 5 psi · 1\.1 km/);
  });

  it("draws the fallout plume for a surface burst with a wind", async () => {
    serve();
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    fireEvent.change(screen.getByLabelText("Wind from, degrees"), { target: { value: "270" } });
    fireEvent.change(screen.getByLabelText("Wind speed"), { target: { value: "24" } });
    await waitFor(() => expect(screen.getByTestId("plumes")).toHaveTextContent("4"));
    expect(screen.getByTestId("fallout-state")).toHaveTextContent("Drawn: wind from the west, so the pattern runs east, at 24 km/h.");
    // The legend names the pattern.
    expect(screen.getByRole("list", { name: "How the map draws each kind of effect" })).toHaveTextContent("Fallout (idealised)");
  });

  it("does not redraw the map while a name or notes are typed: only a change to what is drawn redraws it", async () => {
    serve();
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    await waitFor(() => expect(screen.getByTestId("drawn")).toHaveTextContent(/A · 5 psi · 1\.1 km/));
    const before = overlays.length;
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Over the quarry" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "For the talk on Thursday." } });
    expect(overlays.length).toBe(before);
    fireEvent.change(screen.getByLabelText("Yield"), { target: { value: "10" } });
    await waitFor(() => expect(overlays.length).toBe(before + 1));
  });

  it("hands the map the same empty list of places when they cannot be loaded, not a new one each time", async () => {
    serve({ markers: "fails" });
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Over the quarry" } });
    await waitFor(() => expect(screen.getByTestId("places")).toHaveTextContent("0"));
    expect(placesHanded.length).toBe(1);
  });

  it("sets the direction from a compass point, and says when the burst height means no pattern", async () => {
    serve();
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    fireEvent.click(screen.getByRole("radio", { name: "NE" }));
    expect(screen.getByLabelText("Wind from, degrees")).toHaveValue("45");
    expect(screen.getByText("Wind from the north-east, so the pattern runs south-west.")).toBeInTheDocument();
    expect(screen.getByTestId("fallout-state")).toHaveTextContent(/give the wind's speed/);
    fireEvent.click(screen.getByRole("radio", { name: "At a height" }));
    expect(screen.getByTestId("fallout-state")).toHaveTextContent(/the burst is at a height/);
  });

  it("refuses a yield outside the model's range, with the reason, and draws nothing", async () => {
    serve();
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    fireEvent.change(screen.getByLabelText("Yield"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("radio", { name: "megatons" }));
    expect(await screen.findByText(/must be from 1 kiloton to 10 megatons/)).toBeInTheDocument();
    expect(screen.getByTestId("drawn")).toHaveTextContent("");
  });

  it("measures saved places against the scenario in plain words", async () => {
    serve({ markers: [home] });
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    expect(await screen.findByText(/from ground zero\. (Inside|Outside)/)).toBeInTheDocument();
    expect(screen.getByTestId("places")).toHaveTextContent("1");
  });

  it("asks for a name before saving, then saves what was typed", async () => {
    const { posted } = serve();
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    fireEvent.click(screen.getByRole("button", { name: "Save scenario" }));
    expect(await screen.findByText("Give the scenario a name to save it.")).toBeInTheDocument();
    expect(posted).toEqual([]);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Quarry" } });
    fireEvent.click(screen.getByRole("button", { name: "Save scenario" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      path: "/api/nuclear/scenarios",
      body: { name: "Quarry", lat: 54.46, lon: -3.09, effects: { yieldKt: 15 } },
    });
  });

  describe("a saved scenario changed on another device while open here", () => {
    const THEIRS = saved.updatedAt + 60_000;
    const theirs: NuclearScenario = { ...saved, name: "Megaton over the bay (kitchen)", updatedAt: THEIRS };
    const refusedOnce = (body: Record<string, unknown>, count: number) =>
      count === 1
        ? {
            status: 409,
            body: {
              error: {
                code: "conflict",
                message:
                  "This scenario was changed somewhere else after you opened it, in another tab or on another device. Your changes were not saved over it; reload to see the newer version.",
                details: { current: { updatedAt: THEIRS, name: theirs.name } },
              },
            },
          }
        : { status: 200, body: { ...saved, ...body, updatedAt: THEIRS + 1000 } };

    async function editSaved() {
      const server = serve({ scenarios: [saved], onPatch: refusedOnce, one: theirs });
      openTab(/Saved/);
      fireEvent.click(await screen.findByRole("button", { name: "Put it on the map" }));
      fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Mine" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      expect(await screen.findByText("This scenario was changed somewhere else")).toBeInTheDocument();
      const patches = () => server.posted.filter((post) => post.path === "/api/nuclear/scenarios/s1");
      expect(patches()).toHaveLength(1);
      expect(patches()[0]!.body).toMatchObject({ name: "Mine", baseUpdatedAt: saved.updatedAt });
      expect(screen.getByText(/Your version is still here, unsaved, and nothing has been overwritten/)).toBeInTheDocument();
      expect(screen.getByLabelText("Name")).toHaveValue("Mine");
      return patches;
    }

    it("keeps my version by sending it again on top of the newer one", async () => {
      const patches = await editSaved();
      fireEvent.click(screen.getByRole("button", { name: "Keep my version" }));
      await waitFor(() => expect(patches()).toHaveLength(2));
      expect(patches()[1]!.body).toMatchObject({ name: "Mine", baseUpdatedAt: THEIRS });
      await waitFor(() => expect(screen.queryByText("This scenario was changed somewhere else")).toBeNull());
      // The next change builds on the version just saved.
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Mine again" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(patches()).toHaveLength(3));
      expect(patches()[2]!.body).toMatchObject({ name: "Mine again", baseUpdatedAt: THEIRS + 1000 });
    });

    it("loads the other version into the form instead", async () => {
      const patches = await editSaved();
      fireEvent.click(screen.getByRole("button", { name: "Load the other version" }));
      await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue(theirs.name));
      expect(screen.queryByText("This scenario was changed somewhere else")).toBeNull();
      expect(patches()).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(patches()).toHaveLength(2));
      expect(patches()[1]!.body).toMatchObject({ name: theirs.name, baseUpdatedAt: THEIRS });
    });
  });

  it("puts a saved scenario on the map beside the one being edited, as B, the selected one at full strength", async () => {
    serve({ scenarios: [saved] });
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    openTab(/Saved/);
    fireEvent.click(await screen.findByRole("button", { name: "Put it on the map" }));
    await waitFor(() => expect(screen.getByTestId("drawn")).toHaveTextContent(/B · 5 psi/));
    expect(screen.getByTestId("drawn")).toHaveTextContent(/A · 5 psi/);
    expect(screen.getByRole("heading", { name: /Megaton over the bay/ })).toBeInTheDocument();
  });

  it("adds scenarios up to six, says so plainly at the limit, and selects, hides and removes them", async () => {
    serve();
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    for (let n = 0; n < 5; n++) {
      fireEvent.click(screen.getByRole("button", { name: "Add another scenario" }));
      fireEvent.click(screen.getByRole("button", { name: "press the map" }));
    }
    const list = screen.getByRole("list", { name: "Scenarios on the map" });
    expect(list.querySelectorAll("li")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Add another scenario" })).toBeDisabled();
    expect(screen.getAllByText(/6 scenarios is the most the map shows at once/).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByTestId("drawn")).toHaveTextContent(/F · 5 psi/));
    for (const letter of ["A", "B", "C", "D", "E", "F"]) expect(screen.getByTestId("drawn").textContent).toContain(`${letter} · 5 psi`);
    // Select C: its form is the one shown.
    fireEvent.click(screen.getByRole("button", { name: /^C: Scenario C/ }));
    expect(screen.getByRole("heading", { level: 2, name: "Scenario C" })).toBeInTheDocument();
    // Hide B: not drawn.
    fireEvent.click(screen.getByRole("button", { name: "Hide B on the map" }));
    await waitFor(() => expect(screen.getByTestId("drawn").textContent).not.toContain("B · 5 psi"));
    // Remove D: gone from the list and the map, and another can be added.
    fireEvent.click(screen.getByRole("button", { name: "Remove D from the map" }));
    await waitFor(() => expect(screen.getByTestId("drawn").textContent).not.toContain("D · 5 psi"));
    expect(screen.getByRole("button", { name: "Add another scenario" })).not.toBeDisabled();
  });

  it("makes the PDF of the scenarios shown only: a hidden one has no map and no section, and saved places only when ticked", async () => {
    serve({ markers: [home], regions: 1 });
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    for (let n = 0; n < 2; n++) {
      fireEvent.click(screen.getByRole("button", { name: "Add another scenario" }));
      fireEvent.click(screen.getByRole("button", { name: "press the map" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Hide B on the map" }));
    expect(await screen.findByRole("heading", { name: "The 2 scenarios shown, on paper" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make the PDF" }));
    await waitFor(() => expect(printed).toEqual([{ letters: ["A", "C"], places: null }]));
    expect(await screen.findByRole("button", { name: "Add to library" })).toBeInTheDocument();
  });

  it("counts people per ring of the selected scenario only, and never a total across rings or scenarios", async () => {
    serve({ population: true });
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    fireEvent.click(screen.getByRole("button", { name: "Add another scenario" }));
    fireEvent.click(screen.getByRole("button", { name: "press the map" }));
    fireEvent.click(screen.getByRole("button", { name: "Add another scenario" }));
    fireEvent.click(screen.getByRole("button", { name: "press the map" }));
    await waitFor(
      () =>
        expect(
          screen
            .getAllByTestId("ring-people")
            .map((row) => row.textContent)
            .join("|"),
        ).toMatch(/people live inside this ring, by WorldPop's 2020 estimate\. This is who lives there, not a prediction of harm\./),
      { timeout: 3000 },
    );
    // The smallest rings are too small for the grid's cells, and say so.
    expect(
      screen
        .getAllByTestId("ring-people")
        .map((row) => row.textContent)
        .join("|"),
    ).toMatch(/smaller than a few of the population grid's cells/);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/in total|altogether|combined|all of them together|total of|people in all|fatalit/i);
    // Each scenario's rings are counted only when it is the selected one: one set of rows.
    expect(screen.getAllByRole("region", { name: "People inside each ring" })).toHaveLength(1);
    expect(screen.getByText(/Nothing else on the map is counted inside a ring/)).toBeInTheDocument();
  });

  it("says what to download when no population grid is installed", async () => {
    serve({ population: false });
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    expect(
      await screen.findByText(
        /No population grid is installed\. To see how many people live inside each ring, get WorldPop's population grid/,
      ),
    ).toBeInTheDocument();
  });

  it("has an empty state and an error state for saved scenarios", async () => {
    serve({ scenarios: [] });
    openTab(/Saved/);
    expect(await screen.findByText("No saved scenarios")).toBeInTheDocument();
  });

  it("says when saved scenarios cannot be loaded", async () => {
    serve({ scenarios: "fails" });
    openTab(/Saved/);
    expect(await screen.findByText(/The database is busy/)).toBeInTheDocument();
  });

  it("shows the reference layers and the five provenance classes with what is held in each", async () => {
    serve();
    openTab("Layers");
    const key = await screen.findByRole("list", { name: "Where things on this map come from" });
    for (const name of [
      "Published public record",
      "Historical documentation",
      "Modelled effects",
      "Made by you",
      "Unverified or speculative",
    ])
      expect(key).toHaveTextContent(name);
    await waitFor(() => expect(key).toHaveTextContent("2 held"));
    // The layers panel of the Maps screen, unchanged, with its sentence on targets.
    expect(await screen.findByRole("switch", { name: "Shelters and assembly points" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing here marks a place as a likely target or ranks places/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Reference data for the map" })).toBeInTheDocument();
  });

  it("has a records browser with an empty state that says why nothing ships", async () => {
    serve();
    openTab("Records");
    expect(await screen.findByText("No historical records installed")).toBeInTheDocument();
    expect(screen.getByText(/No dataset of historical records is cleared for Outpost to ship/)).toBeInTheDocument();
  });

  it("attaches a scenario to a plan changed elsewhere in between by adding it to the newer version, not over it", async () => {
    const template = PLAN_TEMPLATES.find((each) => each.id === "radiation")!;
    const version = (updatedAt: number, name: string): EmergencyPlanResponse => ({
      plan: {
        ...planFromTemplate(template, () => localId()),
        name,
        id: "p1",
        use: { startedAt: null, ticks: {} },
        reviewedAt: 1,
        openedAt: null,
        createdAt: 1,
        updatedAt,
      },
      resolved: { contacts: {}, places: {}, commPlan: undefined, powerPlan: undefined, links: [] },
    });
    const { posted } = serve({
      scenarios: [saved],
      plans: {
        list: [
          {
            id: "p1",
            name: "Radiation",
            kind: "other",
            kindText: "",
            templateId: "radiation",
            scenarios: [],
            steps: 10,
            ticked: 0,
            startedAt: null,
            reviewedAt: 1,
            reviewEveryDays: 180,
            openedAt: null,
            missing: 0,
            updatedAt: 10,
          },
        ],
        read: (count) => (count === 1 ? version(10, "Radiation") : version(20, "Radiation (kitchen)")),
        put: (count) =>
          count === 1
            ? {
                status: 409,
                body: {
                  error: {
                    code: "conflict",
                    message: "Changed elsewhere.",
                    details: { current: { updatedAt: 20, name: "Radiation (kitchen)" } },
                  },
                },
              }
            : { status: 200, body: version(30, "Radiation (kitchen)") },
      },
    });
    openTab("Plans");
    fireEvent.click(await screen.findByRole("button", { name: `Attach “${saved.name}” to Radiation` }));
    await waitFor(() => expect(posted.filter((post) => post.path === "PUT /api/emergency-plans/p1")).toHaveLength(2));
    const [first, second] = posted
      .filter((post) => post.path === "PUT /api/emergency-plans/p1")
      .map((post) => post.body as EmergencyPlanUpdate);
    expect(first).toMatchObject({ name: "Radiation", baseUpdatedAt: 10 });
    expect(second).toMatchObject({ name: "Radiation (kitchen)", baseUpdatedAt: 20 });
    expect(second!.body.links).toEqual([{ kind: "scenario", id: saved.id }]);
  });

  it("offers a plan from the radiation emergency template in the Plans tab, and says personal places stay on this Outpost", async () => {
    serve();
    openTab("Plans");
    expect(await screen.findByRole("button", { name: /Make a plan from the template/ })).toBeInTheDocument();
    expect(screen.getByText(/nothing here sends them anywhere/)).toBeInTheDocument();
    expect(screen.getByText(/In a real emergency, follow the emergency services and official warnings/)).toBeInTheDocument();
  });
});
