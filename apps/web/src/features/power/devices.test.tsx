/**
 * The battery runtime calculator built from devices, the picker, a person's own devices,
 * and a plan citing where its figures came from. The figures are those of the worked
 * example in docs/tools-power.md.
 */
import { newPowerPlan, type PowerPlan, type PowerPlanInput } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toMarkdown } from "@/features/propagation/plans/document";
import { workOut } from "./calc/plan";
import { OwnDeviceDialog } from "./device-picker";
import { planBlocks } from "./document";
import PowerPlanPage from "./plan-page";
import PowerPage from "./power-page";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const planWithOrigin = (): PowerPlan => ({
  ...newPowerPlan("Power cut"),
  householdId: null,
  usb: { efficiency: 0.71 },
  loads: [
    {
      id: "pi",
      kind: "device",
      name: "Raspberry Pi 5",
      supply: "usb",
      quantity: 1,
      startHour: 0,
      watts: 4.08,
      hoursPerDay: 24,
      origin: { library: "common", id: "raspberry-pi-5", name: "Raspberry Pi 5", state: "typical", figures: { watts: 4.08 } },
    },
    {
      id: "lamp",
      kind: "device",
      name: "Shed lamp",
      supply: "dc",
      quantity: 1,
      startHour: 18,
      watts: 6,
      hoursPerDay: 4,
      origin: { library: "common", id: "ikea-solhetta-806", name: "LED bulb", state: "rated", figures: { watts: 5 } },
    },
  ],
  id: "p1",
  createdAt: 1,
  updatedAt: Date.UTC(2026, 10, 16),
});

function show(path: string) {
  const server = { plans: [] as unknown[], devices: [] as Array<Record<string, unknown>> };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (pathname === "/api/power/plans" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as PowerPlanInput;
        server.plans.push(body);
        return json({ plan: { ...body, id: "p9", createdAt: 1, updatedAt: 1 } });
      }
      if (pathname === "/api/power/plans") return json({ plans: [] });
      if (pathname === "/api/power/plans/p1") return json({ plan: planWithOrigin() });
      if (pathname === "/api/power/devices" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        server.devices.push(body);
        return json({ device: { ...body, id: "d1", createdAt: 1, updatedAt: 1 } });
      }
      if (pathname === "/api/power/devices")
        return json({ devices: server.devices.map((body) => ({ ...body, id: "d1", createdAt: 1, updatedAt: 1 })) });
      if (pathname === "/api/radio/profiles") return json({ radios: [], antennas: [] });
      if (pathname === "/api/weather") return json({ places: [], kept: [], sources: [], updateOnOpen: false, now: Date.now() });
      return json({ error: { code: "not_found", message: "Not here." } }, 404);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tools/power" element={<PowerPage />} />
          <Route path="/tools/power/plans/:id" element={<PowerPlanPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return server;
}

async function pick(search: string, name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: "Add a device" }));
  const dialog = await screen.findByRole("dialog", { name: "Add a device" });
  fireEvent.change(within(dialog).getByLabelText("Find a device"), { target: { value: search } });
  fireEvent.click(within(dialog).getByRole("button", { name }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add a device" })).not.toBeInTheDocument());
}

const runtime = () => document.getElementById("calc-runtime")!;

describe("the battery runtime calculator, from devices", () => {
  it("invites the first device and has no answers until there is one", async () => {
    show("/tools/power");
    fireEvent.click(await screen.findByText("Battery runtime"));
    expect(within(runtime()).getByText(/^Add what the battery should run or charge/)).toBeInTheDocument();
    expect(within(runtime()).queryByText("Runs what runs")).not.toBeInTheDocument();
  });

  it("finds devices by their common names: “G90”, “vape”, “18650”, “power station”", async () => {
    show("/tools/power");
    fireEvent.click(await screen.findByText("Battery runtime"));
    fireEvent.click(screen.getByRole("button", { name: "Add a device" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a device" });
    const find = within(dialog).getByLabelText("Find a device");
    const names = () =>
      within(dialog)
        .queryAllByRole("button")
        .map((button) => button.textContent ?? "");
    fireEvent.change(find, { target: { value: "G90" } });
    expect(names().some((name) => name.startsWith("Xiegu G90S"))).toBe(true);
    fireEvent.change(find, { target: { value: "vape" } });
    expect(names().some((name) => name.startsWith("Vape with a built-in battery: VOOPOO ARGUS G3"))).toBe(true);
    expect(within(dialog).getByRole("region", { name: "Cells, batteries and power stations" })).toBeInTheDocument();
    fireEvent.change(find, { target: { value: "18650" } });
    expect(names().some((name) => name.startsWith("18650 cell: Molicel INR-18650-P28A"))).toBe(true);
    fireEvent.change(find, { target: { value: "power station" } });
    expect(names().some((name) => name.startsWith("Anker SOLIX C2000 Gen 2 power station"))).toBe(true);
  });

  it("answers for a Raspberry Pi, two phones and a radio, with the working", async () => {
    show("/tools/power");
    fireEvent.click(await screen.findByText("Battery runtime"));
    await pick("pi 5", /^Raspberry Pi 5:/);
    await pick("iphone 16", /^iPhone 16:/);
    await pick("iphone 16", /^iPhone 16:/);
    await pick("ft-65", /^Yaesu FT-65:/);
    const list = within(runtime()).getByRole("list", { name: "What it runs and charges" });
    // Picking the same phone twice makes it two of one row.
    expect(within(list).getByText("2 ×")).toBeInTheDocument();
    const answers = within(runtime());
    // 1,024 Wh ÷ 163.15 Wh a day = 6.28 days, 151 hours.
    expect(answers.getByText("6.3 days (151 hours)")).toBeInTheDocument();
    expect(answers.getByText(/1,024 Wh can be taken out \(1,280 Wh × 80% usable\) ÷ 163 Wh a day = 6.28 days/)).toBeInTheDocument();
    // One charge: 12.82 Wh ÷ 80% ÷ 71% = 22.6 Wh from the battery; 45 instead of anything else, 23 besides three days of the rest.
    expect(answers.getByText("45 instead, 23 besides")).toBeInTheDocument();
    expect(
      answers.getByText(
        /With this battery, for 3 days, you can run the Raspberry Pi 5 and the Yaesu FT-65 as set, and charge each iPhone 16 up to 3.9 times a day/,
      ),
    ).toBeInTheDocument();
    expect(answers.getByText("781 Wh, 61 Ah at 12.8 V")).toBeInTheDocument();
    // Which uses most, as a table: the Pi first.
    const table = answers.getByRole("table", { name: /Watt-hours a day from the battery/ });
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(/Raspberry Pi 5.*138 Wh.*66%/);
    expect(answers.queryByText("At least")).not.toBeInTheDocument();
    // Each figure's source is behind a disclosure, with the maker's sentence.
    expect(answers.getAllByText("Where these figures come from").length).toBe(3);
    expect(answers.getAllByText(/the label on your own device governs/i).length).toBeGreaterThan(0);
  });

  it("says “at least” when any figure is a maker's maximum", async () => {
    show("/tools/power");
    fireEvent.click(await screen.findByText("Battery runtime"));
    await pick("pi 5", /^Raspberry Pi 5:/);
    fireEvent.click(within(runtime()).getByLabelText("Figure"));
    fireEvent.click(await screen.findByRole("option", { name: /At most, the recommended supply: 25.5 W at most/ }));
    const answers = within(runtime());
    expect(await answers.findByText("At least")).toBeInTheDocument();
    expect(answers.getByText(/The Raspberry Pi 5 is counted at the most it should draw/)).toBeInTheDocument();
    // 1,024 Wh ÷ (25.5 W ÷ 71%) = 28.5 hours, at least.
    expect(answers.getByText("At least 28.5 hours")).toBeInTheDocument();
  });

  it("adds nothing for a medical device, and says the maker's guide governs", async () => {
    show("/tools/power");
    fireEvent.click(await screen.findByText("Battery runtime"));
    await pick("cpap", /^CPAP: ResMed AirSense/);
    expect(within(runtime()).getByText(/Its maker's guide and the person's clinician govern/)).toBeInTheDocument();
    expect(within(runtime()).queryByRole("list", { name: "What it runs and charges" })).not.toBeInTheDocument();
  });

  it("keeps a device of the person's own on the server and adds it", async () => {
    const server = show("/tools/power");
    fireEvent.click(await screen.findByText("Battery runtime"));
    fireEvent.click(screen.getByRole("button", { name: "Add a device" }));
    const picker = await screen.findByRole("dialog", { name: "Add a device" });
    fireEvent.click(within(picker).getByRole("button", { name: "Add a device of your own" }));
    const own = await screen.findByRole("dialog", { name: "A device of your own" });
    fireEvent.change(within(own).getByLabelText("Name"), { target: { value: "Shed lamp" } });
    fireEvent.change(within(own).getByLabelText("Power while on"), { target: { value: "6" } });
    fireEvent.click(within(own).getByRole("button", { name: "Keep device" }));
    await waitFor(() => expect(server.devices).toHaveLength(1));
    expect(server.devices[0]).toMatchObject({ name: "Shed lamp", kind: "run", watts: 6, supply: "dc" });
    expect(await within(runtime()).findByText(/Your own figure/)).toBeInTheDocument();
  });

  it("makes a plan carrying the devices and where their figures came from", async () => {
    const server = show("/tools/power");
    fireEvent.click(await screen.findByText("Battery runtime"));
    await pick("pi 5", /^Raspberry Pi 5:/);
    fireEvent.click(within(runtime()).getByRole("button", { name: "Make this a plan" }));
    const dialog = await screen.findByRole("dialog", { name: "Make this a plan" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(server.plans).toHaveLength(1));
    expect(server.plans[0]).toMatchObject({
      name: "Power cut",
      battery: { volts: 12.8, ampHours: 100, usableDod: 0.8 },
      usb: { efficiency: 0.71 },
      loads: [{ name: "Raspberry Pi 5", watts: 4.08, origin: { id: "raspberry-pi-5" } }],
    });
  });
});

describe("a plan made from the library", () => {
  it("cites where each figure came from on the screen and in the PDF, and says when one was changed", async () => {
    show("/tools/power/plans/p1");
    expect(await screen.findByRole("heading", { level: 1, name: "Power cut" })).toBeInTheDocument();
    expect(screen.getByText(/From the library: Raspberry Pi 5, the maker's typical figure/)).toBeInTheDocument();
    expect(screen.getByText(/From the library: LED bulb, changed by you since/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "USB converter" })).toBeInTheDocument();
    const plan = planWithOrigin();
    const text = toMarkdown(planBlocks(plan, workOut(plan), new Date(Date.UTC(2026, 10, 16))));
    expect(text).toContain("Where the figures come from");
    expect(text).toContain(
      "Raspberry Pi 5, bare board, typical: 800 mA at 5.1 V = 4.08 W, from Raspberry Pi Ltd, Raspberry Pi documentation",
    );
    expect(text).toContain("read 16 November 2026");
    expect(text).toContain("A figure has been changed by hand since");
    expect(text).toContain("The label on your own device governs");
  });
});

describe("changing a device of the person's own", () => {
  it("sends the version it was opened at, and says what to do when it was changed elsewhere since", async () => {
    const sent: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            error: { code: "conflict", message: "This device was changed somewhere else.", details: { updatedAt: 9 } },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const onSaved = vi.fn();
    const lamp = {
      id: "d1",
      name: "Shed lamp",
      kind: "run" as const,
      supply: "dc" as const,
      watts: 6,
      wattHours: null,
      receiveW: null,
      transmitW: null,
      standbyW: null,
      note: "",
      createdAt: 1,
      updatedAt: 5,
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OwnDeviceDialog device={lamp} onClose={() => undefined} onSaved={onSaved} />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Power while on"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Save device" }));
    expect(await screen.findByText(/changed somewhere else\. Close this and open it again to see it as it is now\./)).toBeInTheDocument();
    expect(sent[0]).toMatchObject({ watts: 7, baseUpdatedAt: 5 });
    expect(onSaved).not.toHaveBeenCalled();
  });
});
