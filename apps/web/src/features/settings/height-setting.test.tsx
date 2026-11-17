import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "@/components/command-palette";
import { heightUnit, setHeightUnit } from "@/lib/heights";
import { ownAnswer, serveSearch } from "@/lib/search-stand-in";
import { ThemeProvider } from "@/lib/theme";
import { HeightSetting } from "./height-setting";

afterEach(() => {
  setHeightUnit("m");
  vi.unstubAllGlobals();
});

describe("the Heights choice", () => {
  it("is metres to begin with, and keeps feet in this browser once chosen", async () => {
    render(<HeightSetting />);
    expect(screen.getByRole("radio", { name: "Metres" })).toBeChecked();
    expect(screen.getByText(/312 m or 1,025 ft\./)).toBeInTheDocument();
    expect(screen.getByText(/a height you type \(an aerial's\) is always in metres/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Feet" }));
    expect(heightUnit()).toBe("ft");
    expect(localStorage.getItem("outpost.heights")).toBe("ft");
    await userEvent.click(screen.getByRole("radio", { name: "Metres" }));
    expect(heightUnit()).toBe("m");
  });

  it("is found by the quick search under the words a person would type", async () => {
    serveSearch(() => ownAnswer([]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <MemoryRouter>
            <CommandPalette open onOpenChange={() => {}} onNewPage={() => {}} />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    const box = screen.getByPlaceholderText(/Search your library/);
    for (const word of ["feet", "metres", "meters", "height", "elevation", "units"]) {
      await userEvent.clear(box);
      await userEvent.type(box, word);
      expect(screen.getByRole("option", { name: "Settings: Heights in metres or feet" }), word).toBeInTheDocument();
    }
  });
});
