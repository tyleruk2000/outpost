/** The search box over the map: a question for the nearest of a kind, and what it says when the words were read loosely. */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeServer, renderScreen } from "../downloads/test-support";
import { SearchBox } from "./search-box";

const place = (over: Record<string, unknown>) => ({
  id: 1,
  source: "geonames",
  name: "Waterloo",
  country: "GB",
  admin1: "ENG",
  featureCode: "RSTN",
  kindLabel: "Railway station",
  lat: 51.5032,
  lon: -0.1123,
  population: 0,
  elevation: null,
  ...over,
});

function box(onNearest = vi.fn(), onChoose = vi.fn()) {
  renderScreen(
    <SearchBox
      markers={[]}
      tracks={[]}
      placesInstalled
      getCenter={() => ({ lat: 51.5, lon: -0.12 })}
      onChoose={onChoose}
      onAddPlaceNames={vi.fn()}
      onNearest={onNearest}
    />,
  );
  return { onNearest, onChoose };
}

afterEach(() => vi.unstubAllGlobals());

describe("the map's search box", () => {
  it("offers the nearest of a kind first when the words ask for it, by press or by Enter", async () => {
    const user = userEvent.setup();
    fakeServer({
      "GET /api/maps/places": {
        query: "pharmacy",
        coordinate: null,
        places: [place({ name: "Pharmacy Road", kindLabel: "Street or road", featureCode: "os:Named Road", source: "os" })],
        nearest: "pharmacy",
      },
    });
    const { onNearest } = box();
    const field = screen.getByRole("combobox", { name: "Search the map" });
    await user.type(field, "pharmacy");
    const list = await screen.findByRole("listbox", { name: "Search results" });
    const options = await within(list).findAllByRole("option");
    expect(options[0]).toHaveTextContent("Nearest pharmacies");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveTextContent("Pharmacy Road");
    await user.keyboard("{Enter}");
    expect(onNearest).toHaveBeenCalledWith("pharmacy");
  });

  it("says how the words were read, above the places it found", async () => {
    const user = userEvent.setup();
    fakeServer({
      "GET /api/maps/places": {
        query: "Waterloo station",
        coordinate: null,
        places: [place({}), place({ id: 2, featureCode: "PPLX", kindLabel: "Neighbourhood" })],
        notice: "Nothing is called “Waterloo station”; showing places called Waterloo, stations first.",
      },
    });
    const { onChoose } = box();
    await user.type(screen.getByRole("combobox", { name: "Search the map" }), "Waterloo station");
    expect(await screen.findByText(/showing places called Waterloo, stations first/)).toHaveAttribute("role", "status");
    const options = await screen.findAllByRole("option");
    expect(options[0]).toHaveTextContent("Railway station");
    await user.click(options[0]!);
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ kind: "place", title: "Waterloo" }));
  });
});
