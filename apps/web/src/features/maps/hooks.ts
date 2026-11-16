/** Small hooks shared by the maps screen's components. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/lib/theme";
import { mixOklch, oklchToHex, parseOklch, tokenToHex } from "./lib/color";
import { FALLBACK_THEME } from "./lib/palette";
import type { MapFlavour, MapTheme } from "./lib/style";
import { readStored, writeStored } from "./lib/view";

export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** True from the `md` breakpoint up, where the sidebar and the side panel are shown. */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 48rem)").matches);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 48rem)");
    const onChange = (event: MediaQueryListEvent) => setDesktop(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return desktop;
}

/** State that is remembered in this browser. */
export function useStoredState<T>(
  key: string,
  isValid: (value: unknown) => value is T,
  fallback: T,
): [T, (next: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, isValid, fallback));
  const set = useCallback(
    (next: T | ((current: T) => T)) =>
      setValue((current) => {
        const resolved = typeof next === "function" ? (next as (current: T) => T)(current) : next;
        writeStored(key, resolved);
        return resolved;
      }),
    [key],
  );
  return [value, set];
}

/** The map's base colours, read from the design tokens as the browser has resolved them. */
export function readMapTheme(): { flavour: MapFlavour; theme: MapTheme } {
  const flavour: MapFlavour = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const fallback = FALLBACK_THEME[flavour];
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(name);
  const hex = (name: string, otherwise: string) => tokenToHex(token(name), otherwise);

  // Water in the light theme is a wash of the verdigris primary; in the dark theme it is the spine itself.
  const soft = parseOklch(token("--primary-soft"));
  const primary = parseOklch(token("--primary"));
  const water =
    flavour === "dark" ? hex("--spine", fallback.water) : soft && primary ? oklchToHex(mixOklch(soft, primary, 0.2)) : fallback.water;

  // Contour lines are the earth brown of a printed map: the hue of the warning token, which is the
  // only warm token that is not the lamp, quietened towards the muted ink so that a hillside of
  // lines never reads as a screenful of amber.
  const warm = parseOklch(token("--warning"));
  const muted = parseOklch(token("--ink-muted"));
  const contour = warm && muted ? oklchToHex({ l: (warm.l + muted.l) / 2, c: warm.c * 0.65, h: warm.h }) : fallback.contour;

  return {
    flavour,
    theme: {
      land: hex(flavour === "dark" ? "--surface" : "--surface-strong", fallback.land),
      water,
      outline: hex("--border-strong", fallback.outline),
      road: flavour === "dark" ? hex("--border-strong", fallback.road) : hex("--page", fallback.road),
      roadCasing: flavour === "dark" ? hex("--page", fallback.roadCasing) : hex("--border-strong", fallback.roadCasing),
      path: hex("--ink-faint", fallback.path),
      page: hex("--page", fallback.page),
      ink: hex("--ink", fallback.ink),
      inkMuted: hex("--ink-muted", fallback.inkMuted),
      primary: hex("--primary", fallback.primary),
      lamp: hex("--lamp", fallback.lamp),
      contour,
    },
  };
}

/**
 * The map theme for the app's current theme. The theme provider writes `data-theme`
 * on the root in an effect of its own, so the tokens are re-read when that attribute
 * changes rather than when the choice does.
 */
export function useMapTheme(): { flavour: MapFlavour; theme: MapTheme } {
  const { resolved } = useTheme();
  const [value, setValue] = useState(readMapTheme);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `resolved` re-runs the read when the app theme changes
  useEffect(() => {
    const update = () =>
      setValue((current) => {
        const next = readMapTheme();
        return JSON.stringify(next) === JSON.stringify(current) ? current : next;
      });
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [resolved]);
  return value;
}

export interface PositionFix {
  lat: number;
  lon: number;
  /** Radius in metres the device claims to be within. */
  accuracy: number;
}

export type LocateState = "off" | "waiting" | "following";

const LOCATION_ERRORS: Record<number, string> = {
  1: "Outpost was not allowed to use this device's location. Allow it in the browser's site settings, then try again.",
  2: "This device could not work out where it is. Outdoors, with a clear view of the sky, GPS usually finds a position within a minute.",
  3: "Finding a position took too long. Try again where the sky is in view.",
};

/**
 * The device's own position, while the person asks for it. Works without a connection
 * wherever the device has GPS. Browsers only share location with pages loaded over
 * HTTPS or from localhost, so over plain HTTP on a home network this says so.
 */
export function useGeolocation(onFix: (fix: PositionFix, first: boolean) => void, onError: (message: string) => void) {
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;
  const [state, setState] = useState<LocateState>("off");
  const [fix, setFix] = useState<PositionFix | null>(null);
  const watch = useRef<number | undefined>(undefined);
  const callbacks = useRef({ onFix, onError });
  callbacks.current = { onFix, onError };

  const stop = useCallback(() => {
    if (watch.current !== undefined) navigator.geolocation.clearWatch(watch.current);
    watch.current = undefined;
    setState("off");
    setFix(null);
  }, []);

  const start = useCallback(() => {
    if (!supported || watch.current !== undefined) return;
    if (!window.isSecureContext) {
      callbacks.current.onError(
        "Browsers only share a device's location with pages opened over HTTPS or on the device itself. Turn on Settings → HTTPS on your network, then open Outpost at its https address.",
      );
      return;
    }
    let first = true;
    setState("waiting");
    watch.current = navigator.geolocation.watchPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy };
        setFix(next);
        setState("following");
        callbacks.current.onFix(next, first);
        first = false;
      },
      (error) => {
        callbacks.current.onError(LOCATION_ERRORS[error.code] ?? "This device's location is not available.");
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
  }, [supported, stop]);

  useEffect(
    () => () => {
      if (watch.current !== undefined) navigator.geolocation.clearWatch(watch.current);
    },
    [],
  );

  return { supported, state, fix, start, stop };
}

/**
 * Copies text and reports whether it worked. The clipboard API only exists on HTTPS and
 * localhost; over plain HTTP on a home network the older selection-based copy is used.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the older way.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
