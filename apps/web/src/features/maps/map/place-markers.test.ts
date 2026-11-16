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

  it("put names and icons in the order of who gives way: ordinary names to every icon, and everything to a favourite", () => {
    const ids = layersOf("light").map((item) => item.id);
    // The map gives room to a higher layer first.
    expect(ids.filter((id) => id.startsWith("o-markers"))).toEqual([
      "o-markers-favourite",
      OVERLAY_LAYERS.markers,
      "o-markers-label",
      OVERLAY_LAYERS.markerIcons,
      OVERLAY_LAYERS.favourites,
    ]);
  });

  it("draw one picture for a place with an icon, and leave out one that would lie over another", () => {
    const pictures = layer(OVERLAY_LAYERS.markerIcons);
    expect(pictures.type).toBe("symbol");
    expect(pictures.filter).toEqual(["all", ["has", "icon"], ["!=", ["get", "favourite"], true]]);
    // No lettering in this layer: nothing for the map to lay out but one picture a place.
    expect(pictures.layout).not.toHaveProperty("text-field");
    // Left to the map's own default, which is to draw only what does not overlap; the place is then its dot.
    // That is what makes thousands of places a screenful of pictures at most.
    expect(pictures.layout).not.toHaveProperty("icon-allow-overlap");
    expect(pictures.layout).not.toHaveProperty("icon-ignore-placement");
    expect(pictures.layout!["icon-padding"]).toBe(0);
  });

  it("write names by the rules there were before icons: favourites always, the rest from zoom 9", () => {
    const others = layer("o-markers-label");
    expect(others.filter).toEqual(["all", ["!=", ["get", "favourite"], true], [">=", ["zoom"], 9]]);
    const favourites = layer(OVERLAY_LAYERS.favourites);
    expect(favourites.filter).toEqual(["==", ["get", "favourite"], true]);
    for (const names of [others, favourites]) {
      expect(names.layout).toMatchObject({
        "text-field": ["get", "name"],
        "text-anchor": "top",
        "text-max-width": 9,
        "text-optional": true,
        "text-offset": ["case", ["has", "icon"], ["literal", [0, 1.45]], ["literal", [0, 0.9]]],
      });
    }
    expect(others.layout).not.toHaveProperty("icon-image");
  });

  it("always draw a favourite's picture, as its name is always written", () => {
    const favourites = layer(OVERLAY_LAYERS.favourites);
    const picture = ["concat", "place-", ["get", "icon"], "-", ["get", "tint"], "-", "ffffff"];
    expect(favourites.layout!["icon-image"]).toEqual(["case", ["has", "icon"], picture, ""]);
    expect(favourites.layout!["icon-allow-overlap"]).toBe(true);
    // Between them the two layers draw every place with an icon once, from the same picture.
    expect(layer(OVERLAY_LAYERS.markerIcons).layout!["icon-image"]).toEqual(picture);
  });

  it("name the picture from the place and the theme, so each theme gets a ring in its own page colour", () => {
    const light = layer(OVERLAY_LAYERS.markerIcons, "light").layout!["icon-image"] as unknown[];
    const dark = layer(OVERLAY_LAYERS.markerIcons, "dark").layout!["icon-image"] as unknown[];
    expect(light).toEqual(["concat", "place-", ["get", "icon"], "-", ["get", "tint"], "-", "ffffff"]);
    expect(dark.at(-1)).toBe(FALLBACK_THEME.dark.page.slice(1));
    // What the map will ask for, for a green shelter on the dark map, is a name that can be drawn.
    const asked = `place-shelter-green-${dark.at(-1)}`;
    expect(parsePlaceImageId(asked)).toEqual({ icon: "shelter", color: "green", page: FALLBACK_THEME.dark.page });
  });

  it("give a favourite its ring outside the larger disc", () => {
    expect(layer("o-markers-favourite").paint!["circle-radius"]).toEqual(["case", ["has", "icon"], 15.5, 11]);
  });
});

describe("the pictures themselves", () => {
  it("are a disc with its ring and a pixel to spare, and nothing is drawn for a name that is not a place's", () => {
    expect(PLACE_IMAGE_SIZE).toBe(28);
    expect(drawPlaceImage("townspot", 2)).toBeNull();
    expect(drawPlaceImage("place-pin-teal-ffffff", 2)).toBeNull();
  });
});
