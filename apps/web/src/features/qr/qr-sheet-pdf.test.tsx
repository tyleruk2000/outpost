/** The printed sheet is made once typing pauses, not at every key. The text here is made up. */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "../manage/test-support";
import QrPage from "./qr-page";

const lettering = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/features/maps/print/lettering", async (original) => {
  const real = await original<typeof import("@/features/maps/print/lettering")>();
  return {
    ...real,
    writeLettered: (...args: Parameters<typeof real.writeLettered>) => {
      lettering.calls += 1;
      return real.writeLettered(...args);
    },
  };
});

beforeEach(() => {
  lettering.calls = 0;
  URL.createObjectURL = vi.fn(() => "blob:qr");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the QR sheet as a PDF", () => {
  it("is made once typing pauses, not for every character typed", async () => {
    fakeApi({});
    const user = userEvent.setup();
    renderScreen(<QrPage />, "/tools/qr");
    await user.type(screen.getByLabelText("Text or web address"), "Water point 3, by the gate");
    await screen.findByTestId("qr-code");
    const add = await screen.findByRole("button", { name: /Add to library/ });
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 3000 });
    expect(lettering.calls).toBe(1);
  });
});
