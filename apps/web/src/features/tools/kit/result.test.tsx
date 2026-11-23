/**
 * While a figure is being retyped the answer gives way to a line saying what to correct; the box keeps the height
 * the answer had, so the page under it does not jump with each key.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Result } from "./result";

afterEach(() => vi.restoreAllMocks());

function box() {
  return screen.getByText("Water to store").closest("div[class*='rounded-panel']") as HTMLElement;
}

describe("the answer of a calculator", () => {
  it("holds its height while a figure is not usable, and lets go once there is an answer again", () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(132);
    const shown = (figure: string | null) => (
      <MemoryRouter>
        <Result label="Water to store" figure={figure}>
          Enough for three days.
        </Result>
      </MemoryRouter>
    );
    const { rerender } = render(shown("16 litres"));
    expect(box().style.minHeight).toBe("");

    rerender(shown(null));
    expect(screen.getByText("Correct the figure marked above to see the answer.")).toBeInTheDocument();
    expect(box().style.minHeight).toBe("132px");

    rerender(shown("20 litres"));
    expect(box().style.minHeight).toBe("");
  });

  it("holds nothing when there has been no answer yet", () => {
    render(
      <MemoryRouter>
        <Result label="Water to store" figure={null} />
      </MemoryRouter>,
    );
    expect(box().style.minHeight).toBe("");
  });
});
