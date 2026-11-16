import type {
  RepeaterDto,
  RepeaterDuplicateSide,
  RepeaterDuplicatesResponse,
  RepeaterFetchResponse,
  RepeaterImportDuplicates,
  RepeaterImportPreview,
  RepeaterImportResult,
  RepeaterListDto,
  RepeaterOverlayResponse,
  RepeaterSourceDto,
  RepeaterSourcesResponse,
} from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import { exportHref, NO_FILTERS } from "./data";
import { DuplicatesDialog } from "./duplicates-dialog";
import { ImportDialog } from "./import-dialog";
import { nearestHit, overlayBox, repeatersData } from "./map/layers";
import { sightEndOf } from "./map/use-repeaters-on-map";
import { positionReadings, readDraft } from "./repeater-form";
import { orderRegions, SourcesSection, useGetList } from "./sources-section";
import { accessParts, ageWarning, isApproximate, positionDigits, positionNote, shiftWords, sourceOf } from "./words";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 16);

const list = (overrides: Partial<RepeaterListDto> = {}): RepeaterListDto => ({
  id: "list1",
  name: "North list",
  source: "A made-up society",
  sourceUrl: null,
  format: "etcc-status",
  formatName: "RSGB ETCC list: voice repeaters and gateways, with status",
  fileName: "north.csv",
  dataDate: NOW - 20 * DAY,
  importedAt: NOW,
  updatedAt: NOW,
  count: 6,
  editedCount: 0,
  setAsideCount: 0,
  fetched: null,
  ...overrides,
});

const NO_DUPLICATES: RepeaterImportDuplicates = { held: 0, heldByHand: 0, withinFile: 0, possible: 0, examples: [] };

const side = (overrides: Partial<RepeaterDuplicateSide> = {}): RepeaterDuplicateSide => {
  const { id: _id, listId: _listId, edited: _edited, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = repeater();
  return { ...fields, id: "r1", line: null, listName: "North list", dataDate: Date.UTC(2026, 9, 1), byHand: false, ...overrides };
};

const repeater = (overrides: Partial<RepeaterDto> = {}): RepeaterDto => ({
  id: "r1",
  listId: "list1",
  callsign: "QZ3AB",
  outputHz: 145_662_500,
  inputHz: 145_062_500,
  band: "2m",
  modes: ["fm"],
  ctcssHz: 94.8,
  dcsCode: null,
  dmrColourCode: null,
  talkgroups: "",
  accessNote: "",
  channel: "RV53",
  place: "THORNWICK",
  region: "NOR",
  country: "",
  lat: 54.521,
  lon: -3.123,
  locator: "IO84KM",
  positionPrecisionMeters: 56,
  antennaMeters: 12,
  keeper: "QZ4AAA",
  status: "operational",
  statusText: "OPERATIONAL",
  notes: "",
  edited: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe("how repeaters are described", () => {
  it("says where an entry came from and the date of its data, and its age once that is worth doubting", () => {
    expect(sourceOf(list(), NOW)).toEqual({ text: "A made-up society, data of 27 Oct 2026", age: null, tone: "neutral" });
    expect(sourceOf(list({ dataDate: NOW - 200 * DAY }), NOW)).toMatchObject({ age: "6 months old", tone: "warning" });
    expect(sourceOf(list({ dataDate: NOW - 800 * DAY, source: "" }), NOW)).toMatchObject({
      text: expect.stringMatching(/^North list, data of /),
      age: "2 years old",
    });
    expect(sourceOf(null, NOW)).toEqual({ text: "Entered by hand", age: null, tone: "neutral" });
    expect(ageWarning(list(), NOW)).toBeNull();
    expect(ageWarning(list({ dataDate: NOW - 200 * DAY }), NOW)).toBe("This data is 6 months old. Some of it will have changed.");
    expect(ageWarning(list({ dataDate: NOW - 400 * DAY }), NOW)).toMatch(/^This data is 1 year old\. Repeaters change tone/);
  });

  it("says how to get in, and where to transmit", () => {
    expect(accessParts(repeater())).toEqual(["CTCSS 94.8 Hz"]);
    expect(accessParts(repeater({ ctcssHz: null, dcsCode: "023", dmrColourCode: 3 }))).toEqual(["DCS 023", "colour code 3"]);
    expect(accessParts(repeater({ ctcssHz: null, accessNote: "1750 Hz tone burst." }))).toEqual(["1750 Hz tone burst"]);
    expect(
      accessParts(repeater({ accessNote: "Tone squelch: the same tone is sent back, and the keeper asks for a call first." })),
    ).toEqual(["CTCSS 94.8 Hz", "more on its page"]);
    expect(shiftWords(repeater())).toBe("shift -0.6 MHz");
    expect(shiftWords(repeater({ inputHz: 145_662_500 }))).toBe("simplex");
    expect(shiftWords(repeater({ inputHz: null }))).toBe("input not listed");
  });

  it("is plain about a position the list has blurred", () => {
    const blurred = repeater({ lat: 54.6, lon: -2.9, positionPrecisionMeters: 5560, locator: "IO84" });
    expect(isApproximate(repeater())).toBe(false);
    expect(isApproximate(blurred)).toBe(true);
    expect(positionNote(blurred)).toBe(
      "The list gives this position only to within about 5.56 km: lists blur private sites on purpose. Anything worked out from it, line of sight above all, is rough.",
    );
    expect(positionNote(repeater())).toBe("A listed position, written to within about 56 m. It has not been checked against the site.");
    expect(positionNote(repeater({ listId: null, positionPrecisionMeters: 0 }))).toBe("As you entered it.");
    // No more decimal places are shown than the list gave.
    expect(positionDigits(blurred)).toBe(1);
    expect(positionDigits(repeater())).toBe(3);
    // The name the line-of-sight check shows for that end carries the warning with it.
    expect(sightEndOf(blurred)).toEqual({
      position: { lat: 54.6, lon: -2.9 },
      name: "QZ3AB: listed only to about 5.56 km",
    });
    expect(sightEndOf(repeater())?.name).toBe("QZ3AB: listed position");
    expect(sightEndOf(repeater({ lat: null, lon: null }))).toBeNull();
  });

  it("builds the address of an export from the filters in use", () => {
    expect(exportHref("chirp", { ...NO_FILTERS, band: "2m", q: " thornwick " }, { lat: 54.5, lon: -3.1 }, 50, 100)).toBe(
      "/api/repeaters/export?format=chirp&q=thornwick&band=2m&near=54.50000%2C-3.10000&withinKm=50&limit=100",
    );
    expect(exportHref("outpost", NO_FILTERS, null, 50, null)).toBe("/api/repeaters/export?format=outpost");
  });
});

describe("repeaters on the map", () => {
  const overlay: RepeaterOverlayResponse = {
    total: 3,
    points: [
      { id: "r1", callsign: "QZ3AB", lat: 54.5, lon: -3.1, outputHz: 145_662_500, band: "2m", status: "operational" },
      { id: "r2", callsign: "QZ3EF", lat: 54.5, lon: -3.0, outputHz: 430_875_000, band: "70cm", status: "off-air" },
    ],
    cells: [{ lat: 55, lon: -3.1, count: 1234 }],
  };

  it("asks about a box rounded outwards, so a small nudge of the map asks nothing new", () => {
    expect(overlayBox([-3.512, 54.213, -2.487, 54.788])).toBe("-3.6,54.2,-2.4,54.8");
    expect(overlayBox([-3.531, 54.201, -2.469, 54.799])).toBe("-3.6,54.2,-2.4,54.8");
    // A view wider than the world is the whole world.
    expect(overlayBox([-300, -70, 300, 80])).toBe("-180,-70,180,80");
    // Across the 180° meridian the west edge is east of the east edge, as the server expects.
    expect(overlayBox([170, -30, 190, 0])).toBe("170,-30,-170,0");
    expect(overlayBox([-10, -95, 10, 95])).toBe("-10,-90,10,90");
  });

  it("draws patches with their count, repeaters with their callsign and frequency, and a ring round the open one", () => {
    const data = repeatersData(overlay, { lat: 54.5, lon: -3.1 });
    expect(data.features.map((feature) => feature.properties.kind)).toEqual(["cell", "point", "point", "selected"]);
    expect(data.features[0]!.properties).toEqual({ kind: "cell", count: 1234, label: "1,234" });
    expect(data.features[1]!.properties).toEqual({ kind: "point", id: "r1", callsign: "QZ3AB", detail: "QZ3AB\n145.6625", offAir: false });
    expect(data.features[2]!.properties.offAir).toBe(true);
    expect(data.features[1]!.geometry).toEqual({ type: "Point", coordinates: [-3.1, 54.5] });
    expect(repeatersData(undefined, null).features).toEqual([]);
  });

  it("finds the repeater under a press, within a finger's reach, and prefers one to a patch", () => {
    // A hundred pixels to a degree, north up.
    const project = (position: { lat: number; lon: number }) => ({ x: (position.lon + 4) * 100, y: (56 - position.lat) * 100 });
    expect(nearestHit(overlay, { x: 92, y: 155 }, project)).toEqual({ kind: "point", id: "r1", lat: 54.5, lon: -3.1 });
    expect(nearestHit(overlay, { x: 96, y: 150 }, project)?.id).toBe("r2");
    expect(nearestHit(overlay, { x: 90, y: 105 }, project)).toEqual({ kind: "cell", lat: 55, lon: -3.1 });
    expect(nearestHit(overlay, { x: 300, y: 300 }, project)).toBeNull();
    expect(nearestHit(undefined, { x: 90, y: 150 }, project)).toBeNull();
    // Equally near a repeater and a patch: the repeater.
    const beside: RepeaterOverlayResponse = { total: 2, points: [overlay.points[0]!], cells: [{ lat: 54.5, lon: -3.0, count: 5 }] };
    expect(nearestHit(beside, { x: 95, y: 150 }, project)?.kind).toBe("point");
  });
});

describe("the form for an entry", () => {
  const draft = {
    callsign: " QZ3NEW ",
    output: "433,375",
    input: "434.975",
    modes: ["fm" as const],
    ctcss: "82.5",
    dcs: "",
    colourCode: "",
    talkgroups: "",
    accessNote: "",
    channel: "",
    place: "Garth Head",
    region: "",
    country: "",
    position: "IO84EJ",
    positionReading: "",
    antenna: "10",
    keeper: "",
    status: "unknown" as const,
    notes: "",
  };

  it("turns megahertz into hertz, and a locator into a place for the server to work out", () => {
    const { input, problems } = readDraft(draft, null);
    expect(problems).toEqual({});
    expect(input).toMatchObject({
      callsign: "QZ3NEW",
      outputHz: 433_375_000,
      inputHz: 434_975_000,
      ctcssHz: 82.5,
      antennaMeters: 10,
      lat: null,
      lon: null,
      locator: "IO84EJ",
    });
    expect(readDraft({ ...draft, position: "54.4012, -3.6101" }, null).input).toMatchObject({ lat: 54.4012, lon: -3.6101, locator: "" });
    expect(readDraft({ ...draft, position: "", input: "" }, null).input).toMatchObject({ lat: null, lon: null, inputHz: null });
  });

  it("asks which is meant when a position can be read two ways, and does not call a grid square an exact place", () => {
    // "NO14" is a British 10 km grid square in Fife and a Maidenhead square in Siberia.
    const twoWays = positionReadings("NO14");
    expect(twoWays.map((item) => item.name)).toEqual(["British grid reference", "Maidenhead locator"]);
    const undecided = readDraft({ ...draft, position: "NO14" }, null);
    expect(undecided.problems.position).toBe("This can be read two ways. Choose which it is.");
    expect("lat" in undecided.input || "locator" in undecided.input).toBe(false);

    const asLocator = readDraft({ ...draft, position: "NO14", positionReading: "maidenhead" }, null);
    expect(asLocator.problems).toEqual({});
    expect(asLocator.input).toMatchObject({ lat: null, lon: null, locator: "NO14" });

    const asGrid = readDraft({ ...draft, position: "NO14", positionReading: "osgb" }, null);
    expect(asGrid.problems).toEqual({});
    expect(asGrid.input).toMatchObject({ locator: "", positionPrecisionMeters: 10_000 });
    expect(asGrid.input.lat).toBeGreaterThan(56);
    expect(asGrid.input.lat).toBeLessThan(57);

    // One reading needs no choice; a full grid reference is as exact as it says, typed coordinates are exact.
    expect(positionReadings("IO84EJ")).toHaveLength(1);
    expect(readDraft({ ...draft, position: "NY 2154 0718" }, null).input).toMatchObject({ positionPrecisionMeters: 10 });
    expect(readDraft({ ...draft, position: "54.4012, -3.6101" }, null).input).toMatchObject({ positionPrecisionMeters: 0 });
  });

  it("does not send a position that was only looked at, so a listed position is not made exact", () => {
    const original = repeater({ lat: 54.6, lon: -2.9, positionPrecisionMeters: 5560, locator: "IO84" });
    const same = readDraft({ ...draft, position: "IO84" }, original).input;
    expect("lat" in same || "locator" in same).toBe(false);
    expect(readDraft({ ...draft, position: "IO84KM" }, original).input).toMatchObject({ locator: "IO84KM", lat: null });
  });

  it("says what is wrong with each field", () => {
    const { problems } = readDraft(
      { ...draft, callsign: " ", output: "fast", ctcss: "12", dcs: "999", colourCode: "16", position: "over there", antenna: "tall" },
      null,
    );
    expect(Object.keys(problems).sort()).toEqual(["antenna", "callsign", "colourCode", "ctcss", "dcs", "output", "position"]);
    expect(problems.output).toBe("A frequency in megahertz, such as 145.7750.");
  });
});

describe("bringing in a file", () => {
  afterEach(() => vi.restoreAllMocks());

  const preview = (overrides: Partial<RepeaterImportPreview> = {}): RepeaterImportPreview => ({
    fileName: "club.csv",
    sizeBytes: 300,
    format: "csv",
    formatName: "CSV with headings",
    columns: ["Station", "Freq", "Kind"],
    mapping: { callsign: "Station", output: "Freq" },
    rows: 3,
    usable: 2,
    skippedCount: 1,
    skipped: [{ line: 4, reason: "No output frequency.", text: "qz3zz, , FM" }],
    sample: [{ ...repeater(), line: 2 }],
    withPosition: 0,
    approximatePositions: 0,
    bands: { "2m": 2 },
    warnings: ["No positions were found, so these will be in the list but not on the map, and have no distance."],
    update: null,
    duplicates: NO_DUPLICATES,
    ...overrides,
  });

  const result: RepeaterImportResult = {
    list: list({ name: "Club" }),
    added: 2,
    updated: 0,
    unchanged: 0,
    removed: 0,
    keptEdits: 0,
    replacedEdits: 0,
    skipped: 1,
    duplicatesSetAside: 0,
    heldSetAside: 0,
    carriedEdits: 0,
  };

  function show(props: { list?: RepeaterListDto } = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ImportDialog open onClose={() => {}} list={props.list} />
      </QueryClientProvider>,
    );
  }

  const fieldsOf = (form: FormData) => Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === "string"));

  it("shows how a file was read before anything is kept, takes a corrected column, and imports with the list's name and date", async () => {
    const upload = vi.spyOn(api, "upload").mockImplementation(async (path, form) => {
      if (path.endsWith("/preview")) {
        const mapping = fieldsOf(form).mapping;
        return (mapping ? preview({ mapping: JSON.parse(mapping as string) }) : preview()) as never;
      }
      return result as never;
    });
    const user = userEvent.setup();
    show();
    const dialog = screen.getByRole("dialog", { name: "Import a list of repeaters" });
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();

    await user.upload(
      within(dialog).getByLabelText("File of repeaters"),
      new File(["Station,Freq,Kind\n"], "club.csv", { type: "text/csv" }),
    );
    expect(await within(dialog).findByText(/Read as/)).toHaveTextContent(
      "Read as CSV with headings. 2 of 3 rows can be kept, 0 with a position.",
    );
    expect(within(dialog).getByText(/No positions were found/)).toBeVisible();
    expect(within(dialog).getByText("No output frequency.")).toBeVisible();
    expect(within(dialog).getByRole("table", { name: "The first rows of the file as they would be kept" })).toHaveTextContent(
      "QZ3AB145.6625-0.6 MHzCTCSS 94.8 HzFM",
    );
    // Nothing has been kept: only the preview was asked for.
    expect(upload.mock.calls.map(([path]) => path)).toEqual(["/api/repeaters/import/preview"]);

    // An unknown layout is shown with its columns open; the person says which column holds the modes.
    await user.click(within(dialog).getByRole("combobox", { name: "Read the column “Kind” as" }));
    await user.click(await screen.findByRole("option", { name: "Modes" }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fieldsOf(upload.mock.calls[1]![1]).mapping as string)).toEqual({
      callsign: "Station",
      output: "Freq",
      modes: "Kind",
    });

    expect(within(dialog).getByLabelText("Name of the list")).toHaveValue("club");
    await user.type(within(dialog).getByLabelText("Who publishes it"), "Fell Radio Club");
    await user.click(within(dialog).getByRole("button", { name: "Import 2 repeaters" }));
    expect(await within(dialog).findByText("“Club” is imported")).toBeVisible();
    const sent = fieldsOf(upload.mock.calls[2]![1]);
    expect(upload.mock.calls[2]![0]).toBe("/api/repeaters/import");
    expect(sent).toMatchObject({ name: "club", source: "Fell Radio Club", edited: "keep", gone: "remove", duplicates: "prefer-newer" });
    // With nothing already held, nothing is asked about duplicates.
    expect(within(dialog).queryByRole("region", { name: "Repeaters already held" })).toBeNull();
    expect(sent.dataDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.parse(sent.mapping as string)).toEqual({ callsign: "Station", output: "Freq", modes: "Kind" });
  });

  it("shows what an update would change, and replaces the person's own changes only if they say so", async () => {
    const upload = vi.spyOn(api, "upload").mockImplementation(async (path) =>
      path.endsWith("/preview")
        ? (preview({
            format: "etcc-status",
            formatName: "RSGB ETCC list: voice repeaters and gateways, with status",
            warnings: [],
            skipped: [],
            skippedCount: 0,
            update: {
              listId: "list1",
              listName: "North list",
              added: 1,
              changed: 2,
              unchanged: 0,
              gone: 1,
              editedSame: 1,
              editedDiffering: 1,
              editedExamples: [{ callsign: "QZ3AB", outputHz: 145_662_500 }],
              removedByYou: 1,
              setAside: 0,
              editedGone: 0,
            },
          }) as never)
        : ({ ...result, keptEdits: 2 } as never),
    );
    const user = userEvent.setup();
    show({ list: list() });
    const dialog = screen.getByRole("dialog", { name: "Bring “North list” up to date" });
    await user.upload(within(dialog).getByLabelText("File of repeaters"), new File(["id,callsign\n"], "newer.csv", { type: "text/csv" }));

    const plan = await within(dialog).findByRole("region", { name: "What bringing the list up to date would do" });
    expect(plan).toHaveTextContent("1new in the file: added");
    expect(plan).toHaveTextContent("2changed in the file: brought up to date");
    expect(plan).toHaveTextContent("1no longer in the file: removed");
    expect(plan).toHaveTextContent("1changed by you: left as you have them");
    expect(plan).toHaveTextContent("1removed by you: stay removed");
    expect(plan).toHaveTextContent("1 entry you changed differs in this file");
    expect(plan).toHaveTextContent("QZ3AB (145.6625)");
    // A recognised layout keeps its columns folded away.
    expect(within(dialog).queryByRole("combobox", { name: /Read the column/ })).toBeNull();

    const replace = within(dialog).getByRole("checkbox", { name: "Replace my changes to it with what the list now says" });
    expect(replace).not.toBeChecked();
    await user.click(within(dialog).getByRole("checkbox", { name: /Keep the 1 entry that is no longer in the file/ }));
    await user.click(within(dialog).getByRole("button", { name: "Bring up to date" }));
    await within(dialog).findByText("“Club” is up to date");
    expect(fieldsOf(upload.mock.calls[1]![1])).toMatchObject({ listId: "list1", edited: "keep", gone: "keep" });
  });

  it("says what is wrong with a file that cannot be read, and keeps nothing", async () => {
    const { ApiError } = await import("@/lib/api");
    const upload = vi.spyOn(api, "upload").mockRejectedValue(new ApiError(400, "bad_request", "That file has no row of column headings."));
    const user = userEvent.setup();
    show();
    const dialog = screen.getByRole("dialog");
    await user.upload(within(dialog).getByLabelText("File of repeaters"), new File(["x"], "odd.csv", { type: "text/csv" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This file could not be readThat file has no row of column headings.",
    );
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

describe("the same repeater twice, in an import", () => {
  afterEach(() => vi.restoreAllMocks());

  const found: RepeaterImportDuplicates = {
    held: 4,
    heldByHand: 1,
    withinFile: 1,
    possible: 1,
    examples: [
      {
        strength: "same",
        against: "held",
        distanceMeters: 21,
        incoming: side({ id: null, line: 2, listName: null, place: "Thornwick, Northshire", channel: "", keeper: "", ctcssHz: 94.8 }),
        existing: side({ listName: "North list", dataDate: Date.UTC(2026, 9, 1), ctcssHz: 77, byHand: true }),
      },
      {
        strength: "same",
        against: "file",
        distanceMeters: 150,
        incoming: side({ id: null, line: 7, listName: null, notes: "Listed a second time." }),
        existing: side({ id: null, line: 2, listName: null }),
      },
      {
        strength: "possible",
        against: "held",
        distanceMeters: 1280,
        incoming: side({ id: null, line: 8, listName: null, callsign: "QZ7CD B", outputHz: 439_462_500 }),
        existing: side({ id: "r2", callsign: "QZ7CD", outputHz: 439_462_500 }),
      },
    ],
  };
  const preview: RepeaterImportPreview = {
    fileName: "world.json",
    sizeBytes: 4200,
    format: "hearham",
    formatName: "Hearham repeater list (JSON)",
    columns: ["id", "callsign"],
    mapping: { callsign: "callsign", output: "frequency" },
    rows: 9,
    usable: 7,
    skippedCount: 2,
    skipped: [],
    sample: [{ ...repeater(), line: 2 }],
    withPosition: 7,
    approximatePositions: 2,
    bands: { "2m": 2, "70cm": 4, "6m": 1 },
    warnings: [],
    update: null,
    duplicates: found,
  };
  const result: RepeaterImportResult = {
    list: list({ name: "World list", format: "hearham" }),
    added: 6,
    updated: 0,
    unchanged: 0,
    removed: 0,
    keptEdits: 0,
    replacedEdits: 0,
    skipped: 2,
    duplicatesSetAside: 1,
    heldSetAside: 5,
    carriedEdits: 2,
  };

  it("says how many are already held, shows them side by side, keeps both unless told otherwise, and sends what is chosen", async () => {
    const upload = vi.spyOn(api, "upload").mockImplementation(async (path) => (path.endsWith("/preview") ? preview : result) as never);
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ImportDialog open onClose={() => {}} />
      </QueryClientProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Import a list of repeaters" });
    await user.upload(within(dialog).getByLabelText("File of repeaters"), new File(["[]"], "world.json", { type: "application/json" }));
    const held = await within(dialog).findByRole("region", { name: "Repeaters already held" });
    expect(within(held).getByRole("heading")).toHaveTextContent("5 rows of this file are repeaters already here");
    expect(held).toHaveTextContent("4 are held already, in another list or entered by hand (1 of them typed or changed by you).");
    expect(held).toHaveTextContent("1 repeats an earlier row of this file.");
    expect(held).toHaveTextContent(/1 may be an entry you hold under another callsign.*It is brought in as it is whatever you choose/);

    // The default shows each repeater once; nothing is lost by it, and the others are a press away.
    expect(within(held).getByRole("radio", { name: /^Show each repeater once, with the newer data/ })).toBeChecked();
    expect(within(held).getByRole("radio", { name: /^Leave what I hold as it is/ })).not.toBeChecked();
    expect(within(held).getByRole("radio", { name: /^Keep both/ })).not.toBeChecked();
    expect(held).toHaveTextContent("Nothing is deleted by any of these.");

    // Side by side: only the parts that differ, with what is agreed said once.
    const table = within(held).getByRole("table", { name: "QZ3AB, 145.6625 MHz: what is held beside what the file says" });
    expect(within(table).getByRole("columnheader", { name: "North list, data of 1 Oct 2026, changed by you" })).toBeVisible();
    expect(within(table).getByRole("row", { name: /CTCSS tone/ })).toHaveTextContent("CTCSS tone77.0 Hz94.8 Hz");
    expect(within(table).getByRole("row", { name: /Town or site/ })).toHaveTextContent("THORNWICKThornwick, Northshire");
    expect(within(table).queryByRole("row", { name: /Listen on/ })).toBeNull();
    expect(held).toHaveTextContent(/They agree on listen on 145\.6625 MHz; shift -0\.6 MHz; modes FM/);
    // Two are shown, and the rest on asking.
    expect(within(held).getAllByRole("table")).toHaveLength(2);
    await user.click(within(held).getByRole("button", { name: "Show 1 more side by side" }));
    expect(held).toHaveTextContent("QZ7CD B, 439.4625 MHz: may be one you hold under another callsign, listed 1.3 km apart");

    await user.click(within(dialog).getByRole("button", { name: "Import 7 repeaters" }));
    expect(await within(dialog).findByText("“World list” is imported")).toBeVisible();
    const sent = Object.fromEntries([...upload.mock.calls.at(-1)![1].entries()].filter(([, value]) => typeof value === "string"));
    expect(sent.duplicates).toBe("prefer-newer");
    expect(dialog).toHaveTextContent(
      "6 added; 1 set aside as repeaters you already hold; 5 older entries of the same repeaters set aside in favour of this list's; what you had typed or changed carried onto 2 of them; 2 rows of the file could not be kept.",
    );
  });
});

/** The section as the page mounts it: with the one fetch flow the page owns. */
function SourcesWithTheirFetch() {
  const getList = useGetList();
  return <SourcesSection lists={[]} getList={getList} />;
}

describe("where lists can be had", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const regions = [
    { id: "gb", name: "United Kingdom", bbox: [-8.7, 49.8, 1.8, 60.9] as [number, number, number, number] },
    { id: "ie", name: "Ireland", bbox: [-10.7, 51.3, -5.3, 55.5] as [number, number, number, number] },
    { id: "au", name: "Australia", bbox: [112.9, -43.8, 153.7, -10.5] as [number, number, number, number] },
    { id: "world", name: "Worldwide", bbox: null },
  ];
  const names = (ordered: ReturnType<typeof orderRegions>) => ({
    likely: ordered.likely.map((region) => region.id),
    rest: ordered.rest.map((region) => region.id),
  });

  it("puts first the country the map was last looking at, or failing that where the saved places are, and asks for no location", () => {
    // Keswick: the United Kingdom only.
    expect(names(orderRegions(regions, { lat: 54.6, lon: -3.13 }, []))).toEqual({ likely: ["gb"], rest: ["world", "au", "ie"] });
    // Dublin is inside both boxes: the smaller country first.
    expect(names(orderRegions(regions, { lat: 53.35, lon: -6.26 }, []))).toEqual({ likely: ["ie", "gb"], rest: ["world", "au"] });
    // No map yet: three saved places in Australia and one in the United Kingdom.
    const places = [
      { lat: -33.9, lon: 151.2 },
      { lat: -37.8, lon: 144.9 },
      { lat: -27.5, lon: 153.0 },
      { lat: 51.5, lon: -0.1 },
    ];
    expect(names(orderRegions(regions, null, places))).toEqual({ likely: ["au", "gb"], rest: ["world", "ie"] });
    // Nothing to go on: the world, then by name.
    expect(names(orderRegions(regions, null, []))).toEqual({ likely: [], rest: ["world", "au", "ie", "gb"] });
    // The middle of the Atlantic is in no country.
    expect(names(orderRegions(regions, { lat: 40, lon: -40 }, places)).likely).toEqual([]);
  });

  const base = {
    termsUrl: "https://example.org/terms",
    termsNote: "Read: nothing forbids it.",
    termsRead: "2026-11-16",
    attribution: "",
    held: null,
  };
  const fetchable: RepeaterSourceDto = {
    ...base,
    id: "north-list",
    region: "gb",
    publisher: "A made-up society",
    name: "North list",
    covers: "A made-up hillside.",
    pageUrl: "https://lists.example.org/repeaters",
    kind: "fetch",
    why: "It offers the file to anyone.",
    fetch: { host: "lists.example.org", url: "https://lists.example.org/north.csv", waitSeconds: 10 },
    steps: [],
  };
  const byHand: RepeaterSourceDto = {
    ...base,
    id: "by-hand",
    region: "gb",
    publisher: "A careful society (careful.example.org)",
    name: "Careful list",
    covers: "The same hillside.",
    pageUrl: "https://www.careful.example.org/files",
    kind: "link",
    why: "Its terms forbid a program.",
    fetch: null,
    steps: ["Open the page.", "Save the CSV file.", "Import it here."],
  };
  const nothing: RepeaterSourceDto = {
    ...base,
    id: "nothing",
    region: "world",
    publisher: "Nobody",
    name: "A map only",
    covers: "Nowhere.",
    pageUrl: "https://example.org/map",
    kind: "none",
    why: "It offers no file.",
    fetch: null,
    steps: [],
  };
  const sources: RepeaterSourcesResponse = { regions, sources: [fetchable, byHand, nothing], problems: [] };
  const fetched: RepeaterFetchResponse = {
    fetched: {
      token: "a".repeat(32),
      sourceId: "north-list",
      url: "https://lists.example.org/north.csv",
      fetchedAt: NOW,
      dataDate: NOW - 46 * DAY,
      sizeBytes: 1500,
      fileName: "north.csv",
      listId: null,
      keptForMs: 1_800_000,
    },
    preview: {
      fileName: "north.csv",
      sizeBytes: 1500,
      format: "etcc-status",
      formatName: "RSGB ETCC list: voice repeaters and gateways, with status",
      columns: ["id", "callsign"],
      mapping: { callsign: "callsign", output: "TX MHz" },
      rows: 9,
      usable: 6,
      skippedCount: 3,
      skipped: [],
      sample: [{ ...repeater(), line: 2 }],
      withPosition: 6,
      approximatePositions: 3,
      bands: { "2m": 2 },
      warnings: [],
      update: null,
      duplicates: NO_DUPLICATES,
    },
  };

  function show() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SourcesWithTheirFetch />
      </QueryClientProvider>,
    );
  }

  it("says of each source whether Outpost can get it, how to get it by hand, or that there is nothing, with the reason and the terms", async () => {
    // The map was last left over the Lake District.
    localStorage.setItem("outpost.maps.view", JSON.stringify({ lat: 54.5, lon: -3.1, zoom: 9, bearing: 0, pitch: 0 }));
    vi.spyOn(api, "get").mockImplementation(async (path) => (path === "/api/repeaters/sources" ? sources : { markers: [] }) as never);
    const post = vi.spyOn(api, "post");
    show();
    const section = (await screen.findByRole("heading", { name: "Get a list" })).closest("section")!;
    expect(section).toHaveTextContent("Getting a list needs the internet for the moment it takes; nothing else on this screen does.");
    expect(await within(section).findByText(/The sources for where your map was last looking come first\./)).toBeVisible();
    const groups = within(section)
      .getAllByRole("group")
      .filter((group) => group.hasAttribute("aria-label"));
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["United Kingdom", "Worldwide"]);
    // Where the map was looking is open, and so is the whole world.
    expect(groups.every((group) => (group as HTMLDetailsElement).open)).toBe(true);
    expect(groups[0]).toHaveTextContent("1 Outpost can get, 1 by hand");

    const rows = within(within(section).getByRole("list", { name: "Sources for United Kingdom" })).getAllByRole("listitem");
    const [get, hand] = [rows[0]!, rows.find((row) => within(row).queryByText("Careful list"))!];
    expect(get).toHaveTextContent("Outpost can get this list. Not held yet.");
    expect(within(get).getByRole("button", { name: "Get the list" })).toBeEnabled();
    expect(get).toHaveTextContent("It offers the file to anyone.");
    expect(get).toHaveTextContent("Read on 16 Nov 2026.");
    expect(get).toHaveTextContent("The file comes from lists.example.org, and Outpost leaves 10 seconds between two requests to it.");

    // By hand: the publisher's page opens in the browser, and the steps are there to follow.
    expect(hand).toHaveTextContent("To be downloaded by hand: Outpost does not fetch this one.");
    const link = within(hand).getByRole("link", { name: "Open careful.example.org" });
    expect(link).toHaveAttribute("href", "https://www.careful.example.org/files");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
    expect(
      within(hand)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Open the page.", "Save the CSV file.", "Import it here."]);
    expect(within(hand).queryByRole("button", { name: /Get/ })).toBeNull();
    expect(within(hand).getByRole("button", { name: "Import the file from A careful society" })).toBeVisible();

    const none = within(section).getByRole("list", { name: "Sources for Worldwide" });
    expect(none).toHaveTextContent("Nothing usable here.");
    expect(within(none).queryByRole("button")).toBeNull();
    expect(within(none).queryByRole("link", { name: /Open/ })).toBeNull();
    // Looking at the sources asked nobody for anything.
    expect(post).not.toHaveBeenCalled();
  });

  it("gets a list on one press and shows what was fetched before anything is kept; a failure is said beside the source", async () => {
    vi.spyOn(api, "get").mockImplementation(async (path) => (path === "/api/repeaters/sources" ? sources : { markers: [] }) as never);
    const remove = vi.spyOn(api, "delete").mockResolvedValue({ ok: true } as never);
    const post = vi
      .spyOn(api, "post")
      .mockRejectedValueOnce(
        new ApiError(
          409,
          "conflict",
          "lists.example.org was asked a moment ago. Outpost leaves it alone between requests: try again in 6 seconds.",
        ),
      )
      .mockResolvedValueOnce(fetched as never)
      .mockResolvedValueOnce({
        list: list({ name: "North list" }),
        added: 6,
        updated: 0,
        unchanged: 0,
        removed: 0,
        keptEdits: 0,
        replacedEdits: 0,
        skipped: 3,
        duplicatesSetAside: 0,
        heldSetAside: 0,
        carriedEdits: 0,
      } as never);
    const user = userEvent.setup();
    show();
    const button = await screen.findByRole("button", { name: "Get the list" });
    await user.click(button);
    expect(await screen.findByText("Not yet")).toBeVisible();
    expect(screen.getByText(/was asked a moment ago\. Outpost leaves it alone between requests/)).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Import a list of repeaters" });
    expect(post.mock.calls.map(([path]) => path)).toEqual([
      "/api/repeaters/sources/north-list/fetch",
      "/api/repeaters/sources/north-list/fetch",
    ]);
    expect(dialog).toHaveTextContent(/Fetched from lists\.example\.org at .*1\.50 kB\. Nothing is kept until you import it\./);
    expect(dialog).toHaveTextContent("A made-up society makes this file when it is asked for, so there is no checksum to hold it to.");
    expect(dialog).toHaveTextContent(
      "Read as RSGB ETCC list: voice repeaters and gateways, with status. 6 of 9 rows can be kept, 6 with a position.",
    );
    // There is no file to choose: the list is the one that was fetched.
    expect(within(dialog).queryByLabelText("File of repeaters")).toBeNull();
    expect(within(dialog).getByLabelText("Name of the list")).toHaveValue("North list");
    expect(within(dialog).getByLabelText("Who publishes it")).toHaveValue("A made-up society");
    expect(within(dialog).getByLabelText("Date of the data")).toHaveValue("2026-10-01");

    await user.click(within(dialog).getByRole("button", { name: "Import 6 repeaters" }));
    expect(await within(dialog).findByText("“North list” is imported")).toBeVisible();
    expect(post.mock.calls[2]![0]).toBe(`/api/repeaters/fetched/${"a".repeat(32)}/import`);
    expect(post.mock.calls[2]![1]).toMatchObject({
      name: "North list",
      source: "A made-up society",
      dataDate: "2026-10-01",
      duplicates: "prefer-newer",
    });
    // Kept, so there is nothing for the server to forget.
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("finding duplicates already held", () => {
  afterEach(() => vi.restoreAllMocks());

  const duplicates: RepeaterDuplicatesResponse = {
    sameTotal: 2,
    same: [
      {
        key: "r1+r9",
        strength: "same",
        keepId: "r9",
        spreadMeters: 21,
        entries: [
          side({ id: "r1", listName: "North list", dataDate: Date.UTC(2026, 9, 1), notes: "Dead spot by the weir.", byHand: true }),
          side({ id: "r9", listName: "World list", dataDate: Date.UTC(2026, 10, 10), place: "Thornwick, Northshire", channel: "" }),
        ],
      },
      {
        key: "r3+r4",
        strength: "same",
        keepId: "r4",
        spreadMeters: null,
        entries: [
          side({ id: "r3", callsign: "QZ3KL", outputHz: 1_297_350_000, listName: null, dataDate: null, byHand: true, keeper: "QZ4MINE" }),
          side({ id: "r4", callsign: "QZ3KL", outputHz: 1_297_350_000, listName: "North list", dataDate: Date.UTC(2026, 9, 1) }),
        ],
      },
    ],
    possibleTotal: 1,
    possible: [
      {
        key: "r5+r6",
        strength: "possible",
        keepId: "r5",
        spreadMeters: 1280,
        entries: [
          side({ id: "r5", callsign: "QZ7CD", outputHz: 439_462_500, listName: "North list", dataDate: Date.UTC(2026, 9, 1) }),
          side({ id: "r6", callsign: "QZ7CD B", outputHz: 439_462_500, listName: "World list", dataDate: Date.UTC(2026, 10, 10) }),
        ],
      },
    ],
  };

  function show() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DuplicatesDialog open onClose={() => {}} />
      </QueryClientProvider>,
    );
  }

  it("shows each group side by side, merges one keeping the entry the person chooses, and merges the certain ones all at once", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue(duplicates as never);
    const post = vi.spyOn(api, "post").mockResolvedValue({ merged: 1, setAside: 1, kept: ["r1"] } as never);
    const user = userEvent.setup();
    show();
    const dialog = screen.getByRole("dialog", { name: "Find duplicates" });
    const same = await within(dialog).findByRole("region", { name: "The same repeater" });
    expect(same).toHaveTextContent("2 repeaters held more than once");
    expect(same).toHaveTextContent("The same callsign on the same frequency, to within 3 kHz.");
    expect(dialog).toHaveTextContent("Nothing is deleted: the entries can be separated again on the repeater's own screen.");

    const groups = within(within(same).getByRole("list", { name: "Repeaters held more than once" })).getAllByRole("listitem");
    const first = groups[0]!;
    expect(first).toHaveTextContent("QZ3AB, 145.6625 MHz 2 entries");
    const table = within(first).getByRole("table", { name: "QZ3AB, 145.6625 MHz: the entries side by side" });
    expect(within(table).getByRole("row", { name: /Notes/ })).toHaveTextContent("NotesDead spot by the weir.nothing");
    // The newer data is the one that would be kept; the person chooses the other.
    expect(within(table).getByRole("radio", { name: /World list, data of 10 Nov 2026/ })).toBeChecked();
    await user.click(within(table).getByRole("radio", { name: /North list, data of 1 Oct 2026, changed by you/ }));
    expect(within(table).getByRole("columnheader", { name: /North list.*Keep this one/ })).toBeVisible();
    await user.click(within(first).getByRole("button", { name: "Merge these two" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/repeaters/duplicates/merge", { keepId: "r1", mergeIds: ["r9"] }));

    // A pair that only may be the same is never part of "Merge all": it has a button of its own.
    const possible = within(dialog).getByRole("region", { name: "Possibly the same repeater" });
    expect(possible).toHaveTextContent("1 pair that may be the same repeater");
    expect(possible).toHaveTextContent("Outpost does not merge these by itself.");
    expect(possible).toHaveTextContent("QZ7CD and QZ7CD B, 439.4625 MHz 2 entries, listed up to 1.28 km apart");

    post.mockResolvedValue({ merged: 2, setAside: 2, kept: ["r9", "r4"] } as never);
    await user.click(within(same).getByRole("button", { name: "Merge all 2" }));
    await waitFor(() => expect(post).toHaveBeenLastCalledWith("/api/repeaters/duplicates/merge-all"));
    expect(get).toHaveBeenCalledWith("/api/repeaters/duplicates");
  });

  it("says so when nothing is held twice", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ same: [], sameTotal: 0, possible: [], possibleTotal: 0 } as never);
    show();
    expect(await screen.findByText("No duplicates")).toBeVisible();
    expect(screen.getByText(/No two entries have the same callsign on the same frequency/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Merge/ })).toBeNull();
  });
});
