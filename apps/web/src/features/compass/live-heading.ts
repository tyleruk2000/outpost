/**
 * The phone's own compass heading, from the browser's device-orientation events.
 *
 * - iPhone and iPad (Safari): a `deviceorientation` event carries `webkitCompassHeading`,
 *   degrees clockwise from magnetic north, once the person has pressed a button that asks
 *   for it (`DeviceOrientationEvent.requestPermission()`), and only on a secure page.
 * - Android (Chrome and others): a `deviceorientationabsolute` event (or a
 *   `deviceorientation` event marked `absolute`) gives the phone's orientation against
 *   the Earth; the heading is worked from its three angles. The phone's sensors take
 *   north from the magnetometer, so this too is a magnetic heading.
 *
 * Neither is given on a plain http page, and a computer with no compass gives nothing.
 * Nothing listens until a person presses Start, and nothing listens while the page is
 * hidden: see useLiveHeading.
 */
import { useEffect, useRef, useState } from "react";

const DEG = Math.PI / 180;

export interface OrientationReading {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute?: boolean;
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

export interface Heading {
  /** Degrees clockwise from magnetic north, 0 up to 360. */
  magnetic: number;
  /** What the phone says it is good to, in degrees, where it says (iOS). */
  accuracy: number | null;
}

/**
 * A heading from one event, or null if the event carries none. `screenAngle` is how far
 * the screen is turned from the phone's natural way up (screen.orientation.angle).
 *
 * From the three angles, the heading is that of the top edge of the phone while it is held
 * more flat than upright, and that of its back (the way the camera looks) while it is held
 * up in front of the face: the two directions a person points a phone along. The rotation
 * is the one the W3C Device Orientation specification defines (Z, then X′, then Y″), whose
 * own worked example gives the second case.
 */
export function headingFrom(event: OrientationReading, screenAngle = 0): Heading | null {
  if (typeof event.webkitCompassHeading === "number" && Number.isFinite(event.webkitCompassHeading) && event.webkitCompassHeading >= 0) {
    const accuracy =
      typeof event.webkitCompassAccuracy === "number" && event.webkitCompassAccuracy >= 0 ? event.webkitCompassAccuracy : null;
    return { magnetic: wrap(event.webkitCompassHeading), accuracy };
  }
  if (!event.absolute || event.alpha === null || !Number.isFinite(event.alpha)) return null;
  const z = event.alpha * DEG;
  const x = (event.beta ?? 0) * DEG;
  const y = (event.gamma ?? 0) * DEG;
  const [cZ, sZ, cX, sX, cY, sY] = [Math.cos(z), Math.sin(z), Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y)];
  // The phone's top edge in the Earth's frame (east, north), and its back.
  const topEast = -sZ * cX;
  const topNorth = cZ * cX;
  const backEast = -cZ * sY - sZ * sX * cY;
  const backNorth = -sZ * sY + cZ * sX * cY;
  const flat = Math.hypot(topEast, topNorth) >= Math.hypot(backEast, backNorth);
  const heading = flat ? Math.atan2(topEast, topNorth) / DEG + screenAngle : Math.atan2(backEast, backNorth) / DEG;
  return { magnetic: wrap(heading), accuracy: null };
}

const wrap = (degrees: number) => ((degrees % 360) + 360) % 360;

export type LiveState =
  /** Not started. */
  | "off"
  /** This page is not secure: browsers give no orientation to it. */
  | "insecure"
  /** Asking the person (iOS). */
  | "asking"
  | "denied"
  /** Started, waiting for a first heading. */
  | "waiting"
  | "live"
  /** Started, and nothing came: no compass in this device. */
  | "none";

interface PermissionCapable {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
}

/** How long to wait for a first heading before saying the device gives none. */
export const FIRST_HEADING_MS = 3000;

/** The screen's turn from the phone's natural way up, in degrees. */
const screenAngle = () => (typeof screen !== "undefined" && screen.orientation ? screen.orientation.angle : 0);

/**
 * The live heading, while `open` is true and the page is visible. `start` must be called
 * from a press: on iOS it asks for permission, which Safari allows only then. Closing the
 * card (`open` false), hiding the page or leaving the screen removes every listener.
 */
export function useLiveHeading(open: boolean): { state: LiveState; heading: Heading | null; start: () => Promise<void> } {
  const [state, setState] = useState<LiveState>("off");
  const [heading, setHeading] = useState<Heading | null>(null);
  const [granted, setGranted] = useState(false);
  const shown = useRef<string>("");

  useEffect(() => {
    if (!open) {
      setState((current) => (current === "insecure" || current === "denied" ? current : "off"));
      setHeading(null);
      setGranted(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !granted) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let listening = false;
    let heard = false;
    const onReading = (event: Event) => {
      const next = headingFrom(event as unknown as OrientationReading, screenAngle());
      if (!next) return;
      heard = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      // Only a change a person could see is drawn: the figure is shown to the whole degree.
      const key = `${Math.round(next.magnetic) % 360}|${next.accuracy === null ? "" : Math.round(next.accuracy)}`;
      if (key === shown.current) return;
      shown.current = key;
      setHeading(next);
      setState("live");
    };
    const listen = () => {
      if (listening) return;
      listening = true;
      window.addEventListener("deviceorientationabsolute", onReading);
      window.addEventListener("deviceorientation", onReading);
      if (!heard) {
        setState("waiting");
        timer = setTimeout(() => {
          timer = undefined;
          if (!heard) setState("none");
        }, FIRST_HEADING_MS);
      }
    };
    const stop = () => {
      listening = false;
      window.removeEventListener("deviceorientationabsolute", onReading);
      window.removeEventListener("deviceorientation", onReading);
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? listen() : stop());
    if (document.visibilityState === "visible") listen();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      shown.current = "";
    };
  }, [open, granted]);

  const start = async () => {
    if (!window.isSecureContext) {
      setState("insecure");
      return;
    }
    if (typeof DeviceOrientationEvent === "undefined") {
      setState("none");
      return;
    }
    const ask = (DeviceOrientationEvent as unknown as PermissionCapable).requestPermission;
    if (typeof ask === "function") {
      setState("asking");
      try {
        const answer = await ask.call(DeviceOrientationEvent);
        if (answer !== "granted") {
          setState("denied");
          return;
        }
      } catch {
        setState("denied");
        return;
      }
    }
    setGranted(true);
  };

  return { state, heading, start };
}
