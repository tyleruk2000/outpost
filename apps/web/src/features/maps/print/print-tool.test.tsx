import type { Bbox } from "@outpost/shared";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "radix-ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_THEME } from "../lib/palette";
import type { StyleInput } from "../lib/style";
import type { MapEngine } from "../map/engine";
import { MapControls } from "../map-chrome";
import { pageGeometry } from "./paper";
import PrintTool from "./print-tool";
import { frameOfBox, mercatorX, mercatorY, scaleOfBox } from "./scale";
import { SheetView } from "./sheet-view";

const portrait = pageGeometry("a4", "portrait").mapPixels;
const landscape = pageGeometry("a4", "landscape").mapPixels;
const shape = (bbox: Bbox) => (mercatorX(bbox[2]) - mercatorX(bbox[0])) / (mercatorY(bbox[1]) - mercatorY(bbox[3]));
const VIEW: Bbox = [-4.2, 53, -3.95, 53.14];

const style: Omit<StyleInput, "overlays"> = {
  sources: undefined,
  flavour: "light",
  theme: FALLBACK_THEME.light,
  hillshade: false,
  contours: false,
  origin: "http://outpost.test",
  cacheKey: "",
};

/** A map showing `VIEW`. Its centre is the middle of that unless it is put elsewhere, as a phone's is by its sheet. */
function fakeEngine(start: { lat: number; lon: number } = { lat: 53.07, lon: -4.075 }) {
  let centre = start;
  const listeners = new Map<string, (payload: unknown) => void>();
  const setBox = vi.fn<(bbox: Bbox | null, handles: boolean) => void>();
  const setBoxShape = vi.fn<(shape: ((bbox: Bbox, handle: "se") => Bbox) | null) => void>();
  const fitBounds = vi.fn<(bbox: Bbox, options: { clearBottom?: number }) => void>();
  const engine = {
    getBounds: () => VIEW,
    getCenter: () => centre,
    setBox,
    setBoxShape,
    fitBounds,
    on: (type: string, listener: (payload: unknown) => void) => {
      listeners.set(type, listener);
      return () => listeners.delete(type);
    },
  } as unknown as MapEngine;
  return {
    engine,
    setBox,
    setBoxShape,
    fitBounds,
    /** The map is moved: its centre is somewhere else. */
    moveTo(position: { lat: number; lon: number }) {
      centre = position;
    },
    emit: (type: string, payload: unknown) => act(() => listeners.get(type)?.(payload)),
  };
}

const lastBox = (setBox: ReturnType<typeof fakeEngine>["setBox"]) => setBox.mock.calls[setBox.mock.calls.length - 1]![0]!;

describe("laying out a page on the map", () => {
  beforeEach(() => localStorage.clear());

  it("puts a box the shape of the page in the middle of the view, with handles, and keeps it that shape", () => {
    const fake = fakeEngine();
    render(<PrintTool engine={fake.engine} style={style} format="decimal" onClose={() => {}} />);
    const [box, handles] = fake.setBox.mock.calls[fake.setBox.mock.calls.length - 1]!;
    expect(handles).toBe(true);
    expect(shape(box!)).toBeCloseTo(portrait.width / portrait.height, 9);
    // Inside what the map shows, about its middle.
    expect(box![0]).toBeGreaterThan(VIEW[0]);
    expect(box![2]).toBeLessThan(VIEW[2]);
    expect(box![1]).toBeGreaterThan(VIEW[1]);
    expect(box![3]).toBeLessThan(VIEW[3]);
    expect((box![0] + box![2]) / 2).toBeCloseTo(-4.075, 6);
    // At a scale that can be printed as it is: three figures.
    const scale = scaleOfBox(box!, portrait);
    expect(Number(scale.toPrecision(3))).toBeCloseTo(scale, 3);
    expect(screen.getByText(/km on A4 portrait at 1:[\d,]+$/)).toBeInTheDocument();

    // A handle dragged anywhere gives a page-shaped box back.
    const keep = fake.setBoxShape.mock.calls[fake.setBoxShape.mock.calls.length - 1]![0]!;
    expect(shape(keep([-4.1, 53.05, -4.0, 53.07], "se"))).toBeCloseTo(portrait.width / portrait.height, 9);
  });

  it("turns the page round about the same middle at the same scale, and remembers the paper", async () => {
    const fake = fakeEngine();
    render(<PrintTool engine={fake.engine} style={style} format="decimal" onClose={() => {}} />);
    const before = lastBox(fake.setBox);
    await userEvent.click(screen.getByRole("radio", { name: "Landscape" }));
    const after = lastBox(fake.setBox);
    expect(shape(after)).toBeCloseTo(landscape.width / landscape.height, 9);
    expect(frameOfBox(after, landscape).center.lon).toBeCloseTo(frameOfBox(before, portrait).center.lon, 9);
    expect(frameOfBox(after, landscape).center.lat).toBeCloseTo(frameOfBox(before, portrait).center.lat, 9);
    expect(scaleOfBox(after, landscape)).toBeCloseTo(scaleOfBox(before, portrait), 3);
    expect(screen.getByText(/km on A4 landscape at 1:/)).toBeInTheDocument();
    // The whole of the new box is brought into view.
    expect(fake.fitBounds.mock.calls[fake.fitBounds.mock.calls.length - 1]![0]).toEqual(after);
    expect(JSON.parse(localStorage.getItem("outpost.maps.print")!)).toMatchObject({
      paper: "a4",
      orientation: "landscape",
      resolution: 300,
    });
  });

  it("starts the box about the map's own centre, which on a phone is the middle of what the sheet leaves in view", () => {
    // The centre is north of the middle of the rectangle the map is drawn in: the sheet covers the lower part.
    const fake = fakeEngine({ lat: 53.09, lon: -4.075 });
    render(<PrintTool engine={fake.engine} style={style} format="decimal" onClose={() => {}} />);
    const box = lastBox(fake.setBox);
    // To a few metres: the box is shaped on the map's projection, where the middle of a span of latitude is not its mean.
    expect(frameOfBox(box, portrait).center.lat).toBeCloseTo(53.09, 3);
    // Not the middle of the rectangle, which is 53.07.
    expect(frameOfBox(box, portrait).center.lat).toBeGreaterThan(53.085);
    expect((box[0] + box[2]) / 2).toBeCloseTo(-4.075, 6);
    expect(shape(box)).toBeCloseTo(portrait.width / portrait.height, 9);
  });

  it("takes the scale from the box when a handle is moved, and moves the box to the middle of the map when asked", async () => {
    const fake = fakeEngine();
    render(<PrintTool engine={fake.engine} style={style} format="decimal" onClose={() => {}} />);
    const first = lastBox(fake.setBox);
    // Twice the width about the same corner: half the scale's detail, twice its figure.
    const wider: Bbox = [first[0], first[1] - (first[3] - first[1]), first[2] + (first[2] - first[0]), first[3]];
    await fake.emit("box", { ok: true, bbox: wider });
    const grown = lastBox(fake.setBox);
    expect(scaleOfBox(grown, portrait) / scaleOfBox(first, portrait)).toBeGreaterThan(1.9);
    expect(screen.getByRole("combobox", { name: "Scale" })).toHaveTextContent(/^Fit the box: 1:/);

    fake.moveTo({ lat: 53.1, lon: -4 });
    await userEvent.click(screen.getByRole("button", { name: "Centre the box here" }));
    const centred = frameOfBox(lastBox(fake.setBox), portrait);
    expect(centred.center.lat).toBeCloseTo(53.1, 9);
    expect(centred.center.lon).toBeCloseTo(-4, 9);
    expect(scaleOfBox(lastBox(fake.setBox), portrait)).toBeCloseTo(scaleOfBox(grown, portrait), 3);
  });

  it("takes its box off the map when it is put away", () => {
    const fake = fakeEngine();
    const { unmount } = render(<PrintTool engine={fake.engine} style={style} format="decimal" onClose={() => {}} />);
    unmount();
    expect(fake.setBox).toHaveBeenLastCalledWith(null, false);
    expect(fake.setBoxShape).toHaveBeenLastCalledWith(null);
  });
});

describe("the print control", () => {
  it("is among the map's tools and says when it is in hand", async () => {
    const onToolChange = vi.fn();
    const controls = (tool: "browse" | "print") => (
      <Tooltip.Provider>
        <MapControls
          tool={tool}
          onToolChange={onToolChange}
          locatorGrid={false}
          onLocatorGridChange={() => {}}
          onZoomIn={() => {}}
          onZoomOut={() => {}}
          rotated={false}
          onResetNorth={() => {}}
          locate={undefined}
          onLocate={() => {}}
          hillshade
          onHillshadeChange={() => {}}
          contours={false}
          contourReach="drawn"
          onContoursChange={() => {}}
          disabled={false}
        />
      </Tooltip.Provider>
    );
    const { rerender } = render(controls("browse"));
    const button = screen.getByRole("button", { name: "Print or save as PDF" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(onToolChange).toHaveBeenLastCalledWith("print");
    rerender(controls("print"));
    expect(screen.getByRole("button", { name: "Print or save as PDF" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Print or save as PDF" }));
    expect(onToolChange).toHaveBeenLastCalledWith("browse");
  });
});

describe("the sheet on screen", () => {
  it("draws every kind of thing on a sheet, and a blank where a picture has not been drawn yet", () => {
    const { container } = render(
      <SheetView
        label="Preview of the page"
        pictures={{ there: "blob:there" }}
        sheet={{
          width: 200,
          height: 100,
          items: [
            { kind: "image", id: "there", x: 10, y: 10, width: 80, height: 40 },
            { kind: "image", id: "missing", x: 100, y: 10, width: 80, height: 40 },
            { kind: "rect", x: 10, y: 10, width: 170, height: 40, stroke: [0, 0, 0], lineWidth: 0.6 },
            { kind: "line", x1: 10, y1: 60, x2: 60, y2: 60, color: [0, 0, 0], width: 0.5 },
            {
              kind: "polygon",
              points: [
                [190, 60],
                [194, 70],
                [186, 70],
              ],
              fill: [0, 0, 0],
            },
            { kind: "text", x: 10, y: 80, text: "1:25,000", size: 11, bold: true, color: [0, 0, 0], anchor: "end" },
            { kind: "text", x: 5, y: 30, text: "53°04'N", size: 6, color: [0, 0, 0], anchor: "middle", upward: true },
            { kind: "text", x: 10, y: 95, text: "ABCDE FGHIJ", size: 8, mono: true, color: [0, 0, 0] },
            { kind: "rect", x: 100, y: 60, width: 60, height: 30, stroke: [0, 0, 0], dash: [3, 2] },
          ],
        }}
      />,
    );
    const svg = screen.getByRole("img", { name: "Preview of the page" });
    expect(svg).toHaveAttribute("viewBox", "0 0 200 100");
    expect(container.querySelectorAll("image")).toHaveLength(1);
    expect(container.querySelector("image")).toHaveAttribute("href", "blob:there");
    expect(svg).toHaveTextContent("1:25,000");
    const side = [...container.querySelectorAll("text")].find((text) => text.textContent === "53°04'N")!;
    expect(side).toHaveAttribute("transform", "rotate(-90 5 30)");
    expect(container.querySelector("polygon")).toHaveAttribute("points", "190,60 194,70 186,70");
    // Letters that stand in columns are in the fixed-width face, and a line to cut along is broken.
    const letters = [...container.querySelectorAll("text")].find((text) => text.textContent === "ABCDE FGHIJ")!;
    expect(letters.getAttribute("font-family")).toMatch(/^Courier, /);
    expect(side).not.toHaveAttribute("font-family");
    expect(container.querySelector('rect[stroke-dasharray="3 2"]')).toHaveAttribute("x", "100");
  });
});
