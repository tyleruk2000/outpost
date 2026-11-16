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
  put: PowerPlanInput[];
  posted: unknown[];
}

function show(path: string, options: { plans?: PowerPlan[] | "fails" | "never"; plan?: PowerPlan; weather?: unknown } = {}): Server {
  const server: Server = { put: [], posted: [] };
  let plan = options.plan ?? planOf();
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
        const body = JSON.parse(String(init.body)) as PowerPlanInput;
        server.put.push(body);
        plan = { ...plan, ...body };
        return json({ plan });
      }
      if (pathname === "/api/power/plans/p1") return json({ plan });
      if (pathname === "/api/radio/profiles") return json({ radios: [], antennas: [] });
      if (pathname === "/api/weather")
        return json(options.weather ?? { places: [], kept: [], sources: [], updateOnOpen: false, now: Date.now() });
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
    expect(screen.getByText(/Real batteries deliver less when cold/)).toBeInTheDocument();
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
    const dialog = screen.getByRole("dialog", { name: "Add a load" });
    expect(within(dialog).getByText(/the supply Raspberry Pi recommends/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add load" }));
    await waitFor(() => expect(server.put).toHaveLength(1), { timeout: 3000 });
    expect(server.put[0]!.loads).toHaveLength(3);
    expect(server.put[0]!.loads[2]).toMatchObject({ kind: "device", name: "Raspberry Pi 4 running Outpost", watts: 15, hoursPerDay: 24 });
  });

  it("refuses a load with a figure missing, saying which", async () => {
    show("/tools/power/plans/p1");
    fireEvent.click(await screen.findByRole("button", { name: "Add a load" }));
    const dialog = screen.getByRole("dialog", { name: "Add a load" });
    fireEvent.change(within(dialog).getByLabelText("Power while on"), { target: { value: "" } });
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

describe("peak sun hours from Weather and hazards", () => {
  it("says they can be fetched there when none have been, and fetches nothing itself", async () => {
    show("/tools/power/plans/p1");
    expect(await screen.findByText(/None have been fetched yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Weather and hazards" })).toHaveAttribute("href", "/prepare/weather?view=climate");
    const asked = vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input), "http://outpost.test").pathname);
    expect(asked.every((path) => path.startsWith("/api/") && !path.includes("update"))).toBe(true);
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
