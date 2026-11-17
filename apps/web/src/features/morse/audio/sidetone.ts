/**
 * The sidetone: a Web Audio tone keyed on and off for Morse.
 *
 * One oscillator runs all the time into a key gain (the envelope) and a master gain
 * (the volume). A 5 ms ramp at each edge keeps the key from clicking. Band noise mixes
 * in at the master, slow fading (QSB) is an LFO on its own gain, and a second tone
 * 180 Hz up plays an interfering station (QRM) on an envelope of its own.
 *
 * Browsers start audio suspended until a person presses something, and iPhones are
 * strict about it: the context has to be made and resumed inside the press itself, and
 * only some events count (a tap's pointerup or click, not its pointerdown). So
 * `ensure()` makes and resumes the context before it awaits anything, and `unlock()`
 * resumes it again from the events that count. An iPhone's silent switch also mutes
 * Web Audio unless the page asks for media playback: `navigator.audioSession` where
 * Safari has it, and otherwise a moment of silence played through an audio element.
 * `soundState()` says whether sound is getting out, for the screen to say what to do.
 *
 * A running context keeps the audio hardware busy even when it is silent, so the
 * context is suspended two seconds after the last sound ends (and at once when the page
 * is hidden with nothing playing), and resumed by the next key or playback. A browser
 * that has been let play once resumes it without another press.
 */
import type { TimelineSegment } from "@outpost/shared";

const RAMP_S = 0.005;
/** Headroom when turning performance.now() into the AudioContext's clock. */
const KEY_LATENCY_S = 0.03;
/** How long the context stays awake after the last sound, so a run of keying does not wake it per element. */
const IDLE_MS = 2000;

export interface Impairments {
  /** 0–1 band noise. */
  noise: number;
  /** 0–1 depth of slow fading. */
  qsb: number;
}

export interface PlayHandle {
  /** Stop at once (ramped). */
  stop: () => void;
  /** True when it played to the end, false when it was stopped. */
  done: Promise<boolean>;
  /** Milliseconds into the timeline now. */
  positionMs: () => number;
  totalMs: number;
}

/** "running": sound can be heard. "suspended": the browser has not let this page play yet. "none": nothing has asked yet. */
export type SoundState = "running" | "suspended" | "none" | "unsupported";

type AudioContextClass = typeof AudioContext;

function audioContextClass(): AudioContextClass | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext ?? null;
}

/** Whether this is an iPhone or iPad, where the silent switch mutes the page unless it asks for media playback. */
function isAppleTouch(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** A tenth of a second of silence as a WAV file, made here: playing it puts an iPhone's audio in the media category. */
function silentWavUrl(): string | null {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function" || typeof Blob === "undefined") return null;
  const rate = 8000;
  const samples = rate / 10;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

export class Sidetone {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private keyGain: GainNode | null = null;
  private qsbGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private qsbLfo: OscillatorNode | null = null;
  private qsbLfoGain: GainNode | null = null;
  private qrmOsc: OscillatorNode | null = null;
  private qrmKeyGain: GainNode | null = null;
  private freqHz = 600;
  private volume = 0.5;
  private mediaAsked = false;
  /** A resume has been asked for and answered: until then a suspended context is only starting. */
  private settled = false;
  /** Suspended by this class to save power, not refused by the browser. */
  private asleep = false;
  /** performance.now() until which something is scheduled to sound. */
  private soundingUntil = 0;
  /** The playback under way on each envelope (the signal, the interfering station) and the performance.now() it ends at. */
  private readonly playing = new Map<GainNode, number>();
  /** A straight key or a keyer element is down. */
  private held = false;
  /** Band noise is mixed in, which is meant to be heard between the signals. */
  private noiseOn = false;
  private idleTimer: number | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly onVisibility = (): void => {
    if (document.visibilityState === "hidden") {
      if (!this.held && performance.now() >= this.until()) this.sleep();
    } else if (this.noiseOn) this.wake();
  };

  /** Whether this browser can play the tone at all. */
  get supported(): boolean {
    return audioContextClass() !== null;
  }

  soundState(): SoundState {
    if (!this.supported) return "unsupported";
    if (!this.ctx) return "none";
    if (this.ctx.state === "running" || this.asleep) return "running";
    return this.settled ? "suspended" : "none";
  }

  /** Called when the sound state may have changed. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /** Asks for media playback, so that an iPhone's silent switch does not mute the trainer. Once, inside a press. */
  private askForMedia(): void {
    if (this.mediaAsked) return;
    this.mediaAsked = true;
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = "playback";
      } catch {
        // Not allowed here; the silent switch may then mute the tone, and the screen says so.
      }
      return;
    }
    if (!isAppleTouch()) return;
    const url = silentWavUrl();
    if (!url) return;
    const element = new Audio(url);
    element.setAttribute("playsinline", "");
    void element
      .play()
      .catch(() => undefined)
      .finally(() => URL.revokeObjectURL(url));
  }

  /**
   * Makes and resumes the audio graph. Call it from a press: everything a browser
   * needs to see inside the press happens before the first await.
   */
  async ensure(): Promise<void> {
    const Context = audioContextClass();
    if (!Context) return;
    if (!this.ctx) {
      this.askForMedia();
      this.ctx = new Context();
      this.ctx.addEventListener?.("statechange", () => this.notify());
      document.addEventListener("visibilitychange", this.onVisibility);
      this.build(this.ctx);
    }
    this.asleep = false;
    const resumed = this.ctx.state === "suspended" ? this.ctx.resume() : null;
    if (resumed) {
      try {
        await resumed;
      } catch {
        // Refused: the screen says what to do.
      }
    }
    this.settled = true;
    this.notify();
    this.armIdle();
  }

  /** Resumes a context this class put to sleep. */
  private wake(): void {
    if (!this.ctx || !this.asleep) return;
    this.asleep = false;
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
  }

  /** Something sounds until `untilMs` (performance.now()): keep awake till then, and sleep a little after. */
  private sounding(untilMs: number): void {
    this.soundingUntil = Math.max(this.soundingUntil, untilMs);
    this.wake();
    this.armIdle();
  }

  /** When the last sound now scheduled ends. */
  private until(): number {
    return Math.max(this.soundingUntil, ...this.playing.values());
  }

  private armIdle(): void {
    window.clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    if (!this.ctx || this.held || this.asleep || (this.noiseOn && document.visibilityState !== "hidden")) return;
    const wait = Math.max(0, this.until() - performance.now()) + IDLE_MS;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = undefined;
      if (performance.now() < this.until()) this.armIdle();
      else this.sleep();
    }, wait);
  }

  private sleep(): void {
    window.clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    if (!this.ctx || this.asleep || this.ctx.state !== "running") return;
    this.asleep = true;
    void this.ctx.suspend().catch(() => undefined);
  }

  /** Resumes a suspended context from a press that browsers count (a tap's pointerup or click). */
  unlock(): void {
    if (this.ctx && this.ctx.state === "suspended" && !this.asleep)
      void this.ctx.resume().then(
        () => this.notify(),
        () => this.notify(),
      );
  }

  private build(ctx: AudioContext): void {
    this.osc = ctx.createOscillator();
    this.keyGain = ctx.createGain();
    this.qsbGain = ctx.createGain();
    this.masterGain = ctx.createGain();
    this.osc.type = "sine";
    this.osc.frequency.value = this.freqHz;
    this.keyGain.gain.value = 0;
    this.qsbGain.gain.value = 1;
    this.masterGain.gain.value = this.volume;
    this.osc.connect(this.keyGain).connect(this.qsbGain).connect(this.masterGain).connect(ctx.destination);
    this.osc.start();

    // Band noise: a looped buffer of white noise, silent until asked for.
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) channel[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = this.freqHz;
    filter.Q.value = 0.35;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    noise.connect(filter).connect(this.noiseGain).connect(this.masterGain);
    noise.start();

    // Fading: a slow LFO moving the fading gain about its base value; depth 0 is off.
    this.qsbLfo = ctx.createOscillator();
    this.qsbLfo.frequency.value = 0.09;
    this.qsbLfoGain = ctx.createGain();
    this.qsbLfoGain.gain.value = 0;
    this.qsbLfo.connect(this.qsbLfoGain).connect(this.qsbGain.gain);
    this.qsbLfo.start();

    // Interference: another station about 180 Hz up, keyed on its own envelope.
    this.qrmOsc = ctx.createOscillator();
    this.qrmOsc.type = "sine";
    this.qrmOsc.frequency.value = this.freqHz + 180;
    this.qrmKeyGain = ctx.createGain();
    this.qrmKeyGain.gain.value = 0;
    this.qrmOsc.connect(this.qrmKeyGain).connect(this.masterGain);
    this.qrmOsc.start();
  }

  /** Sets band noise and fading (0 for none). */
  setImpairments(impairments: Impairments): void {
    if (!this.ctx || !this.noiseGain || !this.qsbGain || !this.qsbLfoGain) return;
    const t = this.ctx.currentTime;
    this.noiseGain.gain.setTargetAtTime(impairments.noise * 0.18, t, 0.1);
    // Depth d: the gain swings between 1 - d and 1, never right out.
    const d = Math.max(0, Math.min(0.9, impairments.qsb));
    this.qsbGain.gain.setTargetAtTime(1 - d / 2, t, 0.1);
    this.qsbLfoGain.gain.setTargetAtTime(d / 2, t, 0.1);
    this.noiseOn = impairments.noise > 0;
    if (this.noiseOn && document.visibilityState !== "hidden") this.wake();
    this.armIdle();
  }

  get isReady(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  setFrequency(hz: number): void {
    this.freqHz = hz;
    if (this.osc && this.ctx) this.osc.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.01);
    if (this.qrmOsc && this.ctx) this.qrmOsc.frequency.setTargetAtTime(hz + 180, this.ctx.currentTime, 0.01);
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
  }

  get frequency(): number {
    return this.freqHz;
  }

  /** Key down now (a straight key: the least delay). */
  keyDown(): void {
    if (!this.ctx || !this.keyGain) return;
    this.held = true;
    this.wake();
    this.armIdle();
    const gain = this.keyGain.gain;
    const t = this.ctx.currentTime;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(1, t + RAMP_S);
  }

  /** Key up now. */
  keyUp(): void {
    if (!this.ctx || !this.keyGain) return;
    this.held = false;
    this.sounding(performance.now());
    const gain = this.keyGain.gain;
    const t = this.ctx.currentTime;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(0, t + RAMP_S);
  }

  /**
   * Keys the tone at an exact performance.now() time, for a keyer's own edges, so the
   * rhythm holds whatever the page is doing. A 30 ms margin keeps it in the future.
   */
  keyAt(on: boolean, atPerfMs: number): void {
    if (!this.ctx || !this.keyGain) return;
    this.held = on;
    this.sounding(atPerfMs + KEY_LATENCY_S * 1000);
    let at = this.ctx.currentTime + (atPerfMs - performance.now()) / 1000 + KEY_LATENCY_S;
    if (at < this.ctx.currentTime) at = this.ctx.currentTime;
    const gain = this.keyGain.gain;
    gain.setValueAtTime(on ? 0 : 1, at);
    gain.linearRampToValueAtTime(on ? 1 : 0, at + RAMP_S);
  }

  /** Cancels anything scheduled on the key and silences it. */
  clearSchedule(): void {
    if (!this.ctx || !this.keyGain) return;
    this.held = false;
    this.sounding(performance.now());
    const gain = this.keyGain.gain;
    const t = this.ctx.currentTime;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(0, t + RAMP_S);
  }

  /**
   * Plays a timeline (from textToTimeline) and resolves when it has finished.
   * `channel: "qrm"` plays it as the interfering station, quieter and 180 Hz up.
   */
  playTimeline(segments: readonly TimelineSegment[], options: { channel?: "main" | "qrm"; level?: number } = {}): PlayHandle {
    const totalMs = segments.reduce((sum, segment) => sum + segment.ms, 0);
    const node = options.channel === "qrm" ? this.qrmKeyGain : this.keyGain;
    if (!this.ctx || !node) {
      // No audio (unsupported, or a test): the timeline still takes its time, so the
      // screen behaves the same and says separately that nothing can be heard.
      let timer: number | undefined;
      let finish: (finished: boolean) => void = () => {};
      const started = performance.now();
      const done = new Promise<boolean>((resolve) => {
        finish = resolve;
        timer = window.setTimeout(() => resolve(true), totalMs + 60);
      });
      return {
        stop: () => {
          window.clearTimeout(timer);
          finish(false);
        },
        done,
        positionMs: () => Math.min(totalMs, performance.now() - started),
        totalMs,
      };
    }
    const peak = options.level ?? (options.channel === "qrm" ? 0.3 : 1);
    const endsAt = performance.now() + totalMs + 50;
    // A new playback on an envelope replaces the one before it there.
    this.playing.set(node, endsAt);
    this.wake();
    this.armIdle();
    const ctx = this.ctx;
    const gain = node.gain;
    const t0 = ctx.currentTime + 0.05;
    let t = t0;
    gain.cancelScheduledValues(ctx.currentTime);
    gain.setValueAtTime(0, ctx.currentTime);
    for (const segment of segments) {
      if (segment.on) {
        gain.setValueAtTime(0, t);
        gain.linearRampToValueAtTime(peak, t + RAMP_S);
        const end = t + segment.ms / 1000;
        gain.setValueAtTime(peak, end - RAMP_S);
        gain.linearRampToValueAtTime(0, end);
      }
      t += segment.ms / 1000;
    }

    let timer: number | undefined;
    let finish: (finished: boolean) => void = () => {};
    const done = new Promise<boolean>((resolve) => {
      finish = resolve;
      timer = window.setTimeout(() => resolve(true), (t - ctx.currentTime) * 1000 + 60);
    });
    return {
      stop: () => {
        window.clearTimeout(timer);
        const now = ctx.currentTime;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(0, now + RAMP_S);
        // Stopped early: it no longer keeps the context awake.
        if (this.playing.get(node) === endsAt) this.playing.delete(node);
        this.armIdle();
        finish(false);
      },
      done,
      positionMs: () => Math.max(0, Math.min(totalMs, (ctx.currentTime - t0) * 1000)),
      totalMs,
    };
  }

  dispose(): void {
    window.clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.asleep = false;
    this.playing.clear();
    this.osc?.stop();
    this.osc?.disconnect();
    this.keyGain?.disconnect();
    this.masterGain?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
    this.osc = null;
    this.keyGain = null;
    this.masterGain = null;
    this.notify();
  }
}

/** One audio graph for the whole trainer. */
let shared: Sidetone | null = null;
export function getSidetone(): Sidetone {
  if (!shared) shared = new Sidetone();
  return shared;
}
