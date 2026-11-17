import { type ChatModelsResponse, type ChatStatus, trialWord } from "@outpost/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ModelPicker } from "./model-picker";

const list: ChatModelsResponse = {
  ollama: true,
  message: null,
  models: [
    { id: "llama3.2:3b", sizeBytes: 2_019_393_189, parameters: "3.2B", quantization: "Q4_K_M", family: "llama", tools: true },
    { id: "qwen3:4b", sizeBytes: null, parameters: null, quantization: null, family: null, tools: false },
  ],
};

const status = {
  server: "127.0.0.1:11434",
  place: "this-computer",
  defaultModel: "llama3.2:3b",
  tools: { enabled: true },
} as unknown as ChatStatus;

describe("the model picker", () => {
  it("marks each model with what was found when it was tried, beside what it already says, and links to Which model", () => {
    render(
      <MemoryRouter>
        <ModelPicker value="" onChange={() => {}} status={status} list={list} loading={false} open />
      </MemoryRouter>,
    );
    const known = screen.getByRole("menuitemradio", { name: /llama3\.2:3b/ });
    expect(known).toHaveTextContent(`3.2B parameters, Q4_K_M, can look things up, tried here: ${trialWord("llama3.2:3b")}`);
    expect(screen.getByRole("menuitemradio", { name: /qwen3:4b/ })).toHaveTextContent("tried here: not tested");
    expect(screen.getByRole("menuitem", { name: "Which model?" })).toHaveAttribute("href", "/help/which-model");
    expect(screen.getByRole("menuitem", { name: "Model server settings" })).toBeVisible();
  });
});
