/**
 * Every tool, in the order a model and a program are shown them. One entry per file of
 * tools, each on a line of its own. A tool added here is offered in Chat and over MCP
 * under its area's switch, and is held to the read-only test with every other.
 */
import { LIBRARY_TOOLS } from "./library.ts";
import type { ToolDefinition } from "./types.ts";

export const TOOLS: readonly ToolDefinition[] = [...LIBRARY_TOOLS];
