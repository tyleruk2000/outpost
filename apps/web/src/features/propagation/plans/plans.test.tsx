import { ANTENNA_PRESETS, type CommunicationPlan, type PlanInput, type PlanResult } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newPlan } from "./data";
import { planDocument, planMarkdown, planPdf, toMarkdown, toSheets, unwritable } from "./document";
import PlanPage from "./plan-page";
import PlansPage from "./plans-page";

// The map needs WebGL; nothing here presses it.
vi.mock("../map/plan-map", () => ({ PlanMap: () => null }));

const saved: Array<{ name: string; type: string; content: Uint8Array | string }> = [];
vi.mock("./document", async (original) => ({
  ...(await original<typeof import("./document")>()),
  saveFile: (name: string, type: string, content: Uint8Array | string) => saved.push({ name, type, content }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  saved.length = 0;
});

const dipole = ANTENNA_PRESETS[0]!.spec;
const station = (id: string, name: string, lat: number, lon: number) => ({
  id,
  name,
  lat,
  lon,
  powerWatts: 5,
  antenna: dipole,
  antennaName: "Low horizontal dipole, 5 m",
  noise: "residential" as const,
});

function planOf(patch: Partial<CommunicationPlan> = {}): CommunicationPlan {
  return {
    id: "p1",
    name: "Family net",
    notes: "Call on the hour.\n\nListen for five minutes.",
    stations: [station("home", "Home base", 51.51, -0.13), station("shelter", "Remote shelter", 54.46, -3.09)],
    date: "2026-11-16",
    fromUtc: 8,
    toUtc: 12,
    bands: ["80m", "40m"],
    mode: "ssb",
    requiredSnrDb: null,
    referenceBandwidthHz: null,
    solar: { source: "table" },
    links: [],
    linked: [],
    workedOut: true,
    createdAt: 1,
    updatedAt: 2,
    ...patch,
  };
}

const day = (value: number | null) => Array.from({ length: 24 }, () => value);
/** 40 m at 70% out and 60% back; 80 m at 20% both ways. The figures are the test's own. */
function matrixOf(patch: Partial<PlanResult> = {}): PlanResult {
  return {
    key: "k".repeat(40),
    planId: "p1",
    computedAt: Date.UTC(2026, 10, 16, 10, 27),
    cached: false,
    tookMs: 40,
    engine: { id: "voacap", name: "VOACAP", model: "VOACAP Version 16.1207W", implementation: "hfcast 2.14.0" } as PlanResult["engine"],
    datasets: [{ id: "voacap-coefficients", version: "hfcast-1" }],
    basis: {
      kind: "recent-solar",
      ssn: 83,
      summary: "Monthly median for November 2026 at smoothed sunspot number 83.",
      tableDate: "2026-11-16",
      tableAgeDays: 0,
      ssnLow: null,
      ssnHigh: null,
    },
    mode: { id: "ssb", label: "SSB voice", requiredSnrDb: 45, referenceBandwidthHz: 1, requiredSnrDbHz: 45, source: "" },
    pairs: [
      {
        a: "home",
        b: "shelter",
        distanceKm: 383.2,
        bearingDeg: 330.4,
        backBearingDeg: 148.1,
        problem: null,
        bands: [
          {
            bandId: "80m",
            mhz: 3.65,
            forward: { reliability: day(0.2), snrDbHz: day(38) },
            back: { reliability: day(0.2), snrDbHz: day(38) },
          },
          {
            bandId: "40m",
            mhz: 7.1,
            forward: { reliability: day(0.7), snrDbHz: day(48) },
            back: { reliability: day(0.6), snrDbHz: day(46) },
          },
        ],
      },
    ],
    limits: ["Every figure is the engine's monthly median for that path."],
    ...patch,
  };
}

const written = new Date(Date.UTC(2026, 10, 16));

describe("the plan written out", () => {
  it("is Markdown that reads as plain text, with the rule and the limits in it", () => {
    const text = planMarkdown(planOf(), matrixOf(), written);
    expect(text.startsWith("# Communication plan: Family net\n")).toBe(true);
    expect(text).toContain(
      "For 16 November 2026, 08:00 to 12:00 UTC. The model works by month, so this is a plan for any day of November 2026.",
    );
    expect(text).toContain("It is not a reading of the ionosphere on the day.");
    expect(text).toContain("| Home base      | 51.51, -0.13 | IO91WM  | 5 W   | Low horizontal dipole, 5 m | Residential |");
    expect(text).toContain("| Home base and Remote shelter | 383 | 40 m, up to 60% | 80 m, up to 20% |");
    expect(text).toContain(
      "- Primary: 40 m (7.1 MHz), 08:00 to 12:00 UTC. Its two-way reliability reaches 60% of days at 08:00 and averages 60% over the window.",
    );
    expect(text).toContain("It is below half the days at every hour of the window.");
    expect(text).toContain("| 40 m |  60 |  60 |  60 |  60 |  60 |");
    expect(text).toContain("## How the bands were chosen");
    expect(text).toContain("- The primary band is the one whose two-way figure, averaged over the hours of the window, is highest.");
    expect(text).toContain("- Every figure is the engine's monthly median for that path.");
    expect(text).toContain("Worked out by VOACAP Version 16.1207W (hfcast 2.14.0) from voacap-coefficients hfcast-1, on 16 November 2026.");
    expect(text).toContain("## Notes\n\nCall on the hour.\n\nListen for five minutes.");
    // Every line of a table is the same width, so the columns stand in line in a plain-text view.
    for (const table of text.split("\n\n").filter((part) => part.startsWith("|"))) {
      expect(new Set(table.split("\n").map((line) => [...line].length)).size).toBe(1);
    }
    expect(text).not.toMatch(/\blive\b|real-time/i);
  });

  it("says when a pair was not worked out, compares by ratio when the mode has no figure, and lists what is linked", () => {
    const byRatio = matrixOf({
      mode: { ...matrixOf().mode, id: "digital", label: "Another narrowband digital mode", requiredSnrDbHz: null },
    });
    const text = planMarkdown(
      planOf({
        linked: [
          { kind: "note", id: "n1", title: "Net procedure" },
          { kind: "document", id: "d1", title: null },
        ],
      }),
      byRatio,
      written,
    );
    expect(text).toContain("Mode: Another narrowband digital mode, no stated requirement.");
    expect(text).toContain("| Home base and Remote shelter | 383 | 40 m, up to 46.0 dB | 80 m, up to 38.0 dB |");
    expect(text).toContain("- This mode has no stated requirement, so the engine gives no reliability.");
    expect(text).toContain("## Linked in Outpost\n\n- Net procedure (a note)\n");
    expect(text).not.toContain("d1");

    const broken = matrixOf({
      pairs: [{ ...matrixOf().pairs[0]!, bands: [], problem: "The engine could not work this pair out: too close." }],
    });
    const blocks = planDocument(planOf(), broken, written);
    expect(toMarkdown(blocks)).toContain("Not worked out. The engine could not work this pair out: too close.");
    expect(toMarkdown(blocks)).toContain("| Home base and Remote shelter |     | None    | None      |");
  });

  it("keeps a pipe in a name from ending a cell", () => {
    const plan = planOf({ stations: [station("home", "Home | base", 51.51, -0.13), station("shelter", "Remote shelter", 54.46, -3.09)] });
    expect(planMarkdown(plan, matrixOf(), written)).toContain("| Home \\| base   |");
  });

  it("is a PDF of pages with the same words, tables in a fixed-width face, and a footer on every page", () => {
    const many = planOf({
      fromUtc: 1,
      toUtc: 24,
      stations: Array.from({ length: 6 }, (_, n) => station(`s${n}`, `Station ${n + 1}`, 50 + n, -n)),
    });
    const pairs = [];
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) pairs.push({ ...matrixOf().pairs[0]!, a: `s${a}`, b: `s${b}` });
    const result = matrixOf({ pairs });
    const sheets = toSheets(planDocument(many, result, written), "Family net");
    expect(sheets.length).toBeGreaterThan(2);
    for (const [index, sheet] of sheets.entries()) {
      expect([sheet.width, sheet.height]).toEqual([595.28, 841.89]);
      const texts = sheet.items.filter((item) => item.kind === "text");
      expect(texts.some((item) => item.text === `Page ${index + 1} of ${sheets.length}`)).toBe(true);
      // Nothing is set below the footer's rule or off the page.
      expect(Math.max(...texts.map((item) => item.y))).toBeLessThan(sheet.height - 20);
    }
    const all = sheets.flatMap((sheet) => sheet.items.filter((item) => item.kind === "text"));
    expect(all.find((item) => item.text === "Communication plan: Family net")).toMatchObject({ bold: true, size: 17 });
    const row = all.find((item) => item.text.startsWith("40 m") && item.mono);
    // Twenty-four hours across: the table is set smaller to fit, and no smaller than can be read.
    expect(row!.size).toBeGreaterThanOrEqual(5.6);
    expect(row!.size).toBeLessThanOrEqual(7.6);

    const bytes = planPdf(planOf(), matrixOf(), written);
    const file = new TextDecoder("latin1").decode(bytes);
    expect(file.startsWith("%PDF-1.")).toBe(true);
    expect(file).toContain("(Communication plan: Family net)");
    expect(file).toContain("/BaseFont /Courier");
    expect(file).toContain("(Page 1 of ");
  });

  it("names the letters the PDF's typeface cannot write", () => {
    const plan = planOf({ stations: [station("home", "Дом", 51.51, -0.13), station("shelter", "Remote shelter", 54.46, -3.09)] });
    expect(unwritable(planDocument(plan, matrixOf(), written))).toEqual(["Д", "о", "м"]);
    expect(unwritable(planDocument(planOf(), matrixOf(), written))).toEqual([]);
  });
});

interface Server {
  patched: PlanInput[];
  posted: Array<{ path: string; body: unknown }>;
  deleted: string[];
}

function show(
  path: string,
  options: {
    plans?: CommunicationPlan[] | "fails";
    plan?: CommunicationPlan | null;
    matrix?: PlanResult | null;
    worked?: PlanResult | "fails";
    engineReady?: boolean;
    found?: Array<{ kind: string; entityId: string; title: string }>;
    /** Saved on another device just after this screen first read the plan. */
    movedOn?: Partial<CommunicationPlan>;
  } = {},
): Server {
  const server: Server = { patched: [], posted: [], deleted: [] };
  let plan = options.plan === undefined ? planOf() : options.plan;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      const missing = () => json({ error: { code: "not_found", message: "The communication plan was not found." } }, 404);
      if (init?.method === "PATCH") {
        const { baseUpdatedAt, ...body } = JSON.parse(String(init.body)) as PlanInput & { baseUpdatedAt?: number };
        if (baseUpdatedAt !== undefined && baseUpdatedAt !== plan!.updatedAt) {
          const message = "This plan was changed somewhere else after you opened it. Nothing was saved.";
          return json({ error: { code: "conflict", message, details: { reason: "changed-elsewhere", plan } } }, 409);
        }
        server.patched.push(body);
        plan = {
          ...plan!,
          ...body,
          updatedAt: plan!.updatedAt + 1,
          linked: body.links.map((link) => ({ ...link, title: "Net procedure" })),
        };
        return json({ plan });
      }
      if (init?.method === "POST") {
        server.posted.push({ path: pathname, body: init.body ? JSON.parse(String(init.body)) : undefined });
        if (pathname.endsWith("/matrix")) {
          if (options.worked === "fails")
            return json({ error: { code: "unsupported", message: "A propagation data file is damaged." } }, 415);
          plan = { ...plan!, workedOut: true };
          return json({ matrix: options.worked ?? matrixOf() });
        }
        return json({ plan: planOf({ id: "new", name: "Winter net", stations: [], workedOut: false }) });
      }
      if (init?.method === "DELETE") {
        server.deleted.push(pathname);
        return json({ ok: true });
      }
      if (pathname === "/api/radio/communication-plans") {
        if (options.plans === "fails") return json({ error: { code: "internal", message: "The database is busy." } }, 500);
        return json({ plans: options.plans ?? [] });
      }
      if (pathname.endsWith("/matrix"))
        return options.matrix === null || !plan?.workedOut ? missing() : json({ matrix: options.matrix ?? matrixOf() });
      if (pathname.startsWith("/api/radio/communication-plans/")) {
        if (!plan) return missing();
        const read = plan;
        if (options.movedOn) {
          plan = { ...plan, ...options.movedOn, updatedAt: plan.updatedAt + 1000 };
          options.movedOn = undefined;
        }
        return json({ plan: read });
      }
      if (pathname === "/api/radio/propagation/engines")
        return json({
          engines: [{ id: "voacap", name: "VOACAP", ready: options.engineReady ?? true, problem: "A data file is damaged." }],
        });
      if (pathname === "/api/radio/profiles") return json({ radios: [{ id: "r1", name: "Hand-held", powerWatts: 20 }], antennas: [] });
      if (pathname === "/api/maps/markers") return json({ markers: [{ id: "m1", name: "Rendezvous", lat: 53.2, lon: -1.6 }] });
      if (pathname === "/api/search") return json({ results: options.found ?? [] });
      return json({}, 404);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/radio/plans" element={<PlansPage />} />
          <Route path="/radio/plans/:id" element={<PlanPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return server;
}

describe("the list of plans", () => {
  it("starts empty and makes a plan with the name given", async () => {
    const server = show("/radio/plans");
    expect(await screen.findByRole("heading", { name: "No communication plans yet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New plan" }));
    const dialog = screen.getByRole("dialog", { name: "New plan" });
    expect(within(dialog).getByRole("button", { name: "Create plan" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Winter net" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(server.posted).toHaveLength(1));
    expect(server.posted[0]).toMatchObject({
      path: "/api/radio/communication-plans",
      body: { ...newPlan("Winter net"), date: expect.any(String) },
    });
    // It opens on the new plan.
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("lists plans with what each is and whether it has been worked out", async () => {
    show("/radio/plans", { plans: [planOf(), planOf({ id: "p2", name: "Winter net", workedOut: false })] });
    const first = (await screen.findByText("Family net")).closest("a")!;
    expect(first).toHaveAttribute("href", "/radio/plans/p1");
    expect(first.textContent).toContain("2 stations, 5 hours from 08:00 to 12:00 UTC, SSB voice, for 2026-11-16. Worked out.");
    expect(screen.getByText("Winter net").closest("a")!.textContent).toContain("Not worked out as it stands.");
  });

  it("says so when the plans cannot be listed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    show("/radio/plans", { plans: "fails" });
    expect(await screen.findByText("The database is busy.")).toBeInTheDocument();
  });
});

describe("a plan", () => {
  it("shows the matrix it was last worked out with, the rule in full, and what the rule chose", async () => {
    show("/radio/plans/p1");
    expect(await screen.findByRole("heading", { level: 1, name: "Family net" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "How the bands are chosen" })).toBeInTheDocument();
    expect(screen.getByText(/the two-way figure is the lower of the two directions' reliabilities/)).toBeInTheDocument();
    expect(screen.getByText(/A band whose two-way figure never reaches 10% of days/)).toBeInTheDocument();
    expect(screen.getByText("A monthly median, with a recent solar forecast")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "The primary and alternate band for each pair of stations" });
    const row = within(table).getByRole("row", { name: /Home base and Remote shelter/ });
    expect(row.textContent).toContain("383 km");
    expect(row.textContent).toContain("40 m, 08:00 to 12:00, up to 60%");
    expect(row.textContent).toContain("80 m, 08:00 to 12:00, up to 20%");
    expect(
      screen.getByText(
        /^40 m \(7\.1 MHz\), 08:00 to 12:00 UTC\. Its two-way reliability reaches 60% of days at 08:00 and averages 60% over the window\.$/,
      ),
    ).toBeInTheDocument();
    // Each direction is read out for the chosen hour, and they are not the same.
    const reading = screen.getByRole("table", { name: /At 08:00 UTC, share of days/ });
    expect(within(reading).getByRole("row", { name: /40 m/ }).textContent).toBe("40 m70%60%60%");
    expect(screen.getByText(/Worked out 16 Nov 2026, 10:27 in 0\.0 s by VOACAP Version 16\.1207W\./)).toBeInTheDocument();
    expect(screen.getByText("Every figure is the engine's monthly median for that path.")).toBeInTheDocument();
  });

  it("shows nothing for a plan that has not been worked out as it stands, until the engine is asked", async () => {
    const server = show("/radio/plans/p1", { plan: planOf({ workedOut: false }) });
    expect(
      await screen.findByText(/Not worked out for the plan as it stands\. Nothing is shown until the engine has been asked\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "How the bands are chosen" })).not.toBeInTheDocument();
    // No figures, no file: there is nothing to save or to add to the library yet.
    expect(screen.getByRole("button", { name: "Save as PDF" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add to library" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Work out the plan" }));
    expect(await screen.findByRole("heading", { name: "How the bands are chosen" })).toBeInTheDocument();
    expect(server.posted.map((item) => item.path)).toEqual(["/api/radio/communication-plans/p1/matrix"]);
    expect(screen.getByRole("button", { name: "Work it out again" })).toBeInTheDocument();
  });

  it("says why when the engine cannot work it out, and when it cannot run at all", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    show("/radio/plans/p1", { plan: planOf({ workedOut: false }), worked: "fails" });
    fireEvent.click(await screen.findByRole("button", { name: "Work out the plan" }));
    expect(await screen.findByText("The plan was not worked out")).toBeInTheDocument();
    expect(screen.getByText("A propagation data file is damaged.")).toBeInTheDocument();
  });

  it("can still be written when the engine cannot run, but not worked out", async () => {
    show("/radio/plans/p1", { plan: planOf({ workedOut: false }), engineReady: false });
    expect(await screen.findByText("The propagation engine cannot run, so the plan cannot be worked out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work out the plan" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add a station" })).toBeEnabled();
  });

  it("asks for two stations before there is anything to work out", async () => {
    show("/radio/plans/p1", { plan: planOf({ stations: [], workedOut: false }) });
    expect(await screen.findByText(/No stations yet\. Add the first/)).toBeInTheDocument();
    expect(screen.getByText("A plan needs at least two stations before there is a pair to work out.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work out the plan" })).toBeDisabled();
  });

  it("adds a station on a page that is not secure, where the browser offers no randomUUID", async () => {
    // Outpost at http://192.168.x.x: the owner pressed Add station and nothing happened, because the call threw.
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: <T extends ArrayBufferView<ArrayBuffer>>(bytes: T) => real.getRandomValues(bytes) });
    try {
      const server = show("/radio/plans/p1");
      fireEvent.click(await screen.findByRole("button", { name: "Add a station" }));
      const dialog = screen.getByRole("dialog", { name: "Add a station" });
      fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Test" } });
      fireEvent.change(within(dialog).getByLabelText("Where it is"), { target: { value: "51.46386, -0.18517" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Add station" }));
      await waitFor(() => expect(server.patched).toHaveLength(1));
      const added = server.patched[0]!.stations[2]!;
      expect(added).toMatchObject({ name: "Test", lat: 51.46386, lon: -0.18517 });
      expect(added.id).toMatch(/^[0-9a-f]{12}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("adds a station with a place, a power and an antenna, and says what is missing first", async () => {
    const server = show("/radio/plans/p1");
    fireEvent.click(await screen.findByRole("button", { name: "Add a station" }));
    const dialog = screen.getByRole("dialog", { name: "Add a station" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add station" }));
    expect(within(dialog).getByRole("alert").textContent).toContain("Give the station a name");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Gran's house" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add station" }));
    expect(within(dialog).getByRole("alert").textContent).toContain("Say where the station is");
    fireEvent.change(within(dialog).getByLabelText("Where it is"), { target: { value: "IO92BL" } });
    fireEvent.change(within(dialog).getByLabelText("Transmitter power, watts"), { target: { value: "50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add station" }));
    await waitFor(() => expect(server.patched).toHaveLength(1));
    expect(server.patched[0]!.stations).toHaveLength(3);
    expect(server.patched[0]!.stations[2]).toMatchObject({
      name: "Gran's house",
      powerWatts: 50,
      antennaName: "Low horizontal dipole, 5 m",
      antenna: dipole,
      noise: "residential",
    });
    expect(server.patched[0]!.stations[2]!.lat).toBeCloseTo(52.479, 2);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Gran's house")).toBeInTheDocument();
  });

  it("changes and removes a station, and nothing else", async () => {
    const server = show("/radio/plans/p1");
    fireEvent.click(await screen.findByRole("button", { name: "Change Remote shelter" }));
    const dialog = screen.getByRole("dialog", { name: "Change Remote shelter" });
    expect(within(dialog).getByLabelText("Where it is")).toHaveValue("54.46, -3.09");
    fireEvent.change(within(dialog).getByLabelText("Transmitter power, watts"), { target: { value: "10" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save station" }));
    await waitFor(() => expect(server.patched).toHaveLength(1));
    expect(server.patched[0]!.stations.map((item) => [item.id, item.powerWatts])).toEqual([
      ["home", 5],
      ["shelter", 10],
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Remove Home base" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm.textContent).toContain("Saved places and equipment profiles are not touched.");
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(server.patched).toHaveLength(2));
    expect(server.patched[1]!.stations.map((item) => item.id)).toEqual(["shelter"]);
  });

  it("saves the bands, the notes and the name as they are changed", async () => {
    const server = show("/radio/plans/p1");
    fireEvent.click(await screen.findByRole("checkbox", { name: "20 m" }));
    await waitFor(() => expect(server.patched).toHaveLength(1));
    expect(server.patched[0]!.bands).toEqual(["80m", "40m", "20m"]);
    const notes = screen.getByLabelText("Notes for this plan");
    fireEvent.change(notes, { target: { value: "Listen at half past." } });
    fireEvent.blur(notes);
    await waitFor(() => expect(server.patched).toHaveLength(2));
    expect(server.patched[1]!.notes).toBe("Listen at half past.");
    const name = screen.getByLabelText("Name of the plan");
    fireEvent.change(name, { target: { value: "Family net, winter" } });
    fireEvent.blur(name);
    await waitFor(() => expect(server.patched).toHaveLength(3));
    expect(server.patched[2]!.name).toBe("Family net, winter");
    expect(await screen.findByRole("heading", { level: 1, name: "Family net, winter" })).toBeInTheDocument();
  });

  it("does not save over a change made on another device, and lets the person take theirs", async () => {
    const server = show("/radio/plans/p1", { movedOn: { name: "Changed on the phone" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: "20 m" }));
    const notice = await screen.findByText("This plan was changed somewhere else");
    expect(server.patched).toHaveLength(0);
    expect(notice.parentElement?.textContent).toMatch(/your last change was not saved/);
    fireEvent.click(screen.getByRole("button", { name: "Take theirs" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Changed on the phone" })).toBeInTheDocument();
    expect(screen.queryByText("This plan was changed somewhere else")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "20 m" })).not.toBeChecked();
    expect(server.patched).toHaveLength(0);
  });

  it("keeps the person's change on top of the other device's when asked", async () => {
    const server = show("/radio/plans/p1", { movedOn: { name: "Changed on the phone" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: "20 m" }));
    await screen.findByText("This plan was changed somewhere else");
    fireEvent.click(screen.getByRole("button", { name: "Keep my change" }));
    await waitFor(() => expect(server.patched).toHaveLength(1));
    // Their name, and my band.
    expect(server.patched[0]).toMatchObject({ name: "Changed on the phone", bands: ["80m", "40m", "20m"] });
    expect(await screen.findByRole("heading", { level: 1, name: "Changed on the phone" })).toBeInTheDocument();
  });

  it("links a note found by its words, and unlinks it", async () => {
    const server = show("/radio/plans/p1", { found: [{ kind: "note", entityId: "n1", title: "Net procedure" }] });
    expect(await screen.findByText("Nothing is linked yet.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Find a note or document to link"), { target: { value: "procedure" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    const results = await screen.findByRole("list", { name: "Notes and documents found" });
    fireEvent.click(within(results).getByRole("button", { name: "Link" }));
    await waitFor(() => expect(server.patched).toHaveLength(1));
    expect(server.patched[0]!.links).toEqual([{ kind: "note", id: "n1" }]);
    expect(await screen.findByRole("link", { name: "Net procedure" })).toHaveAttribute("href", "/notes/n1");
    fireEvent.click(screen.getByRole("button", { name: "Unlink Net procedure" }));
    await waitFor(() => expect(server.patched).toHaveLength(2));
    expect(server.patched[1]!.links).toEqual([]);
  });

  it("says when a linked note has gone, and when nothing matches a search", async () => {
    show("/radio/plans/p1", {
      plan: planOf({ links: [{ kind: "note", id: "gone" }], linked: [{ kind: "note", id: "gone", title: null }] }),
    });
    expect(await screen.findByText("A note that is no longer in Outpost")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Find a note or document to link"), { target: { value: "zebra" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    expect(await screen.findByText("No note or document matches “zebra”.")).toBeInTheDocument();
  });

  it("writes the plan out as Markdown and as a PDF", async () => {
    show("/radio/plans/p1");
    await screen.findByRole("heading", { name: "How the bands are chosen" });
    fireEvent.click(screen.getByRole("button", { name: "Export as Markdown" }));
    expect(saved[0]).toMatchObject({ name: "communication-plan-family-net.md", type: "text/markdown;charset=utf-8" });
    expect(saved[0]!.content).toContain("# Communication plan: Family net");
  });

  it("offers the plan's PDF to save or to add to the library, named for the plan and its day", async () => {
    const made: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => `blob:plan-${made.push(blob)}`);
    URL.revokeObjectURL = vi.fn();
    const server = show("/radio/plans/p1");
    await screen.findByRole("heading", { name: "How the bands are chosen" });
    // The file is there as soon as the plan has figures: saving it is a plain link, which is what a phone will follow.
    const save = await screen.findByRole("link", { name: "Save as PDF" });
    expect(save.getAttribute("download")).toMatch(/^communication-plan-family-net-for-\d+-[a-z]{3}-\d{4}\.pdf$/);
    const file = made.at(-1) as File;
    expect(file.type).toBe("application/pdf");
    expect((await file.text()).startsWith("%PDF-1.")).toBe(true);
    expect(screen.getByTestId("pdf-status")).toHaveTextContent("“Add to library” files it under “Made in Outpost”");
    // Adding it sends that same file to the library's upload, saying which plan it came from.
    const sent: FormData[] = [];
    class Upload {
      upload = {};
      status = 200;
      responseText = JSON.stringify({
        results: [
          {
            originalName: file.name,
            status: "created",
            document: { id: "d9", title: "Communication plan, Family net", category: "Made in Outpost" },
          },
        ],
      });
      onload: (() => void) | undefined;
      open() {}
      setRequestHeader() {}
      send(form: FormData) {
        sent.push(form);
        this.onload?.();
      }
      abort() {}
    }
    vi.stubGlobal("XMLHttpRequest", Upload);
    fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
    expect(await screen.findByRole("link", { name: "Communication plan, Family net" })).toHaveAttribute("href", "/library/documents/d9");
    expect(sent[0]!.get("source")).toBe("Made in Outpost from the communication plan “Family net”: /radio/plans/p1");
    expect(sent[0]!.get("title")).toMatch(/^Communication plan, Family net, for \d+ [A-Z][a-z]{2} \d{4}$/);
    expect(sent[0]!.get("tags")).toBe("Communication plan");
    expect(server.posted.map((item) => item.path)).not.toContain("/api/documents");
  });

  it("is deleted only after it is confirmed, and says so when it does not exist", async () => {
    const server = show("/radio/plans/p1");
    fireEvent.click(await screen.findByRole("button", { name: "Delete plan" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm.textContent).toContain("Notes and documents it links to are not touched.");
    expect(server.deleted).toEqual([]);
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete plan" }));
    await waitFor(() => expect(server.deleted).toEqual(["/api/radio/communication-plans/p1"]));
  });

  it("says so when the plan is not there", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    show("/radio/plans/none", { plan: null });
    expect(await screen.findByText("The communication plan was not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All communication plans" })).toHaveAttribute("href", "/radio/plans");
  });
});
