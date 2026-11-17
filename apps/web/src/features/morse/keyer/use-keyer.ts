/**
 * Joins a keyer to the sidetone, the decoder, the on-screen keys and the keyboard.
 *
 * The keyboard counts as much as the screen: USB paddle interfaces that present
 * themselves as keyboards key the trainer through the bindings (`KeyboardEvent.code`),
 * and a key held down until the system repeats it never makes extra elements. The
 * keyers' edges carry exact times, so the tone and the decoder keep the rhythm whatever
 * the page is doing between frames.
 */

import { AdaptiveDecoder, BugKeyer, DEFAULT_PROFILE, IambicKeyer, type KeyEvent, presetById, StraightKey } from "@outpost/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSidetone } from "../audio/sidetone";
import { useMorsePrefs } from "../prefs";

export type PressSide = "dit" | "dah" | "straight";

export interface UseKeyerResult {
  /** true while the key envelope is down (drives the TX lamp) */
  keyDown: boolean;
  /** decoded text so far */
  text: string;
  /** elements of the in-progress character, e.g. '.-' */
  pending: string;
  /** decoder speed estimate */
  wpm: number;
  /** `at` is the input's own timestamp (performance.now() clock), if known */
  press: (side: PressSide, at?: number) => void;
  release: (side: PressSide, at?: number) => void;
  clear: () => void;
  /** clear the decoder and re-seed its speed estimate (echo: the played dit) */
  clearAt: (initialDitMs: number) => void;
  /** the live decoder (for grading) */
  decoder: AdaptiveDecoder;
}

export interface UseKeyerOptions {
  /** keyer speed override (echo mode keys at the played character speed) */
  wpm?: number;
}

export function useKeyer(enabled: boolean, options: UseKeyerOptions = {}): UseKeyerResult {
  const prefs = useMorsePrefs();
  const { keyType, presetId, keyDit, keyDah, keyStraight, swapPaddles, toneHz, volume } = prefs;
  const keyerWpm = options.wpm ?? prefs.keyerWpm;
  // On-screen pads and capture panels call press() directly, so a disabled
  // keyer (echo playback, a QSO station's turn) must refuse them too.
  // When keying was last (re)enabled: keyer events scheduled before it (a bug
  // dit still repeating from before an echo playback) never reach the reply.
  // Set during render, not in an effect, so a fast first press right after
  // the unlock is not dropped as "earlier".
  const enabledSinceRef = useRef(0);
  const enabledRef = useRef(enabled);
  if (enabled && !enabledRef.current) enabledSinceRef.current = performance.now();
  enabledRef.current = enabled;
  const profile = useMemo(() => presetById(presetId)?.profile ?? DEFAULT_PROFILE, [presetId]);

  const [keyDown, setKeyDown] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState("");
  const [wpm, setWpm] = useState(keyerWpm);

  const iambicRef = useRef<IambicKeyer | null>(null);
  const bugRef = useRef<BugKeyer | null>(null);
  const straightRef = useRef<StraightKey | null>(null);
  const decoderRef = useRef<AdaptiveDecoder | null>(null);
  if (decoderRef.current === null) {
    decoderRef.current = new AdaptiveDecoder({ initialDitMs: 1200 / keyerWpm });
  }
  const decoder = decoderRef.current;
  const flushTimer = useRef<number | undefined>(undefined);
  const downRef = useRef(false);

  // A new keyer when the settings change; a change of key type starts it afresh too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyType restarts the keyers on purpose
  useEffect(() => {
    iambicRef.current = new IambicKeyer(keyerWpm, profile);
    bugRef.current = new BugKeyer(keyerWpm, profile);
    straightRef.current = new StraightKey();
  }, [keyerWpm, profile, keyType]);

  const syncDecoderState = useCallback((): void => {
    setText(decoder.text);
    setPending(decoder.pendingPattern);
    setWpm(Math.round(decoder.wpm));
  }, [decoder]);

  const scheduleFlush = useCallback((): void => {
    window.clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(() => {
      decoder.flush(performance.now());
      syncDecoderState();
    }, decoder.flushAfterMs + 60);
  }, [decoder, syncDecoderState]);

  const processEvents = useCallback(
    (events: KeyEvent[]): void => {
      if (events.length === 0 || !enabledRef.current) return;
      const tone = getSidetone();
      for (const ev of events) {
        if (ev.at < enabledSinceRef.current) continue;
        tone.keyAt(ev.type === "down", ev.at);
        if (ev.type === "down") {
          downRef.current = true;
          decoder.keyDown(ev.at);
        } else {
          downRef.current = false;
          decoder.keyUp(ev.at);
          scheduleFlush();
        }
      }
      setKeyDown(downRef.current);
      syncDecoderState();
    },
    [decoder, scheduleFlush, syncDecoderState],
  );

  // The automatic keyers' edges come from a frame pump that runs only while an element
  // is under way: a press starts it, and it stops once the keyer is idle again.
  const pumpRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!enabled || keyType === "straight") return;
    const keyer = () => (keyType === "bug" ? bugRef.current : iambicRef.current);
    let raf = 0;
    const loop = (): void => {
      raf = 0;
      processEvents(keyer()?.tick(performance.now()) ?? []);
      if (keyer()?.isKeying) raf = window.requestAnimationFrame(loop);
    };
    pumpRef.current = () => {
      if (raf === 0 && keyer()?.isKeying) raf = window.requestAnimationFrame(loop);
    };
    pumpRef.current();
    return () => {
      window.cancelAnimationFrame(raf);
      pumpRef.current = () => {};
    };
  }, [enabled, keyType, processEvents]);

  const press = useCallback(
    (side: PressSide, at?: number): void => {
      if (!enabledRef.current) return;
      const tone = getSidetone();
      void tone.ensure().then(() => {
        tone.setFrequency(toneHz);
        tone.setVolume(volume);
      });
      const now = at ?? performance.now();
      if (keyType === "straight" || side === "straight") {
        const events = straightRef.current?.set(true, now) ?? [];
        // immediate audio for straight-key feel
        if (events.length > 0) {
          tone.keyDown();
          downRef.current = true;
          setKeyDown(true);
          decoder.keyDown(now);
          syncDecoderState();
        }
        return;
      }
      const paddle = swapPaddles ? (side === "dit" ? "dah" : "dit") : side;
      if (keyType === "single") {
        // a single lever cannot squeeze: pressing one side releases the other
        const other = paddle === "dit" ? "dah" : "dit";
        processEvents(iambicRef.current?.setPaddle(other, false, now) ?? []);
      }
      const keyer = keyType === "bug" ? bugRef.current : iambicRef.current;
      processEvents(keyer?.setPaddle(paddle, true, now) ?? []);
      pumpRef.current();
    },
    [decoder, keyType, processEvents, swapPaddles, syncDecoderState, toneHz, volume],
  );

  const release = useCallback(
    (side: PressSide, at?: number): void => {
      const now = at ?? performance.now();
      if (!enabledRef.current) {
        // Locked (echo playback): keep the key's state honest but touch
        // neither the sidetone (its envelope is playing the target) nor the
        // decoder.
        if (keyType === "straight" || side === "straight") straightRef.current?.set(false, now);
        else {
          const paddle = swapPaddles ? (side === "dit" ? "dah" : "dit") : side;
          (keyType === "bug" ? bugRef.current : iambicRef.current)?.setPaddle(paddle, false, now);
        }
        return;
      }
      if (keyType === "straight" || side === "straight") {
        const events = straightRef.current?.set(false, now) ?? [];
        if (events.length > 0) {
          getSidetone().keyUp();
          downRef.current = false;
          setKeyDown(false);
          decoder.keyUp(now);
          scheduleFlush();
          syncDecoderState();
        }
        return;
      }
      const paddle = swapPaddles ? (side === "dit" ? "dah" : "dit") : side;
      const keyer = keyType === "bug" ? bugRef.current : iambicRef.current;
      processEvents(keyer?.setPaddle(paddle, false, now) ?? []);
      pumpRef.current();
    },
    [decoder, keyType, processEvents, scheduleFlush, swapPaddles, syncDecoderState],
  );

  // keyboard bindings (the physical-key path for USB keyboard interfaces)
  useEffect(() => {
    if (!enabled) return;
    // Sides this listener pressed. A release must always be delivered for
    // these — a keyup lost to a focused input, a window switch or an unmount
    // otherwise latches the paddle (endless dits) or leaves the tone on.
    const held = new Set<PressSide>();
    const isFormTarget = (e: KeyboardEvent): boolean => {
      const el = e.target as HTMLElement | null;
      return el?.closest('input, textarea, select, [contenteditable="true"]') != null;
    };
    const sideFor = (code: string): PressSide | null => {
      if (keyType === "straight") return code === keyStraight ? "straight" : null;
      if (code === keyDit) return "dit";
      if (code === keyDah) return "dah";
      return null;
    };
    const releaseAll = (): void => {
      if (held.size === 0) return;
      for (const side of held) release(side);
      held.clear();
      // A hidden tab stops the rAF pump that would schedule the automatic
      // keyer's key-up, so cut any element in flight as well.
      iambicRef.current?.reset();
      if (downRef.current) {
        getSidetone().clearSchedule();
        downRef.current = false;
        setKeyDown(false);
      }
    };
    const onDown = (e: KeyboardEvent): void => {
      if (isFormTarget(e)) return;
      // Space scrolls the page by default — suppress that whenever the keyer
      // is live, bound or not, so a stray press never yanks the view around.
      if (e.code === "Space") e.preventDefault();
      if (e.repeat || e.metaKey || (e.ctrlKey && e.code !== keyDit && e.code !== keyDah)) return;
      const side = sideFor(e.code);
      if (!side) return;
      e.preventDefault();
      held.add(side);
      // the event's own timestamp, not handler time: straight-key marks are
      // measured from these, so main-thread delay must not stretch them
      press(side, e.timeStamp);
    };
    const onUp = (e: KeyboardEvent): void => {
      const side = sideFor(e.code);
      if (!side) return;
      // A key we pressed is released wherever focus went meanwhile.
      if (!held.has(side) && isFormTarget(e)) return;
      e.preventDefault();
      held.delete(side);
      release(side, e.timeStamp);
    };
    const onHidden = (): void => {
      if (document.visibilityState === "hidden") releaseAll();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", onHidden);
      releaseAll();
    };
  }, [enabled, keyType, keyDit, keyDah, keyStraight, press, release]);

  // leaving the tab: reset the keyer, and silence the shared key envelope
  // only if THIS keyer is holding it down. The envelope is shared with
  // playTimeline: the QSO trainer schedules the station's reply and then
  // disables the keyer in the same tick, and an unconditional clearSchedule
  // wiped that reply so it played as silence.
  useEffect(() => {
    if (enabled) return;
    iambicRef.current?.reset();
    // a held bug would otherwise keep repeating dits into the next reply
    bugRef.current = new BugKeyer(keyerWpm, profile);
    straightRef.current = new StraightKey();
    if (downRef.current) getSidetone().clearSchedule();
    setKeyDown(false);
    downRef.current = false;
  }, [enabled, keyerWpm, profile]);

  // While locked, Space must still not scroll the page (it is the default
  // straight key). Buttons and fields keep their own Space behaviour.
  useEffect(() => {
    if (enabled) return;
    const onDown = (e: KeyboardEvent): void => {
      if (e.code !== "Space") return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [enabled]);

  // Unmounting while keyed (switching tabs mid-character) must not leave the
  // shared sidetone sounding across the app.
  useEffect(
    () => () => {
      if (downRef.current) getSidetone().clearSchedule();
    },
    [],
  );

  useEffect(() => () => window.clearTimeout(flushTimer.current), []);

  const clearAt = useCallback(
    (initialDitMs: number): void => {
      decoder.reset(initialDitMs);
      syncDecoderState();
    },
    [decoder, syncDecoderState],
  );
  const clear = useCallback((): void => {
    decoder.reset();
    syncDecoderState();
  }, [decoder, syncDecoderState]);

  return { keyDown, text, pending, wpm, press, release, clear, clearAt, decoder };
}
