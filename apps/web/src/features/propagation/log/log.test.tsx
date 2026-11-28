import {
  ADIF_READ,
  type ComparisonRequest,
  type ComparisonResult,
  type JobDto,
  type Observation,
  type ObservationImport,
  type ObservationInput,
} from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import LogPage from "./log-page";

// The map needs WebGL; nothing here presses it.
vi.mock("../map/plan-map", () => ({ PlanMap: () => null }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const entry = (patch: Partial<Observation> = {}): Observation => ({
  id: "o1",
  at: Date.UTC(2026, 10, 16, 12, 4),
  frequencyMhz: 7.1,
  band: "40m",
  mode: "SSB/LSB",
  outcome: "contact",
  tx: { call: "G4AAA", lat: 51.52, lon: -0.13, from: "locator IO91WM" },
  rx: { call: "G4BBB", lat: null, lon: null, from: "" },
  powerWatts: 5,
  antenna: "Low dipole",
  reportSent: "57",
  reportReceived: "55",
  notes: "Sked with Brum",
  propMode: "",
  source: "adif",
  importId: "i1",
  createdAt: 1,
  ...patch,
});

const imported = (patch: Partial<ObservationImport> = {}): ObservationImport => ({
  id: "i1",
  fileName: "test log.adi",
  adifVersion: "3.1.8",
  program: "TestLog 2.0",
  records: 12,
  imported: 5,
  duplicates: 1,
  skipped: [
    { reason: "No callsign for the station contacted (CALL)", count: 4 },
    { reason: "No mode (MODE)", count: 2 },
  ],
  notes: [{ reason: "No position was given for the contacted station, so that end has none", count: 3 }],
  createdAt: Date.UTC(2026, 10, 16, 13, 0),
  ...patch,
});

function comparisonOf(made: [number, number, number], patch: Partial<ComparisonResult> = {}): ComparisonResult {
  const compared = made[0] + made[1] + made[2];
  return {
    computedAt: 1,
    tookMs: 300,
    engine: { model: "VOACAP Version 16.1207W" } as ComparisonResult["engine"],
    request: {} as ComparisonRequest,
    total: compared + 4,
    compared,
    levels: [
      { id: "low", contact: made[0], heard: 0, failed: 0 },
      { id: "middling", contact: made[1], heard: 0, failed: 0 },
      { id: "high", contact: made[2], heard: 0, failed: 0 },
    ],
    excluded: [
      { reason: "One end or both have no stated position", count: 3 },
      { reason: "The solar table has no sunspot number for that month, and none was given", count: 1 },
    ],
    monthsWithoutSsn: [{ month: "2014-03", count: 1 }],
    rows: [
      {
        id: "o1",
        at: Date.UTC(2026, 10, 16, 12, 4),
        utcHour: 12,
        frequencyMhz: 7.1,
        mode: "ssb",
        outcome: "contact",
        txCall: "G4AAA",
        rxCall: "G4BBB",
        distanceKm: 162.4,
        reliability: 0.55,
        snrDbHz: 46.7,
        ssn: 83,
        level: "middling",
      },
    ],
    reading: ["A log holds the contacts that were made.", "These counts do not adjust the engine in any way."],
    ...patch,
  };
}

/** The job a large file is brought in by, as `/api/jobs/:id` gives it. */
const importJob = (patch: Partial<JobDto> = {}): JobDto => ({
  id: "j1",
  type: "propagation.adif-import",
  queue: "import",
  state: "running",
  title: "Contact log from years.adi",
  subject: "adif-import:i9",
  progress: { current: 12_000_000, total: 30_000_000, message: "Reading the log" },
  error: null,
  errorKind: null,
  attempts: 1,
  maxAttempts: 1,
  result: null,
  createdAt: 1,
  startedAt: 2,
  finishedAt: null,
  updatedAt: 3,
  ...patch,
});

interface Server {
  posted: Array<{ path: string; body: unknown }>;
  put: Array<{ path: string; body: unknown }>;
  deleted: string[];
  /** What the job is answered as from now on: a test moves it on by setting this. */
  job: JobDto;
  /** How many times the log itself was asked for. */
  listed: number;
}

/**
 * Stands in for the live-events stream, which tells the screen each time a job moves (its query is under "jobs"):
 * the screen's own poll is only a slow fallback for when that stream is down.
 */
let jobEvents: number | undefined;
function withJobEvents(client: QueryClient): QueryClient {
  window.clearInterval(jobEvents);
  jobEvents = window.setInterval(() => void client.invalidateQueries({ queryKey: ["jobs"] }), 300);
  return client;
}
afterEach(() => window.clearInterval(jobEvents));

function show(
  options: {
    observations?: Observation[] | "fails";
    total?: number;
    imports?: ObservationImport[];
    importAnswer?: ObservationImport | "refused" | "job";
    /** A job found under way when the screen is opened. */
    importing?: JobDto;
    addAnswer?: "duplicate";
    comparison?: ComparisonResult | "fails";
    engineReady?: boolean;
  } = {},
): Server {
  const server: Server = { posted: [], put: [], deleted: [], job: options.importing ?? importJob(), listed: 0 };
  const observations = options.observations ?? [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (init?.method === "POST") {
        const body = init.body instanceof FormData ? (init.body.get("file") as File).name : JSON.parse(String(init.body));
        server.posted.push({ path: pathname, body });
        if (pathname.endsWith("/import")) {
          if (options.importAnswer === "refused")
            return json(
              { error: { code: "bad_request", message: "That is not an ADIF file Outpost can read: it has no <EOH> or <EOR> tag." } },
              400,
            );
          if (options.importAnswer === "job")
            return json({ job: importJob({ state: "queued", progress: { current: 0, total: null, message: null } }) });
          return json({ import: options.importAnswer ?? imported() });
        }
        if (pathname === "/api/jobs/j1/cancel") {
          server.job = importJob({ state: "cancelled" });
          return json({ job: server.job });
        }
        if (pathname.endsWith("/compare")) {
          if (options.comparison === "fails")
            return json({ error: { code: "unsupported", message: "A propagation data file is damaged." } }, 415);
          return json({ comparison: options.comparison ?? comparisonOf([1, 1, 1]) });
        }
        if (options.addAnswer === "duplicate")
          return json(
            {
              error: {
                code: "conflict",
                message: "That entry is already in the log: the same minute, stations, band and mode. Nothing was added.",
              },
            },
            409,
          );
        return json({ observation: entry({ id: "new" }) });
      }
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as ObservationInput;
        server.put.push({ path: pathname, body });
        return json({ observation: entry({ id: "o1", notes: body.notes }) });
      }
      if (init?.method === "DELETE") {
        server.deleted.push(pathname);
        return json({ ok: true, removed: 5 });
      }
      if (pathname === "/api/radio/observations") {
        if (observations === "fails") return json({ error: { code: "internal", message: "The database is busy." } }, 500);
        server.listed += 1;
        const underWay = !["succeeded", "failed", "cancelled"].includes(server.job.state);
        return json({
          observations,
          total: options.total ?? observations.length,
          imports: options.imports ?? [],
          importing: options.importing && underWay ? server.job : null,
          adif: ADIF_READ,
        });
      }
      if (pathname === "/api/jobs/j1") return json({ job: server.job });
      if (pathname === "/api/radio/propagation/engines")
        return json({
          engines: [{ id: "voacap", name: "VOACAP", ready: options.engineReady ?? true, problem: "A data file is damaged." }],
        });
      if (pathname === "/api/radio/profiles") return json({ radios: [], antennas: [] });
      if (pathname === "/api/maps/markers") return json({ markers: [] });
      return json({}, 404);
    }),
  );
  render(
    <QueryClientProvider client={withJobEvents(new QueryClient({ defaultOptions: { queries: { retry: false } } }))}>
      <MemoryRouter>
        <LogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return server;
}

const chooseFile = (name: string) =>
  fireEvent.change(screen.getByLabelText("ADIF file to import"), {
    target: { files: [new File(["<EOH>"], name, { type: "text/plain" })] },
  });

describe("the contact log", () => {
  it("starts empty, and says which ADIF it reads and that a position is never worked out", async () => {
    show();
    expect(await screen.findByRole("heading", { name: "Nothing is logged yet" })).toBeInTheDocument();
    // The empty log offers its own buttons, once: in the flow of the page the main one comes first, as across the app.
    const empty = screen.getByRole("heading", { name: "Nothing is logged yet" }).parentElement!;
    expect(
      within(empty)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Import an ADIF file", "Log an entry"]);
    expect(screen.getAllByRole("button", { name: "Log an entry" })).toHaveLength(1);
    // The file's field names are a radio amateur's detail: said, but behind a disclosure.
    expect(screen.getByText("What is read from an ADIF file").closest("details")).not.toHaveAttribute("open");
    const footer = screen.getByText(/ADIF files are read as version 3\.1\.8 of the specification/);
    expect(footer.textContent).toContain("QSO_DATE, TIME_ON, CALL");
    expect(footer.textContent).toContain("MY_GRIDSQUARE");
    expect(footer.textContent).toContain(
      "A position is taken only from a latitude and longitude or a locator of four characters or more that the file states.",
    );
    expect(screen.queryByRole("heading", { name: "Compare with predictions" })).not.toBeInTheDocument();
  });

  it("says so when the log cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    show({ observations: "fails" });
    expect(await screen.findByText("The database is busy.")).toBeInTheDocument();
  });

  it("lists entries in UTC with where each end's position came from, or that it has none", async () => {
    show({
      observations: [
        entry(),
        entry({ id: "o2", outcome: "heard", frequencyMhz: null, band: "20m", mode: "FT8", propMode: "SAT", powerWatts: null }),
      ],
      total: 40,
    });
    const first = (await screen.findByText(/16 Nov 2026, 12:04 UTC · 7\.100 MHz · SSB\/LSB · Contact/)).closest("li")!;
    expect(first.textContent).toContain("G4AAA (IO91WM) to G4BBB (no position)");
    expect(first.textContent).toContain("5 W · Low dipole · sent 57 · received 55 · Sked with Brum");
    expect(screen.getByText(/20m · FT8 · Heard, no contact/).closest("li")!.textContent).toContain("logged as SAT");
    expect(screen.getByText("40 entries, newest first. Times are UTC.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show more \(2 of 40 shown\)/ })).toBeInTheDocument();
  });

  it("imports an ADIF file and accounts for every record: brought in, already there, or left out with the reason", async () => {
    const server = show();
    await screen.findByRole("heading", { name: "Nothing is logged yet" });
    chooseFile("test log.adi");
    expect(await screen.findByText("test log.adi: 5 entries brought in")).toBeInTheDocument();
    expect(server.posted).toEqual([{ path: "/api/radio/observations/import", body: "test log.adi" }]);
    expect(
      screen.getByText(
        /12 records in the file, which says it is ADIF 3\.1\.8, written by TestLog 2\.0\. 5 brought in, 1 already in the log, 6 left out\./,
      ),
    ).toBeInTheDocument();
    const reasons = screen.getByRole("list", { name: "Records left out, by reason" });
    expect(
      within(reasons)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["No callsign for the station contacted (CALL): 4", "No mode (MODE): 2"]);
    expect(within(screen.getByRole("list", { name: "Read with a loss" })).getByRole("listitem").textContent).toBe(
      "No position was given for the contacted station, so that end has none: 3",
    );
  });

  it("says why when a file is not ADIF", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    show({ importAnswer: "refused" });
    await screen.findByRole("heading", { name: "Nothing is logged yet" });
    chooseFile("log.csv");
    expect(await screen.findByText("Nothing was imported")).toBeInTheDocument();
    expect(screen.getByText(/That is not an ADIF file Outpost can read/)).toBeInTheDocument();
  });

  it("follows a large file as the job it is: how far it has read, then every record accounted for", async () => {
    const server = show({ observations: [entry()], importAnswer: "job" });
    await screen.findByText(/16 Nov 2026, 12:04 UTC/);
    chooseFile("years.adi");
    const bar = await screen.findByRole("progressbar", { name: "Log read" });
    const row = bar.closest("div[aria-live]")!;
    await waitFor(() => expect(row.textContent).toContain("Contact log from years.adi: 12.0 MB of 30.0 MB read."));
    expect(row.textContent).toContain("None of it is in the log until all of it is.");
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByRole("button", { name: /Import an ADIF file/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText(/brought in/)).not.toBeInTheDocument();

    const before = server.listed;
    server.job = importJob({
      state: "succeeded",
      result: { kind: "adif-import", import: imported({ fileName: "years.adi", records: 100_000, imported: 99_990, duplicates: 4 }) },
    });
    expect(await screen.findByText("years.adi: 99,990 entries brought in")).toBeInTheDocument();
    expect(screen.getByText(/100,000 records in the file/).textContent).toContain("99,990 brought in, 4 already in the log, 6 left out.");
    expect(screen.queryByRole("progressbar", { name: "Log read" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import an ADIF file/ })).toBeEnabled();
    // The log is asked for again, now that the file is in it.
    await waitFor(() => expect(server.listed).toBeGreaterThan(before));
  });

  it("stops a large import when asked, and says that nothing of the file is in the log", async () => {
    const server = show({ observations: [entry()], importAnswer: "job" });
    await screen.findByText(/16 Nov 2026, 12:04 UTC/);
    chooseFile("years.adi");
    await screen.findByRole("progressbar", { name: "Log read" });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    const notice = (await screen.findByText("The import was stopped")).closest("div")!.parentElement!;
    expect(notice.textContent).toContain("Nothing from the file is in the log.");
    expect(server.posted.map((item) => item.path)).toContain("/api/jobs/j1/cancel");
    expect(screen.queryByRole("progressbar", { name: "Log read" })).not.toBeInTheDocument();
  });

  it("gives the job's own words when a large file could not be brought in", async () => {
    const server = show({ observations: [entry()], importAnswer: "job" });
    await screen.findByText(/16 Nov 2026, 12:04 UTC/);
    server.job = importJob({
      state: "failed",
      error: "That file holds more than 200,000 contacts. Export it in parts and import each.",
    });
    chooseFile("lifetime.adi");
    expect(await screen.findByText("Nothing was imported")).toBeInTheDocument();
    expect(screen.getByText("That file holds more than 200,000 contacts. Export it in parts and import each.")).toBeInTheDocument();
  });

  it("shows an import already under way when the screen is opened part of the way through", async () => {
    const server = show({ observations: [entry()], importing: importJob() });
    const bar = await screen.findByRole("progressbar", { name: "Log read" });
    await waitFor(() => expect(bar.closest("div[aria-live]")!.textContent).toContain("12.0 MB of 30.0 MB read."));
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    server.job = importJob({ state: "succeeded", result: { kind: "adif-import", import: imported({ fileName: "years.adi" }) } });
    expect(await screen.findByText("years.adi: 5 entries brought in")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("progressbar", { name: "Log read" })).not.toBeInTheDocument());
  });

  it("takes a typed entry with or without positions, and says what is wrong before sending", async () => {
    const server = show();
    fireEvent.click(await screen.findByRole("button", { name: "Log an entry" }));
    const dialog = screen.getByRole("dialog", { name: "Log an entry" });
    const add = within(dialog).getByRole("button", { name: "Add to the log" });
    fireEvent.change(within(dialog).getByLabelText("Date and time, UTC"), { target: { value: "2026-11-16T15:55" } });
    fireEvent.click(add);
    expect(within(dialog).getByRole("alert").textContent).toBe("Give the frequency in megahertz.");
    fireEvent.change(within(dialog).getByLabelText("Frequency, MHz"), { target: { value: "7.12" } });
    fireEvent.change(within(dialog).getByLabelText("Your station: where"), { target: { value: "somewhere" } });
    fireEvent.click(add);
    expect(within(dialog).getByRole("alert").textContent).toContain("That is not a position");
    fireEvent.change(within(dialog).getByLabelText("Your station: where"), { target: { value: "51.5074, -0.1278" } });
    fireEvent.change(within(dialog).getByLabelText("Your station: callsign (optional)"), { target: { value: "G4AAA" } });
    fireEvent.change(within(dialog).getByLabelText("The other station: callsign (optional)"), { target: { value: "G4BBB" } });
    fireEvent.change(within(dialog).getByLabelText("Transmitter power, watts (optional)"), { target: { value: "5" } });
    fireEvent.click(add);
    await waitFor(() => expect(server.posted).toHaveLength(1));
    const sent = server.posted[0]!.body as ObservationInput;
    expect(sent).toMatchObject({
      at: "2026-11-16T15:55:00Z",
      frequencyMhz: 7.12,
      mode: "SSB",
      outcome: "contact",
      tx: { call: "G4AAA", lat: 51.5074, lon: -0.1278 },
      // No position was given for the other station, and none is made up for it.
      rx: { call: "G4BBB", lat: null, lon: null },
      powerWatts: 5,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // The next entry starts from where your station was, and a locator given for the other is sent as that locator.
    fireEvent.click(screen.getByRole("button", { name: "Log an entry" }));
    const again = screen.getByRole("dialog", { name: "Log an entry" });
    expect(within(again).getByLabelText("Your station: where")).toHaveValue("51.5074, -0.1278");
    fireEvent.change(within(again).getByLabelText("Frequency, MHz"), { target: { value: "7.15" } });
    fireEvent.change(within(again).getByLabelText("The other station: where"), { target: { value: "JO62qm" } });
    fireEvent.click(within(again).getByRole("button", { name: "Add to the log" }));
    await waitFor(() => expect(server.posted).toHaveLength(2));
    expect((server.posted[1]!.body as ObservationInput).rx).toMatchObject({ locator: "JO62qm" });
  });

  it("names the ends by who is transmitting when a station was only heard, and says when an entry is already there", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    show({ addAnswer: "duplicate" });
    fireEvent.click(await screen.findByRole("button", { name: "Log an entry" }));
    const dialog = screen.getByRole("dialog", { name: "Log an entry" });
    expect(within(dialog).getByRole("group", { name: "Your station, transmitting" })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Frequency, MHz"), { target: { value: "7.1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to the log" }));
    expect(await within(dialog).findByText("Not added")).toBeInTheDocument();
    expect(within(dialog).getByText(/already in the log/)).toBeInTheDocument();
  });

  it("puts an entry right in place, starting from what it holds", async () => {
    const server = show({ observations: [entry()] });
    fireEvent.click(await screen.findByRole("button", { name: /Edit the entry of 16 Nov 2026, 12:04 UTC with G4BBB/ }));
    const dialog = screen.getByRole("dialog", { name: "Edit the entry" });
    expect(within(dialog).getByLabelText("Date and time, UTC")).toHaveValue("2026-11-16T12:04");
    expect(within(dialog).getByLabelText("Frequency, MHz")).toHaveValue("7.1");
    expect(within(dialog).getByLabelText("Mode")).toHaveValue("SSB/LSB");
    // The locator it was logged with is given back as that locator; an end with no position is left empty.
    expect(within(dialog).getByLabelText("Your station: where")).toHaveValue("IO91WM");
    expect(within(dialog).getByLabelText("The other station: where")).toHaveValue("");
    expect(within(dialog).getByLabelText("Your station: callsign (optional)")).toHaveValue("G4AAA");
    expect(within(dialog).getByLabelText("Report sent (optional)")).toHaveValue("57");
    fireEvent.change(within(dialog).getByLabelText("Notes (optional)"), { target: { value: "Sked with Brum, on the second try" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save the entry" }));
    await waitFor(() => expect(server.put).toHaveLength(1));
    expect(server.put[0]!.path).toBe("/api/radio/observations/o1");
    expect(server.put[0]!.body).toMatchObject({
      at: "2026-11-16T12:04:00Z",
      frequencyMhz: 7.1,
      mode: "SSB/LSB",
      outcome: "contact",
      tx: { call: "G4AAA", locator: "IO91WM" },
      rx: { call: "G4BBB", lat: null, lon: null },
      powerWatts: 5,
      antenna: "Low dipole",
      reportSent: "57",
      reportReceived: "55",
      notes: "Sked with Brum, on the second try",
    });
    expect(server.posted).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the band of an entry logged with no frequency, unless one is given", async () => {
    const server = show({ observations: [entry({ frequencyMhz: null, band: "20m" })] });
    fireEvent.click(await screen.findByRole("button", { name: /Edit the entry of/ }));
    const dialog = screen.getByRole("dialog", { name: "Edit the entry" });
    expect(within(dialog).getByText(/Logged on the 20m band with no frequency/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save the entry" }));
    await waitFor(() => expect(server.put).toHaveLength(1));
    expect(server.put[0]!.body).toMatchObject({ frequencyMhz: null, band: "20m" });
  });

  it("deletes an entry, and takes back a file with what it brought in, only when confirmed", async () => {
    const server = show({ observations: [entry()], imports: [imported()] });
    fireEvent.click(await screen.findByRole("button", { name: /Delete the entry of 16 Nov 2026, 12:04 UTC with G4BBB/ }));
    let confirm = await screen.findByRole("alertdialog");
    expect(confirm.textContent).toContain("G4AAA (IO91WM) to G4BBB (no position)");
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(server.deleted).toEqual(["/api/radio/observations/o1"]));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    expect(screen.getByText(/12 records: 5 brought in, 1 already in the log, 6 left out\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Take back test log.adi" }));
    confirm = await screen.findByRole("alertdialog");
    expect(confirm.textContent).toContain("The 5 entries that “test log.adi” brought in will be removed from the log.");
    expect(confirm.textContent).toContain("the file itself is not Outpost's to delete");
    fireEvent.click(within(confirm).getByRole("button", { name: "Take back" }));
    await waitFor(() => expect(server.deleted).toContain("/api/radio/observations/imports/i1"));
  });
});

describe("comparing the log with predictions", () => {
  const compare = async () => fireEvent.click(await screen.findByRole("button", { name: "Compare" }));

  it("gives counts and no percentages for a handful, and says why", async () => {
    const server = show({ observations: [entry()] });
    await compare();
    expect(await screen.findByText("3 of 7 entries could be compared with a prediction.")).toBeInTheDocument();
    expect(server.posted[0]).toMatchObject({
      path: "/api/radio/observations/compare",
      body: { noise: "residential", defaultPowerWatts: null, ssnByMonth: {}, myAntenna: { kind: "horizontal-dipole", heightM: 5 } },
    });
    const table = screen.getByRole("table", { name: /Where the entries fell/ });
    expect(within(table).getByRole("row", { name: /Low: under 30% of days/ }).textContent).toBe("Low: under 30% of days10");
    expect(within(table).getByRole("row", { name: /High: 70% of days or more/ }).textContent).toBe("High: 70% of days or more10");
    expect(table.textContent).not.toContain("%)");
    expect(
      screen.getByText(/With fewer than 30 compared, no percentages are given: a share of a handful says nothing either way\./),
    ).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Entries left out, by reason" })).getAllByRole("listitem")[0]!.textContent).toBe(
      "One end or both have no stated position: 3",
    );
    expect(screen.getByText("These counts do not adjust the engine in any way.")).toBeInTheDocument();
    const rows = screen.getByRole("table", { name: "Each entry compared, with the engine's figures for it" });
    expect(within(rows).getByRole("row", { name: /G4AAA to G4BBB/ }).textContent).toContain("55% at 12:00, SSN 83");
    // It counts; it does not grade the engine.
    expect(document.body.textContent).not.toMatch(/\b(wrong|accurate|accuracy|correct|verified|validated)\b/i);
  });

  it("gives each share with the count it rests on once there are thirty", async () => {
    show({ observations: [entry()], comparison: comparisonOf([6, 9, 15]) });
    await compare();
    const table = await screen.findByRole("table", { name: /Where the entries fell/ });
    expect(within(table).getByRole("row", { name: /Low/ }).textContent).toContain("6 (20%)");
    expect(within(table).getByRole("row", { name: /Middling/ }).textContent).toContain("9 (30%)");
    expect(within(table).getByRole("row", { name: /High/ }).textContent).toContain("15 (50%)");
    expect(
      screen.getByText("Each percentage is a share of its own column, and the count beside it is what it rests on."),
    ).toBeInTheDocument();
  });

  it("asks for a sunspot number for a month the table does not reach, and sends it with the next comparison", async () => {
    const server = show({ observations: [entry()] });
    await compare();
    const field = await screen.findByLabelText("March 2014 (1 entry)");
    expect(screen.getByText(/Outpost does not ship past sunspot numbers/)).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "400" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare again" }));
    expect(screen.getByRole("alert").textContent).toBe("Give a smoothed sunspot number between 0 and 300 for March 2014.");
    fireEvent.change(field, { target: { value: "115" } });
    fireEvent.change(screen.getByLabelText("Power to assume where the log gives none, watts (optional)"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare again" }));
    await waitFor(() => expect(server.posted).toHaveLength(2));
    expect(server.posted[1]!.body).toMatchObject({ defaultPowerWatts: 50, ssnByMonth: { "2014-03": 115 } });
    expect(JSON.parse(localStorage.getItem("outpost.propagation.log.ssn.v1")!)).toEqual({ "2014-03": "115" });
  });

  it("says when nothing could be compared, when the engine cannot run, and when the comparison fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    show({ observations: [entry()], comparison: comparisonOf([0, 0, 0], { rows: [] }) });
    await compare();
    expect(await screen.findByText(/0 of 4 entries could be compared with a prediction\. There is nothing to count\./)).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /Where the entries fell/ })).not.toBeInTheDocument();
  });

  it("does not compare when the engine cannot run, and reports a failure in words", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    show({ observations: [entry()], engineReady: false });
    expect(await screen.findByText("The propagation engine cannot run, so nothing can be compared")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare" })).toBeDisabled();
  });

  it("reports a failed comparison in the server's words", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    show({ observations: [entry()], comparison: "fails" });
    await compare();
    expect(await screen.findByText("Nothing was compared")).toBeInTheDocument();
    expect(screen.getByText("A propagation data file is damaged.")).toBeInTheDocument();
  });
});
