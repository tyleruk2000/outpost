/**
 * The app's frame and the shared parts it is drawn with: the sidebar opened over the page on a tablet, the quick
 * search's first lines with nothing typed, going back to where a screen was left, a busy button that keeps its
 * width, and a query that is asked whatever the browser thinks of the network.
 */
import { onlineManager, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createMemoryRouter, Link, RouterProvider, useNavigate } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/lib/query-client";
import { ThemeProvider } from "@/lib/theme";
import { CommandPalette } from "./command-palette";
import { forgetScrollPositions, useScrollMemory } from "./scroll-memory";
import { Sidebar } from "./sidebar";
import { Button } from "./ui/button";
import { TooltipProvider } from "./ui/misc";
import { Table, TableHead, Td, Th, Tr } from "./ui/table";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

function Shell() {
  const [open, setOpen] = useState(false);
  return (
    <Sidebar collapsed={!open} over={open} onClose={() => setOpen(false)} onToggle={() => setOpen((now) => !now)} onOpenSearch={() => {}} />
  );
}

function List() {
  useScrollMemory();
  return <Link to="/item">Open an item</Link>;
}
function Item() {
  useScrollMemory();
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Back
    </button>
  );
}

describe("the sidebar on a tablet", () => {
  it("is a rail of icons that opens over the page, dims it, and closes with Escape, the focus back on its button", async () => {
    // Nothing the sidebar asks for is needed here: every request is turned away.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    const user = userEvent.setup();
    const router = createMemoryRouter([{ path: "*", element: <Shell /> }]);
    render(
      <QueryClientProvider client={createQueryClient()}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    const toggle = screen.getByRole("button", { name: "Expand sidebar" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Close the sidebar" })).toBeNull();
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-expanded", "true");
    // Over the page, with the page dimmed behind and the rail's room kept so that the page does not move.
    expect(screen.getByRole("complementary", { name: "Main" })).toHaveClass("fixed");
    expect(screen.getByRole("button", { name: "Close the sidebar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Close the sidebar" })).toBeNull();
  });
});

describe("the quick search with nothing typed", () => {
  it("offers the things people come to do first, a way somewhere first of all, and every screen after them", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ results: [], warnings: [] })),
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <ThemeProvider>
          <RouterProvider
            router={createMemoryRouter([{ path: "*", element: <CommandPalette open onOpenChange={() => {}} onNewPage={() => {}} /> }])}
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );
    const doGroup = screen.getByRole("group", { name: "Do" });
    const goTo = screen.getByRole("group", { name: "Go to" });
    expect(doGroup.compareDocumentPosition(goTo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(doGroup).getAllByRole("option")[0]).toHaveTextContent("Add documents");
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Add documents");
    expect(within(screen.getByRole("group", { name: "Go to" })).getAllByRole("option")[0]).toHaveTextContent("Home");
  });
});

describe("going back to a screen", () => {
  it("puts it where it was left, and a new screen at its top", async () => {
    forgetScrollPositions();
    const page = document.scrollingElement ?? document.documentElement;
    Object.defineProperty(page, "scrollHeight", { configurable: true, value: 5000 });
    Object.defineProperty(page, "clientHeight", { configurable: true, value: 800 });
    const router = createMemoryRouter(
      [
        { path: "/", element: <List /> },
        { path: "/item", element: <Item /> },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    page.scrollTop = 1200;
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    await userEvent.click(screen.getByRole("link", { name: "Open an item" }));
    expect(page.scrollTop).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(page.scrollTop).toBe(1200));
  });
});

describe("a button while its action is under way", () => {
  it("puts the spinner in its icon's place and keeps its words, so it keeps its width", () => {
    render(
      <Button loading>
        <svg data-testid="icon" />
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    // A Lucide icon is a component; a bare svg tag stands for words here, so is kept under the spinner.
    expect(button.querySelector('[data-slot="spinner"]')).not.toBeNull();
    expect(button).toHaveTextContent("Save");
  });

  it("swaps a leading icon for the spinner", async () => {
    const { Upload } = await import("lucide-react");
    render(
      <Button loading>
        <Upload data-testid="icon" />
        Add documents
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Add documents" });
    expect(within(button).queryByTestId("icon")).toBeNull();
    expect(button.firstElementChild).toHaveAttribute("data-slot", "spinner");
  });

  it("keeps words with no icon, unseen under the spinner, still its name", () => {
    render(<Button loading>Write drive</Button>);
    const button = screen.getByRole("button", { name: "Write drive" });
    expect(screen.getByText("Write drive")).toHaveClass("opacity-0");
    expect(button.querySelector('[data-slot="spinner"]')).toHaveClass("absolute");
  });
});

describe("a table", () => {
  it("sets figures right in tabular numerals, and scrolls in a frame the keyboard reaches unless stacked", () => {
    const { rerender } = render(
      <Table label="Batteries">
        <TableHead>
          <Tr>
            <Th>Name</Th>
            <Th numeric>Capacity</Th>
          </Tr>
        </TableHead>
        <tbody>
          <Tr>
            <Td label="Name">Leisure</Td>
            <Td label="Capacity" numeric>
              110 Ah
            </Td>
          </Tr>
        </tbody>
      </Table>,
    );
    expect(screen.getByRole("region", { name: "Batteries" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("columnheader", { name: "Capacity" })).toHaveClass("text-right");
    expect(screen.getByRole("cell", { name: "110 Ah" })).toHaveClass("tabular", "text-right");
    expect(screen.getByRole("cell", { name: "110 Ah" })).toHaveAttribute("data-label", "Capacity");
    rerender(
      <Table label="Batteries" stack>
        <tbody>
          <Tr>
            <Td label="Name">Leisure</Td>
          </Tr>
        </tbody>
      </Table>,
    );
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.getByRole("table", { name: "Batteries" })).toHaveAttribute("data-stack", "true");
  });
});

function Asks() {
  const query = useQuery({ queryKey: ["frame", "test"], queryFn: () => fetch("/api/x").then((response) => response.json()) });
  return <p>{query.isSuccess ? "Answered" : query.fetchStatus}</p>;
}

describe("the query client", () => {
  it("asks the server while the browser believes it is offline: Outpost is on this network, not the internet", async () => {
    // As the browser says when it has no network at all (Outpost on localhost), or a phone's Wi-Fi has no internet.
    onlineManager.setOnline(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ ok: true })),
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <Asks />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Answered")).toBeInTheDocument();
    onlineManager.setOnline(true);
  });
});
