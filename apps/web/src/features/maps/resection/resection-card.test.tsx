import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapEngine } from "../map/engine";
import { readBearing, useResection } from "./resection-card";

type Click = (event: { position: { lat: number; lon: number }; hit: { type: "marker"; id: string } | null }) => void;

function fakeEngine(centre: { lat: number; lon: number }) {
  const clicks: Click[] = [];
  const overlays: Array<{ id: string; data: { features: Array<{ properties: Record<string, unknown> }> } }> = [];
  const engine = {
    on: (event: string, listener: Click) => {
      if (event === "click") clicks.push(listener);
      return () => clicks.splice(clicks.indexOf(listener), 1);
    },
    setOverlay: (id: string, data: never) => overlays.push({ id, data }),
    getCenter: () => centre,
  } as unknown as MapEngine;
  return {
    engine,
    click: (position: { lat: number; lon: number }, hit: { type: "marker"; id: string } | null = null) => {
      for (const listener of clicks) listener({ position, hit });
    },
    overlays,
  };
}

function Harness({ engine, onSave }: { engine: MapEngine; onSave: (position: { lat: number; lon: number }) => void }) {
  const tool = useResection({
    engine,
    active: true,
    markers: [
      {
        id: "m1",
        name: "Great Gable",
        note: "",
        lat: 54.4819,
        lon: -3.2196,
        color: "teal",
        icon: "pin",
        isFavorite: false,
        noteId: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    where: (position) => `${position.lat.toFixed(4)}, ${position.lon.toFixed(4)}`,
    onSave,
    onDone: () => {},
  });
  return <>{tool.card}</>;
}

beforeEach(() => localStorage.clear());

describe("reading a bearing", () => {
  it("takes a figure from 0 to 360, with a comma or a degree sign", () => {
    expect(readBearing("47")).toBe(47);
    expect(readBearing("047°")).toBe(47);
    expect(readBearing("12,5")).toBe(12.5);
    expect(readBearing("360")).toBe(0);
    expect(readBearing("361")).toBeNull();
    expect(readBearing("-4")).toBeNull();
    expect(readBearing("NE")).toBeNull();
  });
});

describe("the resection card", () => {
  it("takes landmarks from the map and bearings typed, and gives the point with the triangle of error", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { engine, click, overlays } = fakeEngine({ lat: 54.3699, lon: -3.1207 });
    render(<Harness engine={engine} onSave={onSave} />);

    expect(screen.getByText(/Take a compass bearing to two or three things you can see/)).toBeInTheDocument();
    // A: a saved place pressed on the map; B: a press anywhere.
    click({ lat: 0, lon: 0 }, { type: "marker", id: "m1" });
    expect(await screen.findByText(/Great Gable ·/)).toBeInTheDocument();
    click({ lat: 54.5274, lon: -3.0164 });
    await user.type(screen.getByRole("textbox", { name: /Bearing to A/ }), "345");
    await user.type(screen.getByRole("textbox", { name: /Bearing to B/ }), "60");
    expect(await screen.findByText("You are about here")).toBeInTheDocument();
    expect(screen.getByText(/Two lines cross here/)).toBeInTheDocument();
    expect(screen.getByText(/Declination here .* \(World Magnetic Model\), added to each bearing/)).toBeInTheDocument();

    // C: the centre of the map, with a bearing two degrees out.
    await user.click(screen.getByRole("button", { name: "Add a third landmark" }));
    await user.click(screen.getByRole("button", { name: "Use the centre of the map" }));
    await user.type(screen.getByRole("textbox", { name: /Bearing to C/ }), "142");
    expect(await screen.findByText(/The three lines make a triangle of error .* across/)).toBeInTheDocument();

    const drawn = overlays
      .filter((overlay) => overlay.id === "o-resection")
      .at(-1)!
      .data.features.map((feature) => feature.properties.kind);
    expect(drawn.filter((kind) => kind === "line")).toHaveLength(3);
    expect(drawn).toContain("triangle");
    expect(drawn).toContain("fix");

    await user.click(screen.getByRole("button", { name: "Save this place" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ lat: expect.any(Number), lon: expect.any(Number) }));
  });

  it("says a bearing must be a figure, and when two lines cannot both be right", async () => {
    const user = userEvent.setup();
    const { engine, click } = fakeEngine({ lat: 0, lon: 0 });
    render(<Harness engine={engine} onSave={() => {}} />);
    click({ lat: 54.4819, lon: -3.2196 });
    click({ lat: 54.3699, lon: -3.1207 });
    await user.click(screen.getByRole("radio", { name: "True north" }));
    await user.type(screen.getByRole("textbox", { name: /Bearing to A/ }), "north");
    expect(screen.getByText("A bearing is a figure from 0 to 360.")).toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: /Bearing to A/ }));
    await user.type(screen.getByRole("textbox", { name: /Bearing to A/ }), "0");
    await user.type(screen.getByRole("textbox", { name: /Bearing to B/ }), "350");
    const notice = await screen.findByText("The lines from A and B do not meet");
    expect(within(notice.closest("[role]") ?? document.body).getByText(/both bearings cannot be right/)).toBeInTheDocument();
    expect(screen.queryByText("You are about here")).toBeNull();
  });
});
