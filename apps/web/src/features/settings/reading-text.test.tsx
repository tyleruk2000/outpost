import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/misc";
import { ThemeProvider } from "@/lib/theme";
import { ReadingTextControl } from "./reading-text";

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute("style");
  delete root.dataset.reading;
  delete root.dataset.spacing;
});
afterEach(() => root.removeAttribute("style"));

describe("a reader's Text control", () => {
  it("changes the typeface, size and spacing that Settings keeps", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TooltipProvider>
          <ReadingTextControl />
        </TooltipProvider>
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Text" }));
    const panel = await screen.findByRole("dialog", { name: "Text" });

    await user.click(within(within(panel).getByRole("group", { name: "Typeface" })).getByRole("radio", { name: "Sans" }));
    expect(root.dataset.reading).toBe("sans");
    expect(localStorage.getItem("outpost.reading")).toBe("sans");

    await user.click(within(within(panel).getByRole("group", { name: "Size" })).getByRole("radio", { name: "Largest" }));
    expect(root.style.fontSize).toBe("150%");
    expect(localStorage.getItem("outpost.textSize")).toBe("largest");

    await user.click(within(within(panel).getByRole("group", { name: "Spacing" })).getByRole("radio", { name: "Wide" }));
    expect(root.dataset.spacing).toBe("wide");
    expect(localStorage.getItem("outpost.spacing")).toBe("wide");

    await user.click(within(within(panel).getByRole("group", { name: "Spacing" })).getByRole("radio", { name: "Normal" }));
    expect(root.dataset.spacing).toBeUndefined();
  });
});
