/** The printed sheet is made once typing pauses, not at every key. The text here is made up. */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "../manage/test-support";
import QrPage from "./qr-page";

const kit = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/features/print-kit/render", async (original) => {
  const real = await original<typeof import("@/features/print-kit/render")>();
  return {
    ...real,
    renderPdf: (...args: Parameters<typeof real.renderPdf>) => {
      kit.calls += 1;
      return real.renderPdf(...args);
    },
  };
});

beforeEach(() => {
  kit.calls = 0;
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
    await waitFor(() => expect(add).toBeEnabled());
    // Laid out with the print kit, once.
    expect(kit.calls).toBe(1);
  }, 20_000);

  it("is made with the print kit, once, when its words are in another script", async () => {
    fakeApi({});
    const user = userEvent.setup();
    renderScreen(<QrPage />, "/tools/qr");
    await user.type(screen.getByLabelText("Text or web address"), "Νερό 3");
    await screen.findByTestId("qr-code");
    const add = await screen.findByRole("button", { name: /Add to library/ });
    await waitFor(() => expect(add).toBeEnabled());
    expect(kit.calls).toBe(1);
  }, 20_000);
});
