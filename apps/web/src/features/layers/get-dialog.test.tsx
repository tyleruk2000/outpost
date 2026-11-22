/**
 * A source that is told how to reach the project: the name is shown, and nothing is
 * asked of the source until the person has ticked that it may be sent.
 */
import type { ReferenceCatalogueResponse, ReferenceEstimateRequest, ReferenceProviderDto } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { householdOf, householdsAnswer, ONE_HOUSEHOLD, placeHomeIn } from "@/features/households/test-support";
import { GetDialog } from "./dataset-manager";

const NAME = "Outpost/0.1.0 (self-hosted offline library; +https://example.org/outpost)";

const provider = (id: string, name: string, clientName: string | null): ReferenceProviderDto => ({
  id,
  name,
  publisher: name,
  url: "https://example.org",
  license: "CC0 1.0",
  licenseUrl: null,
  termsUrl: "https://example.org/terms",
  termsQuote: "Use it.",
  termsRead: "2026-11-16",
  verdict: "fetch",
  why: `What is asked of ${name}.`,
  layers: ["nuclear"],
  scopes: ["world", "country"],
  importFormats: [],
  caution: null,
  incremental: "No.",
  clientName,
});

const CATALOGUE: ReferenceCatalogueResponse = {
  providers: [provider("natural-earth", "Natural Earth", null), provider("wikidata", "Wikidata", NAME)],
  linked: [],
  countries: [
    { code: "GB", name: "United Kingdom", bbox: [-8, 49, 2, 61] },
    { code: "FR", name: "France", bbox: [-5, 41, 10, 51] },
  ],
} as ReferenceCatalogueResponse;

function show(initial: ReferenceEstimateRequest | null, households: unknown = ONE_HOUSEHOLD): ReferenceEstimateRequest[] {
  const asked: ReferenceEstimateRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (pathname === "/api/reference/catalogue") return json(CATALOGUE);
      if (pathname === "/api/households") return json(households);
      if (pathname === "/api/reference/estimate" && init?.method === "POST") {
        asked.push(JSON.parse(String(init.body)) as ReferenceEstimateRequest);
        return json({
          estimateId: "e1",
          provider: initial?.provider ?? "natural-earth",
          items: [],
          totalBytes: 0,
          databaseBytes: 0,
          notes: [],
        });
      }
      return json({ locations: [], packs: [] });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <GetDialog open onOpenChange={() => {}} engine={null} initial={initial} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return asked;
}

afterEach(() => vi.unstubAllGlobals());

describe("getting reference data from a source that is told what is asking", () => {
  it("shows the name that is sent and asks nothing until the box is ticked, even for an update", async () => {
    const asked = show({ provider: "wikidata", scope: { countries: ["GB"] } });
    // The name itself, word for word, and what it does and does not say.
    expect(await screen.findByText(NAME)).toBeVisible();
    expect(screen.getByText("This source is told what is asking")).toBeVisible();
    expect(screen.getByText(/says nothing about you, your library or this installation/)).toBeVisible();
    expect(screen.getByText(/If you would rather it were not sent, leave this source alone/)).toBeVisible();
    // An update of an installed pack is not estimated by itself for such a source.
    const size = screen.getByRole("button", { name: "Show the size" });
    expect(size).toBeDisabled();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked).toEqual([]);

    fireEvent.click(screen.getByRole("checkbox", { name: "Send this name to Wikidata" }));
    expect(size).toBeEnabled();
    expect(asked).toEqual([]);
    fireEvent.click(size);
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0]).toMatchObject({ provider: "wikidata", clientNameAgreed: true });

    // Unticked again: the button is held again.
    fireEvent.click(screen.getByRole("checkbox", { name: "Send this name to Wikidata" }));
    expect(size).toBeDisabled();
  });

  it("has no such box for a source asked under the plain name, and estimates an update as it opens", async () => {
    const asked = show({ provider: "natural-earth", scope: {} });
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0]).not.toHaveProperty("clientNameAgreed");
    expect(screen.queryByText("This source is told what is asking")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Send this name/ })).not.toBeInTheDocument();
  });
});

describe("a whole country", () => {
  it("starts at the current household's country, and at the UK with none", async () => {
    show(
      null,
      householdsAnswer(
        [
          householdOf({ id: "household", name: "Home", home: placeHomeIn("Home", "GB"), country: "GB" }),
          householdOf({ id: "gite", name: "Gîte", home: placeHomeIn("Gîte", "FR", 47.4, 0.7), country: "FR" }),
        ],
        "gite",
      ),
    );
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Country" })).toHaveTextContent("France"));
  });

  it("with one household and no country, is the UK as before", async () => {
    show(null);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Country" })).toHaveTextContent("United Kingdom"));
  });
});
