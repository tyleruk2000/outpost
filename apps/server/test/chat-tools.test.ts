/**
 * Chat with tools: the model asks for something to be looked up in Outpost, the server
 * runs it and feeds the answer back, and the reply cites it. Tested against the
 * stand-in model server (model-server.ts) in both of the protocols it speaks; no
 * language model is involved and nothing leaves this machine.
 */
import type { AddressInfo } from "node:net";
import type { ChatConversationDetail, ChatMessage, ChatModelsResponse, ChatStatus, ChatStreamEvent } from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ANSWER_NOW } from "../src/modules/chat/tools.ts";
import { createToolsService } from "../src/modules/tools/index.ts";
import { LIBRARY_TOOLS } from "../src/modules/tools/library.ts";
import { TOOLS } from "../src/modules/tools/registry.ts";
import { defineTool, type ToolDefinition } from "../src/modules/tools/types.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { isChatPath, type StandIn, type StandInOptions, startModelServer } from "./model-server.ts";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const QUICK = { firstTokenMs: 1500, idleMs: 1000, totalMs: 10_000, probeMs: 1000 };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The two ways the provider speaks: Ollama's own `/api/chat`, and the OpenAI-compatible `/v1` (the stand-in without Ollama's endpoints). */
const PROTOCOLS = [
  { name: "Ollama's own protocol", ollamaApi: true, path: "/api/chat" },
  { name: "the OpenAI-compatible protocol", ollamaApi: false, path: "/v1/chat/completions" },
] as const;

interface Station {
  app: TestApp;
  model: StandIn;
  origin: string;
  open(body?: Record<string, unknown>): Promise<string>;
  /** Sends a message and waits for the reply to be stored. */
  exchange(id: string, text: string): Promise<ChatMessage>;
  detail(id: string): Promise<ChatConversationDetail>;
  // biome-ignore lint/suspicious/noExplicitAny: request bodies as the stand-in received them
  chats(): any[];
}

async function station(
  model: string,
  options: StandInOptions = {},
  settings: Record<string, unknown> = { "tools.enabled": true },
  flavour = "/v1",
): Promise<Station> {
  const server = await startModelServer(options);
  cleanups.push(() => server.close());
  const app = await createTestApp();
  cleanups.push(() => app.close());
  await app.app.listen({ port: 0, host: "127.0.0.1" });
  const origin = `http://127.0.0.1:${(app.app.server.address() as AddressInfo).port}`;
  app.ctx.services.answers.setTimeouts(QUICK);
  // The library's two tools alone, so that what is offered does not change as the registry grows.
  app.ctx.services.tools = createToolsService(app.ctx, LIBRARY_TOOLS);
  const saved = await app.api("PATCH", "/api/settings", {
    "answers.enabled": true,
    "answers.endpoint": `${server.url}${flavour}`,
    "answers.model": model,
    "indexing.chunkSize": 300,
    "indexing.chunkOverlap": 0,
    ...settings,
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const { search } = app.ctx.services;
  search.upsert({
    kind: "document",
    entityId: "dwater",
    title: "Water treatment in the field",
    url: "/library/documents/dwater",
    collection: "Medicine and first aid",
    tags: [],
    sections: [
      { page: 1, heading: "Boiling", text: "Bring the water to a rolling boil for one minute. At altitude, boil for three minutes." },
      { page: 2, heading: "Tablets", text: "Chlorine dioxide tablets treat one litre of water in thirty minutes." },
    ],
  });
  search.upsert({
    kind: "note",
    entityId: "nknots",
    title: "Knots I use",
    url: "/notes/nknots",
    tags: [],
    sections: [{ heading: "Loops", text: "The bowline makes a fixed loop at the end of a rope. It is easy to untie after loading." }],
  });
  const it: Station = {
    app,
    model: server,
    origin,
    async open(body = {}) {
      const made = await app.api("POST", "/api/chat/conversations", body);
      expect(made.status, JSON.stringify(made.body)).toBe(200);
      return made.body.conversation.id;
    },
    async exchange(id, text) {
      const sent = await app.api("POST", `/api/chat/conversations/${id}/messages`, { text });
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      return app.ctx.services.chat.runner.of(id)?.finished ?? (await it.detail(id)).messages.at(-1)!;
    },
    async detail(id) {
      return (await app.api("GET", `/api/chat/conversations/${id}`)).body;
    },
    chats: () => server.requests.filter((request) => isChatPath(request.path)).map((request) => request.body),
  };
  return it;
}

async function readStream(response: Response): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for (const block of (await response.text()).split("\n\n")) {
    let type = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) type = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (type && data) events.push({ type, ...JSON.parse(data) } as ChatStreamEvent);
  }
  return events;
}

const lookups = (message: ChatMessage) => message.sources.filter((source) => source.kind === "lookup");
// biome-ignore lint/suspicious/noExplicitAny: a request body as received
const toolNames = (body: any): string[] | undefined => body.tools?.map((tool: { function: { name: string } }) => tool.function.name);

/** A tool with an answer known in advance, in an area of its own. */
function fixedTool(name: string, area: ToolDefinition["area"], text: string): ToolDefinition {
  return defineTool({
    name,
    title: name === "find_places" ? "places on the map" : name.replace(/_/g, " "),
    area,
    description: `A test tool that answers "${text}".`,
    input: z.object({ kind: z.string().optional(), near: z.string().optional() }),
    run: () => ({ held: true, text, label: "Food and supplies, fetched 12 Nov", url: "/map?layer=food" }),
  });
}

for (const protocol of PROTOCOLS) {
  describe(`looking things up, over ${protocol.name}`, () => {
    it("runs one tool on the server, feeds its answer back as a numbered source, and keeps it with the reply", async () => {
      const s = await station("stand-in-tools", { ollamaApi: protocol.ollamaApi, toolCallDelayMs: 150 });
      const id = await s.open();
      const watching = fetch(`${s.origin}/api/chat/conversations/${id}/stream`, { headers: { host: "localhost" } });
      const sent = s.app.api("POST", `/api/chat/conversations/${id}/messages`, {
        text: 'How long to boil water? use search_library {"query":"boil water"}',
      });
      expect((await sent).status).toBe(200);
      const events = await readStream(await watching);
      const reply = await s.app.ctx.services.chat.runner.of(id)?.finished;
      const stored = reply ?? (await s.detail(id)).messages.at(-1)!;

      expect(stored.state).toBe("complete");
      expect(stored.text).toBe('From Outpost: From the library, for "boil water" [1].');
      const [found] = lookups(stored);
      expect(found).toMatchObject({
        marker: 1,
        kind: "lookup",
        title: expect.stringMatching(/^the library \(\d+ passages?\)$/),
        url: "/search?q=boil%20water",
        lookup: { tool: "search_library", arguments: { query: "boil water" }, area: "library", ok: true },
      });
      expect(found!.quote).toMatch(/^From the library, for "boil water":\nPassage \d+ \(document, Water treatment in the field/);
      expect(stored.used).toEqual([1]);
      expect(stored.declined).toBe(false);

      const chats = s.chats();
      expect(chats).toHaveLength(2);
      expect(s.model.requests.filter((request) => isChatPath(request.path)).every((request) => request.path.endsWith(protocol.path))).toBe(
        true,
      );
      expect(toolNames(chats[0])).toEqual(["search_library", "read_passage"]);
      expect(chats[0].tool_choice).toBeUndefined();
      expect(chats[0].messages[0].content).toMatch(/You cannot reach the internet/);
      expect(chats[0].messages[0].content).toMatch(/only through the tools you are given/);
      // The answer went back after the model's call, in the protocol's own shape.
      const sentBack = chats[1].messages.slice(-2);
      expect(sentBack[0]).toMatchObject({ role: "assistant", tool_calls: [{ function: { name: "search_library" } }] });
      expect(sentBack[1].content).toMatch(/^Source \[1\] \(from Outpost: the library, \d+ passages?\):\nFrom the library/);
      if (protocol.ollamaApi) {
        expect(sentBack[1]).toMatchObject({ role: "tool", tool_name: "search_library" });
        expect(sentBack[0].tool_calls[0].function.arguments).toEqual({ query: "boil water" });
      } else {
        expect(sentBack[1]).toMatchObject({ role: "tool", tool_call_id: sentBack[0].tool_calls[0].id });
        expect(JSON.parse(sentBack[0].tool_calls[0].function.arguments)).toEqual({ query: "boil water" });
      }

      // Watchers saw it looking, and the lookup, before the reply was written.
      const looking = events.filter((event) => event.type === "phase" && event.phase === "looking");
      expect(looking[0]).toMatchObject({ looking: "the library" });
      const withLookup = events.findIndex((event) => event.type === "phase" && event.sources?.some((source) => source.kind === "lookup"));
      const firstWords = events.findIndex((event) => event.type === "phase" && event.phase === "writing");
      expect(withLookup).toBeGreaterThan(-1);
      expect(withLookup).toBeLessThan(firstWords);
    });

    it("runs two tools in sequence, a round each, and the reply cites both", async () => {
      const s = await station("stand-in-tools", { ollamaApi: protocol.ollamaApi });
      const id = await s.open();
      const reply = await s.exchange(id, 'use search_library {"query":"boil"} then use search_library {"query":"bowline"}');
      expect(reply.state).toBe("complete");
      expect(lookups(reply).map((source) => [source.marker, (source.lookup?.arguments as { query: string } | undefined)?.query])).toEqual([
        [1, "boil"],
        [2, "bowline"],
      ]);
      expect(reply.text).toBe('From Outpost: From the library, for "boil" [1]. From Outpost: From the library, for "bowline" [2].');
      expect(reply.used).toEqual([1, 2]);
      expect(s.chats()).toHaveLength(3);
    });

    it("answers a tool that does not exist in words, and keeps the refusal as one", async () => {
      const s = await station("stand-in-tools", { ollamaApi: protocol.ollamaApi });
      const id = await s.open();
      const reply = await s.exchange(id, "use find_treasure {}");
      expect(reply.state).toBe("complete");
      const [refused] = lookups(reply);
      expect(refused).toMatchObject({ marker: 0, title: "find_treasure", lookup: { tool: "find_treasure", ok: false, area: null } });
      expect(refused!.quote).toBe('There is no tool called "find_treasure". The tools are: search_library, read_passage.');
      const told = s.chats()[1].messages.at(-1);
      expect(told.content).toBe(
        'Refused (not a source): There is no tool called "find_treasure". The tools are: search_library, read_passage.',
      );
      expect(reply.text).toBe('Outpost said: There is no tool called "find_treasure".');
      expect(reply.text).not.toMatch(/[{}]/);
    });

    it("answers arguments that do not fit in words", async () => {
      const s = await station("stand-in-tools", { ollamaApi: protocol.ollamaApi });
      const id = await s.open();
      const reply = await s.exchange(id, 'use search_library {"query": 5}');
      expect(reply.state).toBe("complete");
      expect(lookups(reply)[0]).toMatchObject({ marker: 0, lookup: { tool: "search_library", ok: false, area: "library" } });
      expect(s.chats()[1].messages.at(-1).content).toMatch(
        /^Refused \(not a source\): The arguments for search_library did not fit: query:/,
      );
    });

    it("never shows a tool call the model wrote as text: nothing was looked up, and the reply says so", async () => {
      const s = await station("stand-in-tools-as-text", { ollamaApi: protocol.ollamaApi });
      const id = await s.open();
      const reply = await s.exchange(id, "What's the river doing?");
      expect(reply.state).toBe("failed");
      expect(reply.text).toBe("");
      expect(JSON.stringify(reply.blocks)).not.toContain('"parameters"');
      expect(reply.notice).toMatch(/^The model wrote out a request to look something up as text instead of making it/);
      expect(lookups(reply)).toHaveLength(0);
    });

    it("stops a model that keeps asking after four rounds, and asks once more with no tools", async () => {
      const s = await station("stand-in-tools-loops", { ollamaApi: protocol.ollamaApi });
      const id = await s.open();
      const reply = await s.exchange(id, "Tell me about water.");
      expect(reply.state).toBe("complete");
      const chats = s.chats();
      expect(chats).toHaveLength(5);
      expect(chats.slice(0, 4).every((body) => toolNames(body)?.includes("search_library"))).toBe(true);
      expect(chats[4].tools).toBeUndefined();
      expect(chats[4].messages.at(-1)).toEqual({ role: "user", content: ANSWER_NOW });
      // The same call is run once; asked again, the model is told so.
      expect(lookups(reply)).toHaveLength(1);
      expect(chats[2].messages.at(-1).content).toMatch(/^You already asked that, and the answer is Source \[1\] above/);
      expect(reply.text).toMatch(/^From Outpost: From the library, for "water" \[1\]\./);
    });
  });
}

describe("stopping while looking things up", () => {
  it("tells the tool being run, stores the reply as stopped, and asks the model nothing more", async () => {
    let started = false;
    let aborted = false;
    const slow = defineTool({
      name: "slow_lookup",
      title: "something slow",
      area: "library",
      description: "Takes a while.",
      input: z.object({}),
      run: (_args, { signal }) =>
        new Promise((resolve, reject) => {
          started = true;
          const timer = setTimeout(() => resolve({ held: true, text: "Done at last." }), 5000);
          signal.addEventListener("abort", () => {
            aborted = true;
            clearTimeout(timer);
            reject(signal.reason);
          });
        }),
    });
    const s = await station("stand-in-tools");
    s.app.ctx.services.tools = createToolsService(s.app.ctx, [slow]);
    const id = await s.open();
    expect((await s.app.api("POST", `/api/chat/conversations/${id}/messages`, { text: "use slow_lookup {}" })).status).toBe(200);
    for (let tries = 0; !started && tries < 200; tries += 1) await sleep(10);
    expect(started).toBe(true);
    const stopped = await s.app.api<ChatConversationDetail>("POST", `/api/chat/conversations/${id}/stop`);
    const reply = stopped.body.messages.at(-1)!;
    expect(reply.state).toBe("stopped");
    expect(aborted).toBe(true);
    await sleep(100);
    expect(s.chats()).toHaveLength(1);
    expect(lookups(reply)).toEqual([]);
  });

  it("closes the connection to the model while it is asking for a tool, and runs nothing", async () => {
    const s = await station("stand-in-tools", { toolCallDelayMs: 600 });
    const id = await s.open();
    expect(
      (await s.app.api("POST", `/api/chat/conversations/${id}/messages`, { text: 'use search_library {"query":"boil"}' })).status,
    ).toBe(200);
    await sleep(150);
    const stopped = await s.app.api<ChatConversationDetail>("POST", `/api/chat/conversations/${id}/stop`);
    expect(stopped.body.messages.at(-1)!.state).toBe("stopped");
    await sleep(700);
    expect(s.model.abandoned()).toBe(1);
    expect(s.chats()).toHaveLength(1);
    expect(lookups(stopped.body.messages.at(-1)!)).toEqual([]);
  });
});

describe("when tools are not offered", () => {
  it("sends no tools to a model the server says cannot call them, and asks what it can do only once in a while", async () => {
    const s = await station("stand-in-no-tools");
    const id = await s.open();
    const first = await s.exchange(id, "Hello there.");
    expect(first.state).toBe("complete");
    await s.exchange(id, "And again.");
    expect(s.chats().every((body) => !("tools" in body))).toBe(true);
    expect(s.chats()[0].messages[0].content).toMatch(/cannot search the internet, open files or read the person's library/);
    expect(s.model.requests.filter((request) => request.path === "/api/tags")).toHaveLength(1);
  });

  it("is refused by a model without the capability, as Ollama refuses, if tools are sent anyway", async () => {
    const server = await startModelServer();
    cleanups.push(() => server.close());
    const refused = await fetch(`${server.url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "stand-in-no-tools",
        messages: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", function: { name: "x", description: "", parameters: { type: "object" } } }],
      }),
    });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "registry.ollama.ai/library/stand-in-no-tools does not support tools" });
  });

  it("sends none, and does not ask what the model can do, when looking things up is off in Settings", async () => {
    const s = await station("stand-in-tools", {}, { "tools.enabled": false });
    const id = await s.open();
    const reply = await s.exchange(id, 'use search_library {"query":"boil"}');
    expect(reply.state).toBe("complete");
    expect(s.chats().every((body) => !("tools" in body))).toBe(true);
    expect(s.model.requests.some((request) => request.path === "/api/tags")).toBe(false);
    expect(lookups(reply)).toEqual([]);
  });

  it("leaves out the tools of an area that is switched off, and sends none when every area is off", async () => {
    const s = await station("stand-in-tools", {}, { "tools.enabled": true, "tools.library": false });
    s.app.ctx.services.tools = createToolsService(s.app.ctx, [
      ...LIBRARY_TOOLS,
      fixedTool("find_places", "places", "Tesco Extra, Northampton, 2.1 km."),
    ]);
    const id = await s.open();
    const reply = await s.exchange(id, 'use find_places {"kind":"supermarket","near":"Northampton"}');
    expect(toolNames(s.chats()[0])).toEqual(["find_places"]);
    expect(reply.text).toBe("From Outpost: Tesco Extra, Northampton, 2.1 km [1].");
    expect(lookups(reply)[0]).toMatchObject({
      title: "places on the map (Food and supplies, fetched 12 Nov)",
      url: "/map?layer=food",
      lookup: { tool: "find_places", arguments: { kind: "supermarket", near: "Northampton" }, area: "places", ok: true },
    });

    await s.app.api("PATCH", "/api/settings", { "tools.places": false });
    const before = s.chats().length;
    await s.exchange(id, "use find_places {}");
    expect(
      s
        .chats()
        .slice(before)
        .every((body) => !("tools" in body)),
    ).toBe(true);
  });

  it("offers none to a model a person has turned them off for in Settings", async () => {
    const s = await station("stand-in-tools", {}, { "tools.enabled": true, "tools.offForModels": ["stand-in-tools"] });
    const plain = await s.open();
    await s.exchange(plain, 'use search_library {"query":"boil"}');
    expect(s.chats().every((body) => !("tools" in body))).toBe(true);
  });
});

describe("what is kept and what the screen is told", () => {
  it("shows the same lookups when the conversation is read again, cited, with library passages numbered first", async () => {
    const s = await station("stand-in-tools");
    s.app.ctx.services.tools = createToolsService(s.app.ctx, [
      ...LIBRARY_TOOLS,
      fixedTool("find_places", "places", "Tesco Extra, Northampton, 2.1 km."),
    ]);
    // A note the library's search finds for the whole message, directive and all.
    s.app.ctx.services.search.upsert({
      kind: "note",
      entityId: "nshops",
      title: "Shopping",
      url: "/notes/nshops",
      tags: [],
      sections: [{ heading: "Water", text: "To boil water on the way, use the find places list: every kind of supermarket is on it." }],
    });
    const id = await s.open({ useLibrary: true });
    // No arguments: quotation marks would make the library's search look for a phrase.
    const reply = await s.exchange(id, "How do I boil water? use find_places");
    expect(reply.state).toBe("complete");
    const passages = reply.sources.filter((source) => source.kind !== "lookup");
    expect(passages.length).toBeGreaterThan(0);
    const [lookup] = lookups(reply);
    expect(lookup!.marker).toBe(Math.max(...passages.map((source) => source.marker)) + 1);
    expect(s.chats()[1].messages.at(-1).content).toMatch(new RegExp(`^Source \\[${lookup!.marker}\\] \\(from Outpost: places on the map`));
    expect(s.chats()[0].messages[0].content).toMatch(/The tools' answers are sources as well as the passages/);

    const again = (await s.detail(id)).messages.at(-1)!;
    expect(lookups(again)).toEqual(lookups(reply));
    expect(again.used).toEqual([lookup!.marker]);
    expect(again.declined).toBe(false);
    expect(JSON.stringify(again.blocks)).toContain(`[${lookup!.marker}]`);
    // Later turns are sent the reply's words, not what the tools answered.
    await s.exchange(id, "Thanks.");
    const history = s
      .chats()
      .at(-1)
      .messages.map((message: { content: string }) => message.content);
    expect(history.some((content: string) => content.startsWith("Source ["))).toBe(false);
  });

  it("asks a model that can look things up even when the library's search finds nothing for the message", async () => {
    const s = await station("stand-in-tools");
    const id = await s.open({ useLibrary: true });
    const reply = await s.exchange(id, 'Supermarkets near Northampton? use search_library {"query":"bowline"}');
    expect(reply.state).toBe("complete");
    expect(reply.sources.every((source) => source.kind === "lookup")).toBe(true);
    expect(reply.text).toBe('From Outpost: From the library, for "bowline" [1].');
    expect(s.chats()[0].messages[0].content).toMatch(/Nothing in the library matched the message as it was written/);
  });

  it("does not show a reply resting on lookups alone as the library not covering the question", async () => {
    const s = await station("stand-in-tools");
    s.app.ctx.services.tools = createToolsService(s.app.ctx, [
      fixedTool("find_places", "places", "Nothing is held for that: the layer has not been fetched."),
    ]);
    const id = await s.open();
    const reply = await s.exchange(id, "use find_places {}");
    expect(reply.declined).toBe(false);
    expect(reply.used).toEqual([1]);
  });

  it("sends every registered tool whose area is on, each in a shape a model server takes", async () => {
    const s = await station("stand-in-tools");
    s.app.ctx.services.tools = createToolsService(s.app.ctx, TOOLS);
    const id = await s.open();
    const reply = await s.exchange(id, 'use search_library {"query":"boil"}');
    expect(reply.state).toBe("complete");
    const offered = s.app.ctx.services.tools.offered().map((tool) => tool.name);
    expect(toolNames(s.chats()[0])).toEqual(offered);
    expect(offered).not.toContain("board_messages");
  });

  it("says which models can call tools, and what the switch says", async () => {
    const s = await station("stand-in-tools");
    const models = (await s.app.api<ChatModelsResponse>("GET", "/api/chat/models")).body.models;
    expect(models.find((model) => model.id === "stand-in-tools:latest")?.tools).toBe(true);
    expect(models.find((model) => model.id === "stand-in-no-tools:latest")?.tools).toBe(false);
    const status = (await s.app.api<ChatStatus>("GET", "/api/chat/status")).body;
    expect(status.tools).toEqual({ enabled: true, offForModels: [], offered: 2 });

    const llama = await station("stand-in", {}, { "tools.enabled": true }, "/llamacpp/v1");
    const listed = (await llama.app.api<ChatModelsResponse>("GET", "/api/chat/models")).body.models;
    expect(listed[0]!.tools).toBeUndefined();
    const id = await llama.open();
    await llama.exchange(id, "Hello.");
    expect(llama.chats().every((body) => !("tools" in body))).toBe(true);
  });
});
