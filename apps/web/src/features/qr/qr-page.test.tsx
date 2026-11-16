/** The QR codes screen against a stand-in server. Every person, place and network here is made up. */
import type { ContactDto, ContactListResponse } from "@outpost/shared";
import { emptyContactFields } from "@outpost/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import jsQR from "jsqr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "../manage/test-support";
import QrPage from "./qr-page";

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:qr");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Reads the code on screen with an independent decoder, from the squares of its SVG. */
function readCode(): string | null {
  const svg = screen.getByTestId("qr-code");
  const [, , extent] = svg.getAttribute("viewBox")!.split(" ").map(Number) as [number, number, number];
  const scale = 4;
  const width = extent * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  const path = svg.querySelector("path")!.getAttribute("d")!;
  for (const match of path.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
    const [x, y, length] = [Number(match[1]), Number(match[2]), Number(match[3])];
    for (let px = x * scale; px < (x + length) * scale; px += 1)
      for (let py = y * scale; py < (y + 1) * scale; py += 1) data.fill(0, (py * width + px) * 4, (py * width + px) * 4 + 3);
  }
  const result = jsQR(data, width, width);
  return result ? new TextDecoder().decode(new Uint8Array(result.binaryData)) : null;
}

async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("the QR codes screen", () => {
  it("waits for something to encode, then shows the code, its words and its size", async () => {
    const api = fakeApi({});
    const user = userEvent.setup();
    renderScreen(<QrPage />, "/tools/qr");
    expect(screen.getByRole("heading", { level: 1, name: "QR codes" })).toBeInTheDocument();
    expect(screen.getByText(/never sent to the server, stored, logged, put in a web address or kept in the browser/)).toBeInTheDocument();
    expect(screen.getByTestId("qr-waiting")).toHaveTextContent("Type the text or web address");
    await user.type(screen.getByLabelText("Text or web address"), "https://example.org/hut");
    expect(await screen.findByRole("img", { name: "QR code: example.org" })).toBeInTheDocument();
    expect(readCode()).toBe("https://example.org/hut");
    expect(screen.getByText(/Version \d+, \d+ × \d+ squares, 23 bytes/)).toBeInTheDocument();
    expect(screen.getByText(/at least 5 cm wide/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save as PNG/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save as SVG/ })).toBeInTheDocument();
    // Nothing went to the server for any of it.
    expect(api.requests).toEqual([]);
  });

  it("makes a Wi-Fi code without a request, and asks before it goes in the library", async () => {
    const api = fakeApi({});
    const user = userEvent.setup();
    renderScreen(<QrPage />, "/tools/qr");
    await choose(user, "What the code holds", "Wi-Fi network");
    await user.type(screen.getByLabelText("Network name"), "Hut; upstairs");
    expect(screen.getByTestId("qr-waiting")).toHaveTextContent("password");
    await user.type(screen.getByLabelText("Password"), "correct:horse");
    await screen.findByRole("img", { name: "QR code: Wi-Fi: Hut; upstairs" });
    expect(readCode()).toBe("WIFI:T:WPA;S:Hut\\; upstairs;P:correct\\:horse;;");
    const words = screen.getByRole("region", { name: "The code" });
    expect(within(words).getByText("in the code, not written here")).toBeInTheDocument();
    expect(within(words).queryByText("correct:horse")).toBeNull();
    await user.click(screen.getByLabelText(/Write the password in words/));
    expect(within(words).getByText("correct:horse")).toBeInTheDocument();
    // The sheet is made on this device; adding it asks first and says why.
    const add = await screen.findByRole("button", { name: /Add to library/ });
    await waitFor(() => expect(add).toBeEnabled());
    await user.click(add);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Put a Wi-Fi password in the library?");
    expect(dialog).toHaveTextContent(/everyone who can reach Outpost on your network/);
    expect(dialog).toHaveTextContent(/backup/);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.requests).toEqual([]);
    // Nothing typed was kept in the browser or put in the address.
    expect(JSON.stringify({ ...localStorage })).not.toContain("correct");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("correct");
    expect(window.location.href).not.toContain("correct");
  });

  it("says copying a picture needs a secure page where it is not one", async () => {
    fakeApi({});
    const user = userEvent.setup();
    renderScreen(<QrPage />, "/tools/qr");
    await user.type(screen.getByLabelText("Text or web address"), "Water point 3");
    await screen.findByTestId("qr-code");
    expect(screen.queryByRole("button", { name: /Copy picture/ })).toBeNull();
    expect(screen.getByText(/Copying the picture needs a secure \(https\) page/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy text/ })).toBeInTheDocument();
  });

  it("makes a contact from Contacts with the fields chosen, after loading and on error", async () => {
    const maya: ContactDto = {
      ...emptyContactFields(),
      id: "c1",
      displayName: "Maya Okafor",
      name: { prefix: "", given: "Maya", additional: "", family: "Okafor", suffix: "" },
      phones: [{ value: "+44 7700 900123", label: "mobile" }],
      emails: [{ value: "maya@okafor.example", label: "home" }],
      note: "Spare key",
      place: null,
      pages: [],
      otherFields: [],
      source: "manual",
      createdAt: 1,
      updatedAt: 2,
    };
    const list: ContactListResponse = {
      contacts: [
        {
          id: "c1",
          kind: "person",
          displayName: "Maya Okafor",
          initial: "O",
          detail: "",
          phones: maya.phones,
          emails: maya.emails,
          tags: [],
          isEmergency: false,
          emergencyNote: "",
          callsign: "",
        },
      ],
      total: 1,
      all: 1,
      emergency: 0,
      tags: [],
    };
    const api = fakeApi({ "GET /api/contacts": list, "GET /api/contacts/c1": { contact: maya } });
    const user = userEvent.setup();
    renderScreen(<QrPage />, "/tools/qr");
    await choose(user, "What the code holds", "Contact");
    await user.click(screen.getByRole("radio", { name: "From Contacts" }));
    await choose(user, "Contact", "Maya Okafor");
    await screen.findByRole("img", { name: "QR code: Maya Okafor" });
    expect(readCode()).toContain("TEL;TYPE=CELL:+44 7700 900123");
    expect(readCode()).not.toContain("NOTE");
    await user.click(screen.getByLabelText("Note: Spare key"));
    await waitFor(() => expect(readCode()).toContain("NOTE:Spare key"));
    // The list was asked for whole: nothing typed on this screen went with it.
    expect(api.requests.map((request) => request.call)).toEqual(["GET /api/contacts", "GET /api/contacts/c1"]);
    const add = screen.getByRole("button", { name: /Add to library/ });
    await waitFor(() => expect(add).toBeEnabled());
    await user.click(add);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Put someone’s contact details in the library?");
  });

  it("says when the contacts could not be loaded, and when there are none", async () => {
    fakeApi({ "GET /api/contacts": { status: 500, error: { code: "internal", message: "The database is busy." } } });
    const user = userEvent.setup();
    renderScreen(<QrPage />, "/tools/qr");
    await choose(user, "What the code holds", "Contact");
    await user.click(screen.getByRole("radio", { name: "From Contacts" }));
    expect(await screen.findByText("This could not be loaded")).toBeInTheDocument();
  });

  it("says when there are no saved places", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [] } });
    const user = userEvent.setup();
    renderScreen(<QrPage />, "/tools/qr");
    await choose(user, "What the code holds", "Saved place");
    expect(await screen.findByText(/No places are saved on the map yet/)).toBeInTheDocument();
  });

  it("says when there is too much for one code", async () => {
    fakeApi({});
    const user = userEvent.setup();
    renderScreen(<QrPage />, "/tools/qr");
    const box = screen.getByLabelText("Text or web address");
    await user.click(box);
    await user.paste("x".repeat(3000));
    expect(await screen.findByText("Too much for one code")).toBeInTheDocument();
  });
});
