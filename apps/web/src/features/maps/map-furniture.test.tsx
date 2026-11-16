import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import { MapCard, MapMenu, MapToolColumn, type MapToolsInput, mapTools } from "./map-chrome";
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
      "print",
      "locator-grid",
      "repeaters",
      "sight",
    ]);
  });

  it("leaves out what there is nothing for: no compass until the map is turned, no shading without terrain, no locating without a position", () => {
    const ids = mapTools(input({ locate: undefined, hillshade: undefined, onRepeatersChange: undefined })).map((tool) => tool.id);
    expect(ids).toEqual(["measure", "draw", "add-place", "contours", "print", "locator-grid", "sight"]);
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
    await userEvent.click(screen.getByRole("button", { name: "All map tools" }));
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

describe("the column of tools on a phone", () => {
  it("shows the tools as the same named buttons as a wide screen has", () => {
    render(
      <Tooltip.Provider>
        <MapToolColumn tools={mapTools(input({ tool: "draw" }))} />
      </Tooltip.Provider>,
    );
    // Not laid out here, so there is room for all of them; in a browser it shows as many as fit (see the end-to-end tests).
    expect(screen.getAllByRole("button")).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Draw a route" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
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
    expect(title.parentElement).toHaveClass("sticky", "top-0");
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
