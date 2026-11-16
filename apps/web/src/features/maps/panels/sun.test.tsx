import { act, fireEvent, render as renderBare, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setClockChoice, setDeviceClockStyle } from "@/lib/clock";
import { SunSection, SunTimes } from "./sun";

// The times asserted here are the US Naval Observatory's for Greenwich and Tromsø (see
// lib/sun.test.ts for where and when they were read), moved onto the clock named in each test.
const GREENWICH = { lat: 51.48, lon: 0 };
const TROMSO = { lat: 69.65, lon: 18.96 };
const SUVA = { lat: -18.14, lon: 178.44 };

// The section links to Settings, so it is drawn inside a router, as in the app.
const render = (ui: ReactElement) => renderBare(ui, { wrapper: MemoryRouter });

const row = (label: string) => {
  const term = screen.getByText(label, { selector: "dt" });
  return (term.parentElement as HTMLElement).querySelector("dd") as HTMLElement;
};

describe("the Sun section of a place", () => {
  beforeEach(() => {
    localStorage.clear();
    // Mid-morning on the June solstice, 2026.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-21T09:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is folded to one line that already gives sunrise and sunset for today", () => {
    render(<SunSection position={GREENWICH} zone="Europe/London" />);
    const toggle = screen.getByRole("button", { name: /^Sun/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("Sunrise 04:43, sunset 21:21");
    expect(screen.queryByText("Solar noon")).not.toBeInTheDocument();
  });

  it("opens to the day's times on the device's clock, names the zone, and remembers being open", async () => {
    const { unmount } = render(<SunSection position={GREENWICH} zone="Europe/London" />);
    await userEvent.click(screen.getByRole("button", { name: /^Sun/ }));
    expect(row("First light (civil dawn)")).toHaveTextContent("03:55");
    expect(row("Sunrise")).toHaveTextContent("04:43");
    // The bearings are rows of their own, in the quieter list, so that the two large times stand alone.
    expect(row("Sunrise")).not.toHaveTextContent("NE");
    expect(row("Rises towards")).toHaveTextContent("49° NE");
    expect(row("Sets towards")).toHaveTextContent("311° NW");
    expect(row("Solar noon")).toHaveTextContent("13:02");
    expect(row("Solar noon")).toHaveTextContent("sun 62° up");
    expect(row("Sunset")).toHaveTextContent("21:21");
    expect(row("Last light (civil dusk)")).toHaveTextContent("22:09");
    expect(row("Day length")).toHaveTextContent("16 h 38 min");
    expect(row("Nautical twilight")).toHaveTextContent("02:41 to 23:23");
    expect(row("Moon")).toHaveTextContent("First quarter, 46% lit");
    expect(screen.getByText(/Times are in this device’s time zone, Europe\/London \(UTC\+1\)\./)).toBeInTheDocument();
    expect(screen.queryByText(/clocks there probably read differently/)).not.toBeInTheDocument();
    expect(screen.getByText(/flat horizon at sea level/)).toBeInTheDocument();

    unmount();
    render(<SunSection position={GREENWICH} zone="Europe/London" />);
    expect(screen.getByRole("button", { name: /^Sun/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the same day in UTC when asked, and remembers the choice", async () => {
    const { unmount } = render(<SunSection position={GREENWICH} zone="Europe/London" defaultOpen />);
    await userEvent.click(
      within(screen.getByRole("radiogroup", { name: "Clock the times are shown on" })).getByRole("radio", { name: "UTC" }),
    );
    expect(row("Sunrise")).toHaveTextContent("03:43");
    expect(row("Sunset")).toHaveTextContent("20:21");
    expect(screen.getByText(/Times are in UTC\./)).toBeInTheDocument();
    unmount();
    render(<SunSection position={GREENWICH} zone="Europe/London" defaultOpen />);
    expect(row("Sunrise")).toHaveTextContent("03:43");
  });

  it("steps a day either way, takes a typed date, and comes back to today", async () => {
    render(<SunSection position={GREENWICH} zone="Europe/London" defaultOpen />);
    const date = screen.getByLabelText("Date");
    expect(date).toHaveValue("2026-06-21");
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "The day before" }));
    expect(date).toHaveValue("2026-06-20");
    await userEvent.click(screen.getByRole("button", { name: "The day after" }));
    await userEvent.click(screen.getByRole("button", { name: "The day after" }));
    expect(date).toHaveValue("2026-06-22");

    // Greenwich at the March equinox, when London keeps UTC: sunrise 06:03, sunset 18:13, nautical twilight 04:50 to 19:26.
    fireEvent.change(date, { target: { value: "2026-03-20" } });
    expect(row("Sunrise")).toHaveTextContent("06:03");
    expect(row("Sunset")).toHaveTextContent("18:13");
    expect(row("Nautical twilight")).toHaveTextContent("04:50 to 19:26");
    expect(screen.getByText(/Europe\/London \(UTC\+0\)/)).toBeInTheDocument();

    // Nonsense leaves the date as it was.
    fireEvent.change(date, { target: { value: "" } });
    expect(date).toHaveValue("2026-03-20");

    await userEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(date).toHaveValue("2026-06-21");
  });

  it("says a folded section is for another date when one was picked", async () => {
    render(<SunSection position={GREENWICH} zone="UTC" defaultOpen />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-03-20" } });
    await userEvent.click(screen.getByRole("button", { name: /^Sun/ }));
    expect(screen.getByRole("button", { name: /^Sun/ })).toHaveTextContent("20 Mar: Sunrise 06:03, sunset 18:13");
  });

  it("says in words that the sun does not set, and that it does not rise", () => {
    render(<SunSection position={TROMSO} zone="Europe/London" defaultOpen />);
    expect(row("Sun")).toHaveTextContent("Does not set on this date (midnight sun)");
    expect(row("Day length")).toHaveTextContent("24 hours");
    expect(screen.queryByText("Sunrise", { selector: "dt" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-21" } });
    expect(row("Sun")).toHaveTextContent("Does not rise on this date (polar night)");
    // Civil twilight published as 09:31 to 13:53 at UTC+1.
    expect(row("First light (civil dawn)")).toHaveTextContent("08:31");
    expect(row("Last light (civil dusk)")).toHaveTextContent("12:53");
    expect(row("Day length")).toHaveTextContent("No daylight");
    expect(document.body).not.toHaveTextContent(/Invalid|NaN/);
  });

  it("says when the place is far from the device's time zone instead of guessing its clock", () => {
    render(<SunSection position={SUVA} zone="Europe/London" defaultOpen />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-03-20" } });
    expect(
      screen.getByText(
        /By the sun, this place runs about 12 hours ahead of this device’s time zone, so clocks there probably read differently\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not guess\. The date is the date at the place\./)).toBeInTheDocument();
    // Suva's sunrise on its 20 March (06:10 at UTC+12) is the evening of the 19th in London.
    expect(row("Sunrise")).toHaveTextContent("18:10 on 19 Mar");
    expect(row("Sunset")).toHaveTextContent("06:17");
  });

  it("starts open when the sun times were asked for, whatever was remembered", () => {
    localStorage.setItem("outpost.maps.sun.open", "false");
    render(<SunSection position={GREENWICH} zone="Europe/London" defaultOpen />);
    expect(screen.getByRole("button", { name: /^Sun/ })).toHaveAttribute("aria-expanded", "true");
  });
  describe("on the 12-hour clock", () => {
    it("writes the folded line and every row that way, and points to where the clock is chosen", async () => {
      setClockChoice("12");
      render(<SunSection position={GREENWICH} zone="Europe/London" />);
      const toggle = screen.getByRole("button", { name: /^Sun/ });
      expect(toggle).toHaveTextContent("Sunrise 4:43 am, sunset 9:21 pm");
      await userEvent.click(toggle);
      expect(row("First light (civil dawn)")).toHaveTextContent("3:55 am");
      expect(row("Sunrise")).toHaveTextContent("4:43 am");
      expect(row("Solar noon")).toHaveTextContent("1:02 pm");
      expect(row("Sunset")).toHaveTextContent("9:21 pm");
      expect(row("Last light (civil dusk)")).toHaveTextContent("10:09 pm");
      expect(row("Nautical twilight")).toHaveTextContent("2:41 am to 11:23 pm");
      // A length of time is not a clock time.
      expect(row("Day length")).toHaveTextContent("16 h 38 min");
      expect(document.body).not.toHaveTextContent(/\b\d\d:\d\d(?! [ap]m)/);
      expect(screen.getByText(/For the 24-hour clock, see/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Settings → Appearance" })).toHaveAttribute("href", "/settings#appearance");
    });

    it("is what a device that uses it gets without choosing", () => {
      setDeviceClockStyle("12");
      render(<SunSection position={GREENWICH} zone="Europe/London" />);
      expect(screen.getByRole("button", { name: /^Sun/ })).toHaveTextContent("Sunrise 4:43 am, sunset 9:21 pm");
    });

    it("still writes UTC on the 24-hour clock, marked, and says why", async () => {
      setClockChoice("12");
      render(<SunSection position={GREENWICH} zone="Europe/London" defaultOpen />);
      await userEvent.click(screen.getByRole("radio", { name: "UTC" }));
      expect(row("Sunrise")).toHaveTextContent("03:43 UTC");
      expect(row("Sunset")).toHaveTextContent("20:21 UTC");
      expect(row("Nautical twilight")).toHaveTextContent("01:41 UTC to 22:23 UTC");
      expect(document.body).not.toHaveTextContent(/\d [ap]m\b/);
      expect(
        screen.getByText(/Times are in UTC\. UTC is written on the 24-hour clock, whichever clock is chosen in Settings\./),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /^Sun/ }));
      expect(screen.getByRole("button", { name: /^Sun/ })).toHaveTextContent("Sunrise 03:43, sunset 20:21 UTC");
    });

    it("says the day beside a time that falls on another one, across the date line", () => {
      setClockChoice("12");
      render(<SunSection position={SUVA} zone="Europe/London" defaultOpen />);
      fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-03-20" } });
      expect(row("Sunrise")).toHaveTextContent("6:10 pm on 19 Mar");
      expect(row("Sunset")).toHaveTextContent("6:17 am");
    });

    it("keeps the polar wording, with the twilight that remains in the same style", () => {
      setClockChoice("12");
      render(<SunSection position={TROMSO} zone="Europe/London" defaultOpen />);
      expect(row("Sun")).toHaveTextContent("Does not set on this date (midnight sun)");
      fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-21" } });
      expect(row("Sun")).toHaveTextContent("Does not rise on this date (polar night)");
      expect(row("First light (civil dawn)")).toHaveTextContent("8:31 am");
      expect(row("Last light (civil dusk)")).toHaveTextContent("12:53 pm");
      expect(document.body).not.toHaveTextContent(/Invalid|NaN/);
    });

    it("changes with the choice while it is on screen", () => {
      render(<SunSection position={GREENWICH} zone="Europe/London" />);
      expect(screen.getByRole("button", { name: /^Sun/ })).toHaveTextContent("Sunrise 04:43, sunset 21:21");
      act(() => setClockChoice("12"));
      expect(screen.getByRole("button", { name: /^Sun/ })).toHaveTextContent("Sunrise 4:43 am, sunset 9:21 pm");
    });
  });

  it("marks every UTC time as UTC on the 24-hour clock as well, and points to where the clock is chosen", async () => {
    render(<SunSection position={GREENWICH} zone="Europe/London" defaultOpen />);
    expect(screen.getByText(/For a 12-hour clock, see/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "UTC" }));
    expect(row("Sunrise")).toHaveTextContent("03:43 UTC");
    expect(row("Solar noon")).toHaveTextContent("12:02 UTC");
    expect(screen.getByText("Times are in UTC.")).toBeInTheDocument();
  });

  it("asks for room when a person opens it, and not when they fold it away", async () => {
    const onOpen = vi.fn();
    render(<SunSection position={GREENWICH} zone="Europe/London" onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /^Sun/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: /^Sun/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("puts sunrise and sunset first and largest, first and last light next, and the rest after the date", async () => {
    render(<SunSection position={GREENWICH} zone="Europe/London" defaultOpen />);
    const terms = [...document.querySelectorAll("dt")].map((term) => term.textContent);
    expect(terms).toEqual([
      "Sunrise",
      "Sunset",
      "First light (civil dawn)",
      "Last light (civil dusk)",
      "Solar noon",
      "Rises towards",
      "Sets towards",
      "Day length",
      "Nautical twilight",
      "Moon",
    ]);
    // The figures of the two times are the largest type in the section, in the app's tabular figures.
    const figures = (label: string) => row(label).querySelector(".tabular") as HTMLElement;
    for (const label of ["Sunrise", "Sunset"]) {
      expect(figures(label)).toHaveTextContent(/^\d\d:\d\d$/);
      expect(figures(label)).toHaveClass("text-display", "tabular");
    }
    expect(figures("First light (civil dawn)")).toHaveClass("text-heading", "tabular");
    expect(figures("Last light (civil dusk)")).toHaveClass("text-heading", "tabular");
    expect(row("Solar noon")).toHaveClass("text-small");
    // The day the times are for is said above them, and the date control comes after the times.
    expect(screen.getByText("Today, Sunday 21 June")).toBeInTheDocument();
    const date = screen.getByLabelText("Date");
    expect(row("Last light (civil dusk)").compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(date.compareDocumentPosition(row("Solar noon")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "The day after" }));
    expect(screen.getByText("Monday 22 June 2026")).toBeInTheDocument();
    expect(screen.queryByText(/^Today,/)).not.toBeInTheDocument();
  });

  it("sets “am”, “UTC” and another day’s date small beside the figures, so the figures stay large", async () => {
    setClockChoice("12");
    render(<SunSection position={SUVA} zone="Europe/London" defaultOpen />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-03-20" } });
    const figures = row("Sunrise").querySelector(".tabular") as HTMLElement;
    expect(figures).toHaveTextContent(/^6:10$/);
    expect(row("Sunrise")).toHaveTextContent("6:10 pm on 19 Mar");
    await userEvent.click(screen.getByRole("radio", { name: "UTC" }));
    expect(row("Sunrise").querySelector(".tabular")).toHaveTextContent(/^18:10$/);
    expect(row("Sunrise")).toHaveTextContent("18:10 UTC on 19 Mar");
  });

  it("says a day without a sunrise in words at reading size, not as a large figure", () => {
    render(<SunSection position={TROMSO} zone="Europe/London" defaultOpen />);
    expect(row("Sun").querySelector(".tabular")).toBeNull();
    expect(row("Sun")).toHaveTextContent("Does not set on this date (midnight sun)");
    // Nothing is left where first and last light would have been.
    expect(screen.queryByText(/light/, { selector: "dt" })).not.toBeInTheDocument();
  });

  it("gives the folded line at reading size and in ink", () => {
    render(<SunSection position={GREENWICH} zone="Europe/London" />);
    const line = screen.getByText("Sunrise 04:43, sunset 21:21");
    expect(line).toHaveClass("text-body", "text-ink", "tabular");
  });

  it("can be shown always open, under one line that gives sunrise and sunset first", () => {
    render(<SunTimes position={GREENWICH} zone="Europe/London" />);
    expect(screen.getByText("Sunrise 04:43, sunset 21:21")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Sun/ })).not.toBeInTheDocument();
    expect(row("Sunset")).toHaveTextContent("21:21");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-03-20" } });
    expect(screen.getByText("20 Mar: Sunrise 06:03, sunset 18:13")).toBeInTheDocument();
  });
});
