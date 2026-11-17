/** The Model Context Protocol endpoint, `/mcp`. Stub: being written. */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/context.ts";
import type { ToolsService } from "./index.ts";

export const MCP_VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"] as const;

export async function registerMcp(_app: FastifyInstance, _ctx: AppContext, _tools: ToolsService): Promise<void> {}
