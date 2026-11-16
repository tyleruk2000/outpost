import { MORSE_DIGITS, MORSE_LETTERS, MORSE_PROSIGNS, MORSE_PUNCTUATION } from "@outpost/shared";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { applyMorsePrefs, resetMorsePrefs } from "../prefs";
import { CodeChartTab } from "./code-chart-tab";

beforeEach(() => {
  window.localStorage.clear();
  resetMorsePrefs();
});

describe("Code chart", () => {
  it("lists every letter, number, punctuation mark and prosign", () => {
    render(<CodeChartTab />);
    const section = (name: string) => screen.getByRole("region", { name });
    expect(within(section("Letters")).getAllByRole("term")).toHaveLength(MORSE_LETTERS.length);
    expect(within(section("Numbers")).getAllByRole("term")).toHaveLength(MORSE_DIGITS.length);
    expect(within(section("Punctuation")).getAllByRole("term")).toHaveLength(MORSE_PUNCTUATION.length);
    expect(within(section("Prosigns")).getAllByRole("row")).toHaveLength(MORSE_PROSIGNS.length + 1);
    // A code is read out as dits and dahs.
    const a = within(section("Letters")).getByText("A").parentElement!;
    expect(a).toHaveTextContent("·−");
    expect(within(a).getByText("dit dah")).toHaveClass("sr-only");
    expect(within(section("Prosigns")).getByRole("rowheader", { name: "SK" }).parentElement).toHaveTextContent("End of contact");
  });

  it("states the timing rule and where the code and the timing come from", () => {
    render(<CodeChartTab />);
    expect(screen.getByText(/one dit lasts 1\.2 ÷ wpm seconds \(1200 ÷ wpm milliseconds\)/)).toHaveTextContent("PARIS standard");
    expect(screen.getByText(/between characters three, and between words seven/)).toBeInTheDocument();
    expect(screen.getByText(/Farnsworth spacing keeps each character at the character speed/)).toBeInTheDocument();
    const sources = screen.getByText(/^Sources:/);
    expect(sources).toHaveTextContent("ITU-R M.1677-1");
    expect(sources).toHaveTextContent("Jon Bloom, KE3Z, “A Standard for Morse Timing” (QEX, 1990)");
  });

  it("works the rule through at the speeds set on Receive", () => {
    applyMorsePrefs({ charWpm: 20, effWpm: 10 });
    render(<CodeChartTab />);
    const example = screen.getByText(/At your character speed of 20 wpm/);
    expect(example).toHaveTextContent("a dit lasts 60 ms and a dah 180 ms");
    expect(example).toHaveTextContent("At your effective speed of 10 wpm the gap between characters is");
  });
});
