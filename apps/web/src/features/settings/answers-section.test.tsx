import type {
  AnswersStatus,
  AnswerTestResult,
  ChatModel,
  ChatModelsResponse,
  ModelSetupLook,
  ModelSetupTry,
  Settings,
} from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswersSection } from "./answers-section";

const ADDRESS = "http://127.0.0.1:11434/v1";

const base = {
  "answers.enabled": true,
  "answers.endpoint": ADDRESS,
  "answers.model": "lfm3:1.7b",
  "answers.temperature": 0.2,
  "answers.contextChars": 6000,
} as Settings;
/** A new installation: nothing switched on, no model named. */
const fresh = { ...base, "answers.enabled": false, "answers.model": "" } as Settings;

const status = (over: Partial<AnswersStatus> = {}): AnswersStatus => ({
  enabled: true,
  ready: true,
  reason: null,
  model: "lfm3:1.7b",
  server: "127.0.0.1:11434",
  place: "this-computer",
  busy: false,
  ...over,
});
const notSetUp = status({
  enabled: false,
  ready: false,
  reason: "Answers are turned off. Turn them on in Settings and say where your model runs.",
  model: "",
  server: null,
  place: null,
});

const model = (id: string, sizeBytes: number | null, parameters: string | null, writes = true): ChatModel => ({
  id,
  sizeBytes,
  parameters,
  quantization: "Q4_K_M",
  family: writes ? "llama" : "nomic-bert",
  writes,
});
const SMALL = model("llama3.2:1b", 1_321_098_329, "1.2B");
const START = model("lfm3:1.7b", 1_700_000_000, "1.7B");
const EMBED = model("nomic-embed-text:latest", 274_302_450, "137M", false);
const OTHER = model("mistral:7b", 4_372_824_384, "7.2B");

interface Served {
  status?: AnswersStatus;
  /** What the model server's list says while answers are on. */
  models?: ChatModelsResponse;
  look?: ModelSetupLook;
  attempt?: ModelSetupTry;
  test?: AnswerTestResult;
}

function serve(options: Served) {
  const calls: string[] = [];
  const bodies: unknown[] = [];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (init?.body) bodies.push(JSON.parse(String(init.body)));
      if (url.pathname === "/api/answers/status") return json(options.status ?? status());
      if (url.pathname === "/api/chat/models") return json(options.models ?? { models: [START, SMALL], message: null, ollama: true });
      if (url.pathname === "/api/chat/setup/look") return json(options.look);
      if (url.pathname === "/api/chat/setup/try") return json(options.attempt);
      if (url.pathname === "/api/answers/test") return json(options.test);
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }),
  );
  return { calls, bodies };
}

function show(settings: Settings) {
  const save = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AnswersSection settings={settings} disabled={false} save={save} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return save;
}

const section = () => screen.getByRole("region", { name: "Answers from your library" });
const openMoreOptions = async () => userEvent.click(await screen.findByText("More options"));
/** The line that says whether it is working: the first thing a person sees. */
const state = () => screen.findByTestId("answers-state");
const ready = async () => expect(await state()).toHaveTextContent(/^Ready: /);
const found = (models: ChatModel[], recommended: string | null): ModelSetupLook => ({
  found: true,
  address: ADDRESS,
  models,
  message: `A model server is running at 127.0.0.1:11434 with ${models.length} models.`,
  recommended,
});

afterEach(() => vi.unstubAllGlobals());

describe("Answers from your library, in Settings: the first level", () => {
  it("shows one thing to press before anything is set up, and asks no model server for anything", async () => {
    const { calls } = serve({ status: notSetUp });
    show(fresh);

    expect(screen.getByRole("heading", { name: "Answers from your library" })).toBeInTheDocument();
    expect(await screen.findByText("Find Ollama")).toBeVisible();
    // What it costs, in plain words: a download, the internet once, and nothing leaving the network.
    expect(
      screen.getByText(
        "Outpost does not come with this program. You install one, called Ollama, once: about 2 GB to download, which needs the internet. After that, what you ask stays on this computer or your own network.",
      ),
    ).toBeVisible();
    expect(within(section()).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Look for Ollama on this computer" })).toBeEnabled();
    // No switch yet: there is nothing for it to switch.
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    // The later steps do not show until the first is done.
    expect(screen.queryByText("Choose a model")).not.toBeInTheDocument();
    expect(screen.queryByText("Try it")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "I do not have Ollama yet" })).toHaveAttribute(
      "href",
      "/help/search-and-answers#answers-and-chat",
    );
    expect(section()).not.toHaveTextContent(/embedding|provider|OpenAI|context window|temperature|token/i);

    await waitFor(() => expect(calls).toContain("GET /api/answers/status"));
    expect(calls).toEqual(["GET /api/answers/status"]);
  });

  it("is set up in three presses: find, choose, try, and then it is on", async () => {
    const { calls, bodies } = serve({
      status: notSetUp,
      look: found([SMALL, EMBED, START], "lfm3:1.7b"),
      attempt: {
        ok: true,
        failure: null,
        message: '"lfm3:1.7b" answered: “ready”.',
        models: ["lfm3:1.7b"],
        reply: "ready",
        tookMs: 2400,
        saved: true,
      },
    });
    show(fresh);

    // 1. Find.
    await userEvent.click(await screen.findByRole("button", { name: "Look for Ollama on this computer" }));
    expect(await screen.findByText("Found a model server on this computer.")).toBeVisible();

    // 2. Choose: the one Outpost suggests starting with is first and already chosen; the one that cannot write is last and says so.
    const choice = screen.getByRole("radiogroup", { name: "Model to use" });
    const offered = within(choice).getAllByRole("radio");
    expect(offered.map((radio) => radio.textContent?.split(/(?=Recommended|This one)/)[0])).toEqual([
      "lfm3:1.7b",
      "llama3.2:1b",
      "nomic-embed-text:latest",
    ]);
    expect(offered[0]).toBeChecked();
    expect(offered[0]).toHaveTextContent("Recommended to start with");
    expect(offered[0]).toHaveTextContent("1.7 GB on disk. Takes about 1.7 GB of memory, so it fits a computer with 4 GB.");
    expect(offered[1]).toHaveTextContent("1.3 GB on disk. Takes about 1.5 GB of memory, so it fits a computer with 4 GB.");
    expect(offered[2]).toHaveTextContent("This one is for searching, not writing. It cannot answer.");
    expect(screen.queryByText("Try it")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use this model" }));

    // 3. Try.
    expect(await screen.findByText(/Outpost asks the model for one word and shows what comes back/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try it" }));
    expect(await screen.findByText("It answered")).toBeVisible();
    expect(screen.getByText(/"lfm3:1.7b" answered: “ready”. Answers and chat are switched on./)).toBeVisible();

    expect(calls.filter((call) => call.startsWith("POST"))).toEqual(["POST /api/chat/setup/look", "POST /api/chat/setup/try"]);
    // What was found and chosen is what is tried, and the server saves it: this screen saved nothing itself.
    expect(bodies.at(-1)).toEqual({ address: ADDRESS, model: "lfm3:1.7b" });
  });

  it("says exactly what went wrong when the try fails, and lets it be tried again or another model chosen", async () => {
    serve({
      status: notSetUp,
      look: found([START, EMBED], "lfm3:1.7b"),
      attempt: {
        ok: false,
        failure: "too-slow",
        message: '"lfm3:1.7b" did not answer a one-word request within 1 minute. It may still be loading; try again.',
        models: [],
        reply: null,
        tookMs: 60000,
        saved: false,
      },
    });
    show(fresh);
    await userEvent.click(await screen.findByRole("button", { name: "Look for Ollama on this computer" }));
    await userEvent.click(await screen.findByRole("button", { name: "Use this model" }));
    await userEvent.click(screen.getByRole("button", { name: "Try it" }));

    expect(await screen.findByText("Not working yet")).toBeVisible();
    expect(screen.getByText(/did not answer a one-word request within 1 minute/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Try it again" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Choose another" }));
    expect(screen.getByRole("radiogroup", { name: "Model to use" })).toBeVisible();
  });

  it("says when Ollama was not found, and where the steps to get it are", async () => {
    serve({
      status: notSetUp,
      look: {
        found: false,
        address: null,
        models: [],
        recommended: null,
        message: "Nothing answered at 127.0.0.1:11434, which is where Ollama listens. If it is installed, start it and look again.",
      },
    });
    show(fresh);
    await userEvent.click(await screen.findByRole("button", { name: "Look for Ollama on this computer" }));
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("Ollama was not found");
    expect(notice).toHaveTextContent("Nothing answered at 127.0.0.1:11434");
    expect(notice).toHaveTextContent("The model to get first is lfm3:1.7b (1.7 GB).");
    expect(within(notice).getByRole("link", { name: "the guide has the steps" })).toHaveAttribute(
      "href",
      "/help/search-and-answers#get-ollama",
    );
    expect(screen.queryByText("Choose a model")).not.toBeInTheDocument();
  });

  it("shows the models Outpost suggests, and the command for the one to start with, when the server has none", async () => {
    serve({ status: notSetUp, look: found([], null) });
    show(fresh);
    await userEvent.click(await screen.findByRole("button", { name: "Look for Ollama on this computer" }));

    expect(await screen.findByText(/Ollama is running, but it has no models yet/)).toBeVisible();
    const list = screen.getByRole("list", { name: "Recommended small models" });
    const names = within(list)
      .getAllByRole("listitem")
      .map((item) => item.querySelector(".font-mono")?.textContent);
    expect(names).toEqual(["lfm3:1.7b", "llama3.2:3b", "llama3.2:1b", "gemma3:1b", "phi4-mini", "gemma3:4b"]);
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("Start with this one");
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent(
      "1.7 GB to download. Takes about 1.7 GB of memory, so it fits a computer with 4 GB.",
    );
    expect(screen.getByText("ollama pull lfm3:1.7b")).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy: ollama pull lfm3:1.7b" })).toBeEnabled();
    expect(screen.getByText(/listed them on 16 November 2026/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Look again" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Use this model" })).not.toBeInTheDocument();
  });

  it("offers what the server has when none of it is on Outpost's list, in words about its size, with the command for the suggested one", async () => {
    serve({ status: notSetUp, look: found([OTHER], "mistral:7b") });
    show(fresh);
    await userEvent.click(await screen.findByRole("button", { name: "Look for Ollama on this computer" }));

    const offered = await screen.findByRole("radio", { name: /mistral:7b/ });
    expect(offered).toBeChecked();
    expect(offered).toHaveTextContent(
      "Medium-sized: 4.37 GB on disk. Takes about 5 GB of memory, so it wants a computer with 16 GB or more.",
    );
    expect(screen.getByText(/None of these is on Outpost’s short list of small models/)).toBeVisible();
    expect(screen.getByText("ollama pull lfm3:1.7b")).toBeVisible();
    expect(screen.getByRole("button", { name: "Use this model" })).toBeEnabled();
  });

  it("says it is ready, by which model and where, once the model server has answered", async () => {
    const { calls } = serve({});
    const save = show(base);

    expect(await state()).toHaveTextContent("Ready: answers are written by lfm3:1.7b on this computer.");
    expect(screen.getByRole("switch", { name: "Write answers" })).toBeChecked();
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "Chat" })).toHaveAttribute("href", "/chat");
    // Honest about what a small model is.
    expect(screen.getByText(/A small model is a helper, not an expert/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Set-up guide" })).toHaveAttribute("href", "/help/search-and-answers#answers-and-chat");
    // The steps are done with; nothing to press but the switch.
    expect(screen.queryByText("Find Ollama")).not.toBeInTheDocument();
    expect(within(section()).queryByRole("button")).not.toBeInTheDocument();
    // "Ready" rests on the model server having answered with its list.
    expect(calls).toContain("GET /api/chat/models");

    await userEvent.click(screen.getByRole("switch", { name: "Write answers" }));
    expect(save).toHaveBeenCalledWith("answers.enabled", false);
  });

  it("says where the model is when it is on another computer", async () => {
    serve({ status: status({ server: "192.168.1.20:11434", place: "local-network" }) });
    show({ ...base, "answers.endpoint": "http://192.168.1.20:11434/v1" });
    expect(await state()).toHaveTextContent("Ready: answers are written by lfm3:1.7b on your network, at 192.168.1.20:11434.");
  });

  it("is one switch while it is set up and off, and asks the model server nothing", async () => {
    const { calls } = serve({ status: status({ enabled: false, ready: false, reason: "Answers are turned off." }) });
    const save = show({ ...base, "answers.enabled": false });
    expect(await state()).toHaveTextContent("OffTurning it on uses lfm3:1.7b on this computer.");
    expect(calls).not.toContain("GET /api/chat/models");
    await userEvent.click(screen.getByRole("switch", { name: "Write answers" }));
    expect(save).toHaveBeenCalledWith("answers.enabled", true);
  });

  it("says the model server is not answering, with the one next step", async () => {
    const { calls } = serve({
      models: {
        models: [],
        message: "No model server answered at 127.0.0.1:11434. Check that it is running on this computer.",
        ollama: false,
      },
    });
    show(base);

    expect(await screen.findByText("On, but not working yet")).toBeVisible();
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("The model server is not answering");
    expect(notice).toHaveTextContent("No model server answered at 127.0.0.1:11434");
    expect(notice).toHaveTextContent("Start Ollama on that computer, then press Look again.");
    expect(within(notice).getByRole("link", { name: "What else to check" })).toHaveAttribute(
      "href",
      "/help/search-and-answers#when-it-does-not-work",
    );
    const asked = calls.filter((call) => call === "GET /api/chat/models").length;
    await userEvent.click(within(notice).getByRole("button", { name: "Look again" }));
    await waitFor(() => expect(calls.filter((call) => call === "GET /api/chat/models").length).toBe(asked + 1));
  });

  it("says when the chosen model has gone from the server, and offers the ones it has", async () => {
    serve({ models: { models: [SMALL], message: null, ollama: true } });
    show(base);

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("This model is not on the model server");
    expect(notice).toHaveTextContent("it no longer has lfm3:1.7b. Choose one it has.");
    // Straight to the second step, with the server's own list.
    expect(screen.getByText("Found a model server on this computer.")).toBeVisible();
    expect(screen.getByRole("radio", { name: /llama3.2:1b/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Use this model" })).toBeEnabled();
  });

  it("says why a server outside the home network is refused, in the server's own words", async () => {
    const reason =
      "The model server's address, models.example.com, is on the internet, not on this computer or your own network. If this server is yours, whoever starts Outpost can allow it with OUTPOST_ALLOW_REMOTE_MODEL_SERVER=true.";
    serve({
      status: status({ server: "models.example.com", place: "elsewhere", ready: false, reason }),
      models: { models: [], message: reason, ollama: false },
    });
    show({ ...base, "answers.endpoint": "https://models.example.com/v1" });
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("The address in More options cannot be used");
    expect(notice).toHaveTextContent(reason);
    expect(screen.queryByText(/^Ready/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("answers-state")).not.toHaveTextContent("Ready");
  });
});

describe("Answers from your library, in Settings: more options", () => {
  it("is closed to begin with", async () => {
    serve({});
    show(base);
    await ready();
    expect(screen.queryByLabelText("Server address")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Temperature")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Test" })).not.toBeInTheDocument();
  });

  it("says plainly where questions and passages are sent", async () => {
    serve({});
    show(base);
    await ready();
    await openMoreOptions();
    const notice = await screen.findByText(/your question and the passages found for it are sent to/);
    expect(notice).toHaveTextContent(
      "When you ask for an answer, your question and the passages found for it are sent to 127.0.0.1:11434, this computer. They are sent nowhere else, and nothing is sent until you ask.",
    );
  });

  it("warns when a server outside the home network has been allowed at start-up", async () => {
    serve({ status: status({ server: "models.example.com", place: "elsewhere", ready: true, reason: null }) });
    show({ ...base, "answers.endpoint": "https://models.example.com/v1" });
    expect(await state()).toHaveTextContent(
      "Ready: answers are written by lfm3:1.7b at models.example.com, which is not on your own network.",
    );
    await openMoreOptions();
    const notice = await screen.findByText(/an address that is not on this computer or your home network/);
    expect(notice).toHaveTextContent("Use this only if that machine is yours.");
  });

  it("holds the address, which is saved as typed", async () => {
    serve({});
    const save = show(base);
    await ready();
    await openMoreOptions();
    const address = await screen.findByLabelText("Server address");
    expect(address).toHaveValue(ADDRESS);
    await userEvent.clear(address);
    await userEvent.type(address, "http://192.168.1.20:11434/v1{Enter}");
    expect(save).toHaveBeenCalledWith("answers.endpoint", "http://192.168.1.20:11434/v1");
    expect(screen.getByText(/“Look for Ollama on this computer” asks this address first/)).toBeVisible();
  });

  it("offers the models the server reports", async () => {
    serve({ models: { models: [START, EMBED], message: null, ollama: true } });
    const save = show(base);
    await ready();
    await openMoreOptions();
    expect(await screen.findByText(/The server has 2 models\. Choose one that writes text/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "nomic-embed-text:latest" }));
    expect(save).toHaveBeenCalledWith("answers.model", "nomic-embed-text:latest");
  });

  it("lets the name be typed when the list cannot be read, and says why it could not", async () => {
    serve({
      models: {
        models: [],
        message: "No model server answered at 127.0.0.1:11434. Check that it is running on this computer.",
        ollama: false,
      },
    });
    const save = show(base);
    await screen.findByText("On, but not working yet");
    await openMoreOptions();
    expect(
      await screen.findByText(/No model server answered at 127\.0\.0\.1:11434.*You can still type the model’s name/),
    ).toBeInTheDocument();
    const field = screen.getByLabelText("Model");
    await userEvent.clear(field);
    await userEvent.type(field, "gemma3:1b{Enter}");
    expect(save).toHaveBeenCalledWith("answers.model", "gemma3:1b");
  });

  it("lets the address and the model's name be typed before anything is switched on", async () => {
    const { calls } = serve({ status: notSetUp });
    const save = show(fresh);
    await screen.findByText("Find Ollama");
    await openMoreOptions();
    await userEvent.type(await screen.findByLabelText("Model"), "lfm3:1.7b{Enter}");
    expect(save).toHaveBeenCalledWith("answers.model", "lfm3:1.7b");
    // The test needs answers switched on, and says so; nothing has been asked of a model server.
    expect(screen.getByRole("button", { name: "Test" })).toBeDisabled();
    expect(screen.getByText(/The test runs once answers are switched on/)).toBeVisible();
    expect(calls).toEqual(["GET /api/answers/status"]);
  });

  it("tests the model and says exactly what failed", async () => {
    serve({
      models: { models: [START, EMBED], message: null, ollama: true },
      test: {
        ok: false,
        failure: "not-a-chat-model",
        message: '"nomic-embed-text" cannot write text. It is probably an embedding model. Choose a chat model in Settings.',
        models: ["lfm3:1.7b"],
        reply: null,
        tookMs: 40,
      },
    });
    show({ ...base, "answers.model": "nomic-embed-text:latest" });
    await openMoreOptions();
    await userEvent.click(await screen.findByRole("button", { name: "Test" }));
    expect(await screen.findByText("Not working yet")).toBeInTheDocument();
    expect(screen.getByText(/"nomic-embed-text" cannot write text/)).toBeInTheDocument();
  });

  it("says when the model answers, and how long it took", async () => {
    serve({
      test: { ok: true, failure: null, message: '"lfm3:1.7b" answered: “ready”.', models: ["lfm3:1.7b"], reply: "ready", tookMs: 2300 },
    });
    show(base);
    await ready();
    await openMoreOptions();
    await userEvent.click(await screen.findByRole("button", { name: "Test" }));
    expect(await screen.findByText("The model is answering")).toBeInTheDocument();
    expect(screen.getByText(/answered: “ready”\. It took 2\.3 seconds\./)).toBeInTheDocument();
  });

  it("shows the context budget in tokens as well as characters, and saves the temperature", async () => {
    serve({});
    const save = show(base);
    await ready();
    await openMoreOptions();
    expect(await screen.findByText(/now about 1,500 tokens/)).toBeInTheDocument();
    const temperature = screen.getByLabelText("Temperature");
    await userEvent.clear(temperature);
    await userEvent.type(temperature, "0.5{Enter}");
    expect(save).toHaveBeenCalledWith("answers.temperature", 0.5);
    expect(screen.getByText(/Questions and answers are not kept/)).toBeInTheDocument();
  });

  it("lists the small models Outpost suggests, and says which the model server already has", async () => {
    serve({});
    show(base);
    await ready();
    await openMoreOptions();
    const list = await screen.findByRole("list", { name: "Recommended small models" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveTextContent("lfm3:1.7b");
    expect(rows[0]).toHaveTextContent("On your model server");
    expect(rows[0]).toHaveTextContent("1.7 GB on disk");
    expect(rows[1]).toHaveTextContent("llama3.2:3b");
    expect(rows[1]).not.toHaveTextContent("On your model server");
    expect(rows[2]).toHaveTextContent("On your model server");
    expect(rows[3]).toHaveTextContent("gemma3:1b");
    expect(rows[3]).not.toHaveTextContent("On your model server");
    expect(rows[3]).toHaveTextContent("806 MB to download. Takes about 1.1 GB of memory, so it fits a computer with 4 GB.");
    // The server has one of them, so no command is pressed on the person.
    expect(screen.queryByText("ollama pull lfm3:1.7b")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ollama’s library" })).toHaveAttribute("href", "https://ollama.com/library");
  });
});
