import type { SatelliteAbout, SatellitesResponse, SatelliteWikipedia } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AboutSatellite, matchWords } from "./about-satellite";

const ELEMENTS = { MEAN_MOTION: 14.8, ECCENTRICITY: 0.006, INCLINATION: 97.6 };
const ARTICLE: SatelliteWikipedia = {
  noradId: 39444,
  title: "FUNcube-1",
  url: "https://en.wikipedia.org/wiki/FUNcube-1",
  description: "British amateur radio satellite",
  extract: "FUNcube-1 is a CubeSat.",
  foundBy: "number",
  searchedFor: "NORAD 39444",
  wikidataId: "Q15261051",
  archive: null,
  editedAt: null,
  fetchedAt: Date.parse("2026-11-24T09:00:00Z"),
};

function show(article: SatelliteWikipedia | null, data: Partial<SatellitesResponse> = {}, about: SatelliteAbout | null = null) {
  const client = new QueryClient();
  client.setQueryData(["satellites"], {
    satellites: [{ noradId: 53109, name: "GREENCUBE (IO-117)" }],
    wikipediaDiscarded: [],
    ...data,
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AboutSatellite
          noradId={article?.noradId ?? 53109}
          about={about}
          elements={ELEMENTS}
          transmitters={[]}
          wikipedia={article}
          detailsFetched
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("About this satellite: Wikipedia", () => {
  it("says how the article was matched, strongest first", () => {
    expect(matchWords(ARTICLE)).toBe("Matched by its catalogue number: Wikidata's entry Q15261051 for 39444 links to this article.");
    expect(matchWords({ ...ARTICLE, archive: { collectionId: "c", title: "Wikipedia", date: "2026-10-01" } })).toBe(
      "Matched by its catalogue number: the article's infobox gives 39444, this satellite's.",
    );
    expect(matchWords({ ...ARTICLE, foundBy: "series", title: "MetOp" })).toMatch(/about the series the satellite belongs to/);
    expect(matchWords({ ...ARTICLE, foundBy: "name", searchedFor: "Lusat" })).toMatch(/check it is about this satellite/);
  });

  it("credits a copy on this Outpost and opens it in the reader", () => {
    show({
      ...ARTICLE,
      url: "/library/read/c1/FUNcube-1",
      archive: { collectionId: "c1", title: "Wikipedia (English, all)", date: "2026-10-01" },
    });
    expect(screen.getByText(/From the Wikipedia copy on this Outpost \(Wikipedia \(English, all\), 1 Oct 2026\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "read “FUNcube-1”" })).toHaveAttribute("href", "/library/read/c1/FUNcube-1");
    expect(screen.getByRole("button", { name: "Discard this article" })).toBeInTheDocument();
  });

  it("names what was discarded, and offers it again", () => {
    show(null, { wikipediaDiscarded: [{ noradId: 53109, title: "Vega C" }] });
    expect(screen.getByText("Discarded before, so not offered again: “Vega C”.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Offer it again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read about it on Wikipedia" })).toBeInTheDocument();
  });

  it("flags a number CelesTrak and SatNOGS DB name differently", () => {
    const about: SatelliteAbout = {
      noradId: 53109,
      name: "MTCube 2",
      otherNames: ["ROBUSTA-1F", "FX6FRA"],
      status: "in orbit",
      launched: null,
      deployed: null,
      decayed: null,
      website: null,
      operator: null,
      countries: ["FR"],
      citation: null,
      frequencyViolator: false,
      associated: [],
    };
    show(null, {}, about);
    expect(screen.getByText("The two lists name this number differently")).toBeInTheDocument();
    expect(screen.getByText(/CelesTrak calls NORAD 53109 “GREENCUBE \(IO-117\)”; SatNOGS DB calls it “MTCube 2”/)).toBeInTheDocument();
  });
});
