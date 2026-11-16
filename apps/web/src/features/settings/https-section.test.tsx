import { type HttpsOwnCertificate, type HttpsStatus, PLAIN_HTTP_ACCEPTED_FIELD, type Settings } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpsSection } from "./https-section";
import { guessDevice } from "./https-steps";

const off = { "https.enabled": false, "https.certificate": "outpost", "https.names": "" } as Settings;
const on = { "https.enabled": true, "https.certificate": "outpost", "https.names": "" } as Settings;
const onOwn = { "https.enabled": true, "https.certificate": "own", "https.names": "" } as Settings;

const authority: HttpsStatus["authority"] = {
  name: "Outpost on kitchen-pi (2026-11-16)",
  fingerprint: "E7:D7:AE:11:2B:C4:43:99:79:14:AF:37:FC:A1:8D:35:BA:9F:B5:B3:4F:35:E9:9B:E8:3D:A9:CE:6C:AD:A4:FA",
  createdAt: Date.UTC(2026, 10, 15),
  expiresAt: Date.UTC(2036, 10, 13),
  permittedNames: ["local", "lan", "home", "internal", "home.arpa", "localhost", "kitchen-pi"],
  permittedBlocks: ["192.168.0.0/16"],
};

const noOwn: HttpsStatus["own"] = {
  folder: "/srv/outpost/data/tls/own",
  files: { certificate: "fullchain.pem", key: "privkey.pem" },
  inFolder: { certificate: false, key: false },
  certificate: null,
  expiry: null,
  problem: null,
  keyRight: { allowed: true, reason: "local" },
};

const status = (over: Partial<HttpsStatus> = {}): HttpsStatus => ({
  enabled: false,
  source: "outpost",
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
  own: noOwn,
  ...over,
});

/** A certificate from a home authority, covering the name the server is reached by and not its address. */
const mine = (over: Partial<HttpsOwnCertificate> = {}): HttpsOwnCertificate => ({
  name: "kitchen-pi.local",
  issuer: "Hill House Issuing 1",
  fingerprint: "5C:78:51:0A:42:F0:0A:CA:A1:C7:A6:B2:5D:B6:55:FA:40:EA:6E:6C:C0:09:A4:D7:11:D7:D1:D5:D8:88:1E:7F",
  validFrom: Date.now() - 30 * 86_400_000,
  expiresAt: Date.now() + 60 * 86_400_000 + 3_600_000,
  key: "ECDSA P-256",
  names: ["kitchen-pi.local"],
  chain: ["Hill House Issuing 1"],
  trust: "private",
  anchor: { name: "Hill House Root", fingerprint: "AA:BB:CC", held: true },
  covered: ["kitchen-pi.local"],
  notCovered: [],
  notAnswered: [],
  warnings: [],
  notes: [],
  ...over,
});

/** HTTPS running with the person's own certificate. */
const runningOwn = (
  certificate: Partial<HttpsOwnCertificate> = {},
  own: Partial<HttpsStatus["own"]> = {},
  over: Partial<HttpsStatus> = {},
) =>
  status({
    enabled: true,
    source: "own",
    listening: true,
    addresses: [{ url: "https://kitchen-pi.local:8443", name: "kitchen-pi.local", kind: "name" }],
    names: ["kitchen-pi.local"],
    certificateExpiresAt: Date.now() + 60 * 86_400_000,
    own: { ...noOwn, inFolder: { certificate: true, key: true }, certificate: mine(certificate), expiry: "ok", ...own },
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

function serve(answers: {
  status: HttpsStatus;
  replace?: HttpsStatus | { error: string };
  remove?: HttpsStatus;
  /** The answer to a certificate given by upload, or taken from the folder. */
  give?: HttpsStatus | { error: string };
  removeOwn?: HttpsStatus;
  /** What was sent with an upload: each part's name, and a file's name or a field's text. */
  sent?: Array<[string, string]>;
}) {
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
      if (call === "POST /api/https/own" || call === "POST /api/https/own/use") {
        if (init?.body instanceof FormData) {
          for (const [name, value] of init.body.entries()) answers.sent?.push([name, typeof value === "string" ? value : value.name]);
        }
        return answers.give && "error" in answers.give
          ? json({ error: { code: "bad_request", message: answers.give.error } }, 400)
          : json(answers.give);
      }
      if (call === "DELETE /api/https/own") return json(answers.removeOwn);
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
    expect(download).toHaveAttribute("href", "/api/https/outpost-authority.crt");
    // An ordinary link, not a forced download: an iPhone has to see a certificate arrive to offer to install it.
    expect(download).not.toHaveAttribute("download");
    expect(screen.getByText("Listed on devices as").parentElement).toHaveTextContent("Outpost on kitchen-pi (2026-11-16)");
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
    expect(steps("iPhone and iPad")).toHaveTextContent("Enable full trust for root certificates, turn on trust for Outpost on kitchen-pi");
    expect(steps("iPhone and iPad")).toHaveTextContent(
      "Go to Settings › General › VPN & Device Management, select the profile, and tap Delete Profile",
    );
    expect(steps("Android")).toHaveTextContent("Install a certificate, then CA certificate");
    expect(steps("Android")).toHaveTextContent("Trusted credentials, then User");
    expect(steps("Mac")).toHaveTextContent("Secure Sockets Layer (SSL) choose Always Trust");
    expect(steps("Windows")).toHaveTextContent("Trusted Root Certification Authorities");
    expect(steps("Windows")).toHaveTextContent("certmgr.msc");
    expect(steps("Firefox, on any computer")).toHaveTextContent("Trust this CA to identify websites");
    expect(steps("Firefox, on any computer")).toHaveTextContent("Delete or Distrust…");
    for (const name of ["iPhone and iPad", "Android", "Mac", "Windows", "Linux", "Firefox, on any computer"]) {
      expect(steps(name), name).toHaveTextContent("Check it worked");
      expect(steps(name), name).toHaveTextContent("To remove it again");
      // Each set of steps starts by fetching the file, in the form that kind of device wants.
      const link = within(steps(name)).getByRole("link", { name: "Download the certificate", hidden: true });
      expect(link, name).toHaveAttribute(
        "href",
        name === "Linux" ? "/api/https/outpost-authority.pem" : "/api/https/outpost-authority.crt",
      );
      expect(link, name).not.toHaveAttribute("download");
    }
  });

  it("gives the command line as well as the windows, with this server's own file and address in each command", async () => {
    serve({ status: running() });
    show(on);
    await screen.findByText("Trust the certificate on each device");
    const steps = (name: string) => screen.getByText(name, { selector: "summary" }).closest("details") as HTMLElement;
    expect(steps("Mac")).toHaveTextContent(
      "security add-trusted-cert -r trustRoot -p ssl -k ~/Library/Keychains/login.keychain-db ~/Downloads/outpost-authority.crt",
    );
    expect(steps("Mac")).toHaveTextContent("security verify-cert https://192.168.1.20:8443");
    expect(steps("Mac")).toHaveTextContent('security delete-certificate -c "Outpost on kitchen-pi (2026-11-16)"');
    expect(steps("Windows")).toHaveTextContent('certutil -user -addstore Root "%USERPROFILE%\\Downloads\\outpost-authority.crt"');
    expect(steps("Windows")).toHaveTextContent("-CertStoreLocation Cert:\\CurrentUser\\Root");
    expect(steps("Windows")).toHaveTextContent('certutil -user -delstore Root "Outpost on kitchen-pi (2026-11-16)"');
    // Debian wants the text form under a name ending .crt; the others take it as it is.
    expect(steps("Linux")).toHaveTextContent(
      "sudo cp ~/Downloads/outpost-authority.pem /usr/local/share/ca-certificates/outpost-authority.crt sudo update-ca-certificates",
    );
    expect(steps("Linux")).toHaveTextContent(
      "sudo cp ~/Downloads/outpost-authority.pem /etc/pki/ca-trust/source/anchors/ sudo update-ca-trust",
    );
    expect(steps("Linux")).toHaveTextContent("sudo trust anchor ~/Downloads/outpost-authority.pem");
    expect(steps("Linux")).toHaveTextContent("sudo cp ~/Downloads/outpost-authority.pem /etc/pki/trust/anchors/");
    expect(steps("Linux")).toHaveTextContent("chrome://certificate-manager");
    expect(steps("Linux")).toHaveTextContent("curl https://192.168.1.20:8443/api/health");
    expect(steps("Linux")).toHaveTextContent("sudo update-ca-certificates --fresh");
  });

  it("puts the steps straight after the addresses, and says where a phone opens this page", async () => {
    at("http://localhost:8080/settings");
    serve({ status: running() });
    show(on);
    const heading = await screen.findByRole("heading", { name: "Trust the certificate on each device" });
    // Before the upkeep: a person who has just turned HTTPS on needs the steps next.
    const names = screen.getByLabelText("Other names and addresses");
    expect(heading.compareDocumentPosition(names) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/On a phone or another computer, open this page there first/)).toHaveTextContent(
      "http://192.168.1.20:8080/settings#https",
    );
    expect(screen.getByRole("link", { name: "As text (PEM), for Linux and commands" })).toHaveAttribute(
      "href",
      "/api/https/outpost-authority.pem",
    );
  });

  it("does not tell a phone to open the page it is already on, and marks its own steps", async () => {
    at("http://192.168.1.20:8080/settings");
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      maxTouchPoints: 5,
    });
    serve({ status: running() });
    show(on);
    await screen.findByText("Trust the certificate on each device");
    expect(screen.queryByText(/open this page there first/)).not.toBeInTheDocument();
    const iphone = screen.getByText("iPhone and iPad", { selector: "summary" });
    expect(iphone).toHaveTextContent("This device");
    expect(iphone.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Mac", { selector: "summary" }).closest("details")).not.toHaveAttribute("open");
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
    expect(guessDevice("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36", 0)).toBe("linux");
    expect(guessDevice("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36", 0)).toBeNull();
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
    await waitFor(() =>
      expect(screen.getByText("Listed on devices as").parentElement).toHaveTextContent("Outpost on kitchen-pi (2026-12-01)"),
    );
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

describe("a certificate of your own, in Settings", () => {
  const file = (name: string) => new File(["-----BEGIN CERTIFICATE-----"], name);
  const open = async () => {
    const summary = await screen.findByText("Use a certificate of your own instead", { selector: "summary" });
    await userEvent.click(summary);
    return summary.closest("details") as HTMLElement;
  };

  it("is one closed line for a person who does not need it, with HTTPS on or off", async () => {
    serve({ status: running() });
    show(on);
    const summary = await screen.findByText("Use a certificate of your own instead", { selector: "summary" });
    expect(summary.closest("details")).not.toHaveAttribute("open");
    // The simple case is unchanged beside it.
    expect(screen.getByRole("heading", { name: "Trust the certificate on each device" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your certificate" })).not.toBeInTheDocument();
  });

  it("takes the certificate and key chosen here, and turns to them when the server accepts", async () => {
    const sent: Array<[string, string]> = [];
    const calls = serve({ status: status(), give: runningOwn(), sent });
    show(off);
    const choice = await open();
    expect(choice).toHaveTextContent("Most people do not need this");
    expect(choice).toHaveTextContent("Offered here because you are at the computer Outpost runs on");
    const use = within(choice).getByRole("button", { name: "Use this certificate" });
    expect(use).toBeDisabled();
    await userEvent.upload(within(choice).getByLabelText("Certificate file"), file("fullchain.pem"));
    await userEvent.upload(within(choice).getByLabelText("Key file"), file("privkey.pem"));
    expect(choice).toHaveTextContent("fullchain.pem");
    await userEvent.click(use);
    await waitFor(() => expect(calls).toContain("POST /api/https/own"));
    expect(sent).toEqual([
      ["certificate", "fullchain.pem"],
      ["key", "privkey.pem"],
    ]);
    // The section now shows the person's certificate in place of Outpost's own part.
    expect(await screen.findByRole("heading", { name: "Your certificate" })).toBeInTheDocument();
    expect(screen.queryByText("Use a certificate of your own instead")).not.toBeInTheDocument();
  });

  it("asks for the password of a .pfx file in place of the key, and shows a refusal in the server's words", async () => {
    const sent: Array<[string, string]> = [];
    const refusal = "That is not the password this file was exported with.";
    serve({ status: status(), give: { error: refusal }, sent });
    show(off);
    const choice = await open();
    await userEvent.upload(within(choice).getByLabelText("Certificate file"), file("outpost.pfx"));
    expect(within(choice).queryByLabelText("Key file")).not.toBeInTheDocument();
    await userEvent.type(within(choice).getByLabelText("Password of the file"), "hunter2");
    expect(choice).toHaveTextContent("It is used once, to open the file, and is not kept");
    await userEvent.click(within(choice).getByRole("button", { name: "Use this certificate" }));
    const alert = await within(choice).findByRole("alert");
    expect(alert).toHaveTextContent("Not used");
    expect(alert).toHaveTextContent(refusal);
    expect(sent).toEqual([
      ["certificate", "outpost.pfx"],
      ["password", "hunter2"],
    ]);
    // Nothing changed: still the choice, not a certificate in use.
    expect(screen.queryByRole("heading", { name: "Your certificate" })).not.toBeInTheDocument();
  });

  it("offers the upload with no warning on the computer Outpost runs on, opened at its network address", async () => {
    // The server decides: a browser on the computer itself, at 192.168.1.20, arrives from that address and counts as local.
    at("http://192.168.1.20:8080/settings");
    serve({ status: running() });
    show(on);
    const choice = await open();
    expect(choice).toHaveTextContent("Offered here because you are at the computer Outpost runs on");
    expect(within(choice).queryByText("This page is open over plain http")).not.toBeInTheDocument();
    expect(within(choice).queryByRole("checkbox")).not.toBeInTheDocument();
    await userEvent.upload(within(choice).getByLabelText("Certificate file"), file("fullchain.pem"));
    expect(within(choice).getByRole("button", { name: "Use this certificate" })).toBeEnabled();
  });

  it("on another device over plain http, says what sending the key gives away, and sends only once the box is ticked", async () => {
    at("http://192.168.1.77:8080/settings");
    const sent: Array<[string, string]> = [];
    const remote = { ...noOwn, keyRight: { allowed: false, reason: "remote" } as const, inFolder: { certificate: true, key: false } };
    const calls = serve({ status: status({ own: remote }), give: runningOwn({}, { keyRight: remote.keyRight }), sent });
    const save = show(off);
    const choice = await open();
    const warning = within(choice).getByText("This page is open over plain http").closest("[role=status]") as HTMLElement;
    expect(warning).toHaveTextContent("the private key crosses your network unencrypted, and so does the password of a .pfx or .p12 file");
    expect(warning).toHaveTextContent("pass off another server as this Outpost to every device that trusts the certificate");
    // The two better ways, each one press or one line away.
    await userEvent.click(within(warning).getByRole("button", { name: "Turn on HTTPS" }));
    expect(save).toHaveBeenCalledWith("https.enabled", true);
    expect(warning).toHaveTextContent("Put the two files in /srv/outpost/data/tls/own on the computer Outpost runs on");

    const use = within(choice).getByRole("button", { name: "Use this certificate" });
    await userEvent.upload(within(choice).getByLabelText("Certificate file"), file("fullchain.pem"));
    await userEvent.upload(within(choice).getByLabelText("Key file"), file("privkey.pem"));
    expect(use).toBeDisabled();
    const tick = within(choice).getByRole("checkbox", { name: /I accept that my private key.*will cross my network unencrypted/ });
    await userEvent.click(tick);
    expect(use).toBeEnabled();
    await userEvent.click(use);
    await waitFor(() => expect(calls).toContain("POST /api/https/own"));
    expect(sent).toEqual([
      [PLAIN_HTTP_ACCEPTED_FIELD, "yes"],
      ["certificate", "fullchain.pem"],
      ["key", "privkey.pem"],
    ]);
    expect(await screen.findByRole("heading", { name: "Your certificate" })).toBeInTheDocument();
  });

  it("on another device over plain http with HTTPS running, links to this page over HTTPS, and still offers the folder", async () => {
    at("http://192.168.1.20:8080/settings");
    const remote = { ...noOwn, keyRight: { allowed: false, reason: "remote" } as const, inFolder: { certificate: true, key: false } };
    const calls = serve({
      status: running({ own: remote }),
      give: { error: "Outpost looked in /srv/outpost/data/tls/own and did not find privkey.pem." },
    });
    show(on);
    const choice = await open();
    const warning = within(choice).getByText("This page is open over plain http").closest("[role=status]") as HTMLElement;
    expect(within(warning).getByRole("link", { name: "Open this page over HTTPS" })).toHaveAttribute(
      "href",
      "https://192.168.1.20:8443/settings#https",
    );
    expect(within(warning).queryByRole("button", { name: "Turn on HTTPS" })).not.toBeInTheDocument();

    // The folder, with its exact file names, and which of the two is there.
    const rows = within(choice)
      .getAllByRole("listitem")
      .filter((row) => row.textContent?.includes("/srv/outpost/data/tls/own/"));
    expect(rows[0]).toHaveTextContent("/srv/outpost/data/tls/own/fullchain.pem");
    expect(rows[0]).toHaveTextContent("There");
    expect(rows[1]).toHaveTextContent("/srv/outpost/data/tls/own/privkey.pem");
    expect(rows[1]).toHaveTextContent("Not there yet");
    expect(choice).toHaveTextContent("Outpost looks at the folder every half minute and takes up new files by itself");
    await userEvent.click(within(choice).getByRole("button", { name: "Use them" }));
    await waitFor(() => expect(calls).toContain("POST /api/https/own/use"));
    expect(await within(choice).findByRole("alert")).toHaveTextContent("did not find privkey.pem");
  });

  it("says upload is allowed over HTTPS, with no warning, and that the folder path is the container's in Docker", async () => {
    at("https://192.168.1.77:8443/settings");
    serve({
      status: status({ inContainer: true, own: { ...noOwn, folder: "/data/tls/own", keyRight: { allowed: true, reason: "https" } } }),
    });
    show(off);
    const choice = await open();
    expect(choice).toHaveTextContent("Offered here because this page is open over HTTPS");
    expect(within(choice).queryByText("This page is open over plain http")).not.toBeInTheDocument();
    expect(within(choice).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(choice).toHaveTextContent("That is the path inside the container");
  });

  it("shows the certificate in use: who issued it, how long it has, and whose root devices must trust", async () => {
    serve({ status: runningOwn() });
    show(onOwn);
    const heading = await screen.findByRole("heading", { name: "Your certificate" });
    const facts = heading.parentElement as HTMLElement;
    expect(facts).toHaveTextContent(/For\s*kitchen-pi\.local/);
    expect(facts).toHaveTextContent(/Issued by\s*Hill House Issuing 1/);
    expect(facts).toHaveTextContent("(60 days left)");
    expect(facts).toHaveTextContent(/Key\s*ECDSA P-256/);
    expect(screen.queryByText("Where it will not work")).not.toBeInTheDocument();
    // Outpost's own authority is not what devices trust here, and its steps are not shown.
    expect(screen.queryByRole("heading", { name: "Trust the certificate on each device" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download certificate" })).not.toBeInTheDocument();
    const trust = screen.getByRole("heading", { name: "Each device has to trust your authority’s root" }).parentElement as HTMLElement;
    expect(trust).toHaveTextContent("as far as Outpost can tell it is a private one");
    expect(trust).toHaveTextContent("It is your authority’s root that devices must trust, not Outpost’s");
    expect(trust).toHaveTextContent("Outpost cannot see which do");
    // The same steps, for the person's root, which Outpost holds because it was in the files.
    const mac = within(trust).getByText("Mac", { selector: "summary" }).closest("details") as HTMLElement;
    expect(within(mac).getByRole("link", { name: "Download the certificate", hidden: true })).toHaveAttribute(
      "href",
      "/api/https/own-root.crt",
    );
    expect(mac).toHaveTextContent("Double-click Hill House Root in the list");
    expect(mac).toHaveTextContent("security verify-cert https://kitchen-pi.local:8443");
  });

  it("says where the root has to come from when it was not among the files", async () => {
    serve({ status: runningOwn({ anchor: { name: "mkcert development CA", fingerprint: null, held: false } }) });
    show(onOwn);
    const trust = (await screen.findByRole("heading", { name: "Each device has to trust your authority’s root" }))
      .parentElement as HTMLElement;
    expect(trust).toHaveTextContent("The root was not in the files you gave, so Outpost cannot offer it for download");
    expect(trust).toHaveTextContent("rootCA.pem, in the folder that mkcert -CAROOT prints");
    const mac = within(trust).getByText("Mac", { selector: "summary" }).closest("details") as HTMLElement;
    expect(within(mac).queryByRole("link", { name: "Download the certificate", hidden: true })).not.toBeInTheDocument();
    expect(mac).toHaveTextContent("Copy your authority’s root certificate to this device as a file");
  });

  it("gives no steps for a certificate from a public authority, and says how far it can tell", async () => {
    serve({ status: runningOwn({ trust: "public", issuer: "R11", anchor: { name: "ISRG Root X1", fingerprint: "AA", held: false } }) });
    show(onOwn);
    const trust = (await screen.findByRole("heading", { name: "Devices need nothing installed" })).parentElement as HTMLElement;
    expect(trust).toHaveTextContent("its chain ends at ISRG Root X1");
    expect(trust).toHaveTextContent("it cannot see what any one device trusts");
    expect(screen.queryByText("iPhone and iPad", { selector: "summary" })).not.toBeInTheDocument();
  });

  it("says a self-signed certificate is itself what devices must trust", async () => {
    serve({
      status: runningOwn({ trust: "self-signed", chain: [], anchor: { name: "kitchen-pi.local", fingerprint: "AA:BB", held: true } }),
    });
    show(onOwn);
    const trust = (await screen.findByRole("heading", { name: "Each device has to trust this certificate" })).parentElement as HTMLElement;
    expect(trust).toHaveTextContent("It is signed by itself, not by an authority");
    expect(trust).toHaveTextContent("AA:BB");
  });

  it("says plainly which addresses in use the certificate does not cover, and which names Outpost does not answer to", async () => {
    at("http://192.168.1.20:8080/settings");
    serve({
      status: runningOwn(
        {
          names: ["outpost.example.net"],
          covered: [],
          notCovered: ["192.168.1.20", "kitchen-pi.local"],
          notAnswered: ["outpost.example.net"],
          warnings: [
            "It is valid for 3650 days. iPhone, iPad and Mac refuse a server certificate valid for more than 825 days, whoever issued it.",
          ],
          notes: ["The certificates in the file were not in order. Outpost sends them in order."],
        },
        {},
        { addresses: [], names: ["outpost.example.net"] },
      ),
    });
    show(onOwn);
    const where = (await screen.findByRole("heading", { name: "Where it will not work" })).parentElement as HTMLElement;
    expect(where).toHaveTextContent("It does not cover 192.168.1.20 and kitchen-pi.local, which this server is also reached by");
    expect(where).toHaveTextContent("a browser will warn that the certificate is for another site");
    expect(where).toHaveTextContent("Outpost does not answer to outpost.example.net yet");
    expect(where).toHaveTextContent("OUTPOST_ALLOWED_HOSTS=outpost.example.net");
    expect(where).toHaveTextContent("more than 825 days");
    expect(screen.getByText(/were not in order/)).toBeInTheDocument();
    expect(screen.getByText(/None of the names on your certificate is an address other devices can use/)).toBeInTheDocument();
    // Adding the address in use to the list would not put it on a certificate Outpost did not make.
    expect(screen.queryByRole("button", { name: "Add 192.168.1.20" })).not.toBeInTheDocument();
    expect(screen.getByText(/which is not a name on your certificate/)).toBeInTheDocument();
    expect(screen.getByText(/With a certificate of your own this does not change the certificate/)).toBeInTheDocument();
  });

  it("warns as the end approaches, and once expired says what is being served and why", async () => {
    const soon = { expiresAt: Date.now() + 5 * 86_400_000 + 3_600_000 };
    serve({ status: runningOwn(soon, { expiry: "soon" }) });
    show(onOwn);
    const warning = (await screen.findByText("Your certificate expires in 5 days")).closest("[role=status]") as HTMLElement;
    expect(warning).toHaveTextContent("Outpost takes them up within half a minute");
    expect(screen.getByRole("heading", { name: "Your certificate" }).parentElement).toHaveTextContent("(5 days left)");
  });

  it("says an expired certificate is still served, and that Outpost does not swap in another by itself", async () => {
    serve({ status: runningOwn({ expiresAt: Date.now() - 2 * 86_400_000 }, { expiry: "expired" }) });
    show(onOwn);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Your certificate has expired");
    expect(alert).toHaveTextContent("Outpost is still serving it, so browsers now warn that it has expired");
    expect(alert).toHaveTextContent("Outpost does not put a different certificate in its place by itself");
    expect(alert).toHaveTextContent("The plain http address is not affected");
    expect(screen.getByRole("heading", { name: "Your certificate" }).parentElement).toHaveTextContent("(expired)");
  });

  it("says when the files in the folder changed for the worse, in the server's words", async () => {
    const problem =
      "The files in /srv/outpost/data/tls/own changed, and the new ones cannot be used. This key does not belong to the certificate. Outpost is still serving the certificate it read before.";
    serve({ status: runningOwn({}, { problem }) });
    show(onOwn);
    const notice = (await screen.findByText("The files in the folder cannot be used as they are")).closest("[role=status]") as HTMLElement;
    expect(notice).toHaveTextContent(problem);
  });

  it("goes back to Outpost's own certificate in one press, and says nothing is lost", async () => {
    serve({ status: runningOwn({}, {}, { authority }) });
    const save = show(onOwn);
    const part = (await screen.findByRole("heading", { name: "Renew it, replace it, or go back" })).parentElement as HTMLElement;
    expect(part).toHaveTextContent("Outpost’s certificate authority and the devices that trust it are as they were");
    expect(part).toHaveTextContent("replace fullchain.pem and privkey.pem in /srv/outpost/data/tls/own");
    await userEvent.click(within(part).getByRole("button", { name: "Go back to Outpost’s own certificate" }));
    expect(save).toHaveBeenCalledWith("https.certificate", "outpost");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("says that going back makes an authority when Outpost has never had one", async () => {
    serve({ status: runningOwn() });
    show(onOwn);
    const part = (await screen.findByRole("heading", { name: "Renew it, replace it, or go back" })).parentElement as HTMLElement;
    expect(part).toHaveTextContent("Outpost has no certificate authority of its own yet, so it will make one");
  });

  it("offers the ways in again for a renewal by hand, and when there is nothing it can use", async () => {
    serve({ status: runningOwn() });
    show(onOwn);
    await userEvent.click(await screen.findByRole("button", { name: "Give Outpost another certificate" }));
    expect(screen.getByLabelText("Certificate file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use them" })).toBeInTheDocument();
  });

  it("shows the server's reason and the ways in when the files could not be used at start-up", async () => {
    const problem =
      "The files in /srv/outpost/data/tls/own cannot be used. This key does not belong to the certificate. Until that is put right, HTTPS is not running; the plain http address is not affected.";
    serve({
      status: status({ enabled: true, source: "own", problem, own: { ...noOwn, inFolder: { certificate: true, key: true } } }),
    });
    show(onOwn);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("HTTPS is not running");
    expect(alert).toHaveTextContent(problem);
    expect(screen.getByText(/there is none Outpost can use/)).toBeInTheDocument();
    expect(screen.getByLabelText("Certificate file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go back to Outpost’s own certificate" })).toBeInTheDocument();
  });

  it("deletes the certificate and key only after saying that HTTPS goes off with them", async () => {
    const calls = serve({ status: runningOwn(), removeOwn: status() });
    show(onOwn);
    await userEvent.click(await screen.findByRole("button", { name: "Delete your certificate from this server" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("HTTPS is turned off");
    expect(dialog).toHaveTextContent("Outpost does not switch to its own certificate by itself");
    expect(calls).not.toContain("DELETE /api/https/own");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete and turn HTTPS off" }));
    await waitFor(() => expect(calls).toContain("DELETE /api/https/own"));
  });

  it("does not offer deleting on another device", async () => {
    serve({ status: runningOwn({}, {}, { authorityRight: { allowed: false, reason: "remote", option: "OUTPOST_ALLOW_REMOTE_ERASE" } }) });
    show(onOwn);
    await screen.findByRole("heading", { name: "Your certificate" });
    expect(screen.queryByRole("button", { name: "Delete your certificate from this server" })).not.toBeInTheDocument();
    // Going back loses nothing, so it is offered everywhere.
    expect(screen.getByRole("button", { name: "Go back to Outpost’s own certificate" })).toBeInTheDocument();
  });
});
