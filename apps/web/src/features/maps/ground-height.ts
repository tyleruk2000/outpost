/**
 * The height of the ground under the pointer, or at the centre of the map, for the
 * readout at the foot of the map.
 *
 * The figure follows the point as it moves: it is there whenever a height can be had, not
 * only once the mouse is held still. One request is out at a time and they start at least
 * a tenth of a second apart, so a pointer swept across the map asks a few times a second
 * and never once per movement. While the next answer is on its way the last figure stays
 * (it is for ground a moment behind the pointer); if no answer comes within a little over
 * half a second it goes, so a figure never sits beside coordinates it does not belong to.
 * The last few answers are kept, so going back over the same ground asks nothing.
 * Positions are taken to four decimal places of a degree (about 11 m, finer than the
 * cells of any terrain), so the same ground is the same question.
 *
 * Nothing is asked while it could not be shown: with the page hidden, with the readout
 * folded on a phone (where the height is shown only when the readout is opened), or with
 * no terrain installed at all.
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

/** The least time between the start of one request and the next. */
export const PACE_MS = 100;
/** How long the last figure may stand, while a newer point's is read, before it is taken away. */
export const STALE_MS = 600;
/** Answers kept, so that going back over the same ground asks nothing. */
export const KEPT_ANSWERS = 32;

type Ask = (at: LatLon, signal: AbortSignal) => Promise<PointHeight>;

const IDLE: GroundHeight = { state: "idle" };
const READING: GroundHeight = { state: "reading" };
const round = (value: number) => Math.round(value * 10_000) / 10_000;
const keyOf = (point: LatLon) => `${point.lat},${point.lon}`;

/** Asks for one point at a time, at a steady pace, always the newest wanted. Kept apart from React so it can be tested with fake timers. */
export class HeightReader {
  /** Waiting out the pace before the next request. */
  private pace: ReturnType<typeof setTimeout> | undefined;
  /** Running while the figure shown is for ground the point has left. */
  private stale: ReturnType<typeof setTimeout> | undefined;
  private request: AbortController | undefined;
  /** The newest point not yet asked for. */
  private next: LatLon | null = null;
  /** The point last wanted: the same one again is no news. */
  private wanted: string | null = null;
  private askedAt = Number.NEGATIVE_INFINITY;
  private readonly kept = new Map<string, GroundHeight>();
  private shown: GroundHeight = IDLE;

  private readonly ask: Ask;
  private readonly onChange: (reading: GroundHeight) => void;

  constructor(ask: Ask, onChange: (reading: GroundHeight) => void) {
    this.ask = ask;
    this.onChange = onChange;
  }

  /** The point whose height is wanted now, or null for nothing. */
  want(at: LatLon | null): void {
    if (!at) {
      this.stop();
      return;
    }
    const point = { lat: round(at.lat), lon: round(at.lon) };
    const key = keyOf(point);
    if (key === this.wanted) return;
    this.wanted = key;
    const kept = this.kept.get(key);
    if (kept) {
      // Least recently used last.
      this.kept.delete(key);
      this.kept.set(key, kept);
      // Whatever is waiting or under way is for ground the point has left.
      this.cancel();
      this.show(kept);
      return;
    }
    this.next = point;
    if (this.shown.state !== "known") this.show(READING);
    else this.stale ??= setTimeout(() => this.show(READING), STALE_MS);
    this.pump();
  }

  /** Stops whatever is waiting or under way, and shows this. */
  stop(reading: GroundHeight = IDLE): void {
    this.cancel();
    this.wanted = null;
    this.show(reading);
  }

  private cancel() {
    if (this.pace !== undefined) clearTimeout(this.pace);
    this.pace = undefined;
    this.next = null;
    this.request?.abort();
    this.request = undefined;
  }

  private show(reading: GroundHeight) {
    if (this.stale !== undefined) clearTimeout(this.stale);
    this.stale = undefined;
    if (reading === this.shown || (reading.state === "reading" && this.shown.state === "reading")) return;
    this.shown = reading;
    this.onChange(reading);
  }

  /** Starts the next request, if one is wanted, none is out and the pace allows. */
  private pump() {
    if (!this.next || this.request || this.pace !== undefined) return;
    const wait = this.askedAt + PACE_MS - Date.now();
    if (wait > 0) {
      this.pace = setTimeout(() => {
        this.pace = undefined;
        this.pump();
      }, wait);
      return;
    }
    const point = this.next;
    this.next = null;
    void this.read(point);
  }

  private async read(point: LatLon) {
    const request = new AbortController();
    this.request = request;
    this.askedAt = Date.now();
    try {
      const answer = await this.ask(point, request.signal);
      if (request.signal.aborted) return;
      const reading: GroundHeight =
        answer.heightMeters === null ? { state: "none" } : { state: "known", meters: answer.heightMeters, cellMeters: answer.cellMeters };
      this.kept.set(keyOf(point), reading);
      for (const oldest of this.kept.keys()) {
        if (this.kept.size <= KEPT_ANSWERS) break;
        this.kept.delete(oldest);
      }
      this.request = undefined;
      // Shown even when the point has moved on since: it is the nearest ground known, and the newest is asked next.
      this.show(reading);
      if (this.next && reading.state === "known") this.stale = setTimeout(() => this.show(READING), STALE_MS);
    } catch {
      if (request.signal.aborted) return;
      this.request = undefined;
      // A failure for ground the point has left says nothing about where it is now.
      if (!this.next) this.show({ state: "failed" });
    }
    this.pump();
  }
}

const askServer: Ask = (at, signal) => api.get<PointHeight>("/api/maps/height", { at: `${at.lat},${at.lon}` }, signal);

/**
 * The height for the readout. `active` is whether it can be shown now (the page in sight,
 * and on a phone the readout opened); `terrain` whether any terrain is installed. It is
 * for the same point as the coordinates beside it: the pointer while a mouse is over the
 * map, and otherwise the centre.
 */
export function useGroundHeight(
  engine: MapEngine,
  { active, terrain, ask = askServer }: { active: boolean; terrain: boolean; ask?: Ask },
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
    let pointer: LatLon | null = null;
    const follow = () => heights.want(pointer ?? engine.getCenter());
    follow();
    const offPointer = engine.on("pointer", (position) => {
      pointer = position;
      follow();
    });
    const offMove = engine.on("move", () => {
      if (!pointer) follow();
    });
    return () => {
      offPointer();
      offMove();
      heights.stop();
    };
  }, [engine, active, terrain]);

  return reading;
}
