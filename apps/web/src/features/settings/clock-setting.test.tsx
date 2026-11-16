import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { clockStyle, setDeviceClockStyle, useClockStyle } from "@/lib/clock";
import { formatDateTime } from "@/lib/utils";
import { scheduleText } from "./backup-text";
import { ClockSetting } from "./clock-setting";

const AFTERNOON = new Date(2026, 10, 17, 14, 32).getTime();

/** Stands for the rest of the Settings screen: a date and time and a schedule, as the Backup section writes them. */
function RestOfTheScreen() {
  useClockStyle();
  return (
    <p>
      Last backup {formatDateTime(AFTERNOON)}. {scheduleText({ frequency: "daily", time: "03:00" } as never)}.
    </p>
  );
}

describe("the Clock setting", () => {
  it("follows the device to begin with, and says which clock that is", () => {
    render(<ClockSetting />);
    const choice = screen.getByRole("radiogroup", { name: "Clock" });
    expect(within(choice).getByRole("radio", { name: "As this device" })).toBeChecked();
    expect(screen.getByText(/14:30 or 2:30 pm\. This device uses the 24-hour clock, as far as its browser says\./)).toBeInTheDocument();
    expect(screen.getByText(/UTC, where it is shown, is always 24-hour\./)).toBeInTheDocument();
  });

  it("says so when the device uses the 12-hour clock, and follows it", () => {
    setDeviceClockStyle("12");
    render(
      <>
        <ClockSetting />
        <RestOfTheScreen />
      </>,
    );
    expect(screen.getByText(/This device uses the 12-hour clock/)).toBeInTheDocument();
    expect(screen.getByText("Last backup 17 Nov 2026, 2:32 pm. Every day at 3:00 am.")).toBeInTheDocument();
  });

  it("changes every time on the screen at once, and is remembered in this browser", async () => {
    render(
      <>
        <ClockSetting />
        <RestOfTheScreen />
      </>,
    );
    expect(screen.getByText("Last backup 17 Nov 2026, 14:32. Every day at 03:00.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "12-hour" }));
    expect(screen.getByText("Last backup 17 Nov 2026, 2:32 pm. Every day at 3:00 am.")).toBeInTheDocument();
    expect(localStorage.getItem("outpost.clock")).toBe("12");
    expect(clockStyle()).toBe("12");

    await userEvent.click(screen.getByRole("radio", { name: "24-hour" }));
    expect(screen.getByText("Last backup 17 Nov 2026, 14:32. Every day at 03:00.")).toBeInTheDocument();
    expect(localStorage.getItem("outpost.clock")).toBe("24");

    await userEvent.click(screen.getByRole("radio", { name: "As this device" }));
    expect(localStorage.getItem("outpost.clock")).toBeNull();
  });
});
