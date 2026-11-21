import { parseCelestrakCsv, type SatellitesResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import SatellitesPage from "./satellites-page";

const HEADER =
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT";
const now = Date.now();
const epoch = new Date(now - 2 * 86_400_000).toISOString().replace("Z", "");
const iss = parseCelestrakCsv(
  `${HEADER}\nISS (ZARYA),1998-067A,${epoch},15.49527370,.0007384,51.6319,243.0636,49.3258,310.8372,0,U,25544,999,59609,.2073332E-3,.11207E-3,0`,
  "amateur",
);

function show(data: SatellitesResponse, settings: Record<string, unknown> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } } });
  client.setQueryData(["satellites"], data);
  client.setQueryData(["maps", "markers"], {
    markers: [{ id: "h", name: "Home", lat: 51.5074, lon: -0.1278, icon: "home", createdAt: 1 }],
  });
  client.setQueryData(["settings"], { settings: { "radio.licensed": false, ...settings } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SatellitesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sources = (fetchedAt: number | null): SatellitesResponse["sources"] => [
  { id: "celestrak", label: "CelesTrak", url: "", fetchedAt, count: 1, error: null, triedAt: fetchedAt },
  { id: "satnogs", label: "SatNOGS DB", url: "", fetchedAt, count: 1, error: null, triedAt: fetchedAt },
];

describe("the Satellites screen", () => {
  it("asks for a press before anything is fetched", () => {
    show({ satellites: [], transmitters: [], sources: sources(null), fetching: false, now });
    expect(screen.getByRole("heading", { name: "No orbital elements yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get orbital elements" })).toBeInTheDocument();
  });

  it("lists passes over Home, and opens one satellite with its transmitters and sky track", { timeout: 20_000 }, async () => {
    const user = userEvent.setup();
    show({
      satellites: iss,
      transmitters: [
        {
          id: "t",
          noradId: 25544,
          description: "FM voice repeater",
          alive: true,
          status: "active",
          type: "Transceiver",
          mode: "FM",
          uplinkLowHz: 145_990_000,
          uplinkHighHz: null,
          downlinkLowHz: 437_800_000,
          downlinkHighHz: null,
          invert: false,
          baud: null,
          updatedAt: null,
        },
      ],
      sources: sources(now),
      fetching: false,
      now,
    });
    expect(screen.getByText(/1 satellite, from CelesTrak/)).toBeInTheDocument();
    expect(await screen.findByText(/passes? of amateur satellites/, {}, { timeout: 5000 })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "One satellite" }));
    expect(await screen.findByRole("heading", { name: "ISS (ZARYA)" })).toBeInTheDocument();
    expect(screen.getByText("FM voice repeater")).toBeInTheDocument();
    expect(screen.getByText(/Sending to a satellite needs an amateur licence/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Sky track/ })).toBeInTheDocument();
  });

  it("warns when the elements are old", () => {
    const old = parseCelestrakCsv(
      `${HEADER}\nISS (ZARYA),1998-067A,${new Date(now - 40 * 86_400_000).toISOString().replace("Z", "")},15.49527370,.0007384,51.6319,243.0636,49.3258,310.8372,0,U,25544,999,59609,.2073332E-3,.11207E-3,0`,
      "amateur",
    );
    show({ satellites: old, transmitters: [], sources: sources(now), fetching: false, now });
    expect(screen.getByText("These elements are getting old")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Weather satellites" }));
  });
});
