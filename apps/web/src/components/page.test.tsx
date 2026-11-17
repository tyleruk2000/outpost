import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { BackLink, Disclosure, EmptyState, Joined, JumpLinks, PageHeader } from "./page";

const at = (path: string, ui: React.ReactNode) => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe("PageHeader's back link", () => {
  it("leads a screen under another back to it, above the title, by the navigation's own name", () => {
    at("/storage/manage", <PageHeader title="Manage and clean up" />);
    const back = screen.getByRole("link", { name: "Storage" });
    expect(back).toHaveAttribute("href", "/storage");
    const heading = screen.getByRole("heading", { level: 1 });
    // Above the title: earlier in the page.
    expect(back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("finds the parent of a tool drawn from a section's registry", () => {
    at("/tools/water", <PageHeader title="Water" />);
    expect(screen.getByRole("link", { name: "Tools" })).toHaveAttribute("href", "/tools");
  });

  it("is given by the screen where it is not in the navigation, and can be left out", () => {
    at("/prepare/plans/7", <PageHeader title="Power cut" back={{ to: "/prepare/plans", label: "Emergency plans" }} />);
    expect(screen.getByRole("link", { name: "Emergency plans" })).toHaveAttribute("href", "/prepare/plans");
  });

  it("can be left out where the screen draws its own way back", () => {
    at("/storage/manage", <PageHeader title="Manage" back={false} />);
    expect(screen.queryByRole("link", { name: "Storage" })).toBeNull();
  });

  it("is not drawn on a screen at the top level, nor outside a router", () => {
    at("/storage", <PageHeader title="Storage" />);
    expect(screen.queryByRole("link")).toBeNull();
    render(<PageHeader title="Anywhere" />);
    expect(screen.getAllByRole("heading", { name: "Anywhere" })).toHaveLength(1);
  });

  it("is one glyph and one look wherever it is used", () => {
    at("/", <BackLink to="/notes">Notes</BackLink>);
    const link = screen.getByRole("link", { name: "Notes" });
    expect(link.querySelector("svg.lucide-arrow-left")).not.toBeNull();
    expect(link.className).toContain("text-ink-muted");
  });
});

describe("Joined", () => {
  it("puts one separator, a middle dot, between the facts and none at the ends, and skips empty ones", () => {
    const { container } = render(<p>{<Joined parts={["12 tins", null, "Pantry", false, "349 kcal each"]} />}</p>);
    expect(container.textContent).toBe("12 tins · , Pantry · , 349 kcal each");
    // Read aloud as a list: the dot is hidden and a comma is said.
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
    expect(container.querySelectorAll('[aria-hidden="true"]')[0]?.textContent).toBe(" · ");
  });
});

describe("JumpLinks", () => {
  it("lists the sections of a page that shows them all, as links to each", () => {
    render(
      <JumpLinks
        label="Calculators on this screen"
        items={[
          { id: "boil", label: "Boiling" },
          { id: "bleach", label: "Bleach" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Calculators on this screen" });
    expect(within(nav).getByRole("link", { name: "Bleach" })).toHaveAttribute("href", "#bleach");
  });
});

describe("Disclosure", () => {
  it("keeps detail closed under a summary that says what it holds", () => {
    render(<Disclosure summary="What is read from an ADIF file">QSO_DATE, CALL</Disclosure>);
    const details = screen.getByText("What is read from an ADIF file").closest("details");
    expect(details).not.toHaveAttribute("open");
  });
});

describe("EmptyState", () => {
  it("can sit inside a section, with a heading of the level it needs", () => {
    render(
      <EmptyState title="No loads yet" compact level={3}>
        Add the first.
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "No loads yet" })).toBeInTheDocument();
  });
});
