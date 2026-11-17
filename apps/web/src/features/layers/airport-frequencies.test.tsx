import type { AirportFrequenciesDto, ReferenceFeatureDetail } from "@outpost/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AIR_BAND_LINK, formatMhz } from "./airport-frequencies";
import { FeatureCard } from "./feature-card";

const airport = (airportFrequencies?: AirportFrequenciesDto): ReferenceFeatureDetail => ({
  id: 4,
  layer: "airports",
  kind: "large_airport",
  kindLabel: "Large airport",
  name: "London Heathrow Airport",
  altNames: ["LHR", "EGLL"],
  country: "GB",
  lat: 51.4706,
  lon: -0.461941,
  bbox: null,
  props: { ident: "EGLL", iata_code: "LHR" },
  provenance: "public-infrastructure",
  source: {
    provider: "ourairports",
    providerName: "OurAirports",
    sourceId: "EGLL",
    publisher: "OurAirports (David Megginson and contributors)",
    license: "Public domain",
    licenseUrl: null,
    sourceUrl: "https://ourairports.com/data/",
    publishedAt: "2026-11-17",
    retrievedAt: Date.UTC(2026, 10, 17),
    accuracy: "The airport's reference point as OurAirports lists it",
    accuracyMeters: null,
    provenance: "public-infrastructure",
    packId: "p1",
    packTitle: "Airports (OurAirports)",
  },
  alsoFrom: [],
  historical: null,
  hasGeometry: false,
  ...(airportFrequencies ? { airportFrequencies } : {}),
});

const show = (feature: ReferenceFeatureDetail) =>
  render(
    <MemoryRouter>
      <FeatureCard
        query={{ data: feature, isPending: false, isError: false, isSuccess: true } as unknown as UseQueryResult<ReferenceFeatureDetail>}
        alsoHere={[]}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />
    </MemoryRouter>,
  );

describe("an airport's radio frequencies on its card", () => {
  it("lists them in order, with the type in words only where certain, in MHz, and the cautions", async () => {
    show(
      airport({
        held: true,
        asOf: "2026-11-17",
        list: [
          { type: "TWR", typeLabel: "Tower", description: "Heathrow Tower", mhz: "118.5" },
          { type: "ATIS", typeLabel: null, description: "Heathrow ATIS", mhz: "113.75" },
          { type: "CLD", typeLabel: null, description: "Heathrow Delivery", mhz: "121.975" },
          { type: "8.33", typeLabel: null, description: "", mhz: "123.425" },
        ],
      }),
    );
    const list = screen.getByRole("list", { name: "Radio frequencies" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "TowerTWRHeathrow Tower118.500 MHz",
      "ATISHeathrow ATIS113.750 MHz",
      "CLDHeathrow Delivery121.975 MHz",
      "8.33123.425 MHz",
    ]);
    // It scrolls inside the card when long, on a phone as on a wide screen: about five rows show at once.
    expect(list.className).toMatch(/(^| )overflow-y-auto/);
    expect(list.className).toMatch(/(^| )max-h-/);
    expect(screen.getByText("4 listed")).toBeTruthy();
    // The caution in one line under the list; the rest behind the disclosure.
    expect(
      screen.getByText(
        "Not for navigation or flight planning: OurAirports' community list, as of 17 November 2026, may be out of date or wrong.",
      ),
    ).toBeTruthy();
    await userEvent.click(screen.getByText("About these frequencies"));
    expect(screen.getByText(/a community-maintained public-domain dataset/)).toBeTruthy();
    expect(screen.getByText(/Rules on listening to aviation and other non-broadcast traffic/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "The VHF air band in Frequencies to listen to" }).getAttribute("href")).toBe(AIR_BAND_LINK);
    // Its fields stay listed, without the frequencies.
    expect(screen.getByText("Everything the source gives")).toBeTruthy();
  });

  it("says no frequencies are listed when the file has none for the airport, not that there are none", () => {
    show(airport({ held: true, asOf: "2026-11-17", list: [] }));
    expect(screen.getByText("No frequencies listed in OurAirports' file of 17 November 2026.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Radio frequencies" })).toBeNull();
    expect(screen.queryByText(/Not for navigation/)).toBeNull();
  });

  it("says they are not held yet, and where to get them", () => {
    show(airport({ held: false, asOf: null, list: [] }));
    expect(screen.getByText(/Not held for this airport yet\. Update the airports pack/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reference data for the map" }).getAttribute("href")).toBe("/maps?reference=manage");
  });

  it("shows nothing about frequencies on any other record", () => {
    show(airport());
    expect(screen.queryByRole("heading", { name: "Radio frequencies" })).toBeNull();
  });

  it("writes MHz with three decimals at least, and anything else as given", () => {
    expect(formatMhz("118.5")).toBe("118.500");
    expect(formatMhz("122")).toBe("122.000");
    expect(formatMhz("121.9375")).toBe("121.9375");
    expect(formatMhz("abc")).toBe("abc");
  });

  it("puts the frequencies first on the card, straight under what the place is", () => {
    show(airport({ held: true, asOf: "2026-11-17", list: [{ type: "TWR", typeLabel: "Tower", description: "", mhz: "118.5" }] }));
    const list = screen.getByRole("list", { name: "Radio frequencies" });
    const provenance = screen.getByText("Published public record");
    expect(list.compareDocumentPosition(provenance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("folds to one line to leave the map clear, and opens out again", async () => {
    show(
      airport({
        held: true,
        asOf: "2026-11-17",
        list: [
          { type: "TWR", typeLabel: "Tower", description: "", mhz: "118.5" },
          { type: "ATIS", typeLabel: null, description: "", mhz: "113.75" },
        ],
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Show less" }));
    const folded = screen.getByRole("region", { name: "London Heathrow Airport: radio frequencies" });
    expect(folded).toHaveTextContent(/London Heathrow Airport\s*2 radio frequencies$/);
    expect(screen.queryByRole("list", { name: "Radio frequencies" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show the details" }));
    expect(screen.getByRole("list", { name: "Radio frequencies" })).toBeTruthy();
  });
});
