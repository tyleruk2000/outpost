import type { HttpsStatus, Settings } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpsSection } from "./https-section";
import { guessDevice } from "./https-steps";

const off = { "https.enabled": false, "https.names": "" } as Settings;
const on = { "https.enabled": true, "https.names": "" } as Settings;

const authority: HttpsStatus["authority"] = {
  name: "Outpost on kitchen-pi (2026-11-16)",
  fingerprint: "E7:D7:AE:11:2B:C4:43:99:79:14:AF:37:FC:A1:8D:35:BA:9F:B5:B3:4F:35:E9:9B:E8:3D:A9:CE:6C:AD:A4:FA",
  createdAt: Date.UTC(2026, 10, 15),
  expiresAt: Date.UTC(2036, 10, 13),
  permittedNames: ["local", "lan", "home", "internal", "home.arpa", "localhost", "kitchen-pi"],
  permittedBlocks: ["192.168.0.0/16"],
};

const status = (over: Partial<HttpsStatus> = {}): HttpsStatus => ({
  enabled: false,
  unavailable: null,
  listening: false,
  port: 8443,
  httpPort: 8080,
  problem: null,
  addresses: [],
  names: [],
  leftOut: [],
  authority: null,
  certificateExpiresAt: null,
  inContainer: false,
  lanAccess: true,
  authorityRight: { allowed: true, reason: "local", option: "OUTPOST_ALLOW_REMOTE_ERASE" },
  ...over,
});

const running = (over: Partial<HttpsStatus> = {}): HttpsStatus =>
  status({
    enabled: true,
    listening: true,
    addresses: [
      { url: "https://192.168.1.20:8443", name: "192.168.1.20", kind: "address" },
      { url: "https://kitchen-pi.local:8443", name: "kitchen-pi.local", kind: "name" },
      { url: "https://localhost:8443", name: "localhost", kind: "this-computer" },
      { url: "https://127.0.0.1:8443", name: "127.0.0.1", kind: "this-computer" },
    ],
    names: ["192.168.1.20", "kitchen-pi.local", "localhost", "127.0.0.1"],
    authority,
    certificateExpiresAt: Date.UTC(2027, 11, 18),
    ...over,
  });

function serve(answers: { status: HttpsStatus; replace?: HttpsStatus | { error: string }; remove?: HttpsStatus }) {
  const calls: string[] = [];
  const json = (body: unknown, code = 200) =>
    new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const call = `${init?.method ?? "GET"} ${url.pathname}`;
      calls.push(call);
      if (call === "GET /api/https") return json(answers.status);
      if (call === "POST /api/https/authority/replace") {
        return answers.replace && "error" in answers.replace
          ? json({ error: { code: "forbidden", message: answers.replace.error } }, 403)
          : json(answers.replace);
      }
      if (call === "DELETE /api/https/authority") return json(answers.remove);
      return json({}, 404);
    }),
  );
  return calls;
}

/** Puts the page at an address of the test's choosing for one test. */
function at(href: string) {
  const url = new URL(href);
  vi.stubGlobal("location", { protocol: url.protocol, hostname: url.hostname, host: url.host, href, origin: url.origin });
}

function show(settings: Settings) {
  const save = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HttpsSection settings={settings} disabled={false} save={save} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return save;
}

afterEach(() => vi.unstubAllGlobals());

describe("HTTPS on your network, in Settings", () => {
  it("has the title and the anchor other screens link to", async () => {
    serve({ status: status() });
    show(off);
    const heading = screen.getByRole("heading", { name: "HTTPS on your network" });
    expect(heading.closest("section")).toHaveAttribute("id", "https");
  });

  it("is one switch while it is off, and says that plain HTTP keeps working", async () => {
    serve({ status: status() });
    const save = show(off);
    expect(await screen.findByText(/on port 8443/)).toBeInTheDocument();
    expect(screen.getByText(/address keeps working and nothing is redirected/)).toBeInTheDocument();
    expect(screen.queryByText("Addresses to use")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Download certificate/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Use HTTPS" }));
    expect(save).toHaveBeenCalledWith("https.enabled", true);
  });

  it("says it is starting until the server reports the listener", async () => {
    serve({ status: status({ enabled: true }) });
    show(on);
    expect(await screen.findByText(/Starting HTTPS\. Making the keys takes a few seconds the first time/)).toBeInTheDocument();
  });

  it("shows the server's own words when HTTPS could not start", async () => {
    const problem =
      "Port 8443 is already in use on this computer, so HTTPS could not start. Start Outpost with OUTPOST_HTTPS_PORT set to a free port.";
    serve({ status: status({ enabled: true, problem }) });
    show(on);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("HTTPS is not running");
    expect(alert).toHaveTextContent(problem);
    expect(screen.queryByText(/Starting HTTPS/)).not.toBeInTheDocument();
  });

  it("lists the addresses for other devices, and offers this page over HTTPS", async () => {
    at("http://192.168.1.20:8080/settings");
    serve({ status: running() });
    show(on);
    expect(await screen.findByRole("link", { name: "https://192.168.1.20:8443" })).toHaveAttribute("href", "https://192.168.1.20:8443");
    expect(screen.getByRole("link", { name: "https://kitchen-pi.local:8443" })).toBeInTheDocument();
    // The computer's own addresses are one line, not rows among the ones for phones.
    expect(screen.queryByRole("link", { name: "https://127.0.0.1:8443" })).not.toBeInTheDocument();
    expect(screen.getByText(/On this computer itself:/)).toHaveTextContent("https://localhost:8443");
    expect(screen.getByRole("link", { name: "Open this page over HTTPS" })).toHaveAttribute(
      "href",
      "https://192.168.1.20:8443/settings#https",
    );
    expect(screen.getByText(/this device does not trust the certificate yet/)).toBeInTheDocument();
  });

  it("offers to add the address in use when the certificate does not list it", async () => {
    at("http://192.168.1.77:8080/settings");
    serve({ status: running({ inContainer: true }) });
    const save = show({ ...on, "https.names": "outpost.lan" });
    expect(await screen.findByText(/the address this browser is using, is not on the certificate/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add 192.168.1.77" }));
    expect(save).toHaveBeenCalledWith("https.names", "outpost.lan, 192.168.1.77");
    expect(screen.getByText(/In Docker the HTTPS port has to be published as well/)).toBeInTheDocument();
  });

  it("explains an empty list: not shared with the network, or inside a container", async () => {
    const own: HttpsStatus["addresses"] = [{ url: "https://localhost:8443", name: "localhost", kind: "this-computer" }];
    serve({ status: running({ addresses: own, names: ["localhost"], lanAccess: false }) });
    show(on);
    expect(await screen.findByText(/Only this computer can reach Outpost at the moment/)).toBeInTheDocument();
  });

  it("names what the certificate cannot carry, with the reason", async () => {
    serve({
      status: running({
        leftOut: [{ name: "outpost.example.net", reason: "This certificate authority signs only for names ending in .local, .lan." }],
      }),
    });
    const save = show({ ...on, "https.names": "outpost.example.net" });
    const list = (await screen.findByText("Not on the certificate")).parentElement as HTMLElement;
    expect(list).toHaveTextContent("outpost.example.net: This certificate authority signs only for names ending in .local, .lan.");
    const field = screen.getByLabelText("Other names and addresses");
    await userEvent.clear(field);
    await userEvent.type(field, "nas.lan{Enter}");
    expect(save).toHaveBeenCalledWith("https.names", "nas.lan");
  });

  it("offers the public certificate, its name and fingerprint, and says what trusting it means", async () => {
    serve({ status: running() });
    show(on);
    const download = await screen.findByRole("link", { name: /Download certificate/ });
    expect(download).toHaveAttribute("href", "/api/https/authority.crt");
    expect(download).toHaveAttribute("download", "outpost-authority.crt");
    expect(screen.getByText("Outpost on kitchen-pi (2026-11-16)")).toBeInTheDocument();
    expect(screen.getByText(authority?.fingerprint ?? "")).toBeInTheDocument();
    const meaning = screen.getByText(/Trusting it tells the device to believe a server that holds the matching key/);
    expect(meaning).toHaveTextContent(
      "names ending in .local, .lan, .home, .internal or .home.arpa, so it cannot vouch for a site on the internet",
    );
    expect(meaning).toHaveTextContent("Android does not check the limit");
    expect(meaning).toHaveTextContent("only a Mac was tried");
  });

  it("gives steps for each kind of device, and how to remove the certificate from each", async () => {
    serve({ status: running() });
    show(on);
    await screen.findByText("Trust the certificate on each device");
    const steps = (name: string) => screen.getByText(name, { selector: "summary" }).closest("details") as HTMLElement;
    expect(steps("iPhone and iPad")).toHaveTextContent("Settings › General › About › Certificate Trust Settings");
    expect(steps("iPhone and iPad")).toHaveTextContent("Enable full trust for root certificates");
    expect(steps("iPhone and iPad")).toHaveTextContent("To remove it again: go to Settings › General › VPN & Device Management");
    expect(steps("Android")).toHaveTextContent("Install a certificate, then CA certificate");
    expect(steps("Android")).toHaveTextContent("Trusted credentials, then User");
    expect(steps("Mac")).toHaveTextContent("Secure Sockets Layer (SSL) choose Always Trust");
    expect(steps("Windows")).toHaveTextContent("Trusted Root Certification Authorities");
    expect(steps("Windows")).toHaveTextContent("certmgr.msc");
    expect(steps("Firefox on a computer")).toHaveTextContent("Trust this CA to identify websites");
    expect(steps("Firefox on a computer")).toHaveTextContent("Delete or Distrust…");
    for (const name of ["iPhone and iPad", "Android", "Mac", "Windows", "Firefox on a computer"]) {
      expect(steps(name), name).toHaveTextContent("To remove it again:");
    }
  });

  it("opens the steps for the device in hand", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
    expect(guessDevice(iphone, 5)).toBe("apple-mobile");
    expect(guessDevice(mac, 0)).toBe("mac");
    // An iPad asking for desktop sites says it is a Mac, but has a touch screen.
    expect(guessDevice(mac, 5)).toBe("apple-mobile");
    expect(guessDevice("Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/142.0.0.0 Mobile Safari/537.36", 5)).toBe(
      "android",
    );
    expect(guessDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36", 0)).toBe("windows");
    expect(guessDevice("Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0", 0)).toBe("firefox");
    expect(guessDevice("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36", 0)).toBeNull();
  });

  it("makes a new certificate authority only after saying what that costs", async () => {
    const replaced = running({ authority: authority ? { ...authority, name: "Outpost on kitchen-pi (2026-12-01)" } : null });
    const calls = serve({ status: running(), replace: replaced });
    show(on);
    await userEvent.click(await screen.findByRole("button", { name: "Make a new certificate authority" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Every phone and computer that trusted it must be told to trust the new one");
    expect(calls).not.toContain("POST /api/https/authority/replace");
    await userEvent.click(within(dialog).getByRole("button", { name: "Make a new one" }));
    await waitFor(() => expect(calls).toContain("POST /api/https/authority/replace"));
    expect(await screen.findByText("Outpost on kitchen-pi (2026-12-01)")).toBeInTheDocument();
  });

  it("deletes the certificate authority only after saying what that means", async () => {
    const calls = serve({ status: running(), remove: status() });
    show(on);
    await userEvent.click(await screen.findByRole("button", { name: "Turn HTTPS off and delete it" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Remove the certificate from each device that trusted it as well");
    await userEvent.click(within(dialog).getByRole("button", { name: "Turn off and delete" }));
    await waitFor(() => expect(calls).toContain("DELETE /api/https/authority"));
    await waitFor(() => expect(screen.queryByRole("link", { name: /Download certificate/ })).not.toBeInTheDocument());
  });

  it("does not offer either on another device, and says why and how that can be changed", async () => {
    serve({ status: running({ authorityRight: { allowed: false, reason: "remote", option: "OUTPOST_ALLOW_REMOTE_ERASE" } }) });
    show(on);
    const notice = (await screen.findByText("Not offered on this device")).closest("[role=status]") as HTMLElement;
    expect(notice).toHaveTextContent("can only be done at the computer Outpost runs on");
    expect(notice).toHaveTextContent("OUTPOST_ALLOW_REMOTE_ERASE=true");
    expect(screen.queryByRole("button", { name: "Make a new certificate authority" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn HTTPS off and delete it" })).not.toBeInTheDocument();
    // The certificate itself is still there to download: a phone needs it.
    expect(screen.getByRole("link", { name: /Download certificate/ })).toBeInTheDocument();
  });

  it("asks before turning HTTPS off from the HTTPS address itself, and says where to carry on", async () => {
    at("https://192.168.1.20:8443/settings");
    serve({ status: running() });
    const save = show(on);
    expect(await screen.findByText("This browser is using the HTTPS address, and trusts the certificate.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Use HTTPS" }));
    expect(save).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Carry on at http://192.168.1.20:8080");
    await userEvent.click(within(dialog).getByRole("button", { name: "Turn HTTPS off" }));
    expect(save).toHaveBeenCalledWith("https.enabled", false);
  });

  it("is not offered from a portable drive", async () => {
    serve({ status: status({ unavailable: "portable" }) });
    show(off);
    expect(await screen.findByText(/Not offered from a portable drive/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Use HTTPS" })).toBeDisabled();
  });

  it("says so, with a way to try again, when the status cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "internal", message: "Something went wrong on the server." } }), {
            status: 500,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    show(off);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong on the server.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
