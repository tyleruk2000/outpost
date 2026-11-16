/**
 * Connecting a real key or paddle wired to a USB serial adapter, or a game-controller
 * interface. Interfaces that type keys need nothing connecting (they use the key
 * bindings), and two-button mouse adapters use the mouse-paddle capture.
 *
 * Both of these depend on the browser and on the page: Web Serial is only in Chrome
 * and Edge on a computer, and only on a secure page; some browsers offer game
 * controllers only on a secure page. Each is offered only where it can work, and where
 * it cannot the panel says what is missing and how to get it.
 */
import { Cable, Gamepad2, Unplug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import type { PressSide } from "../keyer/use-keyer";
import type { KeyType } from "../prefs";
import { connectGamepadKey, connectSerialKey, gamepadAvailability, type KeySource, serialAvailability } from "./key-sources";

export interface PhysicalKeyPanelProps {
  keyType: KeyType;
  onPress: (side: PressSide) => void;
  onRelease: (side: PressSide) => void;
}

const httpsLink = (
  <Link to="/settings#https" className="text-primary underline decoration-1 underline-offset-2 hover:decoration-2">
    Settings → HTTPS on your network
  </Link>
);

export function PhysicalKeyPanel({ keyType, onPress, onRelease }: PhysicalKeyPanelProps) {
  const [source, setSource] = useState<KeySource | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The latest handlers and key type, so that a connected source follows a change of settings without reconnecting.
  const handlers = useRef({ keyType, onPress, onRelease });
  handlers.current = { keyType, onPress, onRelease };
  const serial = serialAvailability();
  const gamepad = gamepadAvailability();

  useEffect(() => () => source?.stop(), [source]);

  const paddle = {
    onPaddle: (side: "dit" | "dah", pressed: boolean): void => {
      const current = handlers.current;
      const mapped: PressSide = current.keyType === "straight" ? "straight" : side;
      if (pressed) current.onPress(mapped);
      else current.onRelease(mapped);
    },
  };

  async function connectSerial(): Promise<void> {
    setError(null);
    try {
      const connected = await connectSerialKey(paddle);
      if (connected) setSource(connected);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The serial port could not be opened.");
    }
  }

  function connectGamepad(): void {
    setError(null);
    const connected = connectGamepadKey(paddle);
    if (connected) setSource(connected);
    else setError("No game controller was found. Press a button on it first, so that the browser shows it to the page, then try again.");
  }

  if (source) {
    return (
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-success-soft px-3 py-2">
          <span className="inline-flex min-w-0 items-center gap-2 text-small text-ink">
            {source.kind === "serial" ? (
              <Cable aria-hidden className="size-4 text-success" />
            ) : (
              <Gamepad2 aria-hidden className="size-4 text-success" />
            )}
            <span className="truncate">Connected: {source.label}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              source.stop();
              setSource(null);
            }}
          >
            <Unplug aria-hidden />
            Disconnect
          </Button>
        </div>
        <p className="text-small text-ink-muted">
          {source.kind === "serial"
            ? "CTS keys the dit paddle and DSR or DCD the dah. With a straight key, either one keys the tone."
            : "Its first and third buttons key the dit paddle, the second and fourth the dah. With a straight key, any of them keys the tone."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {serial === "ready" || gamepad === "ready" ? (
        <div className="flex flex-wrap gap-2">
          {serial === "ready" ? (
            <Button onClick={() => void connectSerial()}>
              <Cable aria-hidden />
              Connect a wired key
            </Button>
          ) : null}
          {gamepad === "ready" ? (
            <Button onClick={connectGamepad}>
              <Gamepad2 aria-hidden />
              Connect a game controller
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      <ul className="grid gap-1.5 text-small text-ink-muted">
        <li>
          <span className="font-medium text-ink">Wired to a USB serial adapter: </span>
          {serial === "ready"
            ? "dit on CTS, dah on DSR or DCD. The browser asks which port."
            : serial === "insecure"
              ? null
              : "this browser has no Web Serial. It is in Chrome and Edge on a computer; not on iPhones, iPads or Android phones."}
          {serial === "insecure" ? (
            <>
              needs Web Serial, which browsers offer only on a secure page, and this one was opened over plain http. It also needs Chrome or
              Edge on a computer. How to give Outpost a secure address is under {httpsLink}.
            </>
          ) : null}
        </li>
        <li>
          <span className="font-medium text-ink">A game-controller interface: </span>
          {gamepad === "ready" ? (
            "press one of its buttons, then connect it."
          ) : gamepad === "insecure" ? (
            <>this browser offers game controllers only on a secure page, and this one was opened over plain http. See {httpsLink}.</>
          ) : (
            "this browser does not offer game controllers to pages."
          )}
        </li>
        <li>
          <span className="font-medium text-ink">An interface that types keys: </span>
          nothing to connect. Set its keys under Key bindings.
        </li>
        <li>
          <span className="font-medium text-ink">A two-button mouse adapter: </span>
          use Start mouse paddle.
        </li>
      </ul>
    </div>
  );
}
