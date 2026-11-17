/**
 * Tools a language model may call to look things up in Outpost.
 *
 * Defined once (registry.ts), used in two places: Chat, where the server runs what the
 * chosen model asks for and feeds the answers back (modules/chat/run.ts), and the Model
 * Context Protocol endpoint `/mcp`, for other programs on the home network (mcp.ts).
 *
 * Every tool reads and nothing else; see types.ts for the rules and
 * test/tools-readonly.test.ts for the proof. Which tools are offered at all follows the
 * area switches in Settings (`tools.<area>`): a tool whose area is off is not offered,
 * and a call to it is refused as if it did not exist.
 *
 * Nothing here runs until a model or a program asks. Nothing polls, nothing is kept
 * between calls, and no connection is held open.
 */
import os from "node:os";
import { type McpStatus, TOOL_AREAS, type ToolArea, type ToolInfo, type ToolsStatus } from "@outpost/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, forbidden } from "../../core/errors.ts";
import { isLocalRequest } from "../../core/local.ts";
import { settings as settingsTable } from "../../db/schema.ts";
import { MCP_VERSIONS, registerMcp } from "./mcp.ts";
import { TOOLS } from "./registry.ts";
import { MAX_ANSWER_CHARS, type ToolDefinition } from "./types.ts";

/**
 * The switch for `/mcp`. Not in the settings schema, for the reason backup protection is
 * not: `PATCH /api/settings` is open to every device, and this changes who can read
 * what, so it is changed only from the computer Outpost runs on (`PUT /api/tools/mcp`).
 * "Put everything back to its defaults" and "Erase everything" remove the row, which
 * turns it off.
 */
export const MCP_SETTING = "tools.mcp";

/** What the model or the program is told came of one call. */
export interface ToolCallResult {
  ok: boolean;
  /** The name as it was asked for. */
  name: string;
  tool: ToolDefinition | null;
  /** For "Looked at": the tool's title, or what was asked for when there is no such tool. */
  title: string;
  area: ToolArea | null;
  /** The arguments: as checked when they fitted, as sent when they did not. */
  arguments: unknown;
  /** What the model is sent. Never more than MAX_ANSWER_CHARS. */
  text: string;
  label: string | null;
  url: string | null;
  held: boolean;
}

/** A tool as a model server is sent it: the OpenAI-compatible shape, which Ollama takes too. */
export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ToolsService {
  readonly all: readonly ToolDefinition[];
  areaOn(area: ToolArea): boolean;
  /** The tools whose areas are switched on, in the registry's order. */
  offered(): ToolDefinition[];
  /** A tool's arguments as JSON Schema (2020-12, no `$schema`), made from its zod schema. */
  schemaOf(tool: ToolDefinition): Record<string, unknown>;
  specs(tools: readonly ToolDefinition[]): ToolSpec[];
  /**
   * Runs one tool. Never throws for anything a model can do wrong: no such tool, an area
   * that is off, arguments that do not fit, or a tool that fails, each come back as
   * `ok: false` with words the model can act on.
   */
  call(name: string, args: unknown, options: { signal: AbortSignal; offered?: readonly ToolDefinition[] }): Promise<ToolCallResult>;
  mcpEnabled(): boolean;
  status(request: FastifyRequest): ToolsStatus;
}

declare module "../../core/context.ts" {
  interface Services {
    tools: ToolsService;
  }
}

const cut = (text: string) =>
  text.length > MAX_ANSWER_CHARS ? `${text.slice(0, MAX_ANSWER_CHARS - 40).trimEnd()}\n(Cut short: the answer was longer.)` : text;

/** A zod issue as a sentence a small model can act on: "radius_km: Too big: expected number to be <=50". */
function issuesOf(error: z.ZodError): string {
  return error.issues
    .slice(0, 4)
    .map((issue) => `${issue.path.length > 0 ? `${issue.path.join(".")}: ` : ""}${issue.message}`)
    .join("; ");
}

/**
 * What a small model sends, made to fit before it is checked. Tried with real models on
 * 2026-11-17 (docs/ai.md, "Tried with a real model: tools"): llama3.2:3b sent every number
 * as a string (`"count": "3"`, `"page": "1"`) and empty strings or null for arguments it
 * meant to leave out, and each such call was refused. A number written as digits becomes
 * that number where the schema asks for a number, and an empty or null value of an
 * argument that may be left out is left out. Nothing else is changed: anything that still
 * does not fit is refused in words, as before.
 */
export function lenient(args: unknown, schema: Record<string, unknown>): unknown {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  const properties = (schema.properties ?? {}) as Record<string, { type?: unknown }>;
  const required = new Set((schema.required ?? []) as string[]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    const type = properties[key]?.type;
    if ((value === null || value === "") && !required.has(key)) continue;
    if ((type === "number" || type === "integer") && typeof value === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) {
      out[key] = Number(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** This computer's own addresses on the home network, IPv4 and private, for "the address to give a client". */
function lanAddresses(): string[] {
  const found: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)) found.push(entry.address);
    }
  }
  return [...new Set(found)].slice(0, 4);
}

export function createToolsService(ctx: AppContext, tools: readonly ToolDefinition[] = TOOLS): ToolsService {
  const { settings } = ctx.services;
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const schemas = new Map<string, Record<string, unknown>>();

  const areaOn = (area: ToolArea) => settings.get(`tools.${area}`) === true;

  function schemaOf(tool: ToolDefinition): Record<string, unknown> {
    let schema = schemas.get(tool.name);
    if (!schema) {
      const made = z.toJSONSchema(tool.input, { io: "input" }) as Record<string, unknown>;
      delete made.$schema;
      schema = made;
      schemas.set(tool.name, schema);
    }
    return schema;
  }

  function mcpEnabled(): boolean {
    const row = ctx.db.select().from(settingsTable).where(eq(settingsTable.key, MCP_SETTING)).get();
    return row?.value === true;
  }

  const service: ToolsService = {
    all: tools,
    areaOn,
    offered: () => tools.filter((tool) => areaOn(tool.area)),
    schemaOf,
    specs: (list) =>
      list.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: schemaOf(tool) } })),
    mcpEnabled,

    async call(name, args, { signal, offered }) {
      const now = Date.now();
      const available = offered ?? service.offered();
      const tool = byName.get(name);
      const refuse = (text: string, tool: ToolDefinition | null = null): ToolCallResult => ({
        ok: false,
        name,
        tool,
        title: tool?.title ?? (String(name).slice(0, 60) || "a tool with no name"),
        area: tool?.area ?? null,
        arguments: args,
        text,
        label: null,
        url: null,
        held: false,
      });
      const names = available.map((entry) => entry.name).join(", ");
      if (!tool || !available.includes(tool)) {
        // A tool whose area is off is refused in the same words as one that does not exist: it is not offered.
        return refuse(`There is no tool called "${String(name).slice(0, 60)}". The tools are: ${names || "none"}.`);
      }
      const parsed = tool.input.safeParse(lenient(args, schemaOf(tool)));
      if (!parsed.success) {
        return refuse(
          `The arguments for ${tool.name} did not fit: ${issuesOf(parsed.error)}. Call it again with arguments that fit its schema.`,
          tool,
        );
      }
      try {
        signal.throwIfAborted();
        const answer = await tool.run(parsed.data, { ctx, signal, now });
        return {
          ok: true,
          name,
          tool,
          title: tool.title,
          area: tool.area,
          arguments: parsed.data,
          text: cut(answer.text),
          label: answer.label ?? null,
          url: answer.url ?? null,
          held: answer.held,
        };
      } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof AppError) return refuse(`${tool.name} could not answer: ${error.message}`, tool);
        ctx.log.error({ err: error, tool: tool.name }, "a tool failed");
        return refuse(`${tool.name} failed on the server. Say that it could not be looked up.`, tool);
      }
    },

    status(request) {
      const port = ctx.config.port;
      const addresses = [
        `http://127.0.0.1:${port}/mcp`,
        ...(ctx.config.lanAccess ? lanAddresses().map((address) => `http://${address}:${port}/mcp`) : []),
      ];
      const mcp: McpStatus = {
        enabled: mcpEnabled(),
        canChange: isLocalRequest(request, ctx.config),
        addresses,
        versions: [...MCP_VERSIONS],
      };
      return {
        enabled: settings.get("tools.enabled"),
        areas: Object.fromEntries(TOOL_AREAS.map(({ area }) => [area, areaOn(area)])) as Record<ToolArea, boolean>,
        offForModels: settings.get("tools.offForModels"),
        tools: tools.map(({ name, title, area, description }): ToolInfo => ({ name, title, area, description })),
        mcp,
      };
    },
  };
  return service;
}

export async function registerTools(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createToolsService(ctx);
  ctx.services.tools = service;

  /** What there is, what is switched on, and whether this device may change the `/mcp` switch. Changes nothing. */
  app.get("/api/tools", async (request): Promise<ToolsStatus> => service.status(request));

  /**
   * "Let other programs on the home network use these tools". Only from the computer
   * Outpost runs on (`isLocalRequest`), because it changes who can read what.
   */
  app.put("/api/tools/mcp", async (request): Promise<ToolsStatus> => {
    const { enabled } = z.object({ enabled: z.boolean() }).strict().parse(request.body);
    if (!isLocalRequest(request, ctx.config)) {
      throw forbidden(
        "This can only be changed at the computer Outpost runs on, because it lets other programs on the network read what the tools read.",
      );
    }
    const now = Date.now();
    ctx.db
      .insert(settingsTable)
      .values({ key: MCP_SETTING, value: enabled, updatedAt: now })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: enabled, updatedAt: now } })
      .run();
    ctx.events.publish({ type: "settings.changed" });
    return service.status(request);
  });

  await registerMcp(app, ctx, service);
}
