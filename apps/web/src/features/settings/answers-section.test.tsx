import type { AnswersStatus, AnswerTestResult, Settings } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswersSection } from "./answers-section";

const base = {
  "answers.enabled": true,
  "answers.endpoint": "http://127.0.0.1:11434/v1",
  "answers.model": "",
  "answers.temperature": 0.2,
  "answers.contextChars": 6000,
} as Settings;

const status = (over: Partial<AnswersStatus> = {}): AnswersStatus => ({
  enabled: true,
  ready: false,
  reason: "Choose which model writes the answers, in Settings.",
  model: "",
  server: "127.0.0.1:11434",
  place: "this-computer",
  busy: false,
  ...over,
});

function serve(options: { status?: AnswersStatus; models?: string[]; modelsMessage?: string; test?: AnswerTestResult }) {
  const calls: string[] = [];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (url.pathname === "/api/answers/status") return json(options.status ?? status());
      if (url.pathname === "/api/answers/models") return json({ models: options.models ?? [], message: options.modelsMessage ?? null });
      if (url.pathname === "/api/answers/test") return json(options.test);
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
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

afterEach(() => vi.unstubAllGlobals());

describe("Answers from your library, in Settings", () => {
  it("is one switch while it is off, and does not ask the model server for anything", async () => {
    const calls = serve({ status: status({ enabled: false, server: null, place: null }) });
    const save = show({ ...base, "answers.enabled": false });
    expect(screen.getByRole("heading", { name: "Answers from your library" })).toBeInTheDocument();
    expect(screen.getByText(/Outpost does not include a language model and does not download one/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Server address")).not.toBeInTheDocument();
    await waitFor(() => expect(calls).toContain("GET /api/answers/status"));
    expect(calls).not.toContain("GET /api/answers/models");
    await userEvent.click(screen.getByRole("switch", { name: "Write answers" }));
    expect(save).toHaveBeenCalledWith("answers.enabled", true);
  });

  it("says plainly where questions and passages are sent", async () => {
    serve({ models: ["llama3.2:3b"] });
    show(base);
    const notice = await screen.findByText(/your question and the passages found for it are sent to/);
    expect(notice).toHaveTextContent(
      "When you ask for an answer, your question and the passages found for it are sent to 127.0.0.1:11434, this computer. They are sent nowhere else, and nothing is sent until you ask.",
    );
  });

  it("warns when the address is not on this computer or the home network", async () => {
    serve({ status: status({ server: "models.example.com", place: "elsewhere" }) });
    show({ ...base, "answers.endpoint": "https://models.example.com/v1" });
    const notice = await screen.findByText(/an address that is not on this computer or your home network/);
    expect(notice).toHaveTextContent("Use this only if that machine is yours.");
  });

  it("offers the models the server reports", async () => {
    serve({ models: ["llama3.2:3b", "nomic-embed-text:latest"] });
    const save = show(base);
    expect(await screen.findByText(/The server has 2 models\. Choose one that writes text/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "llama3.2:3b" }));
    expect(save).toHaveBeenCalledWith("answers.model", "llama3.2:3b");
  });

  it("lets the name be typed when the list cannot be read, and says why it could not", async () => {
    serve({ modelsMessage: "No model server answered at 127.0.0.1:11434. Check that it is running on this computer." });
    const save = show(base);
    expect(
      await screen.findByText(/No model server answered at 127\.0\.0\.1:11434.*You can still type the model’s name/),
    ).toBeInTheDocument();
    const field = screen.getByLabelText("Model");
    await userEvent.type(field, "llama3.2:3b{Enter}");
    expect(save).toHaveBeenCalledWith("answers.model", "llama3.2:3b");
  });

  it("tests the model and says exactly what failed", async () => {
    serve({
      models: ["llama3.2:3b"],
      test: {
        ok: false,
        failure: "not-a-chat-model",
        message: '"nomic-embed-text" cannot write text. It is probably an embedding model. Choose a chat model in Settings.',
        models: ["llama3.2:3b"],
        reply: null,
        tookMs: 40,
      },
    });
    show({ ...base, "answers.model": "nomic-embed-text" });
    await userEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(await screen.findByText("Not working yet")).toBeInTheDocument();
    expect(screen.getByText(/"nomic-embed-text" cannot write text/)).toBeInTheDocument();
  });

  it("says when the model answers, and how long it took", async () => {
    serve({
      models: ["llama3.2:3b"],
      test: { ok: true, failure: null, message: '"llama3.2:3b" answered: “ready”.', models: ["llama3.2:3b"], reply: "ready", tookMs: 2300 },
    });
    show({ ...base, "answers.model": "llama3.2:3b" });
    await userEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(await screen.findByText("The model is answering")).toBeInTheDocument();
    expect(screen.getByText(/answered: “ready”\. It took 2\.3 seconds\./)).toBeInTheDocument();
  });

  it("shows the context budget in tokens as well as characters, and saves the temperature", async () => {
    serve({ models: ["llama3.2:3b"] });
    const save = show({ ...base, "answers.model": "llama3.2:3b" });
    expect(screen.getByText(/now about 1,500 tokens/)).toBeInTheDocument();
    const temperature = screen.getByLabelText("Temperature");
    await userEvent.clear(temperature);
    await userEvent.type(temperature, "0.5{Enter}");
    expect(save).toHaveBeenCalledWith("answers.temperature", 0.5);
    expect(screen.getByText(/Questions and answers are not kept/)).toBeInTheDocument();
  });
});
