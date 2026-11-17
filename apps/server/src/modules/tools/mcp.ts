/**
 * The Model Context Protocol endpoint, `/mcp`: the same read-only tools Chat offers, for
 * other programs on the home network (a desktop assistant, an editor). docs/mcp.md says
 * what it answers, what it does not, and how to point a client at it.
 *
 * One endpoint, plain JSON over HTTP POST, nothing held between requests. It speaks
 * revision 2026-07-28 (stateless: every request says its version in `_meta`) and the
 * earlier ones that open with `initialize` (2025-11-25, 2025-06-18, 2025-03-26), and
 * tells them apart the way the versioning page says a "dual-era" server does: a request
 * that carries the modern `_meta` is served as 2026-07-28; `initialize` and everything
 * without it is served as the earlier revisions. No session is minted, no stream is
 * opened, nothing is pushed.
 *
 * Who may call it. Outpost has no accounts and no tokens, so the rules are about where a
 * request comes from and whether a browser could have been made to send it:
 *
 *  - It is off until it is switched on at the computer Outpost runs on.
 *  - The connection must come from loopback or a private, link-local or unique-local
 *    address; a request through a proxy (any forwarding header) is refused, because
 *    where it came from cannot then be told.
 *  - The request guard (core/guard.ts) already holds the Host header to the addresses
 *    Outpost answers to. Here, as the protocol requires, an `Origin` that is not this
 *    server's own is refused, and so is a `Sec-Fetch-Site` other than same-origin or none.
 *  - The body must be `application/json`. A page on another site can make a browser POST
 *    `text/plain` without asking first, never `application/json`.
 *  - A small allowance of requests per address, worked out from timestamps.
 */
import net from "node:net";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";
import { VERSION } from "../../core/version.ts";
import type { ToolsService } from "./index.ts";

/** Every revision answered, newest first. */
export const MCP_VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"] as const;
/** The stateless revision: requests carry `_meta`. */
const MODERN = "2026-07-28";
/** The revisions that open with `initialize`, newest first. */
const LEGACY: readonly string[] = MCP_VERSIONS.filter((version) => version !== MODERN);

export const MCP_PATH = "/mcp";
/** The largest request body read. A tool call is a few hundred bytes. */
export const MAX_BODY_BYTES = 256 * 1024;

/** The allowance: a burst of this many, then one more every second (60 a minute). */
export const RATE_BURST = 20;
export const RATE_PER_MINUTE = 60;
/** Addresses remembered for the allowance; the one heard from least recently is forgotten first. */
const RATE_ADDRESSES = 300;

const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
const META_SERVER = "io.modelcontextprotocol/serverInfo";

/**
 * Where a connection may come from: loopback, the private IPv4 ranges (RFC 1918),
 * link-local, and IPv6 unique-local. Not "anything that is not public": the
 * documentation, benchmarking and carrier-grade NAT ranges are none of these.
 */
const HOME_NETWORK = new net.BlockList();
for (const [address, prefix] of [
  ["127.0.0.0", 8],
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["169.254.0.0", 16],
] as const) {
  HOME_NETWORK.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
  ["::1", 128],
  ["fe80::", 10],
  ["fc00::", 7],
] as const) {
  HOME_NETWORK.addSubnet(address, prefix, "ipv6");
}

/** Whether a connection's address is this computer's or the home network's. */
export function isHomeAddress(address: string): boolean {
  const family = net.isIP(address);
  return family !== 0 && HOME_NETWORK.check(address, family === 4 ? "ipv4" : "ipv6");
}

const FORWARDING_HEADERS = ["forwarded", "x-forwarded-for", "x-real-ip", "x-forwarded-host"];

const SERVER_INFO = { name: "outpost", title: "Outpost", version: VERSION };

const INSTRUCTIONS =
  "Outpost is a household's own offline library, map and records. These tools only read. Each answer says where it came from and how old it is; pass that on, and when a tool says something is not held, say so rather than guessing.";

/** JSON-RPC and MCP error codes used here. */
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
const HEADER_MISMATCH = -32020;
const UNSUPPORTED_VERSION = -32022;

type Id = string | number;

/** A JSON-RPC error answer to a message that was read, with the HTTP status to send it with. */
class RpcError {
  readonly status: number;
  readonly id: Id | null;
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
  constructor(status: number, id: Id | null, code: number, message: string, data?: unknown) {
    this.status = status;
    this.id = id;
    this.code = code;
    this.message = message;
    this.data = data;
  }
}

const rpcError = (status: number, id: Id | null, code: number, message: string, data?: unknown) =>
  new RpcError(status, id, code, message, data);

function sendError(reply: FastifyReply, error: RpcError) {
  const body = {
    jsonrpc: "2.0",
    id: error.id,
    error: { code: error.code, message: error.message, ...(error.data === undefined ? {} : { data: error.data }) },
  };
  return reply.status(error.status).type("application/json; charset=utf-8").send(JSON.stringify(body));
}

/** A refusal of the whole request, before its body is read: no id. */
function refuse(reply: FastifyReply, status: number, code: number, message: string) {
  return reply
    .status(status)
    .type("application/json; charset=utf-8")
    .send(JSON.stringify({ jsonrpc: "2.0", error: { code, message } }));
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** An address as a socket gives it, without a zone and with IPv4 unwrapped. */
function plainAddress(address: string): string {
  const value = address.trim().toLowerCase().replace(/%.*$/, "");
  return value.startsWith("::ffff:") && value.includes(".") ? value.slice("::ffff:".length) : value;
}

/** `Mcp-Name` may carry a name as `=?base64?…?=`; the name it stands for, or null when that is not valid. */
export function decodeHeaderValue(value: string): string | null {
  const match = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/.exec(value);
  if (!match) return value.startsWith("=?base64?") && value.endsWith("?=") ? null : value;
  return Buffer.from(match[1] ?? "", "base64").toString("utf8");
}

/** What a model may be sent: the text without control characters other than line breaks and tabs. */
function clean(text: string): string {
  let kept = "";
  for (const character of text) {
    const code = character.charCodeAt(0);
    if ((code < 0x20 && character !== "\n" && character !== "\t") || code === 0x7f) continue;
    kept += character;
  }
  return kept;
}

/**
 * A token bucket per address, kept as a count and the time it was counted: no timers. At
 * most RATE_ADDRESSES are kept; a Map remembers the order addresses were last heard from.
 */
export function createRateLimit(options: { burst?: number; perMinute?: number; addresses?: number } = {}) {
  const burst = options.burst ?? RATE_BURST;
  const perMs = (options.perMinute ?? RATE_PER_MINUTE) / 60_000;
  const most = options.addresses ?? RATE_ADDRESSES;
  const buckets = new Map<string, { tokens: number; at: number }>();
  return {
    /** Takes one request's worth for `address`: 0 when allowed, otherwise the seconds until it would be. */
    take(address: string, now = Date.now()): number {
      const held = buckets.get(address);
      const tokens = held ? Math.min(burst, held.tokens + (now - held.at) * perMs) : burst;
      buckets.delete(address);
      if (tokens < 1) {
        buckets.set(address, { tokens, at: now });
        return Math.max(1, Math.ceil((1 - tokens) / perMs / 1000));
      }
      buckets.set(address, { tokens: tokens - 1, at: now });
      while (buckets.size > most) {
        const oldest = buckets.keys().next().value;
        if (oldest === undefined) break;
        buckets.delete(oldest);
      }
      return 0;
    },
    get size() {
      return buckets.size;
    },
  };
}

export async function registerMcp(app: FastifyInstance, ctx: AppContext, tools: ToolsService): Promise<void> {
  const limit = createRateLimit();

  /** Every check that does not need the body. Answers the request itself when it is refused. */
  async function admit(request: FastifyRequest, reply: FastifyReply) {
    reply.header("Cache-Control", "no-store");
    if (FORWARDING_HEADERS.some((name) => request.headers[name] !== undefined)) {
      return refuse(
        reply,
        403,
        INVALID_REQUEST,
        "Requests through a proxy are not accepted here: where they came from cannot be told. Connect to Outpost directly.",
      );
    }
    const raw = request.socket.remoteAddress ?? "";
    const address = plainAddress(raw);
    if (!isHomeAddress(address)) {
      return refuse(reply, 403, INVALID_REQUEST, "Only programs on this computer or the home network may use Outpost's tools.");
    }
    const site = header(request, "sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") {
      return refuse(reply, 403, INVALID_REQUEST, "Requests from web pages on other sites are not accepted.");
    }
    const origin = header(request, "origin");
    if (origin !== undefined) {
      // `null` (a sandboxed page, a file opened from disk) and anything that is not an address are no origin of ours.
      // The whole origin, scheme and port too: a page of another program on this computer is another site, and over
      // plain http at a network address a browser sends no Sec-Fetch-Site to say so.
      const from = URL.parse(origin)?.origin;
      const own = URL.parse(`${request.protocol}://${header(request, "host") ?? ""}`)?.origin;
      if (!from || from === "null" || from !== own) {
        return refuse(reply, 403, INVALID_REQUEST, "Requests from web pages on other sites are not accepted.");
      }
    }
    if (!tools.mcpEnabled()) {
      return refuse(
        reply,
        403,
        INVALID_REQUEST,
        "Outpost's tools are switched off for other programs. Turn on “Let other programs on the home network use these tools” in Settings, at the computer Outpost runs on.",
      );
    }
    const wait = limit.take(address);
    if (wait > 0) {
      reply.header("Retry-After", String(wait));
      return refuse(reply, 429, INVALID_REQUEST, `Too many requests from this address. Try again in ${wait} seconds.`);
    }
    if (request.method === "POST") {
      const type = (header(request, "content-type") ?? "").split(";")[0]?.trim().toLowerCase();
      if (type !== "application/json") {
        return refuse(reply, 415, INVALID_REQUEST, "Send the request as application/json.");
      }
    }
  }

  // ── The methods ──

  const listed = () =>
    tools.offered().map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tools.schemaOf(tool),
      annotations: { title: tool.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }));

  async function callTool(id: Id, params: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown> | RpcError> {
    const name = params.name;
    if (typeof name !== "string" || name === "") return rpcError(200, id, INVALID_PARAMS, "tools/call needs the name of a tool.");
    const args = params.arguments;
    if (args !== undefined && args !== null && !isObject(args)) {
      return rpcError(200, id, INVALID_PARAMS, "The arguments of tools/call must be an object.");
    }
    const offered = tools.offered();
    // A tool whose area is switched off is not offered, and is unknown here as it is in Chat.
    if (!offered.some((tool) => tool.name === name)) return rpcError(200, id, INVALID_PARAMS, `Unknown tool: ${name.slice(0, 80)}`);
    const result = await tools.call(name, args ?? {}, { signal, offered });
    // Arguments that do not fit, or a tool that could not answer, are the tool's own error: the model can read it and try again.
    return { content: [{ type: "text", text: clean(result.text) }], isError: !result.ok };
  }

  /** One request with an id: the result, or the error to send. */
  async function answer(
    message: { id: Id; method: string; params: Record<string, unknown> },
    era: "modern" | "legacy",
    signal: AbortSignal,
  ): Promise<Record<string, unknown> | RpcError> {
    const { id, method, params } = message;
    switch (method) {
      case "ping":
        return {};
      case "server/discover":
        return { supportedVersions: [...MCP_VERSIONS], capabilities: { tools: {} }, instructions: INSTRUCTIONS };
      case "tools/list":
        return { tools: listed() };
      case "tools/call":
        return callTool(id, params, signal);
      default:
        return rpcError(era === "modern" ? 404 : 200, id, METHOD_NOT_FOUND, `Method not found: ${method.slice(0, 80)}`);
    }
  }

  function initialize(id: Id, params: Record<string, unknown>): Record<string, unknown> | RpcError {
    const asked = params.protocolVersion;
    if (typeof asked !== "string") return rpcError(200, id, INVALID_PARAMS, "initialize needs a protocolVersion.");
    // The same version when it is one of the earlier revisions answered; otherwise the newest of them. (2026-07-28 has no initialize.)
    const protocolVersion = LEGACY.includes(asked) ? asked : (LEGACY[0] as string);
    return { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS };
  }

  async function handle(request: FastifyRequest, reply: FastifyReply) {
    const text = typeof request.body === "string" ? request.body : "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return sendError(reply, rpcError(400, null, PARSE_ERROR, "The body is not valid JSON."));
    }
    if (Array.isArray(parsed)) {
      return sendError(reply, rpcError(400, null, INVALID_REQUEST, "Send one JSON-RPC message per request; batches are not accepted."));
    }
    if (!isObject(parsed) || parsed.jsonrpc !== "2.0") {
      return sendError(reply, rpcError(400, null, INVALID_REQUEST, "The body is not a JSON-RPC 2.0 message."));
    }
    const hasId = Object.hasOwn(parsed, "id");
    const rawId = parsed.id;
    const id: Id | null = typeof rawId === "string" || (typeof rawId === "number" && Number.isFinite(rawId)) ? rawId : null;

    if (typeof parsed.method !== "string") {
      // A response from the client (to a request this server never sends) is accepted and ignored, as the earlier revisions say.
      if (hasId && ("result" in parsed || "error" in parsed)) return reply.status(202).send();
      return sendError(reply, rpcError(400, id, INVALID_REQUEST, "The message has no method."));
    }
    const method = parsed.method;
    if (!hasId) {
      // A notification: notifications/initialized, notifications/cancelled, or any other. Nothing to answer.
      return reply.status(202).send();
    }
    if (id === null) return sendError(reply, rpcError(400, null, INVALID_REQUEST, "The id must be a string or a number, not null."));
    if (parsed.params !== undefined && !isObject(parsed.params)) {
      return sendError(reply, rpcError(400, id, INVALID_REQUEST, "params must be an object."));
    }
    const params = (parsed.params ?? {}) as Record<string, unknown>;
    const meta = isObject(params._meta) ? params._meta : null;
    const headerVersion = header(request, "mcp-protocol-version");

    const signal = AbortSignal.any([ctx.stopping, closed(reply)]);
    const done = (result: Record<string, unknown> | RpcError, extra: Record<string, unknown> = {}) =>
      result instanceof RpcError
        ? sendError(reply, result)
        : reply
            .status(200)
            .type("application/json; charset=utf-8")
            .send(JSON.stringify({ jsonrpc: "2.0", id, result: { ...extra, ...result } }));

    if (method === "initialize") return done(initialize(id, params));

    const modern = (meta !== null && META_VERSION in meta) || headerVersion === MODERN;
    if (!modern) {
      // An earlier revision. The header, when sent, must name one of them; without it the request is taken as 2025-03-26,
      // which had no such header, and is answered the same way.
      if (headerVersion !== undefined && !LEGACY.includes(headerVersion)) {
        return sendError(
          reply,
          rpcError(400, id, INVALID_REQUEST, `MCP-Protocol-Version ${headerVersion.slice(0, 40)} is not one this server speaks.`, {
            supported: [...MCP_VERSIONS],
            requested: headerVersion.slice(0, 40),
          }),
        );
      }
      return done(await answer({ id, method, params }, "legacy", signal));
    }

    // 2026-07-28: the version and the client's capabilities in _meta, mirrored in the headers.
    const version = meta?.[META_VERSION];
    if (typeof version !== "string" || meta === null || !isObject(meta[META_CAPABILITIES])) {
      return sendError(
        reply,
        rpcError(
          400,
          id,
          INVALID_PARAMS,
          `Every request must carry _meta["${META_VERSION}"] and _meta["${META_CAPABILITIES}"], or open with initialize.`,
        ),
      );
    }
    const mismatch = headerMismatch(request, version, method, params);
    if (mismatch) return sendError(reply, rpcError(400, id, HEADER_MISMATCH, mismatch));
    if (version !== MODERN) {
      return sendError(
        reply,
        rpcError(400, id, UNSUPPORTED_VERSION, "Unsupported protocol version", {
          supported: [...MCP_VERSIONS],
          requested: version.slice(0, 40),
        }),
      );
    }
    return done(await answer({ id, method, params }, "modern", signal), { resultType: "complete", _meta: { [META_SERVER]: SERVER_INFO } });
  }

  /** Why the request's headers do not match its body, or null when they do. */
  function headerMismatch(request: FastifyRequest, version: string, method: string, params: Record<string, unknown>): string | null {
    const versionHeader = header(request, "mcp-protocol-version");
    if (versionHeader === undefined) return "Header mismatch: the MCP-Protocol-Version header is missing.";
    if (versionHeader !== version) {
      return `Header mismatch: MCP-Protocol-Version header value '${versionHeader.slice(0, 40)}' does not match body value '${version.slice(0, 40)}'`;
    }
    const methodHeader = header(request, "mcp-method");
    if (methodHeader === undefined) return "Header mismatch: the Mcp-Method header is missing.";
    if (methodHeader !== method) {
      return `Header mismatch: Mcp-Method header value '${methodHeader.slice(0, 80)}' does not match body value '${method.slice(0, 80)}'`;
    }
    if (method === "tools/call") {
      const nameHeader = header(request, "mcp-name");
      if (nameHeader === undefined) return "Header mismatch: the Mcp-Name header is missing.";
      const name = decodeHeaderValue(nameHeader);
      if (name === null) return "Header mismatch: the Mcp-Name header is not valid base64.";
      if (name !== params.name) {
        return `Header mismatch: Mcp-Name header value '${name.slice(0, 80)}' does not match body value '${String(params.name).slice(0, 80)}'`;
      }
    }
    return null;
  }

  await app.register(async (scope) => {
    // The body is read as text and parsed here, so that bad JSON is answered as JSON-RPC asks; never more than MAX_BODY_BYTES.
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser("*", { parseAs: "string", bodyLimit: MAX_BODY_BYTES }, (_request, body, done) => done(null, body));
    scope.setErrorHandler((error, request, reply) => {
      const status = (error as { statusCode?: number }).statusCode;
      reply.header("Cache-Control", "no-store");
      // The request guard's own refusals (a Host this server does not answer to) keep their words.
      if (error instanceof AppError) return refuse(reply, error.status, INVALID_REQUEST, error.message);
      if (status === 413) return refuse(reply, 413, INVALID_REQUEST, `The request is larger than ${MAX_BODY_BYTES / 1024} KB.`);
      if (status && status >= 400 && status < 500) return refuse(reply, status, INVALID_REQUEST, "The request could not be read.");
      request.log.error({ err: error }, "the MCP endpoint failed");
      return refuse(reply, 500, INTERNAL_ERROR, "Something went wrong on the server. The log has the details.");
    });
    scope.addHook("onRequest", admit);
    scope.post(MCP_PATH, handle);
    // No stream to open and no session to end: 2026-07-28 says 405, and the earlier revisions allow it.
    scope.route({
      method: ["GET", "DELETE", "PUT", "PATCH"],
      url: MCP_PATH,
      handler: async (_request, reply) =>
        reply
          .status(405)
          .header("Allow", "POST")
          .type("application/json; charset=utf-8")
          .send(JSON.stringify({ jsonrpc: "2.0", error: { code: INVALID_REQUEST, message: "Only POST is answered here." } })),
    });
  });
}

/** Fires when the client goes before the answer is sent. */
function closed(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.once("close", () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  return controller.signal;
}
