import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "@/components/ui/misc";
import { NumberSetting, SettingRow } from "./parts";

describe("a row of Settings", () => {
  it("describes its field by its hint and its unit, so both are read with the field", () => {
    render(
      <SettingRow
        htmlFor="pages"
        label="Most pages read from one PDF"
        hint="Use 0 for no limit."
        control={<NumberSetting id="pages" value={5000} min={0} max={100000} disabled={false} onSave={() => {}} unit="pages" />}
      />,
    );
    expect(screen.getByRole("spinbutton", { name: "Most pages read from one PDF" })).toHaveAccessibleDescription(
      "Use 0 for no limit. pages",
    );
  });

  it("describes a switch by its hint too", () => {
    render(
      <SettingRow
        label="Read text from scans automatically"
        hint="It is slow, and it makes mistakes."
        control={<Switch checked={false} onCheckedChange={() => {}} aria-label="Read text from scans automatically" />}
      />,
    );
    expect(screen.getByRole("switch")).toHaveAccessibleDescription("It is slow, and it makes mistakes.");
  });

  it("says why a number out of range was not saved, and that the old one stands", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(
      <SettingRow
        htmlFor="at-once"
        label="Downloads at once"
        control={<NumberSetting id="at-once" value={2} min={1} max={8} disabled={false} onSave={save} />}
      />,
    );
    const field = screen.getByRole("spinbutton", { name: "Downloads at once" });
    await user.clear(field);
    await user.type(field, "12{Enter}");
    expect(save).not.toHaveBeenCalled();
    expect(field).toHaveValue(2);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Not saved: 12 is not a whole number from 1 to 8. It is still 2.");
    expect(field).toHaveAccessibleDescription(/Not saved/);

    await user.clear(field);
    await user.type(field, "3{Enter}");
    expect(save).toHaveBeenCalledWith(3);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
