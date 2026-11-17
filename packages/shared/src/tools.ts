/**
 * Shapes for the tools a language model may call to look things up in Outpost.
 *
 * Every tool reads; none creates, changes, removes, downloads or asks anything on the
 * internet. Each belongs to one area of the household's data, and each area has a switch
 * in Settings (`tools.<area>`). A model reaches them in two ways: from Chat, where the
 * server runs what the model asks for (never the browser), and, when it is switched on at
 * the computer Outpost runs on, from other programs over the Model Context Protocol at
 * `/mcp` (docs/mcp.md).
 */

/** The areas of the household's data a tool can read. Each is one switch. */
export type ToolArea = "library" | "places" | "supplies" | "plans" | "weather" | "radio" | "catalogue" | "board";

export interface ToolAreaInfo {
  area: ToolArea;
  /** As Settings shows it: "Library and notes". */
  label: string;
  /** One sentence: what turning this on lets a model server see. */
  about: string;
  /** Whether it is on until a person changes it. */
  defaultOn: boolean;
}

/** In the order Settings lists them. */
export const TOOL_AREAS: readonly ToolAreaInfo[] = [
  {
    area: "library",
    label: "Library and notes",
    about:
      "Passages of your documents, notes and book chapters that match what the model asks for, and the page or passage it asks to read. Notes' encrypted pages are never read.",
    defaultOn: true,
  },
  {
    area: "places",
    label: "Places and map layers",
    about:
      "Your saved places, every reference layer you have fetched (hospitals, shops, airports and the rest), and the map's place names, with where each is and how far.",
    defaultOn: true,
  },
  {
    area: "supplies",
    label: "Supplies",
    about: "What you hold, how many days of food, water and energy that comes to, and what is missing.",
    defaultOn: true,
  },
  {
    area: "plans",
    label: "Emergency plans",
    about: "The plans you hold and their steps, including the people, places and meeting points written in them.",
    defaultOn: true,
  },
  {
    area: "weather",
    label: "Weather and hazards",
    about: "The forecast, warnings, flood warnings and river and sea levels as last fetched, the sun's times, and magnetic declination.",
    defaultOn: true,
  },
  {
    area: "radio",
    label: "Radio",
    about: "Frequencies to listen to, repeaters held near a place, and propagation predictions already saved.",
    defaultOn: true,
  },
  {
    area: "catalogue",
    label: "The catalogue",
    about: "What could be downloaded on a subject, and whether it is already held.",
    defaultOn: true,
  },
  {
    area: "board",
    label: "Messages on the board",
    about: "The household's messages and check-ins (“I’m safe, gone to Mum’s”), with who wrote them and when.",
    defaultOn: false,
  },
];

/** A tool as a screen lists it. */
export interface ToolInfo {
  name: string;
  /** As a person reads it in "Looked at": "places on the map". */
  title: string;
  area: ToolArea;
  description: string;
}

/**
 * One thing a model looked up, kept with the reply it was looked up for, so that a
 * conversation read again later shows the same. Stored in the reply's `sources` as an
 * `AnswerSource` of kind `lookup` (see `AnswerSource.lookup`).
 */
export interface ToolLookup {
  /** The tool's name as the model called it. May name no tool, when the model made one up. */
  tool: string;
  /** What was asked of it, as the model gave it (after checking, when it fitted). */
  arguments: unknown;
  area: ToolArea | null;
  /** False when the call was refused: no such tool, arguments that did not fit, an area switched off, or the step limit. */
  ok: boolean;
}

export interface McpStatus {
  /** "Let other programs on the home network use these tools". Off until a person at this computer turns it on. */
  enabled: boolean;
  /** Whether this request may change it: only from the computer Outpost runs on. */
  canChange: boolean;
  /** The addresses to give a client, ending in `/mcp`. */
  addresses: string[];
  /** The protocol revisions `/mcp` answers. */
  versions: string[];
}

export interface ToolsStatus {
  /** "Let the model look things up in Outpost": Chat offers tools to a model that can call them. */
  enabled: boolean;
  areas: Record<ToolArea, boolean>;
  /** Models a person has told Outpost not to offer tools to, though they say they can call them. */
  offForModels: string[];
  /** Every tool, whether or not its area is on. */
  tools: ToolInfo[];
  mcp: McpStatus;
}
