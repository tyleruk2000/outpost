import { newPowerPlan, type PowerPlan, type PowerPlanInput } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toMarkdown } from "@/features/propagation/plans/document";
import { workOut } from "./calc/plan";
import { planBlocks, planPdf } from "./document";
import PowerPlanPage from "./plan-page";
import PowerPage from "./power-page";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "visibilityState");
});

function planOf(patch: Partial<PowerPlan> = {}): PowerPlan {
  return {
    ...newPowerPlan("Shack"),
    loads: [
      { id: "pi", kind: "device", name: "Raspberry Pi", supply: "dc", quantity: 1, startHour: 0, watts: 15, hoursPerDay: 24 },
      {
        id: "hf",
        kind: "radio",
        name: "HF radio",
        supply: "dc",
        quantity: 1,
        startHour: 18,
        transmitW: 20,
        receiveW: 4,
        standbyW: 1,
        onAirHours: 2,
        standbyHours: 4,
        transmitShare: 0.5,
        modeFactor: 0.2,
        mode: "ssb",
      },
    ],
    id: "p1",
    createdAt: 1,
    updatedAt: Date.UTC(2026, 10, 16),
    ...patch,
  };
}

interface Server {
  put: Array<PowerPlanInput & { baseUpdatedAt?: number }>;
  /** Another tab or device saving the plan, as the server would keep it. */
  saveElsewhere(patch: Partial<PowerPlanInput>): PowerPlan;
  /** Whether each save asked to outlive the page (`keepalive`). */
  keptAlive: boolean[];
  /** The most saves under way at the same moment. */
  mostAtOnce: number;
  posted: unknown[];
  devices: unknown[];
  /** What the plan's sun-hours control asked of the weather module, in order. */
  weatherAsked: Array<{ path: string; body: unknown }>;
}

function show(
  path: string,
  options: {
    plans?: PowerPlan[] | "fails" | "never";
    plan?: PowerPlan;
    weather?: unknown;
    /** Saved places, as the Maps screen keeps them. */
    markers?: Array<{ id: string; name: string; lat: number; lon: number; icon: string }>;
    /** What PVGIS says when asked: figures unless this is set. */
    pvgisFails?: string;
    /** How long the server takes over each save. */
    putDelayMs?: number;
  } = {},
): Server {
  let plan = options.plan ?? planOf();
  const server: Server = {
    put: [],
    keptAlive: [],
    mostAtOnce: 0,
    posted: [],
    devices: [],
    weatherAsked: [],
    saveElsewhere(patch) {
      plan = { ...plan, ...patch, updatedAt: plan.updatedAt + 1000 };
      return plan;
    },
  };
  let saving = 0;
  // What Weather and hazards holds, which a fetch from the plan adds to.
  const weather = (options.weather ?? { places: [], kept: [], sources: [], updateOnOpen: false, now: Date.now() }) as {
    places: Array<Record<string, unknown>>;
    kept: Array<Record<string, unknown>>;
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (pathname === "/api/power/plans" && init?.method === "POST") {
        server.posted.push(JSON.parse(String(init.body)));
        return json({ plan: { ...planOf(), id: "p2", name: "New one" } });
      }
      if (pathname === "/api/power/plans") {
        if (options.plans === "never") return new Promise<Response>(() => undefined);
        if (options.plans === "fails") return json({ error: { code: "internal", message: "The database is busy." } }, 500);
        return json({ plans: options.plans ?? [plan] });
      }
      if (pathname === "/api/power/plans/p1" && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as PowerPlanInput & { baseUpdatedAt?: number };
        server.put.push(body);
        server.keptAlive.push(init.keepalive === true);
        saving += 1;
        server.mostAtOnce = Math.max(server.mostAtOnce, saving);
        if (options.putDelayMs) await new Promise((resolve) => setTimeout(resolve, options.putDelayMs));
        saving -= 1;
        // As the server does: a save made from an older version than the one kept is refused.
        const { baseUpdatedAt, ...input } = body;
        if (baseUpdatedAt !== undefined && baseUpdatedAt !== plan.updatedAt)
          return json(
            { error: { code: "conflict", message: "This plan was changed somewhere else.", details: { updatedAt: plan.updatedAt } } },
            409,
          );
        plan = { ...plan, ...input, updatedAt: plan.updatedAt + 1 };
        return json({ plan });
      }
      if (pathname === "/api/power/plans/p1") return json({ plan });
      if (pathname === "/api/power/devices" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        server.devices.push(body);
        return json({ device: { ...body, id: `d${server.devices.length}`, createdAt: 1, updatedAt: 1 } });
      }
      if (pathname === "/api/power/devices")
        return json({
          devices: server.devices.map((body, index) => ({ ...(body as object), id: `d${index + 1}`, createdAt: 1, updatedAt: 1 })),
        });
      if (pathname === "/api/radio/profiles") return json({ radios: [], antennas: [] });
      if (pathname === "/api/maps/markers") return json({ markers: options.markers ?? [] });
      if (pathname === "/api/weather/places" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { markerId?: string; name?: string; lat?: number; lon?: number };
        server.weatherAsked.push({ path: pathname, body });
        const marker = options.markers?.find((each) => each.id === body.markerId);
        const place = {
          id: `w${weather.places.length + 9}`,
          name: marker?.name ?? body.name,
          lat: marker?.lat ?? body.lat,
          lon: marker?.lon ?? body.lon,
          markerId: body.markerId ?? null,
          isHome: marker?.icon === "home",
          region: null,
          createdAt: 1,
        };
        weather.places.push(place);
        return json({ place });
      }
      if (pathname === "/api/weather/update" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { kinds: string[]; placeIds: string[] };
        server.weatherAsked.push({ path: pathname, body });
        const placeId = body.placeIds[0]!;
        if (options.pvgisFails)
          return json({
            outcomes: [{ kind: "solar", placeId, placeName: "x", source: "pvgis", ok: false, message: options.pvgisFails, bytes: 0 }],
          });
        weather.kept.push({ ...solarWeather(Date.now()).kept[0]!, id: `c-${placeId}`, placeId });
        return json({ outcomes: [{ kind: "solar", placeId, placeName: "x", source: "pvgis", ok: true, message: null, bytes: 3000 }] });
      }
      if (pathname === "/api/weather") return json(weather);
      return json({ error: { code: "not_found", message: "Not here." } }, 404);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tools/power" element={<PowerPage />} />
          <Route path="/tools/power/plans/:id" element={<PowerPlanPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return server;
}

describe("the Power and batteries screen", () => {
  it("shows skeletons while the plans load", () => {
    show("/tools/power", { plans: "never" });
    expect(screen.getByRole("heading", { level: 1, name: "Power and batteries" })).toBeInTheDocument();
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("No power plans yet")).not.toBeInTheDocument();
  });

  it("invites the first plan when there is none, and the calculators work without one", async () => {
    show("/tools/power", { plans: [] });
    expect(await screen.findByText("No power plans yet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Battery runtime"));
    fireEvent.click(screen.getByRole("radio", { name: "A load in watts" }));
    // 100 Ah × 12.8 V × 80% ÷ 20 W = 51.2 hours.
    expect(await screen.findByText("51.2 hours (2.1 days)")).toBeInTheDocument();
  });

  it("says when the plans could not be loaded", async () => {
    show("/tools/power", { plans: "fails" });
    expect(await screen.findByText("The database is busy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("lists the plans and compares two side by side", async () => {
    show("/tools/power", { plans: [planOf(), planOf({ id: "p2", name: "Car" })] });
    expect((await screen.findAllByRole("link", { name: /Shack/ }))[0]).toHaveAttribute("href", "/tools/power/plans/p1");
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Car" })).toBeInTheDocument();
    expect(within(table).getAllByText("375 Wh")).toHaveLength(2);
  });

  it("starts a new plan from a name", async () => {
    const server = show("/tools/power", { plans: [] });
    fireEvent.click(await screen.findByRole("button", { name: "New power plan" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New one" } });
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(server.posted).toHaveLength(1));
    expect(server.posted[0]).toMatchObject({ name: "New one", battery: { chemistry: "lifepo4", volts: 12.8 }, loads: [] });
  });
});

describe("a power plan", () => {
  it("shows its answers, says they are an estimate, and lists its assumptions", async () => {
    show("/tools/power/plans/p1");
    expect(await screen.findByRole("heading", { level: 1, name: "Shack" })).toBeInTheDocument();
    // 15 W × 24 h + 15.2 Wh for the radio.
    expect(screen.getByText("375 Wh")).toBeInTheDocument();
    expect(screen.getByText(/Real batteries deliver less when cold/)).toHaveTextContent(
      /general information: no substitute for the wiring regulations/,
    );
    expect(screen.getByText(/Duty cycle 10.0%/)).toBeInTheDocument();
    expect(screen.getByText(/Not checked: give the battery's rated discharge current/)).toBeInTheDocument();
    expect(await screen.findByText("Save as PDF")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to library" })).toBeInTheDocument();
  });

  it("shows an error with a way back when the plan is not there", async () => {
    show("/tools/power/plans/missing");
    expect(await screen.findByText("Not here.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Power and batteries" })).toHaveAttribute("href", "/tools/power");
  });

  it("adds a load and saves the plan a moment later", async () => {
    const server = show("/tools/power/plans/p1");
    fireEvent.click(await screen.findByRole("button", { name: "Add a load" }));
    const picker = screen.getByRole("dialog", { name: "Add a load" });
    fireEvent.change(within(picker).getByLabelText("Find a device"), { target: { value: "pi 5" } });
    fireEvent.click(within(picker).getByRole("button", { name: /^Raspberry Pi 5:/ }));
    const dialog = screen.getByRole("dialog", { name: "Add a load" });
    expect(within(dialog).getByText(/From the library: Raspberry Pi 5, the maker's typical figure/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add load" }));
    await waitFor(() => expect(server.put).toHaveLength(1), { timeout: 3000 });
    expect(server.put[0]!.loads).toHaveLength(3);
    // 800 mA at 5.1 V, around the clock, over USB.
    expect(server.put[0]!.loads[2]).toMatchObject({
      kind: "device",
      name: "Raspberry Pi 5",
      watts: 4.08,
      hoursPerDay: 24,
      supply: "usb",
      origin: { library: "common", id: "raspberry-pi-5", state: "typical", figures: { watts: 4.08 } },
    });
  });

  it("saves a change at once when the page is hidden or closed, in a request that outlives the page", async () => {
    const server = show("/tools/power/plans/p1");
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Shack, winter" } });
    expect(server.put).toHaveLength(0);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    // Well inside the moment an ordinary change waits before it is saved.
    await waitFor(() => expect(server.put).toHaveLength(1), { timeout: 300 });
    expect(server.put[0]!.name).toBe("Shack, winter");
    expect(server.keptAlive).toEqual([true]);
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "For the winter months." } });
    window.dispatchEvent(new Event("pagehide"));
    await waitFor(() => expect(server.put).toHaveLength(2), { timeout: 300 });
    expect(server.put[1]!.notes).toBe("For the winter months.");
  });

  it("sends one save at a time, and a change made while one is under way follows it", async () => {
    const server = show("/tools/power/plans/p1", { putDelayMs: 1200 });
    const name = await screen.findByLabelText("Name");
    fireEvent.change(name, { target: { value: "Shack A" } });
    await waitFor(() => expect(server.put).toHaveLength(1), { timeout: 2000 });
    fireEvent.change(name, { target: { value: "Shack AB" } });
    await waitFor(() => expect(server.put).toHaveLength(2), { timeout: 4000 });
    expect(server.mostAtOnce).toBe(1);
    expect(server.put.map((put) => put.name)).toEqual(["Shack A", "Shack AB"]);
    await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument(), { timeout: 3000 });
  }, 10_000);

  it("saves each change from the version it last saved, so that one save never refuses the next", async () => {
    const server = show("/tools/power/plans/p1");
    const name = await screen.findByLabelText("Name");
    fireEvent.change(name, { target: { value: "Shack A" } });
    await waitFor(() => expect(server.put).toHaveLength(1), { timeout: 2000 });
    fireEvent.change(name, { target: { value: "Shack AB" } });
    await waitFor(() => expect(server.put).toHaveLength(2), { timeout: 2000 });
    expect(server.put.map((put) => put.baseUpdatedAt)).toEqual([Date.UTC(2026, 10, 16), Date.UTC(2026, 10, 16) + 1]);
    await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
  });

  it("when another device has saved the plan since, overwrites nothing, says so, and keeps whichever version is chosen", async () => {
    const server = show("/tools/power/plans/p1");
    const name = await screen.findByLabelText("Name");
    const elsewhere = server.saveElsewhere({ name: "Shack, theirs", cableRatingA: 25 });
    fireEvent.change(name, { target: { value: "Shack, mine" } });
    const notice = await screen.findByText("This plan was changed somewhere else", {}, { timeout: 2000 });
    expect(screen.getByText(/Your version is still here, unsaved, and nothing has been overwritten/)).toBeInTheDocument();
    expect(screen.getByText("Not saved: changed somewhere else.")).toBeInTheDocument();
    expect(server.put).toHaveLength(1);
    // Saving stops while the choice is open: a further change sends nothing.
    fireEvent.change(name, { target: { value: "Shack, mine still" } });
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(server.put).toHaveLength(1);
    expect(notice).toBeInTheDocument();
    // Keeping mine saves it over theirs, from their version.
    fireEvent.click(screen.getByRole("button", { name: "Keep my version" }));
    await waitFor(() => expect(server.put).toHaveLength(2));
    expect(server.put[1]).toMatchObject({ name: "Shack, mine still", baseUpdatedAt: elsewhere.updatedAt });
    await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
    expect(screen.queryByText("This plan was changed somewhere else")).not.toBeInTheDocument();
  });

  it("can load the other version instead, dropping the unsaved change", async () => {
    const server = show("/tools/power/plans/p1");
    const name = await screen.findByLabelText("Name");
    server.saveElsewhere({ name: "Shack, theirs" });
    fireEvent.change(name, { target: { value: "Shack, mine" } });
    fireEvent.click(await screen.findByRole("button", { name: "Load the other version" }, { timeout: 2000 }));
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Shack, theirs"));
    expect(screen.queryByText("This plan was changed somewhere else")).not.toBeInTheDocument();
    expect(server.put).toHaveLength(1);
    // And saving carries on from their version.
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Shack, theirs, changed" } });
    await waitFor(() => expect(server.put).toHaveLength(2), { timeout: 2000 });
    await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
  });

  it("refuses a load with a figure missing, saying which", async () => {
    show("/tools/power/plans/p1");
    fireEvent.click(await screen.findByRole("button", { name: "Add a load" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Add a load" })).getByRole("button", { name: /type its watts/ }));
    const dialog = screen.getByRole("dialog", { name: "Add a load" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add load" }));
    expect(await within(dialog).findByText("Give it a name.")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Lamp" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add load" }));
    expect(await within(dialog).findByText("Give its power in watts.")).toBeInTheDocument();
  });
});

const SOLAR_PLACE = { id: "w1", name: "Home", lat: 52.13, lon: -0.46, markerId: "m1", isHome: true, region: null, createdAt: 1 };
const solarWeather = (fetchedAt: number) => ({
  places: [SOLAR_PLACE],
  kept: [
    {
      id: "c1",
      kind: "solar",
      source: "pvgis",
      placeId: "w1",
      fetchedAt,
      validFrom: null,
      validUntil: null,
      bytes: 3000,
      sent: "",
      data: {
        service: "PVGIS 5.3",
        databases: "PVGIS-SARAH3",
        firstYear: 2005,
        lastYear: 2023,
        optimalSlope: 38,
        level: [0.6, 1.2, 2.3, 3.5, 4.4, 4.8, 4.6, 3.9, 2.8, 1.6, 0.8, 0.5],
        optimal: [1.234, 1.9, 2.9, 3.9, 4.4, 4.5, 4.4, 4.1, 3.4, 2.3, 1.4, 1.0],
      },
    },
  ],
  sources: [],
  updateOnOpen: false,
  now: Date.now(),
});

const SAVED = [
  { id: "m1", name: "Home", lat: 52.13, lon: -0.46, icon: "home" },
  { id: "m2", name: "Allotment", lat: 52.2, lon: -0.5, icon: "pin" },
];

describe("peak sun hours from Weather and hazards", () => {
  it("offers a saved place when no figures are held, says what fetching sends, and fetches nothing until pressed", async () => {
    const server = show("/tools/power/plans/p1", { markers: SAVED });
    // Home first, though it is not in the weather list yet.
    expect(await screen.findByRole("button", { name: "Fetch sun hours for Home" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Where the panels are" })).toHaveTextContent("Home (home)");
    expect(screen.getByText(/No sun figures are held for Home yet\. Fetching them asks PVGIS/)).toHaveTextContent(
      /sending only the place's latitude and longitude rounded to two decimal places.*added to the list on Weather and hazards/,
    );
    expect(screen.getByRole("link", { name: "Open Weather and hazards" })).toHaveAttribute("href", "/prepare/weather?view=climate");
    expect(screen.queryByRole("button", { name: "Fill in from Weather and hazards" })).not.toBeInTheDocument();
    expect(server.weatherAsked).toEqual([]);
  });

  it("fetches for the chosen place on a press: adds it to the weather list, asks PVGIS about it alone, then offers its figures", async () => {
    const server = show("/tools/power/plans/p1", { markers: SAVED });
    fireEvent.click(await screen.findByRole("button", { name: "Fetch sun hours for Home" }));
    const fill = await screen.findByRole("button", { name: "Fill in from Weather and hazards" });
    expect(server.weatherAsked).toEqual([
      { path: "/api/weather/places", body: { markerId: "m1" } },
      { path: "/api/weather/update", body: { kinds: ["solar"], placeIds: ["w9"] } },
    ]);
    // Nothing went into the plan by itself.
    expect(server.put).toHaveLength(0);
    fireEvent.click(fill);
    await waitFor(() => expect(server.put).toHaveLength(1), { timeout: 3000 });
    expect(server.put[0]!.solar.sunHoursSource).toMatchObject({ kind: "pvgis", place: "Home", lat: 52.13, lon: -0.46 });
  });

  it("takes a position typed in when there is no place to choose, and refuses one it cannot read", async () => {
    const server = show("/tools/power/plans/p1");
    const where = await screen.findByLabelText("Where the panels are: coordinates, a grid reference or a locator");
    expect(screen.getByRole("button", { name: "Fetch sun hours for this place" })).toBeDisabled();
    fireEvent.change(where, { target: { value: "somewhere sunny" } });
    expect(screen.getByText(/not a position Outpost can read/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fetch sun hours for this place" })).toBeDisabled();
    fireEvent.change(where, { target: { value: "51.5074, -0.1278" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch sun hours for 51.51, -0.13" }));
    await screen.findByRole("button", { name: "Fill in from Weather and hazards" });
    expect(server.weatherAsked[0]).toEqual({
      path: "/api/weather/places",
      body: { name: "Solar panels, 51.51, -0.13", lat: 51.5074, lon: -0.1278 },
    });
  });

  it("says why when PVGIS gives nothing, and offers nothing to fill in", async () => {
    const server = show("/tools/power/plans/p1", { markers: SAVED, pvgisFails: "PVGIS has no data for this place." });
    fireEvent.click(await screen.findByRole("button", { name: "Fetch sun hours for Home" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The figures were not fetched. PVGIS has no data for this place.");
    expect(screen.queryByRole("button", { name: "Fill in from Weather and hazards" })).not.toBeInTheDocument();
    // Pressing again asks about the place already added: it is not added twice.
    fireEvent.click(await screen.findByRole("button", { name: "Fetch sun hours for Home" }));
    await waitFor(() => expect(server.weatherAsked.filter((asked) => asked.path === "/api/weather/update")).toHaveLength(2));
    expect(server.weatherAsked.filter((asked) => asked.path === "/api/weather/places")).toHaveLength(1);
  });

  it("fills the months on a press, says whose they are, and records it in the plan", async () => {
    const server = show("/tools/power/plans/p1", { weather: solarWeather(Date.now() - 3 * 86_400_000) });
    expect(
      await screen.findByText(/PVGIS's figures \(European Commission Joint Research Centre\) for Home, 52.13, -0.46/),
    ).toBeInTheDocument();
    expect(screen.getByText(/fetched by Weather and hazards 3 days ago/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fill in from Weather and hazards" }));
    await waitFor(() => expect(server.put).toHaveLength(1), { timeout: 3000 });
    expect(server.put[0]!.solar.sunHours[0]).toBe(1.23);
    expect(server.put[0]!.solar.sunHoursSource).toMatchObject({ kind: "pvgis", place: "Home", tilt: "optimal", slope: 38, edited: false });
    expect(screen.getByText(/^Peak sun hours from PVGIS .* for Home \(52.13, -0.46\), on a panel facing south at 38°/)).toBeInTheDocument();
    // Typed over afterwards: the record says so.
    fireEvent.change(screen.getByLabelText("March"), { target: { value: "3" } });
    await waitFor(() => expect(server.put.at(-1)!.solar.sunHoursSource?.edited).toBe(true), { timeout: 3000 });
  });

  it("asks before replacing figures the person typed", async () => {
    const typed = planOf();
    typed.solar = { ...typed.solar, sunHours: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] };
    const server = show("/tools/power/plans/p1", { plan: typed, weather: solarWeather(Date.now()) });
    fireEvent.click(await screen.findByRole("button", { name: "Fill in from Weather and hazards" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Replace the figures typed in?" });
    expect(server.put).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(server.put).toHaveLength(0);
  });
});

describe("the plan written out", () => {
  it("has the answers, every assumption and the estimate warning, and makes a PDF", () => {
    const plan = planOf({ notes: "Check the fuses." });
    const text = toMarkdown(planBlocks(plan, workOut(plan), new Date(Date.UTC(2026, 10, 16))));
    expect(text.startsWith("# Power plan: Shack\n")).toBe(true);
    expect(text).toContain("Real batteries deliver less when cold");
    expect(text).toContain("## Assumptions");
    expect(text).toContain("HF radio: 20 W transmitting");
    expect(text).toContain("## Notes\n\nCheck the fuses.");
    expect(text).toContain("Peak sun hours typed in.");
    const bytes = planPdf(plan, workOut(plan), new Date(Date.UTC(2026, 10, 16)));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("telling a save made over another from another refusal", () => {
  it("takes a 409 for a conflict only when it says which version is kept", async () => {
    const { ApiError } = await import("@/lib/api");
    const { isConflict } = await import("./data");
    expect(isConflict(new ApiError(409, "conflict", "This plan was changed somewhere else.", { updatedAt: 5 }))).toBe(true);
    // The server's answer while the database is busy: nobody else saved, so "keep mine" would only be refused again.
    expect(isConflict(new ApiError(409, "conflict", "Outpost's database is busy with other work."))).toBe(false);
  });
});
