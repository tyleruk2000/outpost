import type { MarkerDto } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { FALLBACK_THEME, MARKER_HEX } from "../lib/palette";
import { parsePlaceImageId } from "../lib/place-icons";
import { markersData, OVERLAY_LAYERS, overlayLayers } from "./overlays";
import { drawPlaceImage, PLACE_IMAGE_SIZE } from "./place-images";

const marker = (id: string, extra: Partial<MarkerDto> = {}): MarkerDto => ({
  id,
  name: id,
  note: "",
  lat: 54.46,
  lon: -3.18,
  color: "teal",
  icon: "pin",
  isFavorite: false,
  noteId: null,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

type Layer = { id: string; type: string; filter?: unknown; paint?: Record<string, unknown>; layout?: Record<string, unknown> };
const layersOf = (scheme: "light" | "dark") => overlayLayers(FALLBACK_THEME[scheme]) as unknown as Layer[];
const layer = (id: string, scheme: "light" | "dark" = "light") => layersOf(scheme).find((item) => item.id === id) as Layer;

describe("saved places as the map is given them", () => {
  it("leave a plain pin exactly as places were before there were icons", () => {
    const data = markersData([marker("Cairn", { color: "amber", isFavorite: true })], null);
    expect(data.features).toEqual([
      {
        type: "Feature",
        properties: { id: "Cairn", name: "Cairn", color: MARKER_HEX.amber, favourite: true },
        geometry: { type: "Point", coordinates: [-3.18, 54.46] },
      },
    ]);
  });

  it("say the icon and the colour's name for a place that has one, which together name its picture", () => {
    const [feature] = markersData([marker("Bothy", { icon: "shelter", color: "green" })], null).features;
    expect(feature!.properties).toEqual({
      id: "Bothy",
      name: "Bothy",
      color: MARKER_HEX.green,
      favourite: false,
      icon: "shelter",
      tint: "green",
    });
  });

  it("treat a place with no icon, or one this Outpost does not draw, as a plain pin", () => {
    const old = { ...marker("Kept long ago") } as Partial<MarkerDto>;
    delete old.icon;
    const data = markersData([old as MarkerDto, marker("Newer", { icon: "lighthouse" as never })], null);
    for (const feature of data.features) {
      expect(feature.properties).not.toHaveProperty("icon");
      expect(feature.properties).not.toHaveProperty("tint");
    }
  });

  it("still leave out the place being edited, which is the pin", () => {
    const data = markersData([marker("a", { icon: "tent" }), marker("b", { icon: "tent" })], "a");
    expect(data.features.map((feature) => feature.properties.id)).toEqual(["b"]);
  });
});

describe("the layers saved places are drawn with", () => {
  it("keep every place the dot a press lands on, exactly as it was before there were icons", () => {
    const dots = layer(OVERLAY_LAYERS.markers);
    expect(dots.type).toBe("circle");
    // No filter: plain pins and places with icons are both here, so a press, a long press and a right-click find either.
    expect(dots.filter).toBeUndefined();
    expect(dots.paint).toEqual({
      "circle-radius": 6.5,
      "circle-color": ["get", "color"],
      "circle-stroke-color": FALLBACK_THEME.light.page,
      "circle-stroke-width": 2.5,
    });
  });

  it("lay a place out once, its picture and its name together, over its dot", () => {
    const ids = layersOf("light").map((item) => item.id);
    const [favourite, dots, names, favouriteIcons] = [
      "o-markers-favourite",
      OVERLAY_LAYERS.markers,
      OVERLAY_LAYERS.markerNames,
      OVERLAY_LAYERS.favouriteIcons,
    ].map((id) => ids.indexOf(id)) as [number, number, number, number];
    expect(favourite).toBeGreaterThanOrEqual(0);
    expect(favourite).toBeLessThan(dots);
    expect(dots).toBeLessThan(names);
    expect(names).toBeLessThan(favouriteIcons);
    // One layer for names and icons: there is no second one that lays every place out again.
    expect(ids.filter((id) => id.startsWith("o-markers"))).toEqual([
      "o-markers-favourite",
      OVERLAY_LAYERS.markers,
      OVERLAY_LAYERS.markerNames,
      OVERLAY_LAYERS.favouriteIcons,
    ]);
    const both = layer(OVERLAY_LAYERS.markerNames);
    expect(both.type).toBe("symbol");
    const picture = ["concat", "place-", ["get", "icon"], "-", ["get", "tint"], "-", "ffffff"];
    // A place with an icon that is not a favourite has its picture here; any other place has none.
    expect(both.layout!["icon-image"]).toEqual(["case", ["all", ["has", "icon"], ["!=", ["get", "favourite"], true]], picture, ""]);
  });

  it("leave out a picture that would lie over another, so thousands of places draw a screenful at most", () => {
    // Left to the map's own default, which is to draw only what does not overlap; the place is then its dot.
    const both = layer(OVERLAY_LAYERS.markerNames);
    expect(both.layout).not.toHaveProperty("icon-allow-overlap");
    expect(both.layout).not.toHaveProperty("icon-ignore-placement");
    expect(both.layout!["icon-padding"]).toBe(0);
    // Neither part takes the other with it: a name with no room leaves the icon, and an icon with no room leaves the name.
    expect(both.layout).toMatchObject({ "text-optional": true, "icon-optional": true });
  });

  it("write names by the rules there were before icons: favourites always, the rest from zoom 9", () => {
    const both = layer(OVERLAY_LAYERS.markerNames);
    expect(both.layout!["text-field"]).toEqual([
      "step",
      ["zoom"],
      ["case", ["==", ["get", "favourite"], true], ["get", "name"], ""],
      9,
      ["get", "name"],
    ]);
    // A place is in the layer when it has a name to write there or a picture to draw.
    expect(both.filter).toEqual(["any", ["==", ["get", "favourite"], true], [">=", ["zoom"], 9], ["has", "icon"]]);
    expect(both.layout!["symbol-sort-key"]).toEqual(["case", ["get", "favourite"], 0, 1]);
    expect(both.layout!["text-max-width"]).toBe(9);
  });

  it("always draw a favourite's picture, as its name is always written", () => {
    const pictures = layer(OVERLAY_LAYERS.favouriteIcons);
    expect(pictures.filter).toEqual(["all", ["has", "icon"], ["==", ["get", "favourite"], true]]);
    expect(pictures.layout!["icon-allow-overlap"]).toBe(true);
    expect(pictures.layout).not.toHaveProperty("text-field");
  });

  it("name the picture from the place and the theme, so each theme gets a ring in its own page colour", () => {
    const light = layer(OVERLAY_LAYERS.favouriteIcons, "light").layout!["icon-image"] as unknown[];
    const dark = layer(OVERLAY_LAYERS.favouriteIcons, "dark").layout!["icon-image"] as unknown[];
    expect(light).toEqual(["concat", "place-", ["get", "icon"], "-", ["get", "tint"], "-", "ffffff"]);
    expect(dark.at(-1)).toBe(FALLBACK_THEME.dark.page.slice(1));
    // What the map will ask for, for a green shelter on the dark map, is a name that can be drawn.
    const asked = `place-shelter-green-${dark.at(-1)}`;
    expect(parsePlaceImageId(asked)).toEqual({ icon: "shelter", color: "green", page: FALLBACK_THEME.dark.page });
  });

  it("give a favourite its ring outside the larger disc, and put a name clear of it", () => {
    expect(layer("o-markers-favourite").paint!["circle-radius"]).toEqual(["case", ["has", "icon"], 15.5, 11]);
    expect(layer(OVERLAY_LAYERS.markerNames).layout!["text-offset"]).toEqual([
      "case",
      ["has", "icon"],
      ["literal", [0, 1.25]],
      ["literal", [0, 0.9]],
    ]);
  });
});

describe("the pictures themselves", () => {
  it("are a disc with its ring and a pixel to spare, and nothing is drawn for a name that is not a place's", () => {
    expect(PLACE_IMAGE_SIZE).toBe(28);
    expect(drawPlaceImage("townspot", 2)).toBeNull();
    expect(drawPlaceImage("place-pin-teal-ffffff", 2)).toBeNull();
  });
});
