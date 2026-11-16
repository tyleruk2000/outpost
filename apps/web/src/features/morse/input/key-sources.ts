/**
 * Real keys and paddles. Four ways one can be plugged in:
 *  1. As a keyboard (most USB Morse interfaces): the key bindings in useKeyer;
 *     nothing to connect.
 *  2. As a two-button mouse: the mouse-paddle capture, which is started by hand for
 *     the session so that ordinary clicking is never taken over.
 *  3. Wired to a USB serial adapter's control lines (dit on CTS, dah on DSR or DCD),
 *     through Web Serial: Chrome and Edge on a computer, on a secure page only.
 *  4. As a game controller: buttons 0 and 2 dit, 1 and 3 dah, read every frame. Some
 *     browsers offer controllers only on a secure page.
 *
 * Every source calls the same functions as the on-screen key, so the keyer, the tone
 * and the decoder cannot tell them apart.
 */

export interface KeySourceCallbacks {
  onPaddle: (side: "dit" | "dah", pressed: boolean) => void;
}

export interface KeySource {
  kind: "serial" | "gamepad";
  label: string;
  stop: () => void;
}

interface SerialSignals {
  clearToSend: boolean;
  dataSetReady: boolean;
  dataCarrierDetect: boolean;
}

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getSignals(): Promise<SerialSignals>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}

export function serialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export function gamepadSupported(): boolean {
  return typeof navigator !== "undefined" && "getGamepads" in navigator;
}

/** Whether this page is one browsers treat as secure (https, or the computer itself). */
export function securePage(): boolean {
  return typeof window !== "undefined" && window.isSecureContext === true;
}

/**
 * "ready": it can be used here. "insecure": this browser may have it, but not on a plain
 * http page such as Outpost's address on a home network. "missing": this browser has none.
 */
export type SourceAvailability = "ready" | "insecure" | "missing";

export function serialAvailability(): SourceAvailability {
  if (serialSupported() && securePage()) return "ready";
  return securePage() ? "missing" : "insecure";
}

export function gamepadAvailability(): SourceAvailability {
  if (gamepadSupported()) return "ready";
  return securePage() ? "missing" : "insecure";
}

/**
 * Prompt for a serial port (user gesture required) and poll its control lines
 * every ~3 ms. Returns null if the user cancels the picker.
 */
export async function connectSerialKey(cb: KeySourceCallbacks): Promise<KeySource | null> {
  if (!serialSupported() || !window.isSecureContext) throw new Error("Web Serial is not available on this page.");
  const serial = (navigator as unknown as { serial: { requestPort(): Promise<SerialPortLike> } }).serial;
  let port: SerialPortLike;
  try {
    port = await serial.requestPort();
  } catch {
    return null; // picker dismissed
  }
  await port.open({ baudRate: 9600 });

  let active = true;
  let dit = false;
  let dah = false;
  const loop = async (): Promise<void> => {
    while (active) {
      try {
        const s = await port.getSignals();
        const nextDit = s.clearToSend;
        const nextDah = s.dataSetReady || s.dataCarrierDetect;
        if (nextDit !== dit) {
          dit = nextDit;
          cb.onPaddle("dit", dit);
        }
        if (nextDah !== dah) {
          dah = nextDah;
          cb.onPaddle("dah", dah);
        }
      } catch {
        // Unplugged while held: let go of what was held, or the iambic keyer
        // stays down and sends dits for ever.
        active = false;
        if (dit) {
          dit = false;
          cb.onPaddle("dit", false);
        }
        if (dah) {
          dah = false;
          cb.onPaddle("dah", false);
        }
      }
      await new Promise((r) => setTimeout(r, 3));
    }
  };
  void loop();

  const info = port.getInfo();
  const label = info.usbVendorId
    ? `Serial key (USB ${info.usbVendorId.toString(16)}:${(info.usbProductId ?? 0).toString(16)})`
    : "Serial key";
  return {
    kind: "serial",
    label,
    stop: () => {
      active = false;
      if (dit) cb.onPaddle("dit", false);
      if (dah) cb.onPaddle("dah", false);
      void port.close().catch(() => {});
    },
  };
}

/**
 * Poll the first connected gamepad per animation frame. Buttons 0/2 key the
 * dit paddle, 1/3 the dah paddle.
 */
export function connectGamepadKey(cb: KeySourceCallbacks): KeySource | null {
  if (!gamepadSupported()) return null;
  let pads: (Gamepad | null)[];
  try {
    pads = [...navigator.getGamepads()];
  } catch {
    // Refused on a page that is not secure.
    return null;
  }
  const pad = pads.find((p) => p !== null);
  if (!pad) return null;
  const index = pad.index;

  let active = true;
  let raf = 0;
  let dit = false;
  let dah = false;
  const loop = (): void => {
    if (!active) return;
    let p: Gamepad | null | undefined = null;
    try {
      p = navigator.getGamepads()[index];
    } catch {
      p = null;
    }
    if (p) {
      const nextDit = Boolean(p.buttons[0]?.pressed || p.buttons[2]?.pressed);
      const nextDah = Boolean(p.buttons[1]?.pressed || p.buttons[3]?.pressed);
      if (nextDit !== dit) {
        dit = nextDit;
        cb.onPaddle("dit", dit);
      }
      if (nextDah !== dah) {
        dah = nextDah;
        cb.onPaddle("dah", dah);
      }
    } else {
      // Unplugged while held: let go, as the serial path does.
      if (dit) {
        dit = false;
        cb.onPaddle("dit", false);
      }
      if (dah) {
        dah = false;
        cb.onPaddle("dah", false);
      }
    }
    raf = window.requestAnimationFrame(loop);
  };
  raf = window.requestAnimationFrame(loop);

  return {
    kind: "gamepad",
    label: pad.id.length > 34 ? `${pad.id.slice(0, 34)}…` : pad.id,
    stop: () => {
      active = false;
      window.cancelAnimationFrame(raf);
      if (dit) cb.onPaddle("dit", false);
      if (dah) cb.onPaddle("dah", false);
    },
  };
}
