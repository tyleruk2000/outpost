import { screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fakeServer, installBrowserStubs, renderScreen } from "../../downloads/test-support";
import { AddRegion } from "./add-region";

beforeAll(installBrowserStubs);
afterEach(() => vi.unstubAllGlobals());

const snowdonia = {
  id: "snowdonia",
  name: "Snowdonia",
  bbox: [-4.2, 52.9, -3.7, 53.2],
  recommendedMaxZoom: 14,
  installed: false,
  collectionIds: [],
  downloadId: null,
};

function serve() {
  return fakeServer({
    "GET /api/maps/regions": { groups: [{ name: "Wales", regions: [snowdonia] }] },
    "GET /api/storage/locations": {
      roots: [],
      locations: [{ id: "loc1", name: "Internal storage", status: "available", isDefault: true, freeBytes: 100e9, totalBytes: 200e9 }],
    },
  });
}

describe("the choices before a map region is downloaded", () => {
  it("says, before anything is asked, that the size comes from the map server and needs a connection", async () => {
    const server = serve();
    renderScreen(<AddRegion engine={null} initialPresetId="snowdonia" onClose={() => {}} onNeedMap={() => {}} onNeedRoom={() => {}} />);
    expect(await screen.findByText(/map tiles\. How many megabytes that is depends on what is in the area/)).toBeInTheDocument();
    expect(screen.getByText(/asks the map server\. That needs an internet connection/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check the size" })).toBeInTheDocument();
    expect(server.calls.some((call) => call.includes("/api/maps/estimate"))).toBe(false);
  });

  it("puts the main button on the right of its row, after Cancel", async () => {
    serve();
    renderScreen(<AddRegion engine={null} initialPresetId="snowdonia" onClose={() => {}} onNeedMap={() => {}} onNeedRoom={() => {}} />);
    const download = await screen.findByRole("button", { name: "Download" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel.compareDocumentPosition(download) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(download.parentElement).toHaveClass("justify-end");
  });
});
