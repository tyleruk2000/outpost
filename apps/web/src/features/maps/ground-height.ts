/**
 * The height of the ground under the pointer, or at the centre of the map, for the
 * readout at the foot of the map.
 *
 * It is asked for only once the point has rested for a quarter of a second: never once
 * per movement of the mouse. A request that a newer point has made pointless is
 * cancelled, and the last few answers are kept, so going back over the same ground asks
 * nothing. Positions are taken to four decimal places of a degree (about 11 m, finer than
 * the cells of any terrain), so the same ground is the same question.
 *
 * Nothing is asked while it could not be shown: with the page hidden, with the readout
 * folded on a phone (where the height is shown only when the readout is opened), with a
 * mouse that is not over the map, or with no terrain installed at all.
 */
import type { PointHeight } from "@outpost/shared";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { LatLon } from "./lib/geo";
import type { MapEngine } from "./map/engine";

export type GroundHeight =
  /** Nothing to show: the point is moving, or nothing is being read. */
  | { state: "idle" }
  | { state: "reading" }
  | { state: "known"; meters: number; cellMeters: number | null }
  /** No installed terrain covers the point. */
  | { state: "none" }
  | { state: "failed" };

/** How long a point must stay put before its height is asked for. */
export const REST_MS = 250;
/** Answers kept, so that going back over the same ground asks nothing. */
export const KEPT_ANSWERS = 32;

type Ask = (at: LatLon, signal: AbortSignal) => Promise<PointHeight>;

const IDLE: GroundHeight = { state: "idle" };
const round = (value: number) => Math.round(value * 10_000) / 10_000;

/** Asks for one point at a time, after a rest, cancelling what a newer point supersedes. Kept apart from React so it can be tested with fake timers. */
export class HeightReader {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request: AbortController | undefined;
  private readonly kept = new Map<string, GroundHeight>();
  private shown: GroundHeight = IDLE;

  private readonly ask: Ask;
  private readonly onChange: (reading: GroundHeight) => void;

  constructor(ask: Ask, onChange: (reading: GroundHeight) => void) {
    this.ask = ask;
    this.onChange = onChange;
  }

  /** A point to read once it has rested, or null for nothing. */
  want(at: LatLon | null): void {
    this.cancel();
    this.show(IDLE);
    if (!at) return;
    const point = { lat: round(at.lat), lon: round(at.lon) };
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.read(point);
    }, REST_MS);
  }

  /** Stops whatever is waiting or under way, and shows this. */
  stop(reading: GroundHeight = IDLE): void {
    this.cancel();
    this.show(reading);
  }

  private cancel() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.request?.abort();
    this.request = undefined;
  }

  private show(reading: GroundHeight) {
    if (reading === this.shown) return;
    this.shown = reading;
    this.onChange(reading);
  }

  private async read(point: LatLon) {
    const key = `${point.lat},${point.lon}`;
    const kept = this.kept.get(key);
    if (kept) {
      // Least recently used last.
      this.kept.delete(key);
      this.kept.set(key, kept);
      this.show(kept);
      return;
    }
    const request = new AbortController();
    this.request = request;
    this.show({ state: "reading" });
    try {
      const answer = await this.ask(point, request.signal);
      if (request.signal.aborted) return;
      const reading: GroundHeight =
        answer.heightMeters === null ? { state: "none" } : { state: "known", meters: answer.heightMeters, cellMeters: answer.cellMeters };
      this.kept.set(key, reading);
      for (const oldest of this.kept.keys()) {
        if (this.kept.size <= KEPT_ANSWERS) break;
        this.kept.delete(oldest);
      }
      this.request = undefined;
      this.show(reading);
    } catch {
      if (request.signal.aborted) return;
      this.request = undefined;
      this.show({ state: "failed" });
    }
  }
}

const askServer: Ask = (at, signal) => api.get<PointHeight>("/api/maps/height", { at: `${at.lat},${at.lon}` }, signal);

/** True on a device whose main pointer can hover: a mouse or a trackpad, where the readout follows the pointer. */
const canHover = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(hover: hover)").matches;

/**
 * The height for the readout. `active` is whether it can be shown now (the page in sight,
 * and on a phone the readout opened); `terrain` whether any terrain is installed;
 * `opened` whether the readout is opened, which on a device with a mouse is the one time
 * the centre is read (the mouse is then over the readout, not the map).
 */
export function useGroundHeight(
  engine: MapEngine,
  { active, terrain, opened, ask = askServer }: { active: boolean; terrain: boolean; opened: boolean; ask?: Ask },
): GroundHeight {
  const [reading, setReading] = useState<GroundHeight>(IDLE);
  const reader = useRef<HeightReader | null>(null);
  reader.current ??= new HeightReader(ask, setReading);

  useEffect(() => {
    const heights = reader.current!;
    if (!active) {
      heights.stop();
      return;
    }
    if (!terrain) {
      // Nothing installed anywhere: no need to ask to know there is no height.
      heights.stop({ state: "none" });
      return;
    }
    // On a touch screen the readout gives the centre; with a mouse, the pointer, or the centre while the readout is opened.
    const centre = opened || !canHover();
    let pointer: LatLon | null = null;
    const follow = () => heights.want(pointer ?? (centre ? engine.getCenter() : null));
    follow();
    const offPointer = engine.on("pointer", (position) => {
      pointer = position;
      follow();
    });
    // Each frame of a move puts the rest off again: the centre is read once the map has stopped.
    const offMove = engine.on("move", () => {
      if (!pointer && centre) follow();
    });
    return () => {
      offPointer();
      offMove();
      heights.stop();
    };
  }, [engine, active, terrain, opened]);

  return reading;
}
