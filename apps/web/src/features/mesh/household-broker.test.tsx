/** Settings → Mesh radio, the household's own broker: a port in use, switching, find, test, dynamic security. Addresses are made up. */
import type { MeshBrokerTestResult, MeshDynsecResult, MeshFindResponse, MeshResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeshSettingsSection } from "./mesh-settings-section";

type Meshtastic = { config?: Partial<MeshResponse["meshtastic"]["config"]>; status?: Partial<MeshResponse["meshtastic"]["status"]> };

function mesh(meshtastic: Meshtastic = {}): MeshResponse {
  return {
    meshtastic: {
      config: {
        mode: "off",
        broker: { port: 1883, userName: "radio", passwordSet: true },
        client: { host: "", port: 1883, userName: "", passwordSet: false, rootTopic: "msh/EU_868", tls: false, ca: null },
        channels: [{ name: "LongFast", index: 0 }],
        ...meshtastic.config,
      },
      status: {
        state: "off",
        since: null,
        peers: [],
        lastHeardAt: null,
        lastError: null,
        retryAt: null,
        brokerAddresses: ["192.168.1.20"],
        heardRoot: null,
        gateway: null,
        otherChannels: [],
        json: null,
        portInUse: null,
        radios: [],
        perMinute: 0,
        dropped: 0,
        ...meshtastic.status,
      },
    },
    meshcore: {
      config: { mode: "off", device: null, host: "", port: 5000, channels: [] },
      status: { state: "off", since: null, lastHeardAt: null, lastError: null, retryAt: null, radioName: null, radioChannels: [] },
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
  };
}

function serve(routes: Record<string, unknown>) {
  const sent: Array<{ path: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const method = init?.method ?? "GET";
      if (method !== "GET") sent.push({ path: `${method} ${url.pathname}`, body: init?.body ? JSON.parse(String(init.body)) : null });
      const answer = routes[`${method} ${url.pathname}`] ?? routes[url.pathname];
      return new Response(JSON.stringify(answer ?? { error: { code: "not_found", message: "Not here." } }), {
        status: answer === undefined ? 404 : 200,
        headers: { "content-type": "application/json" },
      });
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const meshtastic = () => screen.findByRole("region", { name: "Meshtastic, by MQTT" });

describe("the household's own broker", () => {
  it("says plainly that port 1883 is taken, and fills in another port or the broker already there", async () => {
    serve({
      "/api/mesh": mesh({
        config: { mode: "broker" },
        status: {
          state: "failed",
          lastError: "Port 1883 is already in use by another program on this computer.",
          portInUse: { port: 1883, freePort: 1884 },
        },
      }),
    });
    show();
    const part = await meshtastic();
    expect(within(part).getByText("Port 1883 is already in use on this computer")).toBeInTheDocument();
    await userEvent.click(within(part).getByRole("button", { name: "Use port 1884 instead" }));
    expect(within(part).getByLabelText("Port")).toHaveValue("1884");
    await userEvent.click(within(part).getByRole("button", { name: "Use the broker on port 1883" }));
    expect(within(part).getByLabelText("The broker's address")).toHaveValue("127.0.0.1");
    // Switching from Outpost's broker says what changes on the radio before anything is saved.
    expect(within(part).getByText("Before you save: what changes on the radio")).toBeInTheDocument();
    expect(within(part).getByText(/Outpost's own broker stops when you save/)).toBeInTheDocument();
  });

  it("says which broker is in use, who has published, and what to do when it drops", async () => {
    serve({
      "/api/mesh": mesh({
        config: {
          mode: "client",
          client: { host: "192.168.1.5", port: 1883, userName: "outpost", passwordSet: true, rootTopic: "msh/EU_868", tls: true, ca: null },
        },
        status: {
          state: "away",
          lastError: "Nothing is accepting connections at 192.168.1.5:1883.",
          since: Date.now(),
          retryAt: Date.now() + 60_000,
        },
      }),
    });
    show();
    const part = await meshtastic();
    expect(
      within(part).getByText(/In use: the household's broker at 192.168.1.5:1883, over TLS. Outpost's own broker is switched off/),
    ).toBeInTheDocument();
    expect(within(part).getByText(/check that Mosquitto is running on that computer/)).toBeInTheDocument();
    expect(
      within(part).getByText(/Outpost does not install, start, stop, upgrade or change the household's Mosquitto/),
    ).toBeInTheDocument();
    expect(within(part).getByRole("checkbox", { name: /Use TLS/ })).toBeChecked();
  });

  it("finds a broker and fills it in; tests a sign-in and lists each step", async () => {
    const found: MeshFindResponse = {
      found: [
        {
          host: "127.0.0.1",
          port: 1883,
          tls: false,
          where: "this-computer",
          answer: "open-to-anyone",
          words: "Answers, and lets anyone on the network in without a password.",
        },
        { host: "127.0.0.1", port: 8883, tls: true, where: "this-computer", answer: "nothing", words: "Nothing there." },
      ],
      inContainer: false,
      containerHost: null,
    };
    const tested: MeshBrokerTestResult = {
      ok: false,
      steps: [
        { step: "connect", ok: true, words: "Signed in to 127.0.0.1:1883 as outpost." },
        { step: "subscribe", ok: true, words: "Subscribed to the radio's topics under msh/EU_868." },
        { step: "check", ok: false, words: "A check message sent under msh/EU_868 did not come back." },
      ],
      heard: [],
    };
    const sent = serve({
      "/api/mesh": mesh({
        config: {
          mode: "client",
          client: { host: "", port: 1883, userName: "outpost", passwordSet: true, rootTopic: "msh/EU_868", tls: false, ca: null },
        },
      }),
      "POST /api/mesh/broker/find": found,
      "POST /api/mesh/broker/test": tested,
    });
    show();
    const part = await meshtastic();
    await userEvent.click(within(part).getByRole("button", { name: /Find a broker/ }));
    const list = await within(part).findByRole("list", { name: "Where Outpost looked" });
    expect(list).toHaveTextContent("lets anyone on the network in without a password");
    await userEvent.click(within(list).getByRole("button", { name: "Use this one" }));
    expect(within(part).getByLabelText("The broker's address")).toHaveValue("127.0.0.1");
    await userEvent.click(within(part).getByRole("button", { name: /^Test$/ }));
    const steps = await within(part).findByRole("list", { name: "What the test found" });
    expect(steps).toHaveTextContent("Failed: A check message sent under msh/EU_868 did not come back.");
    const test = sent.find((entry) => entry.path === "POST /api/mesh/broker/test");
    expect(test?.body).toEqual({ host: "127.0.0.1", port: 1883, userName: "outpost", rootTopic: "msh/EU_868", tls: false });
  });

  it("checks dynamic security on the saved broker and adds an account for a radio", async () => {
    const on: MeshDynsecResult = {
      state: "on",
      words: "Mosquitto's dynamic security is on, and Outpost's account may manage it. It has 2 accounts.",
      clients: ["admin", "outpost"],
    };
    const added: MeshDynsecResult = {
      state: "on",
      words: "Added radio-1, allowed to publish and subscribe under msh/EU_868/# only.",
      clients: [],
    };
    const sent = serve({
      "/api/mesh": mesh({
        config: {
          mode: "client",
          client: {
            host: "192.168.1.5",
            port: 1883,
            userName: "outpost",
            passwordSet: true,
            rootTopic: "msh/EU_868",
            tls: false,
            ca: null,
          },
        },
      }),
      "POST /api/mesh/broker/dynsec": on,
      "POST /api/mesh/broker/radio-account": added,
    });
    show();
    const part = await meshtastic();
    await userEvent.click(within(part).getByRole("button", { name: "Check dynamic security" }));
    expect(await within(part).findByText(on.words)).toBeInTheDocument();
    const add = within(part).getByRole("button", { name: /Add the account/ });
    expect(add).toBeDisabled();
    await userEvent.click(within(part).getAllByRole("button", { name: "Suggest one" }).at(-1)!);
    await userEvent.click(add);
    expect(await within(part).findByText(added.words)).toBeInTheDocument();
    await waitFor(() => expect(sent.some((entry) => entry.path === "POST /api/mesh/broker/radio-account")).toBe(true));
    expect(sent.find((entry) => entry.path === "POST /api/mesh/broker/radio-account")?.body).toMatchObject({ userName: "radio-1" });
  });

  it("offers the guide with the values typed", async () => {
    serve({
      "/api/mesh": mesh({
        config: {
          mode: "client",
          client: {
            host: "192.168.1.5",
            port: 1883,
            userName: "outpost",
            passwordSet: true,
            rootTopic: "msh/EU_868",
            tls: false,
            ca: null,
          },
        },
      }),
    });
    show();
    const part = await meshtastic();
    await userEvent.click(within(part).getByText("A guide to running your own Mosquitto for the radio"));
    expect(within(part).getByText(/allow_anonymous false/)).toBeInTheDocument();
    expect(within(part).getByText(/topic readwrite msh\/EU_868\/#/)).toBeInTheDocument();
  });
});
