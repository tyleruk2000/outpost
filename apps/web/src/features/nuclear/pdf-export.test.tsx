import { computeEffects, type EffectsInput, type MarkerDto } from "@outpost/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MARKDOWN_HAS_NO_MAPS, scenarioMarkdown, type Written } from "./document";
import { ScenarioExport } from "./pdf-export";
import type { ScenarioPdfInput } from "./print-maps";

// The maps need WebGL, which the test's browser has not got. What stands in for the drawing keeps what it was asked
// for and waits until the test lets it finish, so that the page can be looked at while a map is being drawn.
const calls = vi.hoisted(() => ({ inputs: [] as ScenarioPdfInput[], release: [] as Array<() => void> }));
vi.mock("./print-maps", () => ({
  makeScenarioPdf: async (input: ScenarioPdfInput) => {
    calls.inputs.push(input);
    input.onProgress?.("Drawing the map for A", 1, 2);
    await new Promise<void>((resolve) => calls.release.push(resolve));
    if (input.signal?.aborted) throw new DOMException("Stopped", "AbortError");
    return {
      bytes: new TextEncoder().encode("%PDF-1.7 maps"),
      pages: 3,
      maps: 2,
      pieces: 2,
      reduced: false,
      missing: [],
      figures: { overview: [], maps: {} },
    };
  },
}));

afterEach(() => {
  calls.inputs.length = 0;
  calls.release.length = 0;
  localStorage.clear();
});

const home = { id: "home", name: "Home", lat: 54.47, lon: -3.05 } as MarkerDto;
const written = (effects: EffectsInput): Written[] => {
  const answer = computeEffects(effects);
  if (!answer.ok) throw new Error("expected an answer");
  return [{ letter: "A", scenario: { name: "Quarry", notes: "", lat: 54.46, lon: -3.09, effects }, result: answer.result }];
};
const one = written({ yieldKt: 15, burst: { kind: "surface" }, wind: { fromDegrees: 270, kmh: 24 } });

function show(places: MarkerDto[] = [home]) {
  return render(
    <MemoryRouter>
      <ScenarioExport written={one} dated={Date.UTC(2026, 10, 16)} places={places} sources={undefined} regions={[]} />
    </MemoryRouter>,
  );
}

describe("the scenarios on paper", () => {
  it("draws nothing until Make the PDF is pressed, then says which map it is drawing, can be stopped, and offers the three actions", async () => {
    show();
    expect(screen.getByRole("switch", { name: "Maps in the PDF" })).toBeChecked();
    expect(screen.queryByRole("button", { name: "Add to library" })).toBeNull();
    expect(calls.inputs).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Make the PDF" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Drawing the map for A (1 of 2)…");
    // The page stays usable: the Markdown is still there to take, and Stop puts things back.
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.getByRole("button", { name: "Make the PDF" })).toBeInTheDocument();
    expect(calls.inputs[0]!.signal?.aborted).toBe(true);
    calls.release.shift()?.();

    fireEvent.click(screen.getByRole("button", { name: "Make the PDF" }));
    await waitFor(() => expect(calls.release).toHaveLength(1));
    calls.release.shift()?.();
    expect(await screen.findByRole("button", { name: "Add to library" })).toBeInTheDocument();
    expect(screen.getByText(/3 pages of (A4|US Letter), .*, 2 maps\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export as Markdown" })).toBeInTheDocument();
  });

  it("leaves the saved places off unless ticked; ticked, it draws them and Add to library asks first", async () => {
    show();
    const tick = screen.getByRole("checkbox", { name: "Show my saved places on the maps" });
    expect(tick).not.toBeChecked();
    expect(screen.getByText(/The PDF will then show where your places are, and “Add to library” will ask first/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Make the PDF" }));
    await waitFor(() => expect(calls.release).toHaveLength(1));
    expect(calls.inputs[0]!.places).toBeNull();
    calls.release.shift()?.();
    await screen.findByRole("button", { name: "Add to library" });

    fireEvent.click(tick);
    // Ticking makes the file already made out of date: it is made again, with the places.
    fireEvent.click(await screen.findByRole("button", { name: "Make the PDF" }));
    await waitFor(() => expect(calls.release).toHaveLength(1));
    expect(calls.inputs[1]!.places).toEqual([home]);
    calls.release.shift()?.();
    fireEvent.click(await screen.findByRole("button", { name: "Add to library" }));
    const asked = await screen.findByRole("alertdialog", { name: "Add a PDF that shows your saved places?" });
    expect(asked).toHaveTextContent(/a place called Home among them/);
  });

  it("says there are no places to show when there are none, and cannot be ticked", () => {
    show([]);
    expect(screen.getByRole("checkbox", { name: "Show my saved places on the maps" })).toBeDisabled();
    expect(screen.getByText("You have no saved places.")).toBeInTheDocument();
  });

  it("with maps off, makes the words-only PDF at once, and remembers the choice on this device", async () => {
    const { unmount } = show();
    fireEvent.click(screen.getByRole("switch", { name: "Maps in the PDF" }));
    expect(await screen.findByRole("button", { name: "Add to library" })).toBeInTheDocument();
    expect(screen.getByText(/pages? of (A4|US Letter), .*, words only\./)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Show my saved places on the maps" })).toBeNull();
    expect(calls.inputs).toHaveLength(0);
    unmount();
    show();
    expect(screen.getByRole("switch", { name: "Maps in the PDF" })).not.toBeChecked();
  });

  it("keeps the Markdown words only, and says that the PDF has the maps", () => {
    const markdown = scenarioMarkdown(one);
    expect(markdown.split("\n").slice(0, 3)).toEqual(["# Nuclear effects scenario: Quarry", "", MARKDOWN_HAS_NO_MAPS]);
    expect(markdown).not.toMatch(/!\[|<img/);
  });
});
