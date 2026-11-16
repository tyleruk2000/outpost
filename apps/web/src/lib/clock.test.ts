import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { scheduleText } from "@/features/settings/backup-text";
import {
  clockChoice,
  clockStyle,
  clockText,
  deviceClockStyle,
  formatStoredTime,
  formatTimeOfDay,
  setClockChoice,
  setDeviceClockStyle,
  useClockChoice,
  useClockStyle,
} from "./clock";
import { formatDateTime } from "./utils";

afterEach(() => {
  setClockChoice("device");
  setDeviceClockStyle("24");
});

describe("a time of day, written", () => {
  it("on the 24-hour clock keeps its leading zero", () => {
    expect(clockText(7, 42, "24")).toBe("07:42");
    expect(clockText(0, 7, "24")).toBe("00:07");
    expect(clockText(12, 0, "24")).toBe("12:00");
    expect(clockText(23, 59, "24")).toBe("23:59");
    expect(clockText(14, 32, "24", 7)).toBe("14:32:07");
  });

  it("on the 12-hour clock says am or pm, and has no hour nought", () => {
    expect(clockText(7, 42, "12")).toBe("7:42 am");
    expect(clockText(19, 42, "12")).toBe("7:42 pm");
    expect(clockText(11, 59, "12")).toBe("11:59 am");
    expect(clockText(23, 59, "12")).toBe("11:59 pm");
    expect(clockText(14, 32, "12", 7)).toBe("2:32:07 pm");
  });

  it("on the 12-hour clock has midnight and noon the right way round", () => {
    // The hour after midnight is 12 am; the hour after noon is 12 pm.
    expect(clockText(0, 0, "12")).toBe("12:00 am");
    expect(clockText(0, 7, "12")).toBe("12:07 am");
    expect(clockText(12, 0, "12")).toBe("12:00 pm");
    expect(clockText(12, 7, "12")).toBe("12:07 pm");
    expect(clockText(1, 0, "12")).toBe("1:00 am");
    expect(clockText(13, 0, "12")).toBe("1:00 pm");
  });

  it("agrees with the browser's own 12-hour clock for every minute of the day", () => {
    const browser = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" });
    for (let minute = 0; minute < 24 * 60; minute += 1) {
      const said = browser
        .format(Date.UTC(2026, 0, 1, 0, minute))
        .replace(/[  ]/g, " ")
        .toLowerCase();
      expect(clockText(Math.floor(minute / 60), minute % 60, "12")).toBe(said);
    }
  });
});

describe("the clock choice", () => {
  it("follows the device until someone chooses, and is kept in this browser", () => {
    expect(clockChoice()).toBe("device");
    expect(clockStyle()).toBe("24");
    setDeviceClockStyle("12");
    expect(clockStyle()).toBe("12");

    setClockChoice("24");
    expect(clockStyle()).toBe("24");
    expect(localStorage.getItem("outpost.clock")).toBe("24");
    setClockChoice("12");
    setDeviceClockStyle("24");
    expect(clockStyle()).toBe("12");
    expect(localStorage.getItem("outpost.clock")).toBe("12");

    // Back to following the device leaves nothing stored.
    setClockChoice("device");
    expect(localStorage.getItem("outpost.clock")).toBeNull();
    expect(clockStyle()).toBe("24");
  });

  it("reads which clock the device uses from the browser when it is not told", () => {
    setDeviceClockStyle(undefined);
    const browser = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
    expect(deviceClockStyle()).toBe(browser.hourCycle === "h11" || browser.hourCycle === "h12" ? "12" : "24");
  });

  it("is picked up from another tab of the same browser", () => {
    localStorage.setItem("outpost.clock", "12");
    window.dispatchEvent(new StorageEvent("storage", { key: "outpost.clock", newValue: "12" }));
    expect(clockChoice()).toBe("12");
    localStorage.removeItem("outpost.clock");
    window.dispatchEvent(new StorageEvent("storage", { key: "outpost.clock", newValue: null }));
    expect(clockChoice()).toBe("device");
  });

  it("draws again whatever is showing a time when it changes", () => {
    const style = renderHook(() => useClockStyle());
    const choice = renderHook(() => useClockChoice());
    expect(style.result.current).toBe("24");
    act(() => choice.result.current[1]("12"));
    expect(style.result.current).toBe("12");
    expect(choice.result.current[0]).toBe("12");
  });
});

describe("every clock time the app writes", () => {
  // Local time, as the app shows it: these read the same in any time zone the tests run in.
  const afternoon = new Date(2026, 10, 17, 14, 32, 7).getTime();
  const justAfterMidnight = new Date(2026, 10, 17, 0, 7).getTime();

  it("is in the 24-hour style by default here", () => {
    expect(formatTimeOfDay(afternoon)).toBe("14:32");
    expect(formatTimeOfDay(afternoon, { seconds: true })).toBe("14:32:07");
    expect(formatDateTime(afternoon)).toBe("17 Nov 2026, 14:32");
    expect(formatDateTime(justAfterMidnight)).toBe("17 Nov 2026, 00:07");
    expect(formatStoredTime("03:00")).toBe("03:00");
  });

  it("changes together when the 12-hour clock is chosen", () => {
    setClockChoice("12");
    expect(formatTimeOfDay(afternoon)).toBe("2:32 pm");
    expect(formatTimeOfDay(afternoon, { seconds: true })).toBe("2:32:07 pm");
    expect(formatDateTime(afternoon)).toBe("17 Nov 2026, 2:32 pm");
    expect(formatDateTime(justAfterMidnight)).toBe("17 Nov 2026, 12:07 am");
    expect(formatStoredTime("03:00")).toBe("3:00 am");
    expect(formatStoredTime("00:00")).toBe("12:00 am");
    expect(formatStoredTime("12:30")).toBe("12:30 pm");
    expect(scheduleText({ locationId: "x", frequency: "weekly", weekday: 3, time: "21:30", keep: 7 } as never)).toBe(
      "Every Wednesday at 9:30 pm",
    );
  });

  it("leaves alone a stored time it cannot read", () => {
    setClockChoice("12");
    expect(formatStoredTime("25:00")).toBe("25:00");
    expect(formatStoredTime("soon")).toBe("soon");
  });
});
