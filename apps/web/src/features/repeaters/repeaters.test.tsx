import type { RepeaterDto, RepeaterImportPreview, RepeaterImportResult, RepeaterListDto, RepeaterOverlayResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { exportHref, NO_FILTERS } from "./data";
import { ImportDialog } from "./import-dialog";
import { nearestHit, overlayBox, repeatersData } from "./map/layers";
import { sightEndOf } from "./map/use-repeaters-on-map";
import { positionReadings, readDraft } from "./repeater-form";
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
  ...overrides,
});

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
    expect(sent).toMatchObject({ name: "club", source: "Fell Radio Club", edited: "keep", gone: "remove" });
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
