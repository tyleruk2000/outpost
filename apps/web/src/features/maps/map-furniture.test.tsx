import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import { MapCard, MapMenu, MapToolColumn, type MapToolsInput, mapTools, shownInColumn } from "./map-chrome";
import { MapFurniture } from "./map-furniture";

function input(overrides: Partial<MapToolsInput> = {}): MapToolsInput {
  return {
    tool: "browse",
    onToolChange: () => {},
    rotated: false,
    onResetNorth: () => {},
    locate: "off",
    onLocate: () => {},
    hillshade: true,
    onHillshadeChange: () => {},
    contours: false,
    contourReach: "drawn",
    onContoursChange: () => {},
    locatorGrid: false,
    onLocatorGridChange: () => {},
    repeaters: false,
    onRepeatersChange: () => {},
    disabled: false,
    ...overrides,
  };
}

describe("the list the map's controls are drawn from", () => {
  it("holds every tool once, in the order they give way from the end", () => {
    expect(mapTools(input()).map((tool) => tool.id)).toEqual([
      "locate",
      "measure",
      "draw",
      "add-place",
      "hillshade",
      "contours",
      "resection",
      "print",
      "locator-grid",
      "repeaters",
      "sight",
    ]);
  });

  it("leaves out what there is nothing for: no compass until the map is turned, no shading without terrain, no locating without a position", () => {
    const ids = mapTools(input({ locate: undefined, hillshade: undefined, onRepeatersChange: undefined })).map((tool) => tool.id);
    expect(ids).toEqual(["measure", "draw", "add-place", "contours", "resection", "print", "locator-grid", "sight"]);
    expect(mapTools(input({ rotated: true })).map((tool) => tool.id)[0]).toBe("north");
  });

  it("puts a tool down when the one in hand is pressed again", () => {
    const onToolChange = vi.fn();
    const tools = mapTools(input({ tool: "measure", onToolChange }));
    const measure = tools.find((tool) => tool.id === "measure")!;
    expect(measure.pressed).toBe(true);
    measure.onPress();
    expect(onToolChange).toHaveBeenCalledWith("browse");
    tools.find((tool) => tool.id === "print")!.onPress();
    expect(onToolChange).toHaveBeenLastCalledWith("print");
  });
});

describe("the menu of the map's tools on a phone", () => {
  it("lists every tool by name, layers under their own heading, and says which are on", async () => {
    const onToolChange = vi.fn();
    const onLocatorGridChange = vi.fn();
    render(<MapMenu tools={mapTools(input({ contours: true, onToolChange, onLocatorGridChange }))} />);
    await userEvent.click(screen.getByRole("button", { name: "More map tools" }));
    const menu = screen.getByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitemcheckbox")
        .map((item) => item.textContent),
    ).toEqual([
      "Show where I am",
      "Measure a distance",
      "Draw a route",
      "Save a place: then click the map",
      "Find where you are from bearings",
      "Print or save as PDF",
      "Line of sight between two points",
      "Hill shading",
      "Contour lines",
      "Maidenhead locator grid",
      "Repeaters",
    ]);
    expect(within(menu).getByText("Shown on the map")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Contour lines" })).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Measure a distance" })).toHaveAttribute("aria-checked", "false");

    await userEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "Line of sight between two points" }));
    expect(onToolChange).toHaveBeenCalledWith("sight");
  });
});

describe("map styles, road numbers and magnetic north lines in the tools", () => {
  const styled = (overrides: Partial<MapToolsInput> = {}) =>
    input({
      mapStyle: "standard",
      onMapStyleChange: () => {},
      roadNumbers: false,
      onRoadNumbersChange: () => {},
      magneticLines: false,
      onMagneticLinesChange: () => {},
      ...overrides,
    });

  it("puts the style picker before printing, and the two new layers last, to give way first on a phone", () => {
    const ids = mapTools(styled()).map((tool) => tool.id);
    expect(ids.indexOf("map-style")).toBe(ids.indexOf("print") - 1);
    expect(ids.slice(-2)).toEqual(["road-numbers", "magnetic-lines"]);
    expect(mapTools(styled()).find((tool) => tool.id === "map-style")!.label).toBe("Map style: Standard");
  });

  it("lists the styles in the phone's menu, the chosen one ticked, and switches the layers", async () => {
    const onMapStyleChange = vi.fn();
    const onMagneticLinesChange = vi.fn();
    render(<MapMenu tools={mapTools(styled({ mapStyle: "walking", onMapStyleChange, onMagneticLinesChange }))} />);
    await userEvent.click(screen.getByRole("button", { name: "More map tools" }));
    const menu = screen.getByRole("menu");
    const styles = within(menu).getAllByRole("menuitemradio");
    expect(styles.map((item) => item.textContent)).toEqual([
      "Standard",
      "Road map",
      "Road map, UK atlas colours",
      "Walking",
      "High contrast",
      "Night (red)",
      "Low ink",
    ]);
    expect(within(menu).getByRole("menuitemradio", { name: "Walking" })).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Road numbers" })).toHaveAttribute("aria-checked", "false");
    await userEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "Magnetic north lines" }));
    expect(onMagneticLinesChange).toHaveBeenCalledWith(true);
    await userEvent.click(screen.getByRole("button", { name: "More map tools" }));
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitemradio", { name: "Night (red)" }));
    expect(onMapStyleChange).toHaveBeenCalledWith("night");
  });

  it("opens the list of styles from the button in the column", async () => {
    const onMapStyleChange = vi.fn();
    render(
      <Tooltip.Provider>
        <MapToolColumn tools={mapTools(styled({ onMapStyleChange }))} />
      </Tooltip.Provider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Map style: Standard" }));
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitemradio", { name: "Low ink" }));
    expect(onMapStyleChange).toHaveBeenCalledWith("low-ink");
  });
});

describe("the column of tools on a phone", () => {
  it("shows the tools as the same named buttons as a wide screen has", () => {
    render(
      <Tooltip.Provider>
        <MapToolColumn tools={mapTools(input({ tool: "draw" }))} />
      </Tooltip.Provider>,
    );
    // Not laid out here, so there is room for all of them; in a browser it shows as many as fit (see the end-to-end tests).
    expect(screen.getAllByRole("button")).toHaveLength(12);
    expect(screen.getByRole("button", { name: "Draw a route" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
  });

  it("ends in a button that says More in words, which opens every tool by name", async () => {
    render(
      <Tooltip.Provider>
        <MapToolColumn tools={mapTools(input())} />
      </Tooltip.Provider>,
    );
    const more = screen.getByRole("button", { name: "More map tools" });
    expect(more).toHaveTextContent(/^More/);
    expect(screen.getAllByRole("button").at(-1)).toBe(more);
    await userEvent.click(more);
    expect(
      within(screen.getByRole("menu")).getByRole("menuitemcheckbox", { name: "Line of sight between two points" }),
    ).toBeInTheDocument();
  });

  it("keeps the icon of a tool in hand or a layer that is on, in place of the last that is not", () => {
    const tools = mapTools(input({ tool: "sight", contours: true, hillshade: false }));
    const ids = (room: number) => shownInColumn(tools, room).map((tool) => tool.id);
    expect(ids(20)).toHaveLength(tools.length);
    expect(ids(3)).toEqual(["locate", "contours", "sight"]);
    expect(ids(0)).toEqual([]);
    // In the order of the list, so the column does not shuffle as things are switched on.
    expect(ids(5)).toEqual(["locate", "measure", "draw", "contours", "sight"]);
  });
});

describe("a card over the map", () => {
  it("has a title and a close button that stay put while the rest scrolls", () => {
    render(
      <MapCard title="Measure" onClose={() => {}} closeLabel="Stop measuring">
        <p>Body</p>
      </MapCard>,
    );
    const title = screen.getByRole("heading", { name: "Measure" });
    // Above its place by the card's own padding, at every width: a card that scrolls measures the header from inside its padding.
    expect(title.parentElement).toHaveClass("sticky", "-top-3.5");
    expect(title.closest("section")).toHaveClass("outpost-map-card", "max-md:overflow-y-auto");
    expect(screen.getByRole("button", { name: "Stop measuring" })).toBeInTheDocument();
  });

  it("can leave its title to whatever already says it: said to a screen reader, not written twice", () => {
    render(
      <MapCard title="Line of sight" titleHidden>
        <p>Click the map</p>
      </MapCard>,
    );
    expect(screen.getByRole("heading", { name: "Line of sight" })).toHaveClass("sr-only");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("where things sit over the map", () => {
  const parts = {
    search: <input aria-label="Search the map" />,
    tools: <button type="button">Tools</button>,
    cards: <section aria-label="A card" />,
    footer: <p>Credits</p>,
  };

  it("on a phone is one column in a fixed order, so that nothing can lie over anything else", () => {
    const { container } = render(<MapFurniture phone covered={false} {...parts} notice={<p>Part of the map could not be loaded.</p>} />);
    const column = container.querySelector(".outpost-furniture")!;
    expect(column).toHaveClass("flex", "flex-col");
    const order = [...column.querySelectorAll("input, button, section, p")].map(
      (element) => element.getAttribute("aria-label") ?? element.textContent,
    );
    expect(order).toEqual(["Search the map", "Part of the map could not be loaded.", "Tools", "A card", "Credits"]);
    // The cards are held to their share of the clear map by the place they are put in, not by each card.
    expect(screen.getByRole("region", { name: "A card" }).parentElement).toHaveClass("outpost-furniture-cards");
  });

  it("on a phone with something in hand puts its card at the foot, edge to edge, under the credits and no higher than it may go", () => {
    const { container } = render(<MapFurniture phone covered={false} docked dockRoom={300} {...parts} />);
    const column = container.querySelector(".outpost-furniture")!;
    expect(column).toHaveAttribute("data-docked");
    const dock = screen.getByRole("region", { name: "A card" }).parentElement!;
    expect(dock).toHaveClass("outpost-furniture-dock");
    expect(dock.parentElement).toHaveStyle({ maxHeight: "300px" });
    expect(dock.parentElement).toHaveClass("-mx-[12px]");
    // The credits are over the card, in the same block; the readout in the footer is hidden by maps.css.
    expect(dock.previousElementSibling).toHaveTextContent("Credits");
  });

  it("leaves only the search box when the sheet covers the map", () => {
    render(<MapFurniture phone covered {...parts} />);
    expect(screen.getByLabelText("Search the map")).toBeInTheDocument();
    expect(screen.queryByText("Tools")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "A card" })).not.toBeInTheDocument();
    expect(screen.queryByText("Credits")).not.toBeInTheDocument();
  });

  it("on a wide screen keeps search and controls at the top and the card with the readout at the foot", () => {
    const { container } = render(<MapFurniture phone={false} covered={false} {...parts} />);
    expect(container.querySelector(".outpost-furniture")).toBeNull();
    expect(screen.getByText("Tools").parentElement).toBe(screen.getByLabelText("Search the map").parentElement);
    expect(screen.getByText("Credits").parentElement).toBe(screen.getByRole("region", { name: "A card" }).parentElement);
  });
});
