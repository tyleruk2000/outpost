/** Settings → Mesh radio: what it says in each state. Every radio and address here is made up. */
import type { BoardMessage, MeshResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDeviceName } from "@/features/board/data";
import { MeshSettingsSection } from "./mesh-settings-section";
import { deliveryWords, JSON_OFF, REMOTE } from "./words";

const today = (hour: number, minute: number) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
};

type Over = {
  meshtastic?: { config?: Partial<MeshResponse["meshtastic"]["config"]>; status?: Partial<MeshResponse["meshtastic"]["status"]> };
  meshcore?: { config?: Partial<MeshResponse["meshcore"]["config"]>; status?: Partial<MeshResponse["meshcore"]["status"]> };
} & Partial<Omit<MeshResponse, "meshtastic" | "meshcore">>;

function mesh(over: Over = {}): MeshResponse {
  const { meshtastic, meshcore, ...rest } = over;
  return {
    meshtastic: {
      config: {
        mode: "off",
        broker: { port: 1883, userName: "", passwordSet: false },
        client: { host: "", port: 1883, userName: "", passwordSet: false, rootTopic: "msh/EU_868", tls: false, ca: null },
        channels: [],
        ...meshtastic?.config,
      },
      status: {
        state: "off",
        since: null,
        peers: [],
        lastHeardAt: null,
        lastError: null,
        retryAt: null,
        brokerAddresses: [],
        heardRoot: null,
        gateway: null,
        otherChannels: [],
        json: null,
        portInUse: null,
        radios: [],
        perMinute: 0,
        dropped: 0,
        ...meshtastic?.status,
      },
    },
    meshcore: {
      config: { mode: "off", device: null, host: "", port: 5000, channels: [], ...meshcore?.config },
      status: {
        state: "off",
        since: null,
        lastHeardAt: null,
        lastError: null,
        retryAt: null,
        radioName: null,
        radioChannels: [],
        ...meshcore?.status,
      },
    },
    channels: [],
    right: {
      allowed: true,
      reason: "local",
      option: "OUTPOST_ALLOW_REMOTE_SETTINGS",
      inContainer: false,
      localBy: { rule: "loopback", address: "127.0.0.1" },
    },
    inContainer: false,
    lanAccess: true,
    ...rest,
  };
}

const broker = (status: Partial<MeshResponse["meshtastic"]["status"]>, over: Over = {}) =>
  mesh({
    ...over,
    meshtastic: {
      config: { mode: "broker", broker: { port: 1883, userName: "radio", passwordSet: true }, channels: [{ name: "LongFast", index: 0 }] },
      status: { brokerAddresses: ["192.168.1.20"], ...status },
    },
  });

const LONGFAST = { id: "meshtastic:longfast", transport: "meshtastic" as const, label: "LongFast", textBytes: 200, linkUp: true };

function serve(routes: Record<string, unknown>) {
  const sent: Array<{ path: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const method = init?.method ?? "GET";
      if (method !== "GET") sent.push({ path: `${method} ${url.pathname}`, body: init?.body ? JSON.parse(String(init.body)) : null });
      const answer = routes[`${method} ${url.pathname}`] ?? routes[url.pathname];
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (answer !== undefined) return json(answer);
      return json({ error: { code: "not_found", message: "Not here." } }, 404);
    }),
  );
  return sent;
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MeshSettingsSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const part = (name: string) => screen.getByRole("region", { name });

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Settings, Mesh radio", () => {
  it("says what it is, that it is untried, and the warnings, with both ways in off", async () => {
    serve({ "/api/mesh": mesh() });
    show();
    expect(screen.getByRole("heading", { name: "Mesh radio" })).toBeInTheDocument();
    expect(screen.getByText(/Outpost works with radios running Meshtastic or MeshCore firmware/)).toBeInTheDocument();
    expect(screen.getByText("Not tried with a real radio yet.")).toBeInTheDocument();
    const warnings = screen.getByRole("list", { name: "Before you use it" });
    expect(warnings).toHaveTextContent("can be read by anyone with a radio in range. Write nothing private there.");
    expect(warnings).toHaveTextContent("as private as its key, which is set on the radio, not in Outpost");
    expect(warnings).toHaveTextContent("not a way to call for help in an emergency in place of the emergency services");
    const region = within(warnings).getByRole("link", { name: /regional settings/ });
    expect(region).toHaveAttribute("href", "https://meshtastic.org/docs/configuration/radio/lora/#region");
    expect(region).toHaveAttribute("target", "_blank");
    await screen.findByRole("region", { name: "Meshtastic, by MQTT" });
    expect(within(part("Meshtastic, by MQTT")).getByRole("status")).toHaveTextContent(/^Off$/);
    expect(within(part("MeshCore")).getByRole("status")).toHaveTextContent(/^Off$/);
    expect(screen.queryByText(/On the radio/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/registered trademark of Meshtastic LLC; Outpost is not affiliated with or endorsed by it/),
    ).toBeInTheDocument();
  });

  it("while Outpost is the broker and no radio has come, says so and gives the address to type on the radio", async () => {
    serve({ "/api/mesh": broker({ state: "listening" }) });
    show();
    const meshtastic = await screen.findByRole("region", { name: "Meshtastic, by MQTT" });
    expect(within(meshtastic).getByRole("status")).toHaveTextContent("Listening on port 1883; no radio connected yet");
    expect(within(meshtastic).getByRole("status")).toHaveTextContent("Nothing heard yet");
    expect(meshtastic).toHaveTextContent("Server address: 192.168.1.20:1883.");
    expect(meshtastic).toHaveTextContent("JSON output on.");
    expect(meshtastic).toHaveTextContent("JSON is not supported on the nRF52 platform");
    expect(meshtastic).toHaveTextContent("On LongFast: Uplink on and Downlink on.");
    expect(meshtastic).toHaveTextContent("Add a channel named mqtt with Downlink on");
    expect(within(meshtastic).getByLabelText(/Password/)).toHaveAccessibleDescription("Set; type a new one to change it.");
  });

  it("says when a radio connected and from where, and when it was last heard", async () => {
    serve({
      "/api/mesh": broker({
        state: "connected",
        since: today(14, 2),
        peers: [{ clientId: "!a1b2c3d4", address: "192.168.1.40", since: today(14, 2) }],
        lastHeardAt: Date.now() - 3 * 60_000,
        json: true,
      }),
    });
    show();
    const status = within(await screen.findByRole("region", { name: "Meshtastic, by MQTT" })).getByRole("status");
    expect(status).toHaveTextContent("A radio connected since 14:02 (from 192.168.1.40)");
    expect(status).toHaveTextContent("Last heard 3 minutes ago");
    expect(screen.queryByText(JSON_OFF)).not.toBeInTheDocument();
  });

  it("says when the link is away and when it tries again", async () => {
    serve({
      "/api/mesh": mesh({
        meshcore: {
          config: { mode: "tcp", host: "192.168.1.60" },
          status: { state: "away", since: today(14, 10), retryAt: today(14, 12) },
        },
      }),
    });
    show();
    const status = within(await screen.findByRole("region", { name: "MeshCore" })).getByRole("status");
    expect(status).toHaveTextContent("Away since 14:10; trying again at 14:12");
    expect(screen.getByRole("region", { name: "MeshCore" })).toHaveTextContent("which listens on port 5000");
  });

  it("says why it could not start", async () => {
    serve({ "/api/mesh": broker({ state: "failed", lastError: "Port 1883 is in use by another program." }) });
    show();
    expect(await screen.findByText("Could not start: Port 1883 is in use by another program.")).toBeInTheDocument();
  });

  it("says when the radio sends but not as JSON, and offers a channel heard and not carried", async () => {
    serve({ "/api/mesh": broker({ state: "connected", json: false, otherChannels: ["Hikers"] }) });
    show();
    expect(await screen.findByText(JSON_OFF)).toBeInTheDocument();
    expect(screen.getByText("Also heard: Hikers")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add Hikers to the channels carried" }));
    expect(screen.getAllByLabelText("Name").map((input) => (input as HTMLInputElement).value)).toEqual(["LongFast", "Hikers"]);
    expect(screen.getAllByLabelText("Number on the radio").map((input) => (input as HTMLInputElement).value)).toEqual(["0", "1"]);
  });

  it("says a radio on Wi-Fi cannot reach the broker while Outpost listens only on this computer", async () => {
    serve({ "/api/mesh": broker({ state: "listening" }, { lanAccess: false }) });
    show();
    expect(await screen.findByText(/a radio on Wi-Fi cannot reach its broker/)).toBeInTheDocument();
  });

  it("from another device, disables what opens a port or a device, and says why; a test message still works", async () => {
    setDeviceName("Sam");
    serve({
      "/api/mesh": broker(
        { state: "connected" },
        { right: { allowed: false, reason: "remote", option: "OUTPOST_ALLOW_REMOTE_SETTINGS", inContainer: true }, channels: [LONGFAST] },
      ),
    });
    show();
    // The owner's case (outpost-x9dm): Outpost in Docker, opened from another device. It says why, and the line to set.
    expect(await screen.findByText("Can't be changed from this device")).toBeInTheDocument();
    expect(screen.getByText(/Outpost runs in a container/)).toBeInTheDocument();
    expect(screen.getByText("OUTPOST_ALLOW_REMOTE_SETTINGS=true")).toBeInTheDocument();
    expect(screen.getByText("sudo docker compose up -d")).toBeInTheDocument();
    expect(screen.getAllByText(REMOTE.short)).toHaveLength(2);
    for (const select of screen.getAllByRole("combobox")) expect(select).toBeDisabled();
    for (const save of screen.getAllByRole("button", { name: "Save" })) expect(save).toBeDisabled();
    expect(screen.getByLabelText("Port")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send a test message on LongFast" })).toBeEnabled();
  });

  it("saves the Meshtastic part as one, keeping the password unless a new one is typed", async () => {
    const sent = serve({ "/api/mesh": broker({ state: "listening" }), "PUT /api/mesh/meshtastic": broker({ state: "listening" }) });
    show();
    const meshtastic = await screen.findByRole("region", { name: "Meshtastic, by MQTT" });
    await userEvent.click(within(meshtastic).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(sent).toEqual([
        {
          path: "PUT /api/mesh/meshtastic",
          body: { mode: "broker", broker: { port: 1883, userName: "radio" }, channels: [{ name: "LongFast", index: 0 }] },
        },
      ]),
    );
    await userEvent.click(within(meshtastic).getByRole("button", { name: "Suggest one" }));
    const password = within(meshtastic).getByLabelText(/Password/) as HTMLInputElement;
    expect(password.value).toMatch(/^[a-zA-Z2-9]{20}$/);
    expect(password).toHaveAttribute("type", "text");
  });

  it("refuses a port that is not one", async () => {
    serve({ "/api/mesh": broker({ state: "listening" }) });
    show();
    const meshtastic = await screen.findByRole("region", { name: "Meshtastic, by MQTT" });
    const port = within(meshtastic).getByLabelText("Port");
    await userEvent.clear(port);
    await userEvent.type(port, "70000");
    expect(within(meshtastic).getAllByText("A port is a whole number from 1 to 65535.").length).toBeGreaterThan(0);
    expect(within(meshtastic).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("says when no likely radio is plugged in, and in a container that it must be passed through", async () => {
    serve({
      "/api/mesh": mesh({ meshcore: { config: { mode: "serial" } }, inContainer: true }),
      "/api/mesh/devices": { devices: [], platform: "linux" },
    });
    show();
    expect(await screen.findByText(/No likely radio is plugged in/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mesh radio in a container" })).toHaveAttribute(
      "href",
      "/help/deployment#h-mesh-radio-in-a-container",
    );
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeInTheDocument();
  });

  it("asks for a name before a test message, under Messages", async () => {
    serve({ "/api/mesh": broker({ state: "connected" }, { channels: [LONGFAST] }) });
    show();
    expect(await screen.findByRole("link", { name: "Messages" })).toHaveAttribute("href", "/messages");
    expect(screen.queryByRole("button", { name: /Send a test message/ })).not.toBeInTheDocument();
  });

  it("sends a test message and says what became of it", async () => {
    setDeviceName("Sam");
    const test: BoardMessage = {
      sentAt: null,
      id: "t1",
      channel: "meshtastic:longfast",
      source: "here",
      kind: "message",
      author: "Sam",
      body: "Test message from Outpost",
      status: null,
      place: null,
      position: null,
      file: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      edited: null,
      removed: null,
      meta: { delivery: { state: "handed", at: Date.now() } },
    };
    const sent = serve({
      "/api/mesh": broker({ state: "connected" }, { channels: [LONGFAST] }),
      "POST /api/mesh/test": { message: test },
      "/api/board/messages": { messages: [test], older: null },
    });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Send a test message on LongFast" }));
    expect(await screen.findByText("Test message: Handed to the radio")).toBeInTheDocument();
    expect(sent).toEqual([{ path: "POST /api/mesh/test", body: { channel: "meshtastic:longfast", author: "Sam" } }]);
  });

  it("says each delivery as it is", () => {
    expect(deliveryWords(null).text).toBe("Going to the radio…");
    expect(deliveryWords({ delivery: { state: "broker", at: 1 } }).text).toBe("Handed to the household's broker");
    expect(deliveryWords({ delivery: { state: "acknowledged", at: 1 } }).text).toBe("Acknowledged by the mesh");
    expect(deliveryWords({ delivery: { state: "failed", at: 1, detail: "the radio is away" } })).toEqual({
      text: "Did not go: the radio is away",
      failed: true,
    });
  });
});
