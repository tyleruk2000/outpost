import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "../manage/test-support";
import { PhoneAddress } from "./phone-address";

afterEach(() => vi.unstubAllGlobals());

const httpsOff = { listening: false, addresses: [] };

describe("the address for phones", () => {
  it("shows the address this page is open at, with a QR code made here", async () => {
    fakeApi({ "GET /api/https": httpsOff });
    renderScreen(<PhoneAddress origin="http://192.168.1.30:8080" />, "/settings");
    expect(await screen.findByText("http://192.168.1.30:8080/")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "QR code: http://192.168.1.30:8080/" })).toBeInTheDocument();
  });

  it("prefers the network's HTTPS address, never this computer's own", async () => {
    fakeApi({
      "GET /api/https": {
        listening: true,
        addresses: [
          { url: "https://localhost:8443", name: "localhost", kind: "this-computer" },
          { url: "https://outpost.local:8443", name: "outpost.local", kind: "name" },
        ],
      },
    });
    renderScreen(<PhoneAddress origin="http://localhost:8090" />, "/settings");
    expect(await screen.findByRole("img", { name: "QR code: https://outpost.local:8443/" })).toBeInTheDocument();
  });

  it("says where to find it when this page is open at this computer's own address", async () => {
    fakeApi({ "GET /api/https": httpsOff });
    renderScreen(<PhoneAddress origin="http://localhost:8090" />, "/settings");
    expect(await screen.findByText(/cannot be shown here/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("hostname -I")).toBeInTheDocument();
  });
});
