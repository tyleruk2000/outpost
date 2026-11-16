/**
 * Recording a track as its maker walks.
 *
 * Everything here happens on the device. Positions come from the browser, are
 * filtered (`track-log.ts`) and written to the device's own storage as they arrive
 * (`store.ts`). Outpost is not asked for anything until the recording is stopped and
 * named; then it is sent as GPX, and if Outpost cannot be reached it waits on the
 * device and is sent again until it has been taken. A recording is removed from the
 * device only once the server has answered that it holds it.
 *
 * What a browser allows shapes all of it. A page is given positions only while it is
 * the page in front on a screen that is on (see docs/maps.md, "Recording a track", for
 * the sources), so:
 *
 * - while recording, the browser is asked to keep the screen on, and asked again each
 *   time the page comes back into view, because the browser lets go of that whenever
 *   the page is hidden;
 * - a stretch of more than a minute out of sight with no position is written down as
 *   an interruption and breaks the line, so nothing is drawn or counted across ground
 *   that was not recorded;
 * - a recording that was cut off (a reload, a closed tab, a browser that was ended) is
 *   found on the next visit and offered back.
 *
 * The recorder knows nothing of React or of the page: what it needs from the browser
 * is handed to it (`RecorderEnv`), which is also how it is tested.
 */
import { MAX_RECORDING_POINTS, type MarkerColor, type TrackDto } from "@outpost/shared";
import { buildRecordingGpx, gpxFileName } from "./gpx";
import type { Interruption, RecordingMeta, RecordingStore } from "./store";
import {
  addPoint,
  BACKGROUND_GAP_MS,
  DisplayLine,
  emptyTally,
  type Fix,
  type FixRefusal,
  fixTime,
  judgeFix,
  newRecordingId,
  type RecordedPoint,
  type Tally,
  type Totals,
  tallyOf,
  totalsOf,
} from "./track-log";

/**
 * "idle": nothing in hand. "recording": positions are being kept. "paused": the
 * recording is open but nothing is being kept. "stopped": ended, waiting for a name.
 */
export type Phase = "idle" | "recording" | "paused" | "stopped";

/**
 * Why a recording is not going as asked. "denied": the browser was told not to share
 * the location. "unavailable": the device cannot find where it is just now.
 * "storage": the device would not keep a point. "full": the recording has as many
 * points as one track can hold.
 */
export type Problem = "denied" | "unavailable" | "storage" | "full";

/**
 * "held": the browser said yes to keeping the screen on. "released": it had said yes
 * and has since let go. "refused": it said no. "unsupported": it has no way to be
 * asked. "off": not being asked, because nothing is being recorded.
 */
export type WakeState = "off" | "held" | "released" | "refused" | "unsupported";

/** A recording that is named and has not yet been taken by Outpost. */
export interface PendingSave {
  id: string;
  name: string;
  color: MarkerColor;
  startedAt: number;
  totals: Totals;
  /** "waiting": to be sent, or sent again. "sending": being sent now. "refused": Outpost would not take it. */
  state: "waiting" | "sending" | "refused";
  /** What Outpost said when it refused. */
  message: string | null;
}

export interface RecorderSnapshot {
  /** False until the device's storage has been read. */
  ready: boolean;
  /** "unavailable" where the browser keeps nothing for this page; recording is then not offered. */
  storage: "ok" | "unavailable";
  phase: Phase;
  id: string | null;
  totals: Totals;
  /** Goes up each time the line to draw changes. */
  lineRevision: number;
  /** Where the device last said it was, whether or not that was kept. */
  position: { lat: number; lon: number; accuracy: number } | null;
  lastFix: { at: number; accuracy: number; refusal: FixRefusal | null } | null;
  problem: Problem | null;
  wake: WakeState;
  interruptions: Interruption[];
  /** A recording left unfinished by an earlier visit, waiting to be continued, saved or discarded. */
  unfinished: { id: string; startedAt: number; totals: Totals } | null;
  /** Another tab of this browser holds the recording. */
  elsewhere: boolean;
  pending: PendingSave[];
}

export type SaveOutcome = { state: "saved"; track: TrackDto } | { state: "waiting" } | { state: "refused"; message: string };

export type StartOutcome = "started" | "insecure" | "unsupported" | "storage" | "elsewhere" | "busy";

/** A save that did not go through. `retry` is true when sending the same thing again later may work. */
export class SendFailure extends Error {
  readonly retry: boolean;
  constructor(message: string, retry: boolean) {
    super(message);
    this.name = "SendFailure";
    this.retry = retry;
  }
}

export interface WakeSentinel {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

/** A position as the browser hands it over. */
export interface PositionLike {
  coords: { latitude: number; longitude: number; accuracy: number; altitude: number | null; altitudeAccuracy: number | null };
  timestamp: number;
}

/** What the recorder needs from the browser. */
export interface RecorderEnv {
  openStore(): Promise<RecordingStore>;
  /** Null where the browser has no geolocation at all. */
  geolocation: {
    watchPosition(
      onPosition: (position: PositionLike) => void,
      onError: (error: { code: number }) => void,
      options: { enableHighAccuracy: boolean; maximumAge: number },
    ): number;
    clearWatch(id: number): void;
  } | null;
  /** Whether the page was opened over HTTPS or on the device itself: browsers share a location with no other. */
  secure(): boolean;
  now(): number;
  /** That many bytes of chance, for a new recording's id. */
  random(count: number): ArrayLike<number>;
  visible(): boolean;
  onVisibility(listener: () => void): () => void;
  onOnline(listener: () => void): () => void;
  /** Asks the browser to keep the screen on. Null where it cannot be asked. */
  requestWakeLock: (() => Promise<WakeSentinel>) | null;
  /** Keeps two tabs from recording at once. Null where the browser has no such thing. */
  tabLock: { hold(): Promise<(() => void) | null>; heldElsewhere(): Promise<boolean> } | null;
  /** Sends a named recording to Outpost. Rejects with `SendFailure`. */
  send(recording: { id: string; name: string; color: MarkerColor; gpx: string }): Promise<TrackDto>;
  setTimeout(run: () => void, milliseconds: number): number;
  clearTimeout(id: number): void;
}

/** How long to wait before sending again, each time it fails; the last one repeats. */
export const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];
/** Interruptions written down for one recording; more than this and the oldest are still there, the newest are not listed. */
const MAX_INTERRUPTIONS = 200;

const EMPTY_TOTALS = totalsOf(emptyTally());

const INITIAL: RecorderSnapshot = {
  ready: false,
  storage: "ok",
  phase: "idle",
  id: null,
  totals: EMPTY_TOTALS,
  lineRevision: 0,
  position: null,
  lastFix: null,
  problem: null,
  wake: "off",
  interruptions: [],
  unfinished: null,
  elsewhere: false,
  pending: [],
};

interface Parked {
  meta: RecordingMeta;
  tally: Tally;
  line: DisplayLine;
}

function lineOf(points: RecordedPoint[]): DisplayLine {
  const line = new DisplayLine();
  for (const point of points) line.add(point);
  return line;
}

export class Recorder {
  private readonly env: RecorderEnv;
  private snapshot: RecorderSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private readonly savedListeners = new Set<(track: TrackDto) => void>();
  private store: RecordingStore | null = null;
  private loading: Promise<void> | null = null;

  /** The recording in hand. */
  private meta: RecordingMeta | null = null;
  private tally: Tally = emptyTally();
  private line = new DisplayLine();
  /** A recording an earlier visit left behind, read and ready to be taken up. */
  private parked: Parked | null = null;

  private watch: number | undefined;
  private sentinel: WakeSentinel | null = null;
  private askingForWake = false;
  private releaseTab: (() => void) | null = null;
  private hiddenAt: number | null = null;
  private fixWhileHidden = false;
  /** Writes to the device go one after another, in the order the points were kept. */
  private writing: Promise<void> = Promise.resolve();

  private readonly sending = new Map<string, Promise<SaveOutcome>>();
  private retryTimer: number | undefined;
  private retryAttempt = 0;

  constructor(env: RecorderEnv) {
    this.env = env;
  }

  // ── Reading the state ──

  getSnapshot = (): RecorderSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Told each time Outpost takes a recording, whether straight away or after waiting. */
  onSaved(listener: (track: TrackDto) => void): () => void {
    this.savedListeners.add(listener);
    return () => this.savedListeners.delete(listener);
  }

  /** The stretches to draw on the map, each a list of [longitude, latitude]. */
  displayLines(): Array<Array<[number, number]>> {
    return this.meta ? this.line.coordinates() : [];
  }

  /** Whether this browser can record at all, and if not, which of the things it needs is missing. */
  ability(): "ok" | "insecure" | "unsupported" | "storage" {
    if (!this.env.geolocation) return "unsupported";
    if (!this.env.secure()) return "insecure";
    if (this.snapshot.storage === "unavailable") return "storage";
    return "ok";
  }

  private set(patch: Partial<RecorderSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  // ── Starting up ──

  /** Reads what the device holds: an unfinished recording to offer back, and recordings waiting to be sent. */
  init(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  private async load(): Promise<void> {
    this.env.onVisibility(() => this.visibilityChanged());
    this.env.onOnline(() => void this.retryNow());
    let metas: RecordingMeta[];
    try {
      this.store = await this.env.openStore();
      metas = await this.store.list();
    } catch {
      this.store = null;
      this.set({ ready: true, storage: "unavailable" });
      return;
    }
    const pending = metas
      .filter((meta) => meta.status === "queued" || meta.status === "refused")
      .sort((a, b) => a.startedAt - b.startedAt)
      .map(
        (meta): PendingSave => ({
          id: meta.id,
          name: meta.name,
          color: meta.color,
          startedAt: meta.startedAt,
          totals: meta.totals,
          state: meta.status === "refused" ? "refused" : "waiting",
          message: meta.refusal,
        }),
      );
    this.set({ ready: true, storage: "ok", pending });
    await this.findUnfinished(metas.filter((meta) => meta.status === "active" || meta.status === "stopped"));
    void this.flush();
  }

  /** Reads the newest unfinished recording, so that what is offered back is counted from its points. */
  private async findUnfinished(unfinished: RecordingMeta[]): Promise<void> {
    if (!this.store || unfinished.length === 0) return;
    // A tab that is recording right now has not left anything behind.
    if (await this.env.tabLock?.heldElsewhere().catch(() => false)) {
      this.set({ elsewhere: true });
      return;
    }
    for (const meta of unfinished.sort((a, b) => b.startedAt - a.startedAt)) {
      const points = await this.store.points(meta.id);
      if (points.length === 0) {
        // Started, and ended before the first position came: there is nothing to offer.
        await this.store.remove(meta.id).catch(() => undefined);
        continue;
      }
      if (this.parked || this.meta) continue;
      const tally = tallyOf(points);
      this.parked = { meta, tally, line: lineOf(points) };
      this.set({ unfinished: { id: meta.id, startedAt: meta.startedAt, totals: totalsOf(tally) } });
    }
  }

  // ── Recording ──

  async start(): Promise<StartOutcome> {
    await this.init();
    const able = this.ability();
    if (able !== "ok") return able;
    if (this.meta || this.parked || !this.store) return "busy";
    if (!(await this.holdTab())) return "elsewhere";
    const meta: RecordingMeta = {
      id: newRecordingId(this.env.now(), this.env.random),
      startedAt: this.env.now(),
      status: "active",
      name: "",
      color: "teal",
      segment: 0,
      interruptions: [],
      refusal: null,
      totals: EMPTY_TOTALS,
    };
    try {
      await this.store.put(meta);
    } catch {
      this.letGoOfTab();
      this.set({ storage: "unavailable" });
      return "storage";
    }
    this.meta = meta;
    this.tally = emptyTally();
    this.line = new DisplayLine();
    this.begin({ id: meta.id, totals: EMPTY_TOTALS, interruptions: [], position: null, lastFix: null });
    return "started";
  }

  /** Starts keeping positions for the recording in hand. */
  private begin(patch: Partial<RecorderSnapshot> = {}): void {
    if (!this.env.geolocation || !this.meta) return;
    this.hiddenAt = this.env.visible() ? null : this.env.now();
    this.fixWhileHidden = false;
    this.set({ ...patch, phase: "recording", problem: null, lineRevision: this.snapshot.lineRevision + 1 });
    this.stopWatching();
    this.watch = this.env.geolocation.watchPosition(
      (position) => this.onPosition(position),
      (error) => this.onPositionError(error),
      // A fresh fix every time: a remembered one would put the walker where they were.
      { enableHighAccuracy: true, maximumAge: 0 },
    );
    void this.keepAwake();
  }

  private stopWatching(): void {
    if (this.watch !== undefined) this.env.geolocation?.clearWatch(this.watch);
    this.watch = undefined;
  }

  private onPosition(position: PositionLike): void {
    const meta = this.meta;
    if (this.snapshot.phase !== "recording" || !meta) return;
    const now = this.env.now();
    const { coords } = position;
    const fix: Fix = {
      lat: coords.latitude,
      lon: coords.longitude,
      accuracy: coords.accuracy,
      altitude: coords.altitude,
      altitudeAccuracy: coords.altitudeAccuracy,
      time: fixTime(position.timestamp, now),
    };
    const verdict = judgeFix(fix, this.tally.last, meta.segment);
    const refusal = verdict.keep ? null : verdict.reason;
    // A fix that was good enough to keep, or only too near the last one, shows the device still knows where it is.
    if (this.hiddenAt !== null && (verdict.keep || refusal === "too-close")) this.fixWhileHidden = true;
    const patch: Partial<RecorderSnapshot> = {
      lastFix: { at: now, accuracy: fix.accuracy, refusal },
      problem: this.snapshot.problem === "unavailable" ? null : this.snapshot.problem,
    };
    if (refusal !== "invalid") patch.position = { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy };
    if (verdict.keep) {
      this.tally = addPoint(this.tally, verdict.point);
      this.line.add(verdict.point);
      this.keep(meta.id, verdict.point);
      patch.totals = totalsOf(this.tally);
      patch.lineRevision = this.snapshot.lineRevision + 1;
    }
    this.set(patch);
    if (this.tally.points >= MAX_RECORDING_POINTS) void this.stop("full");
  }

  /** Writes a kept point to the device. If the device will not take it, recording stops there and says so. */
  private keep(id: string, point: RecordedPoint): void {
    const store = this.store;
    if (!store) return;
    this.writing = this.writing.then(() => store.addPoint(id, point)).catch(() => this.storageFailed(id));
  }

  private async storageFailed(id: string): Promise<void> {
    if (this.meta?.id !== id || this.snapshot.problem === "storage") return;
    this.stopWatching();
    this.letScreenSleep();
    this.set({ phase: "paused", problem: "storage" });
    // The totals must describe what is really on the device, not what was meant to be.
    try {
      const points = (await this.store?.points(id)) ?? [];
      if (this.meta?.id !== id) return;
      this.tally = tallyOf(points);
      this.line = lineOf(points);
      this.set({ totals: totalsOf(this.tally), lineRevision: this.snapshot.lineRevision + 1 });
    } catch {
      // The storage cannot be read either; what is shown is the best that is known.
    }
  }

  private onPositionError(error: { code: number }): void {
    if (this.snapshot.phase !== "recording") return;
    if (error.code === 1) {
      // Refused: the browser will send nothing more until the person changes that.
      this.stopWatching();
      this.letScreenSleep();
      this.set({ phase: "paused", problem: "denied" });
      return;
    }
    // Anything else passes: the browser keeps looking and the next position clears this.
    this.set({ problem: "unavailable" });
  }

  async pause(): Promise<void> {
    if (this.snapshot.phase !== "recording") return;
    this.stopWatching();
    this.letScreenSleep();
    this.set({ phase: "paused", problem: null });
    await this.writeMeta();
  }

  /** Takes up a paused recording again, as a new stretch. */
  async resume(): Promise<void> {
    if (this.snapshot.phase !== "paused" || !this.meta) return;
    this.meta = { ...this.meta, segment: this.meta.segment + 1 };
    await this.writeMeta();
    this.begin();
  }

  /** Ends the recording. It stays on the device, waiting to be named and saved, carried on with, or discarded. */
  async stop(problem: Problem | null = null): Promise<void> {
    if ((this.snapshot.phase !== "recording" && this.snapshot.phase !== "paused") || !this.meta) return;
    this.stopWatching();
    this.letScreenSleep();
    this.meta = { ...this.meta, status: "stopped" };
    this.set({ phase: "stopped", problem });
    await this.writeMeta();
  }

  /** Goes back to recording after a stop that was not meant, as a new stretch. */
  async carryOn(): Promise<void> {
    if (this.snapshot.phase !== "stopped" || !this.meta || this.tally.points >= MAX_RECORDING_POINTS) return;
    this.meta = { ...this.meta, status: "active", segment: this.meta.segment + 1 };
    await this.writeMeta();
    this.begin();
  }

  /** Throws away the recording in hand. The caller has asked the person first. */
  async discard(): Promise<void> {
    const meta = this.meta;
    if (!meta) return;
    this.stopWatching();
    this.letScreenSleep();
    this.clearInHand();
    await this.writing;
    await this.store?.remove(meta.id).catch(() => undefined);
  }

  private clearInHand(): void {
    this.meta = null;
    this.tally = emptyTally();
    this.line = new DisplayLine();
    this.letGoOfTab();
    this.set({
      phase: "idle",
      id: null,
      totals: EMPTY_TOTALS,
      position: null,
      lastFix: null,
      problem: null,
      interruptions: [],
      lineRevision: this.snapshot.lineRevision + 1,
    });
  }

  private async writeMeta(): Promise<void> {
    const meta = this.meta;
    if (!meta || !this.store) return;
    const current: RecordingMeta = { ...meta, totals: totalsOf(this.tally) };
    this.meta = current;
    await this.store.put(current).catch(() => undefined);
  }

  // ── A recording left unfinished by an earlier visit ──

  /** Carries on with it, as a new stretch. The time since its last point is written down as not recorded. */
  async continueUnfinished(): Promise<StartOutcome> {
    const parked = this.parked;
    if (!parked) return "busy";
    const able = this.ability();
    if (able !== "ok") return able;
    if (!(await this.holdTab())) return "elsewhere";
    const now = this.env.now();
    const gap: Interruption = { from: parked.tally.lastTime ?? parked.meta.startedAt, to: now };
    this.adopt(parked, {
      ...parked.meta,
      status: "active",
      segment: parked.meta.segment + 1,
      interruptions: [...parked.meta.interruptions, gap].slice(0, MAX_INTERRUPTIONS),
    });
    await this.writeMeta();
    this.begin();
    return "started";
  }

  /** Ends it as it stands, ready to be named and saved. */
  async finishUnfinished(): Promise<void> {
    const parked = this.parked;
    if (!parked) return;
    // Another tab cannot be in the middle of it: this one found it unclaimed.
    await this.holdTab();
    this.adopt(parked, { ...parked.meta, status: "stopped" });
    this.set({ phase: "stopped" });
    await this.writeMeta();
  }

  async discardUnfinished(): Promise<void> {
    const parked = this.parked;
    if (!parked) return;
    this.parked = null;
    this.set({ unfinished: null });
    await this.store?.remove(parked.meta.id).catch(() => undefined);
  }

  private adopt(parked: Parked, meta: RecordingMeta): void {
    this.parked = null;
    this.meta = meta;
    this.tally = parked.tally;
    this.line = parked.line;
    this.set({
      unfinished: null,
      id: meta.id,
      totals: totalsOf(parked.tally),
      interruptions: meta.interruptions,
      position: null,
      lastFix: null,
      problem: null,
      lineRevision: this.snapshot.lineRevision + 1,
    });
  }

  // ── Out of sight, and the screen ──

  private visibilityChanged(): void {
    const now = this.env.now();
    if (!this.env.visible()) {
      if (this.snapshot.phase === "recording") {
        this.hiddenAt = now;
        this.fixWhileHidden = false;
      }
      return;
    }
    if (this.snapshot.phase === "recording" && this.meta) {
      const away = this.hiddenAt === null ? 0 : now - this.hiddenAt;
      if (this.hiddenAt !== null && away > BACKGROUND_GAP_MS && !this.fixWhileHidden) {
        // Nothing was recorded while the page was away, and the device may have moved a long way.
        // What comes next is a new stretch, and the gap is written down.
        const interruptions = [...this.meta.interruptions, { from: this.hiddenAt, to: now }].slice(0, MAX_INTERRUPTIONS);
        this.meta = { ...this.meta, segment: this.meta.segment + 1, interruptions };
        this.set({ interruptions });
        void this.writeMeta();
      }
      // The browser let go of the screen when the page was hidden; it has to be asked again.
      void this.keepAwake();
    }
    this.hiddenAt = null;
    void this.retryNow();
  }

  /** Asks the browser to keep the screen on. It may say no, and it may let go later without being asked. */
  async keepAwake(): Promise<void> {
    if (this.snapshot.phase !== "recording") return;
    if (!this.env.requestWakeLock) {
      this.set({ wake: "unsupported" });
      return;
    }
    if (this.sentinel || this.askingForWake || !this.env.visible()) return;
    this.askingForWake = true;
    try {
      const sentinel = await this.env.requestWakeLock();
      if (this.snapshot.phase !== "recording") {
        void sentinel.release().catch(() => undefined);
        return;
      }
      this.sentinel = sentinel;
      sentinel.addEventListener("release", () => {
        if (this.sentinel !== sentinel) return;
        this.sentinel = null;
        if (this.snapshot.phase === "recording") this.set({ wake: "released" });
      });
      this.set({ wake: "held" });
    } catch {
      if (this.snapshot.phase === "recording") this.set({ wake: "refused" });
    } finally {
      this.askingForWake = false;
    }
  }

  private letScreenSleep(): void {
    const sentinel = this.sentinel;
    this.sentinel = null;
    void sentinel?.release().catch(() => undefined);
    this.set({ wake: this.env.requestWakeLock ? "off" : "unsupported" });
  }

  private async holdTab(): Promise<boolean> {
    if (this.releaseTab || !this.env.tabLock) return true;
    const release = await this.env.tabLock.hold().catch(() => null);
    if (!release) {
      this.set({ elsewhere: true });
      return false;
    }
    this.releaseTab = release;
    this.set({ elsewhere: false });
    return true;
  }

  private letGoOfTab(): void {
    this.releaseTab?.();
    this.releaseTab = null;
  }

  // ── Saving ──

  /**
   * Names the stopped recording and sends it to Outpost. Whatever the answer, the
   * recording stays on the device until Outpost has said it holds it.
   */
  async save(name: string, color: MarkerColor): Promise<SaveOutcome> {
    const meta = this.meta;
    if (this.snapshot.phase !== "stopped" || !meta || !this.store) return { state: "refused", message: "There is no recording to save." };
    await this.writing;
    const queued: RecordingMeta = { ...meta, status: "queued", name, color, refusal: null, totals: totalsOf(this.tally) };
    try {
      await this.store.put(queued);
    } catch {
      return { state: "refused", message: "This device's storage would not keep the name. The recording is still here; try again." };
    }
    const entry: PendingSave = {
      id: queued.id,
      name,
      color,
      startedAt: queued.startedAt,
      totals: queued.totals,
      state: "waiting",
      message: null,
    };
    this.set({ pending: [...this.snapshot.pending, entry] });
    this.clearInHand();
    const outcome = await this.sendOne(queued.id);
    this.scheduleRetry();
    return outcome;
  }

  private patchPending(id: string, patch: Partial<PendingSave>): void {
    this.set({ pending: this.snapshot.pending.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) });
  }

  /** Sends one waiting recording. Asked twice at once for the same one, it is sent once. */
  private sendOne(id: string): Promise<SaveOutcome> {
    const running = this.sending.get(id);
    if (running) return running;
    const attempt = this.attemptSend(id).finally(() => this.sending.delete(id));
    this.sending.set(id, attempt);
    return attempt;
  }

  private async attemptSend(id: string): Promise<SaveOutcome> {
    const entry = this.snapshot.pending.find((item) => item.id === id);
    const store = this.store;
    if (!entry || !store) return { state: "refused", message: "That recording is no longer on this device." };
    this.patchPending(id, { state: "sending", message: null });
    try {
      const built = buildRecordingGpx(entry.name, await store.points(id));
      const track = await this.env.send({ id, name: entry.name, color: entry.color, gpx: built.gpx });
      // Outpost holds it. Only now does it leave the device.
      await store.remove(id).catch(() => undefined);
      this.set({ pending: this.snapshot.pending.filter((item) => item.id !== id) });
      for (const listener of this.savedListeners) listener(track);
      return { state: "saved", track };
    } catch (error) {
      if (error instanceof SendFailure && !error.retry) {
        this.patchPending(id, { state: "refused", message: error.message });
        const meta = (await store.list().catch(() => [])).find((item) => item.id === id);
        if (meta) await store.put({ ...meta, status: "refused", refusal: error.message }).catch(() => undefined);
        return { state: "refused", message: error.message };
      }
      this.patchPending(id, { state: "waiting" });
      return { state: "waiting" };
    }
  }

  /** Sends everything that is waiting, one after another. */
  private async flush(): Promise<void> {
    for (const entry of this.snapshot.pending) {
      if (entry.state === "waiting") await this.sendOne(entry.id);
    }
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    const waiting = this.snapshot.pending.some((entry) => entry.state === "waiting");
    if (!waiting) {
      this.retryAttempt = 0;
      if (this.retryTimer !== undefined) this.env.clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
      return;
    }
    if (this.retryTimer !== undefined) return;
    const delay = RETRY_DELAYS_MS[Math.min(this.retryAttempt, RETRY_DELAYS_MS.length - 1)] as number;
    this.retryTimer = this.env.setTimeout(() => {
      this.retryTimer = undefined;
      this.retryAttempt += 1;
      void this.flush();
    }, delay);
  }

  /** Sends what is waiting now, without waiting for the next turn: the network is back, or the person asked. */
  async retryNow(): Promise<void> {
    if (!this.snapshot.pending.some((entry) => entry.state === "waiting")) return;
    if (this.retryTimer !== undefined) this.env.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.retryAttempt = 0;
    await this.flush();
  }

  /** Sends a refused recording again, in case what stopped it has changed. */
  async retryRefused(id: string): Promise<SaveOutcome> {
    const entry = this.snapshot.pending.find((item) => item.id === id);
    if (!entry || entry.state !== "refused") return { state: "refused", message: "That recording is no longer on this device." };
    this.patchPending(id, { state: "waiting" });
    const outcome = await this.sendOne(id);
    this.scheduleRetry();
    return outcome;
  }

  /** Throws away a recording that is waiting to be sent. The caller has asked the person first. */
  async discardPending(id: string): Promise<void> {
    await this.sending.get(id)?.catch(() => undefined);
    if (!this.snapshot.pending.some((entry) => entry.id === id)) return;
    this.set({ pending: this.snapshot.pending.filter((entry) => entry.id !== id) });
    await this.store?.remove(id).catch(() => undefined);
    this.scheduleRetry();
  }

  /**
   * A recording on this device as a GPX file: the one in hand, or one waiting to be
   * sent. This is how a walk can be got off the phone when Outpost cannot be reached.
   */
  async gpxFile(id: string, fallbackName: string): Promise<{ filename: string; gpx: string; points: number } | null> {
    if (!this.store) return null;
    await this.writing;
    const name = this.snapshot.pending.find((entry) => entry.id === id)?.name || fallbackName;
    const built = buildRecordingGpx(name, await this.store.points(id));
    return { filename: gpxFileName(name), gpx: built.gpx, points: built.points };
  }
}
