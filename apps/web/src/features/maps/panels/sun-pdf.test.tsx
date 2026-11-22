/** Sun times on paper, from the Sun tab and a place's Sun section: the three buttons, and the same times as the screen. */
import { render as renderBare, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SunSection, SunTimes } from "./sun";

const GREENWICH = { lat: 51.48, lon: 0 };
const render = (ui: ReactElement) => renderBare(ui, { wrapper: MemoryRouter });
const row = (label: string) =>
  (screen.getByText(label, { selector: "dt" }).parentElement as HTMLElement).querySelector("dd") as HTMLElement;
/** A figure as the screen sets it: the time, without what is set small beside it. */
const figure = (label: string) => row(label).textContent!.match(/\d{1,2}:\d\d/)![0];

const sent: FormData[] = [];
class Upload {
  upload = {};
  status = 200;
  responseText = JSON.stringify({
    results: [{ originalName: "x.pdf", status: "created", document: { id: "d7", title: "Sun times", category: "Made in Outpost" } }],
  });
  onload: (() => void) | undefined;
  open() {}
  setRequestHeader() {}
  send(form: FormData) {
    sent.push(form);
    this.onload?.();
  }
  abort() {}
}

const made: File[] = [];
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-21T09:00:00Z"));
  vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");
  URL.createObjectURL = vi.fn((file: Blob) => `blob:made-${made.push(file as File)}`);
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("XMLHttpRequest", Upload);
});
afterEach(() => {
  vi.useRealTimers();
  sent.length = 0;
  made.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The PDF's line for a day, as it is written in the file: Courier, the cells in columns. */
const lineFor = async (day: string) => {
  const text = await made.at(-1)!.text();
  return text.match(new RegExp(`\\((${day}[^)]*)\\) Tj`))?.[1]?.split(/\s{2,}/);
};

describe("sun times on paper", () => {
  it("is one button under the times until asked for, then the sheet with the three things and the same times as the screen", async () => {
    const user = userEvent.setup();
    render(<SunTimes position={GREENWICH} zone="Europe/London" coordinates="51.48000, 0.00000" />);
    expect(screen.queryByRole("region", { name: "Sun times as a PDF" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "A PDF of sun times, day by day" }));
    const block = screen.getByRole("region", { name: "Sun times as a PDF" });
    // The button that opened it is gone; its heading has the keyboard, not the page.
    expect(within(block).getByRole("heading", { name: "Sun times on paper" })).toHaveFocus();
    const save = await within(block).findByRole("link", { name: "Save as PDF" });
    expect(save).toHaveAttribute("download", "sun-times-51-48000-0-00000-14-days-from-21-jun-2026.pdf");
    expect(within(block).getByRole("button", { name: "Add to library" })).toBeEnabled();
    expect(block).toHaveTextContent("14 days from 21 Jun 2026, a day to a line, on the clock shown above: 1 page of A4.");

    // The first day's line holds the screen's times, to the minute.
    const screenTimes = [
      figure("First light (civil dawn)"),
      figure("Sunrise"),
      figure("Solar noon"),
      figure("Sunset"),
      figure("Last light (civil dusk)"),
    ];
    expect(screenTimes).toEqual(["03:55", "04:43", "13:02", "21:21", "22:09"]);
    expect(await lineFor("Sun 21 Jun")).toEqual(["Sun 21 Jun", ...screenTimes, row("Day length").textContent!.match(/\d+ h \d+ min/)![0]]);

    // On UTC, both say UTC times.
    await user.click(within(screen.getByRole("radiogroup", { name: "Clock the times are shown on" })).getByRole("radio", { name: "UTC" }));
    await waitFor(async () => expect((await lineFor("Sun 21 Jun"))?.[2]).toBe(figure("Sunrise")));
    expect(figure("Sunrise")).toBe("03:43");
    expect(await made.at(-1)!.text()).toContain("(Times are in UTC, on the 24-hour clock.) Tj");

    // A month, remembered for next time.
    await user.click(within(block).getByRole("radio", { name: "Month" }));
    await waitFor(() => expect(block).toHaveTextContent("June 2026, a day to a line"));
    expect(localStorage.getItem("outpost.maps.sun.span")).toBe('"month"');
    expect(await lineFor("Mon 1 Jun")).toBeDefined();

    await user.click(within(block).getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.get("title")).toBe("Sun times, 51.48000, 0.00000, June 2026");
    expect(sent[0]!.get("tags")).toBe("Sun times");
    expect(sent[0]!.get("source")).toBe("Made in Outpost from the map: /maps?lat=51.4800&lon=0.0000&z=12.0");
  });

  it("is named after the saved place it is for", async () => {
    const user = userEvent.setup();
    render(<SunSection position={GREENWICH} name="Royal Observatory" zone="Europe/London" defaultOpen />);
    await user.click(screen.getByRole("button", { name: "A PDF of sun times, day by day" }));
    const block = screen.getByRole("region", { name: "Sun times as a PDF" });
    await within(block).findByRole("link", { name: "Save as PDF" });
    await user.click(within(block).getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.get("title")).toBe("Sun times, Royal Observatory, 14 days from 21 Jun 2026");
    expect(sent[0]!.get("source")).toBe(
      "Made in Outpost from the saved place “Royal Observatory” on the map: /maps?lat=51.4800&lon=0.0000&z=12.0",
    );
  });
});
