import type { ParsedCoordinate } from "@outpost/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import { formatPosition, isReadoutFormat, locatorLengthFor, READOUT_FORMATS, READOUT_LABELS } from "../lib/coords";
import { buildSearchResults } from "../lib/search";
import { ContextMenu, MapControls, MeasureCard, PinCard } from "../map-chrome";
import { Locator, locatorOf, PathLocators } from "./locator";

const WIGAN = { lat: 53.5208, lon: -2.625 };

describe("a position's locator, wherever coordinates are shown", () => {
  it("is six characters beside a position, and copies when pressed", () => {
    expect(locatorOf(WIGAN)).toBe("IO83QM");
    render(<Locator position={WIGAN} />);
    expect(screen.getByRole("button", { name: "Copy Maidenhead locator IO83QM" })).toHaveTextContent("Locator IO83QM");
  });

  it("is given for a found position, with its coordinates", () => {
    render(<PinCard title="Summit" position={WIGAN} format="decimal" onSave={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /Copy coordinates 53\.52080, -2\.62500/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Maidenhead locator IO83QM" })).toBeInTheDocument();
  });

  it("is not given twice when coordinates are shown as locators", () => {
    render(<PinCard title="Summit" position={WIGAN} format="maidenhead" onSave={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Copy coordinates IO83QM54" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copy Maidenhead locator/ })).not.toBeInTheDocument();
  });

  it("is in the menu at a point on the map, under the coordinates", () => {
    render(
      <ContextMenu
        point={{ x: 100, y: 100 }}
        bounds={{ width: 800, height: 600 }}
        coordinates="53.52080, -2.62500"
        locator="IO83QM"
        onSave={() => {}}
        onMeasure={() => {}}
        onDraw={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Locator IO83QM")).toBeInTheDocument();
  });

  it("names both ends of a measured path, which can be handed to a line-of-sight check", async () => {
    const onSight = vi.fn();
    const points = [WIGAN, { lat: 53.07, lon: -4.08 }];
    render(
      <MeasureCard points={points} onUndo={() => {}} onClear={() => {}} onDone={() => {}} onSaveAsRoute={() => {}} onSight={onSight} />,
    );
    expect(screen.getByText(/^Locators/)).toHaveTextContent("Locators IO83QM to IO73XB");
    await userEvent.click(screen.getByRole("button", { name: "Check line of sight" }));
    expect(onSight).toHaveBeenCalledTimes(1);
    // One point is not a path.
    expect(render(<PathLocators points={[WIGAN]} />).container).toBeEmptyDOMElement();
  });

  it("is a format the coordinate readout can be set to, as long as the view can tell apart", () => {
    expect(READOUT_FORMATS).toContain("maidenhead");
    expect(READOUT_LABELS.maidenhead).toBe("Maidenhead locator");
    expect(isReadoutFormat("maidenhead")).toBe(true);
    expect(locatorLengthFor(5000)).toBe(4);
    expect(locatorLengthFor(600)).toBe(4);
    expect(locatorLengthFor(150)).toBe(6);
    expect(locatorLengthFor(10)).toBe(8);
    // Zoomed out, a square; closer, a subsquare; closer still, and for a stored position, an extended square.
    expect(formatPosition(WIGAN.lat, WIGAN.lon, "maidenhead", 4)).toEqual({ text: "IO83", format: "maidenhead" });
    expect(formatPosition(WIGAN.lat, WIGAN.lon, "maidenhead", 9).text).toBe("IO83QM");
    expect(formatPosition(WIGAN.lat, WIGAN.lon, "maidenhead", 14).text).toBe("IO83QM54");
    expect(formatPosition(WIGAN.lat, WIGAN.lon, "maidenhead").text).toBe("IO83QM54");
  });
});

describe("a locator typed into the map's search", () => {
  const search = (coordinate: ParsedCoordinate, otherReadings?: ParsedCoordinate[], query = coordinate.locator ?? "") =>
    buildSearchResults({ query, coordinate, otherReadings, places: [], markers: [], tracks: [], center: null });

  it("is listed as the locator, saying which kind of square it is, how big, and that the position is its middle", () => {
    const [six] = search({ lat: 53.520833, lon: -2.625, format: "maidenhead", locator: "IO83QM" });
    expect(six).toMatchObject({ kind: "coordinate", title: "IO83QM", position: { lat: 53.520833, lon: -2.625 } });
    expect(six!.detail).toBe("Middle of a locator subsquare, 5.51 km × 4.63 km · 53.52083, -2.62500");
    expect(search({ lat: 53.5, lon: -3, format: "maidenhead", locator: "IO83" })[0]!.detail).toBe(
      "Middle of a locator square, 132 km × 111 km · 53.50000, -3.00000",
    );
    expect(search({ lat: 53.522917, lon: -2.620833, format: "maidenhead", locator: "IO83QM54" })[0]!.detail).toMatch(
      /^Middle of a locator extended square, 551 m × 463 m · /,
    );
  });

  it("lists both readings of text that is a grid reference and a locator", () => {
    const results = search(
      { lat: 56.74, lon: -5.0, format: "osgb", precisionMeters: 10_000 },
      [{ lat: 46.5, lon: 83, format: "maidenhead", locator: "NN16" }],
      "nn16",
    );
    expect(results.map((result) => [result.key, result.title])).toEqual([
      ["coordinate", "NN16"],
      ["coordinate-1", "NN16"],
    ]);
    expect(results[0]!.detail).toMatch(/^Grid reference/);
    expect(results[1]!.detail).toMatch(/^Middle of a locator square/);
  });
});

describe("the radio controls on the map", () => {
  function controls(overrides: { tool?: "browse" | "sight"; locatorGrid?: boolean } = {}) {
    const onToolChange = vi.fn();
    const onLocatorGridChange = vi.fn();
    render(
      <Tooltip.Provider>
        <MapControls
          tool={overrides.tool ?? "browse"}
          onToolChange={onToolChange}
          onZoomIn={() => {}}
          onZoomOut={() => {}}
          rotated={false}
          onResetNorth={() => {}}
          locate={undefined}
          onLocate={() => {}}
          hillshade={undefined}
          onHillshadeChange={() => {}}
          contours={false}
          contourReach="drawn"
          onContoursChange={() => {}}
          locatorGrid={overrides.locatorGrid ?? false}
          onLocatorGridChange={onLocatorGridChange}
          disabled={false}
        />
      </Tooltip.Provider>,
    );
    return { onToolChange, onLocatorGridChange };
  }

  it("switch the locator grid on and off, and say which it is", async () => {
    const { onLocatorGridChange } = controls();
    const grid = screen.getByRole("button", { name: "Maidenhead locator grid" });
    expect(grid).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(grid);
    expect(onLocatorGridChange).toHaveBeenCalledWith(true);
  });

  it("take up the line-of-sight tool and put it down again", async () => {
    const taken = controls();
    await userEvent.click(screen.getByRole("button", { name: "Line of sight between two points" }));
    expect(taken.onToolChange).toHaveBeenCalledWith("sight");
  });

  it("show the grid and the tool as on when they are", async () => {
    const { onToolChange, onLocatorGridChange } = controls({ tool: "sight", locatorGrid: true });
    const tool = screen.getByRole("button", { name: "Line of sight between two points" });
    expect(tool).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(tool);
    expect(onToolChange).toHaveBeenCalledWith("browse");
    await userEvent.click(screen.getByRole("button", { name: "Maidenhead locator grid" }));
    expect(onLocatorGridChange).toHaveBeenCalledWith(false);
  });
});
