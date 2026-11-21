import type { MapFilePreview, TrackImportResponse } from "@outpost/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { previewParts } from "../lib/map-files";
import { ImportMapFilesDialog } from "./import-map-files";

const previewMapFile = vi.fn<(file: File) => Promise<MapFilePreview>>();
const importMapFile = vi.fn<(file: File, waypoints: boolean) => Promise<TrackImportResponse>>();
vi.mock("../data", () => ({
  previewMapFile: (file: File) => previewMapFile(file),
  importMapFile: (file: File, waypoints: boolean) => importMapFile(file, waypoints),
}));

const kml: MapFilePreview = { format: "kml", name: "Lakes weekend", points: 3, lines: 2, outlines: 1, linePoints: 14 };
const gpx: MapFilePreview = { format: "gpx", name: "Morning climb", points: 1, lines: 1, outlines: 0, linePoints: 40 };
const file = (name: string) => new File(["x"], name);

beforeEach(() => {
  previewMapFile.mockReset();
  importMapFile.mockReset();
});

describe("words for what a file would make", () => {
  it("names the route's lines and outlines, and the places", () => {
    expect(previewParts(kml, false)).toEqual(["A new route of 2 lines and 1 outline, 14 points", "3 new places"]);
    expect(previewParts({ ...kml, lines: 0, outlines: 0, linePoints: 0, points: 1 }, false)).toEqual(["1 new place"]);
  });

  it("keeps a GPX file's waypoints on the route unless asked", () => {
    expect(previewParts(gpx, false)).toEqual(["A new route of 1 line, 40 points", "1 waypoint kept on the route"]);
    expect(previewParts(gpx, true)).toEqual(["A new route of 1 line, 40 points", "1 new place"]);
  });
});

describe("importing map files", () => {
  it("says what each file would make before anything is saved", async () => {
    previewMapFile.mockImplementation(async (chosen) => {
      if (chosen.name === "broken.geojson") throw new Error("That file is not valid JSON, so it cannot be read as GeoJSON.");
      return chosen.name.endsWith(".gpx") ? gpx : kml;
    });
    importMapFile.mockResolvedValue({ track: null, markers: [], outlines: 0 });
    render(
      <ImportMapFilesDialog files={[file("lakes.kml"), file("climb.gpx"), file("broken.geojson")]} onClose={() => {}} onShow={() => {}} />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Import 3 map files" });
    expect(await within(dialog).findByText(/A new route of 2 lines and 1 outline/)).toBeInTheDocument();
    expect(within(dialog).getByText(/1 waypoint kept on the route/)).toBeInTheDocument();
    expect(within(dialog).getByText("That file is not valid JSON, so it cannot be read as GeoJSON.")).toBeInTheDocument();
    expect(within(dialog).getByText(/Nothing already on the map is changed or replaced/)).toBeInTheDocument();
    expect(importMapFile).not.toHaveBeenCalled();

    // Asking for the waypoints as places changes what the GPX file is said to make.
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Also save its waypoints as places/ }));
    expect(within(dialog).getAllByText(/1 new place/)).toHaveLength(1);

    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));
    // The file the server could not read is not sent again; the others are, with the choice made.
    expect(importMapFile).toHaveBeenCalledTimes(2);
    expect(importMapFile.mock.calls.map(([chosen, waypoints]) => [chosen.name, waypoints])).toEqual([
      ["lakes.kml", true],
      ["climb.gpx", true],
    ]);
    expect(await within(dialog).findByText("broken.geojson was not imported")).toBeInTheDocument();
  });

  it("offers nothing to import when no file can be read", async () => {
    previewMapFile.mockRejectedValue(new Error("Outpost cannot read that kind of file as a map."));
    render(<ImportMapFilesDialog files={[file("route.gpx")]} onClose={() => {}} onShow={() => {}} />);
    const dialog = await screen.findByRole("dialog", { name: "Import a GPX file" });
    expect(await within(dialog).findByText("Outpost cannot read that kind of file as a map.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
