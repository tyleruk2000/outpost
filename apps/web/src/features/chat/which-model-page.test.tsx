import { MODEL_TRIALS, type ModelTrial, type ModelTrials, trialOf, trialWord, WHICH_MODEL_PATH } from "@outpost/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import WhichModelPage, { WhichModel } from "./which-model-page";

const measured: ModelTrial = {
  name: "llama3.2:3b",
  download: "2.0 GB",
  memoryGb: 2.34,
  suits: "pi-8gb",
  licence: { name: "Llama 3.2 Community Licence", url: "https://example.org/licence", read: true },
  thinks: false,
  library: { right: 30, of: 32, declinedRightly: 13, ofDeclined: 13, note: "Cited the right passage." },
  tools: { right: 11, of: 15, mistakes: "It twice gave a place from the wrong town." },
  timing: { firstWordS: 0.6, wholeS: 2.1 },
  verdict: "looks-things-up-well",
  reason: "Right most often, and small enough for a Pi with 8 GB.",
};

const unmeasured: ModelTrial = {
  name: "ornith:9b",
  download: null,
  memoryGb: null,
  suits: null,
  licence: { name: "", url: "", read: false },
  thinks: null,
  library: null,
  tools: null,
  timing: null,
  verdict: "answers-only",
  reason: "Not measured yet.",
};

const trials: ModelTrials = {
  measuredOn: "2026-11-17",
  machine: "an Apple Silicon Mac (M-series, 16 GB)",
  ollama: "0.40.16",
  piTimed: false,
  recommendation: {
    pi: { name: "llama3.2:3b", reason: "Right most often of those that fit a Pi." },
    mac: { name: "bonsai-2:9b", reason: "Right most often of all, and quick on a Mac." },
    avoid: [{ name: "llama3.2:1b", reason: "Made up answers the library did not hold." }],
  },
  models: [measured, unmeasured],
};

function show(data: ModelTrials = trials, questions: string[] = []) {
  render(
    <MemoryRouter initialEntries={[WHICH_MODEL_PATH]}>
      <WhichModel trials={data} questions={questions} />
    </MemoryRouter>,
  );
}

describe("which model", () => {
  it("opens with the recommendation in plain words, and the command for the Pi's", () => {
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Which model" })).toBeVisible();
    const start = screen.getByRole("region", { name: "Start here" });
    expect(start).toHaveTextContent("On a Raspberry Pillama3.2:3b. Right most often of those that fit a Pi.");
    expect(start).toHaveTextContent("On a Mac or PCbonsai-2:9b. Right most often of all, and quick on a Mac.");
    expect(start).toHaveTextContent("Not worth gettingllama3.2:1b. Made up answers the library did not hold.");
    expect(within(start).getByText("ollama pull llama3.2:3b")).toBeVisible();
    expect(start).toHaveTextContent("No model has been timed on a Raspberry Pi; it will be slower, by how much has not been measured.");
  });

  it("lists every model with what was measured, and says where and when", () => {
    show();
    const list = screen.getByRole("list", { name: "The models tried" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => within(item).getByRole("heading", { level: 3 }).textContent)).toEqual(["llama3.2:3b", "ornith:9b"]);
    const first = items[0]!;
    expect(first).toHaveTextContent("looks things up well");
    expect(first).toHaveTextContent("2.0 GB");
    expect(first).toHaveTextContent("2.3 GB, measured here");
    expect(first).toHaveTextContent("suits a Raspberry Pi 5 with 8 GB");
    expect(within(first).getByRole("link", { name: /Llama 3.2 Community Licence/ })).toHaveAttribute("href", "https://example.org/licence");
    expect(first).toHaveTextContent("no, it answers straight away");
    expect(first).toHaveTextContent("30 of 32 right; declined 13 of 13 it should");
    expect(first).toHaveTextContent("11 of 15 right. It twice gave a place from the wrong town.");
    expect(first).toHaveTextContent("first word 0.6 s, whole reply 2.1 s, on that Mac, not on a Pi");
    expect(
      screen.getAllByText(/Measured on 17 November 2026 on an Apple Silicon Mac \(M-series, 16 GB\), with Ollama 0\.40\.16/),
    ).not.toHaveLength(0);
  });

  it("says plainly what was not run, not tried and not timed", () => {
    show();
    const item = within(screen.getByRole("list", { name: "The models tried" })).getAllByRole("listitem")[1]!;
    expect(item).toHaveTextContent("not tested");
    expect(item).toHaveTextContent("size not read");
    expect(item).toHaveTextContent("not measured");
    expect(item).toHaveTextContent("not judged, as its memory was not measured");
    expect(item).toHaveTextContent("licence not read");
    expect(item).toHaveTextContent("not run through the library questions");
    expect(item).toHaveTextContent("not tried");
    expect(item).toHaveTextContent("not timed");
  });

  it("shows the look-up questions behind a disclosure, and links to the set-up guide", async () => {
    show(trials, ["Which supermarkets are in Northampton?", "How much water do we have?"]);
    await userEvent.click(screen.getByText("The 2 questions for looking things up"));
    expect(screen.getByText("Which supermarkets are in Northampton?")).toBeVisible();
    expect(screen.getByRole("link", { name: "Set-up guide" })).toHaveAttribute("href", "/help/search-and-answers#get-a-model");
  });

  it("has a plain empty state, and says when nothing is chosen yet", () => {
    show({ ...trials, models: [] });
    expect(screen.getByRole("heading", { name: "No models have been tried yet" })).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("draws the real data file, with all seven models", () => {
    render(
      <MemoryRouter>
        <WhichModelPage />
      </MemoryRouter>,
    );
    const items = within(screen.getByRole("list", { name: "The models tried" })).getAllByRole("listitem");
    expect(items).toHaveLength(MODEL_TRIALS.models.length);
    expect(MODEL_TRIALS.models.map((model) => model.name)).toEqual([
      "llama3.2:1b",
      "lfm3:1.7b",
      "bonsai-2:2b",
      "llama3.2:3b",
      "bonsai-2:4b",
      "bonsai-2:9b",
      "ornith:9b",
    ]);
  });
});

describe("the word the model picker shows", () => {
  it("is 'not tested' for a model with no entry", () => {
    expect(trialWord("qwen3:4b")).toBe("not tested");
    expect(trialWord("llama3.2:3b-instruct-q4_K_M")).toBe("not tested");
    // An entry gives its verdict once anything has been run; until then it is "not tested" too.
    for (const model of MODEL_TRIALS.models) {
      expect(["looks things up well", "answers only", "not recommended", "not tested"]).toContain(trialWord(model.name));
      if (!model.library && !model.tools) expect(trialWord(model.name)).toBe("not tested");
    }
  });

  it("matches a name and its :latest, and not a longer tag", () => {
    expect(trialOf("llama3.2:3b")?.name).toBe("llama3.2:3b");
    expect(trialOf("LLAMA3.2:3B")?.name).toBe("llama3.2:3b");
    expect(trialOf("llama3.2:3b-instruct-q4_K_M")).toBeUndefined();
    expect(trialOf("llama3.2")).toBeUndefined();
  });
});
