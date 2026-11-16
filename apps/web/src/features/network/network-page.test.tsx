/** The Devices screen against a stand-in server. Every device, name and address here is made up. */
import { NETWORK_SCAN_LIMITS, type NetworkDevice, type NetworkStatus } from "@outpost/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "../manage/test-support";
import NetworkPage from "./network-page";
import { listText, scanWords } from "./network-text";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const AT = Date.UTC(2026, 10, 16, 14, 3);

function device(over: Partial<NetworkDevice> = {}): NetworkDevice {
  return {
    id: "d1",
    label: "",
    note: "",
    name: "shed-nas",
    addresses: ["192.168.77.12"],
    mac: "00:1b:2c:00:00:12",
    maker: null,
    privateMac: false,
    services: [{ type: "_smb._tcp", label: "File sharing", name: "Shed NAS", port: 445 }],
    webUrl: "http://192.168.77.12:5000/",
    isSelf: false,
    isRouter: false,
    firstSeenAt: AT,
    lastSeenAt: AT,
    isNew: false,
    isGone: false,
    ...over,
  };
}

function status(over: Partial<NetworkStatus> = {}): NetworkStatus {
  return {
    unavailable: null,
    scanRight: { allowed: true, reason: "open" },
    os: "macos",
    abilities: { ping: true, neighbourTable: "arp -an and ndp -an", announcements: "dns-sd (Bonjour)", router: "route -n get default" },
    subnets: [
      {
        interface: "en0",
        family: 4,
        address: "192.168.77.5",
        cidr: "192.168.77.0/24",
        kind: "private",
        plan: "sweep",
        swept: null,
        addresses: 253,
        reason: null,
      },
    ],
    skipped: [
      {
        interface: "utun3",
        address: "10.8.0.2",
        reason: "A tunnel (a VPN or similar), which leads to a network somewhere else. Not scanned.",
      },
    ],
    limits: NETWORK_SCAN_LIMITS,
    lastScan: null,
    job: null,
    devices: [],
    makers: { present: false, entries: 0, fetchedAt: null, bytes: null, url: "https://standards-oui.ieee.org/oui/oui.csv" },
    makersJob: null,
    ...over,
  };
}

describe("the Devices on this network screen", () => {
  it("says what a scan will look at and send before anything is sent, and starts one on a press", async () => {
    const api = fakeApi({
      "GET /api/network": status(),
      "POST /api/network/scan": { job: { id: "j1", type: "network.scan", state: "queued" } },
    });
    const user = userEvent.setup();
    renderScreen(<NetworkPage />, "/tools/network");
    expect(await screen.findByRole("heading", { level: 1, name: "Devices on this network" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Nothing listed yet" })).toBeInTheDocument();
    expect(screen.getByText("192.168.77.0/24")).toBeInTheDocument();
    expect(screen.getByText(/253 addresses asked/)).toBeInTheDocument();
    expect(screen.getByText(/port 80, then on port 443/)).toBeInTheDocument();
    expect(screen.getByText(/At most 20 of these a second, 8 at a time/)).toBeInTheDocument();
    expect(screen.getByText(/No other port is tried/)).toBeInTheDocument();
    expect(screen.getByText(/1 address of this computer’s not looked at/)).toBeInTheDocument();
    // Nothing but loading the screen has happened.
    expect(api.requests.map((request) => request.call)).toEqual(["GET /api/network"]);

    await user.click(screen.getAllByRole("button", { name: /Look for devices/ })[0]!);
    await waitFor(() => expect(api.bodiesOf("POST /api/network/scan")).toHaveLength(1));
    // No range or address goes with it: the server decides.
    expect(api.bodiesOf("POST /api/network/scan")[0]).toEqual({});
  });

  it("in a container, says plainly that the home network cannot be seen and what would be needed", async () => {
    fakeApi({ "GET /api/network": status({ unavailable: "container", os: "linux" }) });
    renderScreen(<NetworkPage />, "/tools/network");
    expect(await screen.findByText("Outpost is running in a container")).toBeInTheDocument();
    expect(screen.getByText(/host networking/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Look for devices/ })).not.toBeInTheDocument();
  });

  it("where the administrator kept scans to the computer Outpost runs on, offers none on another device and says why", async () => {
    fakeApi({ "GET /api/network": status({ scanRight: { allowed: false, reason: "remote" } }) });
    renderScreen(<NetworkPage />, "/tools/network");
    expect(await screen.findByText("Started on the computer Outpost runs on")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Look for devices|Look again/ })).not.toBeInTheDocument();
  });

  it("says what this computer lacks", async () => {
    fakeApi({
      "GET /api/network": status({
        os: "linux",
        abilities: { ping: false, neighbourTable: "/proc/net/arp (IPv4 only)", announcements: null, router: "/proc/net/route" },
      }),
    });
    renderScreen(<NetworkPage />, "/tools/network");
    expect(await screen.findByText("Not available on this computer")).toBeInTheDocument();
    expect(screen.getByText(/Ping cannot be used here/)).toBeInTheDocument();
    expect(screen.getByText(/avahi-utils/)).toBeInTheDocument();
  });

  it("shows a scan under way with real progress, and stops it", async () => {
    const api = fakeApi({
      "GET /api/network": status({
        job: {
          id: "j1",
          type: "network.scan",
          queue: "network",
          state: "running",
          title: "Look for devices on this network",
          subject: "network",
          progress: { current: 40, total: 253, message: "Asked 40 of 253 addresses; 3 answered" },
          error: null,
          errorKind: null,
          attempts: 1,
          maxAttempts: 1,
          result: null,
          createdAt: AT,
          startedAt: AT,
          finishedAt: null,
          updatedAt: AT,
        },
      }),
      "POST /api/jobs/j1/cancel": { job: { id: "j1", state: "cancelled" } },
    });
    const user = userEvent.setup();
    renderScreen(<NetworkPage />, "/tools/network");
    expect(await screen.findByText("Asked 40 of 253 addresses; 3 answered")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "How far the scan has got" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Stop/ }));
    await waitFor(() => expect(api.requests.some((request) => request.call === "POST /api/jobs/j1/cancel")).toBe(true));
  });

  it("shows names a device announced as text, never as markup", async () => {
    const markup = '<img src="x" onerror="alert(1)"><b>Printer</b>';
    fakeApi({
      "GET /api/network": status({
        devices: [device({ name: markup, services: [{ type: "_ipp._tcp", label: "Printer", name: markup, port: 631 }], webUrl: null })],
      }),
    });
    const { container } = renderScreen(<NetworkPage />, "/tools/network");
    const rows = await screen.findAllByTestId("network-device");
    expect(within(rows[0]!).getAllByText(markup, { exact: false }).length).toBeGreaterThan(0);
    expect(container.querySelector("img[src='x'], b")).toBeNull();
  });

  it("lists devices with what they say, marks this computer, the router, new and gone, and links a web page for the browser to open", async () => {
    fakeApi({
      "GET /api/network": status({
        lastScan: {
          id: "s2",
          startedAt: AT - 38_000,
          finishedAt: AT,
          subnets: ["192.168.77.0/24"],
          found: 4,
          named: 3,
          packets: 754,
          newDevices: 1,
          goneDevices: 1,
        },
        devices: [
          device({ id: "self", name: "this-mac", addresses: ["192.168.77.5"], isSelf: true, services: [], webUrl: null }),
          device({ id: "router", name: "router.home", addresses: ["192.168.77.1"], isRouter: true, services: [], webUrl: null }),
          device({ label: "Shed NAS", note: "Behind the paint tins." }),
          device({
            id: "phone",
            name: "",
            addresses: ["192.168.77.60"],
            mac: "da:00:00:00:00:60",
            privateMac: true,
            isNew: true,
            services: [],
            webUrl: null,
          }),
          device({ id: "pi", name: "garden-pi", addresses: ["192.168.77.44"], isGone: true, services: [], webUrl: null }),
        ],
      }),
    });
    renderScreen(<NetworkPage />, "/tools/network");
    const rows = await screen.findAllByTestId("network-device");
    expect(rows).toHaveLength(5);
    expect(within(rows[0]!).getByText("This computer")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Your router")).toBeInTheDocument();
    expect(within(rows[2]!).getByRole("heading", { name: "Shed NAS" })).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Calls itself shed-nas")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("File sharing")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Behind the paint tins.")).toBeInTheDocument();
    const link = within(rows[2]!).getByRole("link", { name: /Open its web page/ });
    expect(link).toHaveAttribute("href", "http://192.168.77.12:5000/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(rows[3]!).getByText("New since last time")).toBeInTheDocument();
    expect(within(rows[3]!).getByText(/Private hardware address/)).toBeInTheDocument();
    expect(within(rows[4]!).getByText("Not seen in the last scan")).toBeInTheDocument();
    expect(screen.getByText(/754 probes sent in 38 seconds/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Save as CSV/ })).toHaveAttribute("href", "/api/network/devices.csv");
    expect(screen.getByText(/Names here can be people’s names/)).toBeInTheDocument();
  });

  it("keeps a name and note the person gives a device", async () => {
    const api = fakeApi({
      "GET /api/network": status({ devices: [device()] }),
      "PATCH /api/network/devices/d1": (body: unknown) => ({ device: device(body as Partial<NetworkDevice>) }),
    });
    const user = userEvent.setup();
    renderScreen(<NetworkPage />, "/tools/network");
    await user.click(await screen.findByRole("button", { name: "Name and note for shed-nas" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your name for it"), "Shed NAS");
    await user.type(within(dialog).getByLabelText("Note"), "Behind the paint tins.");
    await user.click(within(dialog).getByRole("button", { name: "Keep" }));
    await waitFor(() =>
      expect(api.bodiesOf("PATCH /api/network/devices/d1")).toEqual([{ label: "Shed NAS", note: "Behind the paint tins." }]),
    );
  });

  it("offers the makers' registry as a download from the IEEE with its size, and sends nothing until pressed", async () => {
    const api = fakeApi({ "GET /api/network": status({ devices: [device()] }), "POST /api/network/makers": { job: { id: "m1" } } });
    const user = userEvent.setup();
    renderScreen(<NetworkPage />, "/tools/network");
    expect(await screen.findByText(/About 3\.\d+ MB, from standards-oui\.ieee\.org/)).toBeInTheDocument();
    expect(api.requests.map((request) => request.call)).toEqual(["GET /api/network"]);
    await user.click(screen.getByRole("button", { name: /Fetch the registry from the IEEE/ }));
    await waitFor(() => expect(api.requests.some((request) => request.call === "POST /api/network/makers")).toBe(true));
  });

  it("shows an error with a way to try again", async () => {
    fakeApi({ "GET /api/network": { status: 500, error: { code: "internal", message: "Something broke." } } });
    renderScreen(<NetworkPage />, "/tools/network");
    expect(await screen.findByText("This could not be loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("the words", () => {
  it("copies the list as plain text, and says what a scan found", () => {
    const text = listText([device({ label: "Shed NAS", maker: "Example Makers, Ltd." })], true);
    expect(text).toBe(
      [
        "Shed NAS",
        "  Calls itself: shed-nas",
        "  Addresses: 192.168.77.12",
        "  Hardware address: 00:1b:2c:00:00:12",
        "  Maker: Example Makers, Ltd.",
        "  Announces: File sharing",
        "  Web page: http://192.168.77.12:5000/",
        `  Seen ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(AT)}, 14:03`,
      ].join("\n"),
    );
    expect(
      scanWords({
        id: "s",
        startedAt: AT - 1000,
        finishedAt: AT,
        subnets: [],
        found: 1,
        named: 0,
        packets: 2,
        newDevices: 0,
        goneDevices: 0,
      }),
    ).toMatch(/1 device, 0 with a name; 2 probes sent in 1 second\.$/);
  });
});
