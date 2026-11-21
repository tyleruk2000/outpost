import { type Settings, TOOL_AREAS, type ToolsStatus } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolsSection } from "./tools-section";

const settings = (over: Partial<Settings> = {}) =>
  ({
    "answers.enabled": false,
    "answers.endpoint": "",
    "tools.enabled": false,
    "tools.library": true,
    "tools.places": true,
    "tools.supplies": true,
    "tools.plans": true,
    "tools.weather": true,
    "tools.radio": true,
    "tools.catalogue": true,
    "tools.board": false,
    "tools.medical": false,
    "tools.offForModels": [],
    ...over,
  }) as Settings;

const status = (mcp: Partial<ToolsStatus["mcp"]> = {}): ToolsStatus => ({
  enabled: false,
  areas: {
    library: true,
    places: true,
    supplies: true,
    plans: true,
    weather: true,
    radio: true,
    catalogue: true,
    board: false,
    medical: false,
  },
  offForModels: [],
  tools: [],
  mcp: {
    enabled: false,
    canChange: false,
    addresses: ["http://127.0.0.1:8080/mcp", "http://192.168.1.20:8080/mcp"],
    versions: ["2026-07-28"],
    ...mcp,
  },
});

function serve(answer: ToolsStatus | "fail") {
  const calls: string[] = [];
  const bodies: unknown[] = [];
  const json = (body: unknown, code = 200) =>
    new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (init?.body) bodies.push(JSON.parse(String(init.body)));
      if (url.pathname === "/api/tools" && answer === "fail") {
        return json({ error: { code: "internal", message: "Something went wrong on the server." } }, 500);
      }
      if (url.pathname === "/api/tools") return json(answer);
      if (url.pathname === "/api/tools/mcp" && answer !== "fail") {
        const { enabled } = JSON.parse(String(init?.body));
        return json({ ...answer, mcp: { ...answer.mcp, enabled } });
      }
      return json({}, 404);
    }),
  );
  return { calls, bodies };
}

function show(values: Settings) {
  const save = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToolsSection settings={values} disabled={false} save={save} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return save;
}

const main = () => screen.findByRole("switch", { name: "Let the model look things up in Outpost" });
const mcpSwitch = () => screen.findByRole("switch", { name: "Let other programs on the home network use these tools" });
const WARNING =
  /any program on your home network that speaks MCP \(the Model Context Protocol\) can ask Outpost these questions, and whatever that program is connected to receives the answers: a desktop assistant using a model in the cloud would send your household's supplies and plans there\./;

afterEach(() => vi.unstubAllGlobals());

describe("Looking things up in Outpost, in Settings", () => {
  it("is off to begin with, says what it would send where, and turns on with the ordinary settings", async () => {
    const { calls } = serve(status());
    const save = show(settings());

    expect(screen.getByRole("heading", { name: "Looking things up in Outpost" })).toBeInTheDocument();
    const toggle = await main();
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText(
        /What the tools return is sent to the model server, as passages are: if that server is on another machine, so is what the tools return\./,
      ),
    ).toBeVisible();
    await userEvent.click(toggle);
    expect(save).toHaveBeenCalledWith("tools.enabled", true);
    expect(calls).toEqual(["GET /api/tools"]);
  });

  it("lists every area with what it lets a model server see, the board off, and encrypted pages never", async () => {
    serve(status());
    show(settings({ "tools.enabled": true }));
    expect(await main()).toBeChecked();

    const list = screen.getByRole("list", { name: "What the tools may read" });
    for (const { label, about } of TOOL_AREAS) {
      expect(within(list).getByRole("switch", { name: label })).toBeInTheDocument();
      expect(within(list).getByText(about)).toBeVisible();
    }
    expect(within(list).getByRole("switch", { name: "Library and notes" })).toBeChecked();
    expect(within(list).getByRole("switch", { name: "Messages on the board" })).not.toBeChecked();
    const never = screen.getByTestId("tools-never");
    expect(never).toHaveTextContent("Notes' encrypted pages");
    expect(never).toHaveTextContent("Never");
    expect(within(never).queryByRole("switch")).not.toBeInTheDocument();
  });

  it("switches an area off as an ordinary setting", async () => {
    serve(status());
    const save = show(settings({ "tools.enabled": true }));
    await userEvent.click(await screen.findByRole("switch", { name: "Places and map layers" }));
    expect(save).toHaveBeenCalledWith("tools.places", false);
  });

  it("adds and removes a model not to offer tools to", async () => {
    serve(status());
    const save = show(settings({ "tools.offForModels": ["qwen2.5:0.5b"] }));
    const list = await screen.findByRole("list", { name: "Models not to offer tools to" });
    expect(list).toHaveTextContent("qwen2.5:0.5b");
    await userEvent.click(within(list).getByRole("button", { name: "Offer tools to qwen2.5:0.5b again" }));
    expect(save).toHaveBeenCalledWith("tools.offForModels", []);

    await userEvent.type(screen.getByRole("textbox", { name: "Models not to offer tools to" }), "llama3.2:1b{Enter}");
    expect(save).toHaveBeenCalledWith("tools.offForModels", ["qwen2.5:0.5b", "llama3.2:1b"]);
  });

  it("does not let another device change the switch for other programs, and says where it can be changed", async () => {
    const { calls } = serve(status({ canChange: false }));
    show(settings());
    const toggle = await mcpSwitch();
    expect(toggle).toBeDisabled();
    expect(screen.getByText("This can only be changed at the computer Outpost runs on.")).toBeVisible();
    expect(screen.getByText(WARNING)).toBeVisible();
    await userEvent.click(toggle);
    expect(calls.filter((call) => call.startsWith("PUT"))).toEqual([]);
  });

  it("lets the computer Outpost runs on turn it on, with the warning at the switch and the addresses to give", async () => {
    const { calls, bodies } = serve(status({ canChange: true }));
    show(settings());
    const toggle = await mcpSwitch();
    expect(toggle).toBeEnabled();
    expect(screen.queryByText("This can only be changed at the computer Outpost runs on.")).not.toBeInTheDocument();
    expect(screen.getByText(WARNING)).toBeVisible();
    await userEvent.click(toggle);
    await waitFor(() => expect(calls).toContain("PUT /api/tools/mcp"));
    expect(bodies.at(-1)).toEqual({ enabled: true });
    await waitFor(() => expect(toggle).toBeChecked());
    const addresses = screen.getByRole("list", { name: "Addresses for other programs" });
    expect(addresses).toHaveTextContent("http://127.0.0.1:8080/mcp");
    expect(addresses).toHaveTextContent("http://192.168.1.20:8080/mcp");

    await userEvent.click(screen.getByText("How to connect Claude Code or VS Code"));
    expect(screen.getByText("claude mcp add --transport http outpost http://192.168.1.20:8080/mcp")).toBeVisible();
    expect(screen.getByText(/Neither has been tried against Outpost\./)).toBeVisible();
  });

  it("says so when the state cannot be read", async () => {
    serve("fail");
    show(settings());
    expect(await screen.findByText("The state of the tools could not be read")).toBeVisible();
  });
});
