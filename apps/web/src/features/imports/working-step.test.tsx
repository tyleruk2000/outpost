import type { ImportDto } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkingStep } from "./working-step";

function dto(state: ImportDto["state"], current: number, message: string, job: "running" | "paused" = "running"): ImportDto {
  return {
    id: "imp1",
    kind: "markdown",
    state,
    originalName: "Field notes.zip",
    sizeBytes: 400,
    error: null,
    createdAt: 0,
    completedAt: null,
    analysis: null,
    options: null,
    report: null,
    job: { id: "j1", state: job, progress: { current, total: 120, message } },
    canRetry: false,
  };
}

describe("WorkingStep", () => {
  it("announces what stage the import is at, not every step of its progress", () => {
    const client = new QueryClient();
    const view = render(
      <QueryClientProvider client={client}>
        <WorkingStep dto={dto("importing", 3, "Creating “Owls”")} onLeave={() => {}} />
      </QueryClientProvider>,
    );
    const live = () => document.querySelectorAll("[aria-live], [role=status], [role=alert]");
    // The progress is on screen for anyone who looks…
    expect(screen.getByText("Creating “Owls”")).toBeInTheDocument();
    expect(screen.getByText("3 of 120")).toBeInTheDocument();
    // …but only the stage is spoken: one live region, holding no count and no page name.
    expect(live()).toHaveLength(1);
    expect(live()[0]).toHaveTextContent("Importing “Field notes.zip”");
    expect(live()[0]?.textContent).not.toMatch(/Owls|120/);

    view.rerender(
      <QueryClientProvider client={client}>
        <WorkingStep dto={dto("importing", 4, "Creating “Lakeside”", "paused")} onLeave={() => {}} />
      </QueryClientProvider>,
    );
    expect(live()[0]).toHaveTextContent("Importing “Field notes.zip”: paused");
  });
});
