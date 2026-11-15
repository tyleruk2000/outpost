/**
 * The one place the maps screen holds literal colours.
 *
 * Markers and tracks are drawn by MapLibre on top of a map that may be light or dark,
 * so their colours have to hold against both and cannot follow the theme. Each is a
 * mid-lightness colour that keeps 3:1 against the light and the dark land colour; the
 * casing drawn around it (the page colour, read from the tokens) does the rest.
 * "teal" is the verdigris primary and "amber" the lamp, at map-safe lightness.
 */
import type { MarkerColor } from "@outpost/shared";

export const MARKER_HEX: Record<MarkerColor, string> = {
  teal: "#1f8a8c",
  amber: "#dc9414",
  red: "#d24b3e",
  green: "#3d9150",
  blue: "#3f7fd6",
  violet: "#8d62cc",
  slate: "#6d7c88",
};

export const MARKER_COLOR_NAMES: Record<MarkerColor, string> = {
  teal: "Teal",
  amber: "Amber",
  red: "Red",
  green: "Green",
  blue: "Blue",
  violet: "Violet",
  slate: "Slate",
};

/** Used when the token cannot be read (no stylesheet, as in tests). */
export const FALLBACK_THEME = {
  light: {
    land: "#ecefef",
    water: "#c5dcdf",
    outline: "#b9c4c6",
    road: "#ffffff",
    roadCasing: "#b9c4c6",
    path: "#6f7c81",
    page: "#ffffff",
    ink: "#161e21",
    inkMuted: "#4d595e",
    primary: "#1c6a70",
    lamp: "#e6a23c",
    contour: "#74532b",
  },
  dark: {
    land: "#1c2224",
    water: "#0d1719",
    outline: "#404a4d",
    road: "#4a5558",
    roadCasing: "#141a1c",
    path: "#818c90",
    page: "#141a1c",
    ink: "#e9edee",
    inkMuted: "#a7b1b4",
    primary: "#6cc3c4",
    lamp: "#edb354",
    contour: "#d2b27e",
  },
} as const;
