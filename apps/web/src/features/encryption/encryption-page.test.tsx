/**
 * The screen where the browser will not do cryptography (a page opened over plain HTTP
 * from another device), and what a signature check is allowed to say.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import EncryptionPage from "./encryption-page";
import type { KeyInfo, SignatureResult } from "./engine";
import type { ShelfKey } from "./keys-data";
import { SignatureReport } from "./parts";

function renderPage(path = "/encryption") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <EncryptionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("over plain HTTP", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("says why keys, text and files cannot work, points at the HTTPS setting, and asks the server for nothing", async () => {
    // What a browser gives a page on http://192.168.x.x: random numbers, but no SubtleCrypto.
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: <T extends ArrayBufferView<ArrayBuffer>>(values: T) => real.getRandomValues(values) });
    const fetched = vi.fn(() => Promise.reject(new Error("no request should be made")));
    vi.stubGlobal("fetch", fetched);
    const user = userEvent.setup();
    renderPage();

    // It opens on the half that works, and says first, above the tabs, what does not work here.
    expect(screen.getByRole("tab", { name: "By hand" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
    const httpsNotices = () => screen.getAllByRole("status").filter((status) => /need HTTPS/.test(status.textContent ?? ""));
    expect(httpsNotices()).toHaveLength(1);
    const notice = httpsNotices()[0]!;
    expect(within(notice).getByText("Keys, text, files and encrypted pages need HTTPS")).toBeInTheDocument();
    expect(within(notice).getByText(/encrypted page of your notes/)).toBeInTheDocument();
    expect(within(notice).getByText(/anyone on the network could alter the page/)).toBeInTheDocument();
    expect(within(notice).getByRole("link", { name: "Settings, HTTPS on your network" })).toHaveAttribute("href", "/settings#https");

    for (const name of ["Keys", "Text", "Files"]) {
      await user.click(screen.getByRole("tab", { name }));
      expect(httpsNotices()).toHaveLength(1);
      expect(screen.getByRole("tabpanel")).toHaveTextContent(/needs HTTPS, as the notice above says/);
      expect(screen.queryByRole("button", { name: "Make a key" })).not.toBeInTheDocument();
    }
    expect(fetched).not.toHaveBeenCalled();
  });

  it("still works a cipher", async () => {
    vi.stubGlobal("crypto", {});
    const user = userEvent.setup();
    renderPage("/encryption?tab=hand");
    await user.type(screen.getByLabelText("Message"), "Hello");
    expect(screen.getByTestId("cipher-output")).toHaveValue("Khoor");
    expect(screen.getByText(/not allowed on amateur radio/)).toBeInTheDocument();
  });
});

describe("what a signature check says", () => {
  const info = (change: Partial<KeyInfo> = {}): KeyInfo => ({
    fingerprint: "151fbadc2a20b68334bd7c9846c88eda032bf66d",
    keyId: "46c88eda032bf66d",
    keyIds: ["46c88eda032bf66d"],
    userIds: ["Gpg Person <gpg@example.org>"],
    name: "Gpg Person",
    email: "gpg@example.org",
    createdAt: 0,
    expiresAt: null,
    algorithm: "Curve25519",
    status: "valid",
    statusReason: null,
    canEncrypt: true,
    canSign: true,
    gnupgReadable: true,
    ...change,
  });
  const key = (change: Partial<ShelfKey> = {}): ShelfKey => ({
    fingerprint: info().fingerprint,
    info: info(),
    publicKey: "",
    mine: false,
    onShelf: true,
    privateOnDevice: false,
    privateOnOutpost: false,
    checkedAt: null,
    addedAt: 0,
    ...change,
  });
  const signature = (change: Partial<SignatureResult> = {}): SignatureResult => ({
    status: "good",
    keyId: "46c88eda032bf66d",
    fingerprint: info().fingerprint,
    signedAt: new Date(2026, 10, 16, 12, 0).getTime(),
    detail: null,
    ...change,
  });

  it("calls a good signature by an unchecked key good, and says it does not prove who signed", () => {
    render(<SignatureReport signatures={[signature()]} keys={[key()]} />);
    expect(screen.getByText("Good signature")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Fingerprint 151F BADC 2A20 B683 34BD 7C98 46C8 8EDA 032B F66D" })).toBeInTheDocument();
    expect(
      screen.getByText(/says it belongs to Gpg Person <gpg@example.org>, but nobody at this device has checked that/),
    ).toBeInTheDocument();
    expect(screen.getByText(/proves only that the holder of that key signed it/)).toBeInTheDocument();
    expect(screen.queryByText(/You marked that key as checked/)).not.toBeInTheDocument();
  });

  it("says so when the person has checked the key, and when the key is their own", () => {
    const { unmount } = render(<SignatureReport signatures={[signature()]} keys={[key({ checkedAt: new Date(2026, 10, 1).getTime() })]} />);
    expect(screen.getByText(/You marked that key as checked with its owner, Gpg Person, on/)).toBeInTheDocument();
    unmount();
    render(<SignatureReport signatures={[signature()]} keys={[key({ mine: true, privateOnDevice: true })]} />);
    expect(screen.getByText("That is your own key (Gpg Person).")).toBeInTheDocument();
  });

  it("never calls a signature good when it is bad, unchecked, or by a key that is no longer good", () => {
    const { unmount } = render(
      <SignatureReport signatures={[signature({ status: "bad", detail: "Signed digest did not match" })]} keys={[key()]} />,
    );
    expect(screen.getByText("Bad signature")).toBeInTheDocument();
    expect(screen.getByText(/Do not rely on it/)).toBeInTheDocument();
    expect(screen.queryByText("Good signature")).not.toBeInTheDocument();
    unmount();

    const second = render(<SignatureReport signatures={[signature({ status: "unknown-key", fingerprint: null })]} keys={[]} />);
    expect(screen.getByText("Signature not checked")).toBeInTheDocument();
    expect(screen.getByText(/This says nothing either way/)).toBeInTheDocument();
    expect(screen.queryByText("Good signature")).not.toBeInTheDocument();
    second.unmount();

    const third = render(
      <SignatureReport signatures={[signature({ status: "unusable-key", detail: "Primary key is revoked" })]} keys={[key()]} />,
    );
    expect(screen.getByText("Signature by a key that is no longer good")).toBeInTheDocument();
    expect(screen.getByText(/Treat the text\s+as unsigned/)).toBeInTheDocument();
    third.unmount();

    render(<SignatureReport signatures={[]} keys={[key()]} />);
    expect(screen.getByText("Not signed")).toBeInTheDocument();
  });
});
