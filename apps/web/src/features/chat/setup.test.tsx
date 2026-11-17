import type { ChatStatus, ModelSetupLook, ModelSetupTry } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatSetup } from "./setup";

const status = (over: Partial<ChatStatus> = {}): ChatStatus => ({
  enabled: false,
  usable: false,
  reason: "Answers are turned off. Turn them on in Settings and say where your model runs.",
  defaultModel: "",
  server: null,
  place: null,
  writingIn: null,
  tools: { enabled: false, offForModels: [], offered: 0 },
  ...over,
});

function serve(look: ModelSetupLook, attempt?: ModelSetupTry) {
  const calls: string[] = [];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (url.pathname === "/api/chat/setup/look") return json(look);
      if (url.pathname === "/api/chat/setup/try") return json(attempt);
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

function show(current: ChatStatus) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidated = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ChatSetup status={current} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return invalidated;
}

afterEach(() => vi.unstubAllGlobals());

describe("Chat before a model server is set up", () => {
  it("says what a language model is, links to the guide, and looks for nothing until asked", () => {
    const calls = serve({ found: false, address: null, models: [], recommended: null, message: "" });
    show(status());
    expect(screen.getByRole("heading", { name: "Chat needs a language model on your own computer" })).toBeVisible();
    expect(screen.getByText(/A language model is a program that writes text. Outpost does not include one/)).toBeVisible();
    expect(screen.getByText(/about 2 GB that needs the internet. After that nothing you write here leaves your own network/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Set-up guide" })).toHaveAttribute("href", "/help/search-and-answers#answers-and-chat");
    expect(screen.getByRole("link", { name: "Open the setting" })).toHaveAttribute("href", "/settings#answers-title");
    expect(screen.getByRole("button", { name: "Look for Ollama on this computer" })).toBeEnabled();
    expect(calls).toEqual([]);
  });

  it("is set up with the same three presses as in Settings, and then everything that shows chat reads again", async () => {
    const calls = serve(
      {
        found: true,
        address: "http://127.0.0.1:11434/v1",
        models: [
          { id: "llama3.2:3b", sizeBytes: 2_019_393_189, parameters: "3.2B", quantization: "Q4_K_M", family: "llama", writes: true },
        ],
        message: "A model server is running at 127.0.0.1:11434 with one model.",
        recommended: "llama3.2:3b",
      },
      { ok: true, failure: null, message: '"llama3.2:3b" answered: “ready”.', models: [], reply: "ready", tookMs: 900, saved: true },
    );
    const invalidated = show(status());
    await userEvent.click(screen.getByRole("button", { name: "Look for Ollama on this computer" }));
    await userEvent.click(await screen.findByRole("button", { name: "Use this model" }));
    await userEvent.click(await screen.findByRole("button", { name: "Try it" }));
    expect(await screen.findByText("It answered")).toBeVisible();
    expect(calls).toEqual(["POST /api/chat/setup/look", "POST /api/chat/setup/try"]);
    await waitFor(() => expect(invalidated).toHaveBeenCalledWith({ queryKey: ["chat"] }));
    expect(invalidated).toHaveBeenCalledWith({ queryKey: ["settings"] });
    expect(invalidated).toHaveBeenCalledWith({ queryKey: ["answers"] });
  });

  it("says why when the address in Settings is one Outpost will not use", () => {
    serve({ found: false, address: null, models: [], recommended: null, message: "" });
    const reason = "The model server's address, models.example.com, is on the internet, not on this computer or your own network.";
    show(status({ enabled: true, reason, server: "models.example.com", place: "elsewhere" }));
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("The address in Settings cannot be used");
    expect(notice).toHaveTextContent(reason);
  });
});
