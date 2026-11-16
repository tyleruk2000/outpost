import { afterEach, describe, expect, it, vi } from "vitest";

import { connectGamepadKey, connectSerialKey, gamepadAvailability, serialAvailability } from "./key-sources";

describe("physical key sources", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("releases a held serial paddle when the port is unplugged mid-press", async () => {
    let signals: () => Promise<{
      clearToSend: boolean;
      dataSetReady: boolean;
      dataCarrierDetect: boolean;
    }> = async () => ({ clearToSend: true, dataSetReady: false, dataCarrierDetect: false });
    const port = {
      open: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      getSignals: () => signals(),
      getInfo: () => ({}),
    };
    vi.stubGlobal("navigator", { serial: { requestPort: async () => port } });
    vi.stubGlobal("isSecureContext", true);
    const onPaddle = vi.fn();
    await connectSerialKey({ onPaddle });
    await vi.waitFor(() => expect(onPaddle).toHaveBeenCalledWith("dit", true));
    signals = async () => {
      throw new Error("device lost");
    };
    await vi.waitFor(() => expect(onPaddle).toHaveBeenLastCalledWith("dit", false));
  });

  it("releases a held gamepad paddle when the pad disconnects", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    let pad: unknown = {
      index: 0,
      id: "pad",
      buttons: [{ pressed: true }, { pressed: false }, { pressed: false }, { pressed: false }],
    };
    vi.stubGlobal("navigator", { getGamepads: () => [pad] });
    const onPaddle = vi.fn();
    connectGamepadKey({ onPaddle });
    frames.shift()!(0);
    expect(onPaddle).toHaveBeenCalledWith("dit", true);
    pad = null;
    frames.shift()!(0);
    expect(onPaddle).toHaveBeenLastCalledWith("dit", false);
  });

  it("says what is missing and why, on a page that is not secure", () => {
    vi.stubGlobal("isSecureContext", false);
    vi.stubGlobal("navigator", {});
    expect(serialAvailability()).toBe("insecure");
    expect(gamepadAvailability()).toBe("insecure");
    // Chrome on a computer can still have the object there and refuse it.
    vi.stubGlobal("navigator", { serial: {} });
    expect(serialAvailability()).toBe("insecure");
    vi.stubGlobal("isSecureContext", true);
    expect(serialAvailability()).toBe("ready");
    vi.stubGlobal("navigator", {});
    expect(serialAvailability()).toBe("missing");
    expect(gamepadAvailability()).toBe("missing");
  });

  it("finds no controller where the browser refuses to list them", () => {
    vi.stubGlobal("navigator", {
      getGamepads: () => {
        throw new Error("SecurityError");
      },
    });
    expect(connectGamepadKey({ onPaddle: vi.fn() })).toBeNull();
  });
});
