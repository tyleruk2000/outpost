import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ScrollBox } from "./scroll-box";

describe("a box that scrolls on its own", () => {
  it("is a named region the keyboard reaches", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <ScrollBox label="Bands and power" className="overflow-x-auto">
          <table>
            <tbody>
              <tr>
                <td>40 m</td>
              </tr>
            </tbody>
          </table>
        </ScrollBox>
      </>,
    );
    const region = screen.getByRole("region", { name: "Bands and power" });
    expect(region).toHaveClass("overflow-x-auto");
    await user.tab();
    await user.tab();
    expect(region).toHaveFocus();
  });

  it("keeps a list a list, under its name", () => {
    render(
      <ScrollBox label="Rows that cannot be kept" as="ul">
        <li>Line 3. No callsign.</li>
      </ScrollBox>,
    );
    const list = screen.getByRole("list", { name: "Rows that cannot be kept" });
    expect(list).toHaveAttribute("tabindex", "0");
  });
});
