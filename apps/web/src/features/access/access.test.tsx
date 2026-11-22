import type { AccessState } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { AccessNotice } from "./access-notice";
import { AccessPinSetting } from "./access-section";

const open: AccessState = { mode: "open", canChange: true, pinSetAt: null, unlockedDevices: 0, unlockedAt: null };
const guest: AccessState = { mode: "pin", canChange: false, pinSetAt: Date.UTC(2026, 10, 20), unlockedDevices: 1, unlockedAt: null };
const unlocked: AccessState = { ...guest, canChange: true, unlockedDevices: 2, unlockedAt: Date.UTC(2026, 10, 21) };

/** A server holding `state`; the PIN is 2468. */
function serve(initial: AccessState) {
  let state = initial;
  const calls: Array<{ path: string; body: unknown }> = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://localhost").pathname;
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path, body });
      if (path === "/api/access") return json({ access: state });
      if (path === "/api/access/unlock") {
        if (body.pin !== "2468") return json({ error: { code: "forbidden", message: "That is not the household PIN." } }, 403);
        state = { ...state, canChange: true, unlockedAt: Date.now() };
        return json({ access: state });
      }
      if (path === "/api/access/pin") {
        state = { ...guest, canChange: true, unlockedAt: Date.now() };
        return json({ access: state });
      }
      if (path === "/api/notes") return json({ error: { code: "locked", message: "This device can read but not change anything." } }, 403);
      return json({ error: { code: "not_found", message: "Nothing." } }, 404);
    }),
  );
  return calls;
}

function show(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("the household PIN", () => {
  it("says there is none, and sets one typed twice", async () => {
    const calls = serve(open);
    show(<AccessPinSetting />);
    expect(await screen.findByText(/No PIN\. Every device that can reach Outpost can read, add, change and delete\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set a PIN" }));
    await userEvent.type(screen.getByLabelText("PIN"), "24a68");
    await userEvent.type(screen.getByLabelText("The same PIN again"), "2469");
    expect(screen.getByText("The two PINs are not the same.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set the PIN" })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("The same PIN again"));
    await userEvent.type(screen.getByLabelText("The same PIN again"), "2468");
    await userEvent.click(screen.getByRole("button", { name: "Set the PIN" }));
    await waitFor(() => expect(calls.some((call) => call.path === "/api/access/pin")).toBe(true));
    expect(calls.find((call) => call.path === "/api/access/pin")?.body).toEqual({ pin: "2468" });
    expect(await screen.findByText(/This computer is unlocked: it can change and delete/)).toBeInTheDocument();
  });

  it("shows a guest that it reads only, and asks for the PIN when a change is refused", async () => {
    serve(guest);
    show(<AccessNotice />);
    expect(await screen.findByText("This computer can read but not change anything.")).toBeInTheDocument();
    await api.post("/api/notes", {}).catch(() => undefined);
    const field = await screen.findByLabelText("Household PIN");
    await userEvent.type(field, "1111");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("That is not the household PIN.")).toBeInTheDocument();
    // Tied to the field, so it is heard with it, and the field is marked wrong.
    expect(screen.getByLabelText("Household PIN")).toHaveAccessibleDescription("That is not the household PIN.");
    expect(screen.getByLabelText("Household PIN")).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(screen.getByLabelText("Household PIN"), "2468");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(screen.queryByText("This computer can read but not change anything.")).not.toBeInTheDocument());
  });

  it("offers an unlocked device its lock, and the PIN's other choices", async () => {
    serve(unlocked);
    show(<AccessPinSetting />);
    expect(await screen.findByRole("button", { name: "Lock this computer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock every other device" })).toBeInTheDocument();
    expect(screen.getByText(/1 other device unlocked\./)).toBeInTheDocument();
    expect(screen.getByText(/OUTPOST_FORGET_PIN=true/)).toBeInTheDocument();
  });
});
