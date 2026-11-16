/**
 * A kitchen timer. It counts to a time on the clock rather than counting seconds, so it
 * is right again when the screen comes back after the phone has slept, and it is kept on
 * this device so that a reload does not lose it. When it ends it sounds a tone (made in
 * the browser, no file), vibrates where the phone can, and says so on the screen.
 */
import { Pause, Play, RotateCcw } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readPref, writePref } from "../kit/device-pref";

interface TimerState {
  label: string;
  /** When it ends, by the clock; null while paused or stopped. */
  endsAt: number | null;
  /** Milliseconds left while paused, or the length it was set to while stopped. */
  remaining: number;
}

const KEY = "cooking.timer";
const STOPPED: TimerState = { label: "", endsAt: null, remaining: 0 };

function load(): TimerState {
  try {
    const parsed = JSON.parse(readPref(KEY) ?? "null") as TimerState | null;
    if (parsed && typeof parsed.remaining === "number") return parsed;
  } catch {
    // A preference that cannot be read is no timer.
  }
  return STOPPED;
}

interface TimerApi {
  state: TimerState;
  start: (minutes: number, label: string) => void;
  pause: () => void;
  reset: () => void;
}

const TimerContext = createContext<TimerApi | null>(null);

/** Lets a result elsewhere on the screen set the timer: "Start a timer for this". */
export function useTimer(): TimerApi | null {
  return useContext(TimerContext);
}

let audio: AudioContext | null = null;

/** A short tone, three times. Browsers allow sound only after a press, so the context is opened when the timer is started. */
function primeSound() {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!audio && Context) audio = new Context();
    void audio?.resume();
  } catch {
    audio = null;
  }
}

function sound() {
  try {
    if (!audio) return;
    for (let beat = 0; beat < 3; beat += 1) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.2;
      oscillator.connect(gain).connect(audio.destination);
      const at = audio.currentTime + beat * 0.45;
      oscillator.start(at);
      oscillator.stop(at + 0.3);
    }
  } catch {
    // No sound on this device; the screen still says it.
  }
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {
    // No vibration here.
  }
}

export function formatClockDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  return hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TimerState>(load);
  const rang = useRef(false);
  const save = useCallback((next: TimerState) => {
    setState(next);
    writePref(KEY, JSON.stringify(next));
  }, []);
  const start = useCallback(
    (minutes: number, label: string) => {
      primeSound();
      rang.current = false;
      save({ label, endsAt: Date.now() + minutes * 60_000, remaining: minutes * 60_000 });
      toast.success(`Timer started: ${formatClockDuration(minutes * 60_000)}`, { description: label || undefined });
    },
    [save],
  );
  const pause = useCallback(
    () => save({ ...state, endsAt: null, remaining: Math.max(0, (state.endsAt ?? Date.now()) - Date.now()) }),
    [save, state],
  );
  const reset = useCallback(() => save(STOPPED), [save]);
  useEffect(() => {
    if (state.endsAt === null) return;
    const check = () => {
      if (state.endsAt !== null && Date.now() >= state.endsAt && !rang.current) {
        rang.current = true;
        sound();
        toast.success("Time is up", { description: state.label || undefined, duration: 30_000 });
        save({ ...state, endsAt: null, remaining: 0 });
      }
    };
    check();
    const id = window.setInterval(check, 250);
    return () => window.clearInterval(id);
  }, [state, save]);
  return <TimerContext.Provider value={{ state, start, pause, reset }}>{children}</TimerContext.Provider>;
}

/** The timer itself: set a time, start, pause, reset. */
export function TimerPanel() {
  const api = useTimer();
  const [, tick] = useState(0);
  const [minutesText, setMinutesText] = useState("10");
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  if (!api) return null;
  const { state, start } = api;
  const running = state.endsAt !== null;
  const left = running ? state.endsAt! - Date.now() : state.remaining;
  const minutes = Number(minutesText);
  const valid = minutesText.trim() !== "" && Number.isFinite(minutes) && minutes > 0 && minutes <= 24 * 60;
  return (
    <div className="rounded-panel bg-surface px-4 py-3">
      <p className="text-small text-ink-muted">{state.label ? `Timer: ${state.label}` : "Timer"}</p>
      <p className="mt-0.5 font-mono text-display text-ink tabular" role="timer" aria-live="off">
        {formatClockDuration(left)}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        {running ? (
          <Button variant="secondary" onClick={api.pause}>
            <Pause aria-hidden /> Pause
          </Button>
        ) : state.remaining > 0 ? (
          <Button variant="primary" onClick={() => start(state.remaining / 60_000, state.label)}>
            <Play aria-hidden /> Carry on
          </Button>
        ) : null}
        {running || state.remaining > 0 ? (
          <Button variant="ghost" onClick={api.reset}>
            <RotateCcw aria-hidden /> Reset
          </Button>
        ) : (
          <>
            <label className="grid gap-1.5 text-small font-medium text-ink">
              Minutes
              <input
                inputMode="decimal"
                value={minutesText}
                onChange={(event) => setMinutesText(event.target.value)}
                aria-invalid={!valid || undefined}
                className="h-9 w-24 rounded-control border border-border-strong bg-page px-3 text-body text-ink tabular focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 aria-invalid:border-danger max-md:h-11"
              />
            </label>
            <Button variant="primary" disabled={!valid} onClick={() => start(minutes, "")}>
              <Play aria-hidden /> Start
            </Button>
          </>
        )}
      </div>
      <p className="mt-2 text-small text-ink-muted">
        Keep this screen open: a phone that locks may silence the tone, though the time stays right.
      </p>
    </div>
  );
}
