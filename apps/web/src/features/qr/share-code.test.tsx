import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "../manage/test-support";
import { ShareCodeButton, shareText } from "./share-code";

afterEach(() => vi.unstubAllGlobals());

const place = { name: "Scafell Pike", outpostPath: "/maps?marker=m1", geo: { lat: 54.4542, lon: -3.2116 } };
const route = { name: "Round of the Langdales", outpostPath: "/maps?track=t1", gpxPath: "/api/maps/tracks/t1/export.gpx" };

const https = (listening: boolean) => ({
  listening,
  addresses: listening
    ? [
        { url: "https://outpost.local:8443", name: "outpost.local", kind: "name" },
        { url: "https://localhost:8443", name: "localhost", kind: "this-computer" },
        { url: "https://192.168.1.20:8443", name: "192.168.1.20", kind: "address" },
      ]
    : [],
});

describe("what a shared code holds", () => {
  it("is a link into Outpost at an address a phone can use, a geo: link, or the GPX file's address", () => {
    expect(shareText("outpost", place, "https://192.168.1.20:8443")).toEqual({ text: "https://192.168.1.20:8443/maps?marker=m1" });
    expect(shareText("geo", place, null)).toEqual({ text: "geo:54.454200,-3.211600" });
    expect(shareText("gpx", route, "http://192.168.1.20:8080")).toEqual({ text: "http://192.168.1.20:8080/api/maps/tracks/t1/export.gpx" });
    // With no address a phone can reach, only the geo: link can be made.
    expect(shareText("outpost", place, null)).toEqual({ missing: "address" });
    expect(shareText("geo", route, null)).toEqual({ missing: "nothing" });
  });
});

describe("the QR code dialog", () => {
  it("draws the code for Outpost at the network's HTTPS address, never this computer's own", async () => {
    fakeApi({ "GET /api/https": https(true), "GET /api/system": { lanAccess: true } });
    renderScreen(<ShareCodeButton target={place} />, "/maps");
    await userEvent.click(screen.getByRole("button", { name: "QR code" }));
    expect(await screen.findByText("https://outpost.local:8443/maps?marker=m1")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "QR code: https://outpost.local:8443/maps?marker=m1" })).toBeInTheDocument();
    expect(screen.queryByText(/localhost/)).toBeNull();

    await userEvent.click(screen.getByRole("radio", { name: "Map apps (geo:)" }));
    expect(screen.getByText("geo:54.454200,-3.211600")).toBeInTheDocument();
    expect(screen.getByText(/Any map app on a phone opens the point, with no network at all/)).toBeInTheDocument();
  });

  it("says when this page is open at an address a phone cannot use, and offers only what the thing has", async () => {
    fakeApi({ "GET /api/https": https(false), "GET /api/system": { lanAccess: false } });
    renderScreen(<ShareCodeButton target={route} />, "/maps");
    await userEvent.click(screen.getByRole("button", { name: "QR code" }));
    expect(await screen.findByText("No address a phone can use")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("radio", { name: "GPX file" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Map apps (geo:)" })).toBeNull();
  });
});
