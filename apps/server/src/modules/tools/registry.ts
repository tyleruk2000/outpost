/**
 * Every tool, in the order a model and a program are shown them. One entry per file of
 * tools, each on a line of its own. A tool added here is offered in Chat and over MCP
 * under its area's switch, and is held to the read-only test with every other.
 */
import { BOARD_TOOLS } from "./board.ts";
import { CATALOGUE_TOOLS } from "./catalogue.ts";
import { LIBRARY_TOOLS } from "./library.ts";
import { PLACES_TOOLS } from "./places.ts";
import { PLANS_TOOLS } from "./plans.ts";
import { RADIO_TOOLS } from "./radio.ts";
import { SUPPLIES_TOOLS } from "./supplies.ts";
import type { ToolDefinition } from "./types.ts";
import { WEATHER_TOOLS } from "./weather.ts";

export const TOOLS: readonly ToolDefinition[] = [
  ...LIBRARY_TOOLS,
  ...PLACES_TOOLS,
  ...SUPPLIES_TOOLS,
  ...PLANS_TOOLS,
  ...WEATHER_TOOLS,
  ...RADIO_TOOLS,
  ...CATALOGUE_TOOLS,
  ...BOARD_TOOLS,
];
