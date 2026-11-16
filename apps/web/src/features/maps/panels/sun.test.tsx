import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SunSection } from "./sun";

// The times asserted here are the US Naval Observatory's for Greenwich and Tromsø (see
// lib/sun.test.ts for where and when they were read), moved onto the clock named in each test.
const GREENWICH = { lat: 51.48, lon: 0 };
const TROMSO = { lat: 69.65, lon: 18.96 };
const SUVA = { lat: -18.14, lon: 178.44 };

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
    expect(row("Sunrise")).toHaveTextContent("49° NE");
    expect(row("Solar noon")).toHaveTextContent("13:02");
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
});
