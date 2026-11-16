/**
 * Echo: hear it, key it back. The trainer plays Morse with the text hidden; you key it
 * back on your own key; the reply ends after a stretch of silence (or Done, or Enter),
 * and only then do the text, what the decoder heard, the scores and the timing tips
 * appear.
 *
 * The keyer is locked while the text plays (the Send tab turns it off), so only your
 * keying is decoded, never the played tone. The engine (content weighting, grading,
 * the speed controller and the unlock rule) is in @outpost/shared.
 */
import {
  applyEchoResult,
  CHAR_STATS_WINDOW,
  ECHO_WPM_MAX,
  ECHO_WPM_MIN,
  type EchoGrade,
  type EchoSpeedChange,
  type EchoSpeedState,
  echoTarget,
  KOCH_LESSON_COUNT,
  kochUnlock,
  lessonCharset,
  type MorseTiming,
  newestKochChar,
  replyComplete,
  type TimelineTracks,
  textToTimeline,
} from "@outpost/shared";
import { Check, Ear, Play, RotateCcw, SkipForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { getSidetone, type PlayHandle } from "../audio/sidetone";
import { SoundNotice } from "../audio/sound-notice";
import { pushMorseProgress, useCharStats, useKochLesson, useRecordMorseSession } from "../data";
import type { UseKeyerResult } from "../keyer/use-keyer";
import { applyMorsePrefs, type EchoContent, useMorsePrefs } from "../prefs";
import { MarkedDiff, normalizeMorseText } from "./echo-diff";
import { SwitchField } from "./echo-switch";
import { EchoTimeline } from "./echo-timeline";
import { Stepper } from "./stepper";

const CONTENT_OPTIONS: { value: EchoContent; label: string }[] = [
  { value: "koch", label: "Koch groups" },
  { value: "callsigns", label: "Callsigns" },
  { value: "abbrev", label: "Q-codes and abbreviations" },
  { value: "exchange", label: "Short exchanges" },
];

type Phase = "idle" | "playing" | "reply" | "graded";

export interface EchoPracticeProps {
  keyer: UseKeyerResult;
  /** The played timing (the Send tab also runs the keyer at its character speed). */
  timing: MorseTiming;
  /** Automatic keyers time their own elements, so the dit and dah proportion is not judged. */
  keyerTimed: boolean;
  /** True while the text plays: the Send tab locks the keyer. */
  onPlayingChange: (playing: boolean) => void;
}

const wordSpaces = (n: number) => (n === 1 ? "word space" : "word spaces");

export function EchoPractice({ keyer, timing, keyerTimed, onPlayingChange }: EchoPracticeProps) {
  const prefs = useMorsePrefs();
  const lesson = useKochLesson();
  const recordSession = useRecordMorseSession();
  const { stats, outcomes, noteOutcome, markSynced } = useCharStats();
  const [phase, setPhase] = useState<Phase>("idle");
  const [target, setTarget] = useState("");
  const [grade, setGrade] = useState<EchoGrade | null>(null);
  const [decoded, setDecoded] = useState("");
  const [tracks, setTracks] = useState<TimelineTracks | null>(null);
  const [speedChange, setSpeedChange] = useState<EchoSpeedChange | null>(null);
  const [unlocked, setUnlocked] = useState<string | null>(null);
  const speedRef = useRef<EchoSpeedState>({ wpm: prefs.echoWpm, cleanStreak: 0, missStreak: 0 });
  const handleRef = useRef<PlayHandle | null>(null);
  const keyDownRef = useRef(keyer.keyDown);
  keyDownRef.current = keyer.keyDown;
  // The silence timer and Enter can both fire before a render.
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  const content = prefs.echoContent;
  const charset = useMemo(() => lessonCharset(lesson), [lesson]);
  const newest = newestKochChar(lesson);
  const unlock = useMemo(() => kochUnlock(charset, stats, newest), [charset, stats, newest]);
  const charWpm = Math.round(1200 / timing.ditMs);

  // A speed set by hand starts the adaptive streaks again.
  useEffect(() => {
    if (speedRef.current.wpm !== prefs.echoWpm) speedRef.current = { wpm: prefs.echoWpm, cleanStreak: 0, missStreak: 0 };
  }, [prefs.echoWpm]);

  useEffect(
    () => () => {
      handleRef.current?.stop();
      onPlayingChange(false);
    },
    [onPlayingChange],
  );

  async function play(text: string): Promise<void> {
    handleRef.current?.stop();
    setGrade(null);
    setTracks(null);
    setPhase("playing");
    phaseRef.current = "playing";
    onPlayingChange(true);
    const tone = getSidetone();
    await tone.ensure();
    tone.setFrequency(prefs.toneHz);
    tone.setVolume(prefs.volume);
    const handle = tone.playTimeline(textToTimeline(text, timing).segments);
    handleRef.current = handle;
    await handle.done;
    handleRef.current = null;
    // Played to the end or stopped early, it is your turn: the reply starts clean, the decoder set to the played speed.
    keyer.clearAt(timing.ditMs);
    onPlayingChange(false);
    setPhase((current) => (current === "playing" ? "reply" : current));
  }

  function next(): void {
    const seed = Math.floor(Math.random() * 1e9);
    const text = echoTarget(content, { seed, lesson, groupSize: prefs.echoGroupSize, stats });
    setTarget(text);
    setUnlocked(null);
    setSpeedChange(null);
    void play(text);
  }

  const finish = useCallback((): void => {
    if (phaseRef.current !== "reply") return;
    phaseRef.current = "graded";
    const decoder = keyer.decoder;
    decoder.flush(performance.now());
    const text = decoder.text;
    const result = applyEchoResult({
      target,
      decodedText: text,
      marks: [...decoder.marks],
      timing,
      keyerTimed,
      speed: speedRef.current,
      adaptive: prefs.echoAdaptive,
      echoWpm: prefs.echoWpm,
      content,
      lesson,
      priorOutcomes: outcomes,
    });
    setDecoded(text);
    setGrade(result.grade);
    setTracks(result.tracks);
    setPhase("graded");
    speedRef.current = result.speed;
    setSpeedChange(result.speedChange);
    if (result.speed.wpm !== prefs.echoWpm) applyMorsePrefs({ echoWpm: result.speed.wpm });
    if (result.unlock) {
      applyMorsePrefs({ kochLesson: result.unlock.lesson });
      void pushMorseProgress({ kochLesson: result.unlock.lesson });
      setUnlocked(result.unlock.chars.join(", "));
    }
    const id = noteOutcome(result.outcome);
    recordSession.mutate(result.session, { onSuccess: () => markSynced(id) });
  }, [
    content,
    keyer.decoder,
    keyerTimed,
    lesson,
    markSynced,
    noteOutcome,
    outcomes,
    prefs.echoAdaptive,
    prefs.echoWpm,
    recordSession,
    target,
    timing,
  ]);

  // The reply ends after the configured silence, counted from your last key-up (never while the key is down, or before you have keyed).
  useEffect(() => {
    if (phase !== "reply") return;
    const id = window.setInterval(() => {
      if (keyDownRef.current) return;
      const last = keyer.decoder.marks.at(-1)?.upAt ?? null;
      if (replyComplete(last, performance.now(), timing, prefs.echoSilenceWords)) finish();
    }, 100);
    return () => window.clearInterval(id);
  }, [finish, keyer.decoder, phase, prefs.echoSilenceWords, timing]);

  // Enter is Done while replying, unless it is pressed in a field or on a button.
  useEffect(() => {
    if (phase !== "reply") return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.code !== "Enter" && event.code !== "NumpadEnter") return;
      const element = event.target as HTMLElement | null;
      if (element?.closest?.('input, textarea, select, button, [contenteditable="true"]')) return;
      event.preventDefault();
      finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, phase]);

  const missed = grade ? Object.keys(grade.misses) : [];
  const silenceMs = Math.round(prefs.echoSilenceWords * timing.interWordMs);
  const farnsworthOn = prefs.echoFarnsworth && charWpm > prefs.echoWpm;

  return (
    <div className="grid gap-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Content">
          {(ids) => (
            <Select
              {...ids}
              value={content}
              options={CONTENT_OPTIONS}
              onChange={(echoContent) => applyMorsePrefs({ echoContent })}
              disabled={phase === "playing"}
            />
          )}
        </Field>
        {content === "koch" ? (
          <Stepper
            label="Group size"
            value={prefs.echoGroupSize}
            min={1}
            max={8}
            onChange={(echoGroupSize) => applyMorsePrefs({ echoGroupSize })}
            hint={`Koch lesson ${lesson}: ${charset.join(" ")}`}
          />
        ) : null}
        <Stepper
          label="Echo speed"
          value={prefs.echoWpm}
          min={ECHO_WPM_MIN}
          max={ECHO_WPM_MAX}
          unit="wpm"
          onChange={(echoWpm) => applyMorsePrefs({ echoWpm })}
          hint={farnsworthOn ? `Characters at ${charWpm} wpm, the gaps stretched to ${prefs.echoWpm}` : "The speed the trainer plays at"}
        />
        <Stepper
          label="Reply ends after"
          value={prefs.echoSilenceWords}
          min={1}
          max={4}
          unit={wordSpaces(prefs.echoSilenceWords)}
          onChange={(echoSilenceWords) => applyMorsePrefs({ echoSilenceWords })}
          hint={`${(silenceMs / 1000).toFixed(1)} s of silence, or press Done (Enter)`}
        />
        <SwitchField
          label="Adaptive speed"
          hint="Up 1 wpm after 3 clean replies, down 1 after 2 misses."
          checked={prefs.echoAdaptive}
          onChange={(echoAdaptive) => applyMorsePrefs({ echoAdaptive })}
        />
        <SwitchField
          label="Farnsworth spacing"
          hint={`For beginners: characters at your receive character speed (${prefs.charWpm} wpm) with longer gaps to listen in. Your own keying is still judged at standard spacing.`}
          checked={prefs.echoFarnsworth}
          onChange={(echoFarnsworth) => applyMorsePrefs({ echoFarnsworth })}
        />
      </div>

      <div className="grid gap-3 border-t border-border pt-5">
        <div className="flex flex-wrap items-center gap-2">
          {phase === "playing" ? (
            <>
              <span className="inline-flex min-h-11 items-center gap-2 text-body text-ink md:min-h-9" aria-live="polite">
                <Ear className="size-4 text-primary motion-safe:animate-pulse" aria-hidden /> Listen…
              </span>
              <Button onClick={() => handleRef.current?.stop()}>
                <SkipForward aria-hidden /> Skip to my turn
              </Button>
            </>
          ) : phase === "reply" ? (
            <>
              <span className="inline-flex min-h-11 items-center text-body font-medium text-ink md:min-h-9" aria-live="polite">
                Your turn: key it back.
              </span>
              <Button variant="primary" onClick={finish}>
                <Check aria-hidden /> Done
              </Button>
              <Button onClick={() => void play(target)}>
                <RotateCcw aria-hidden /> Hear it again
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" onClick={next}>
                <Play aria-hidden /> {phase === "idle" ? "Play" : "Next"}
              </Button>
              {phase === "graded" ? (
                <Button onClick={() => void play(target)}>
                  <RotateCcw aria-hidden /> Try this one again
                </Button>
              ) : null}
            </>
          )}
          <span className="tabular ml-auto text-small text-ink-muted" data-testid="echo-speed">
            {prefs.echoWpm} wpm{farnsworthOn ? ` (characters at ${charWpm})` : ""}
          </span>
        </div>
        <SoundNotice />
        {phase === "idle" ? (
          <p className="max-w-[65ch] text-small text-ink-muted">
            Press Play and listen: the text stays hidden. Then key what you heard on your key. Your reply ends after{" "}
            {prefs.echoSilenceWords} {wordSpaces(prefs.echoSilenceWords)} of silence, or when you press Done.
          </p>
        ) : null}
      </div>

      {phase === "graded" && grade ? (
        <div className="grid gap-5" aria-live="polite" data-testid="echo-result">
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[6rem_minmax(0,1fr)] sm:items-baseline">
            <dt className="text-small text-ink-muted">Played</dt>
            <dd className="break-all font-mono text-lead tracking-widest text-ink">{normalizeMorseText(target)}</dd>
            <dt className="text-small text-ink-muted max-sm:mt-2">You keyed</dt>
            <dd className="break-all font-mono text-lead tracking-widest text-ink">
              {normalizeMorseText(decoded) || <span className="font-sans text-small tracking-normal text-ink-muted">nothing</span>}
            </dd>
            <dt className="text-small text-ink-muted max-sm:mt-2">Marked</dt>
            <dd>
              <MarkedDiff target={target} decoded={decoded} />
            </dd>
          </dl>

          <div className="grid gap-1">
            <p className="text-small text-ink-muted">
              {grade.copy.correct} of {grade.copy.total} characters right
              {missed.length > 0 ? `; missed ${missed.join(", ")}` : ""}.
            </p>
            <p className="tabular text-body text-ink">
              <span className={cn("font-semibold", grade.clean && "text-success")}>{Math.round(grade.copy.accuracy * 100)}% copy</span>
              {grade.clean ? <span className="sr-only"> (clean)</span> : null},{" "}
              <span className="font-semibold">{Math.round(grade.timing.score * 100)}% timing</span>,{" "}
              {grade.timing.keyedWpm !== null ? `you keyed at ${grade.timing.keyedWpm} wpm` : `keyer at ${grade.timing.playedWpm} wpm`}.
            </p>
          </div>

          <div>
            <h3 className="text-body font-semibold text-ink">Timing tips</h3>
            <ul className="mt-1 grid list-disc gap-1 pl-5 text-body text-ink">
              {grade.timing.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>

          {speedChange || unlocked ? (
            <div className="grid gap-1 rounded-panel bg-primary-soft px-4 py-3 text-small text-primary-soft-ink">
              {speedChange ? (
                <p data-testid="echo-speed-change">
                  <span className="font-semibold">Speed {speedChange.to} wpm.</span> {speedChange.reason}
                </p>
              ) : null}
              {unlocked ? (
                <p>
                  <span className="font-semibold">New character unlocked:</span> <span className="font-mono font-semibold">{unlocked}</span>
                  . It comes up often until you have tried it 20 times.
                </p>
              ) : null}
            </div>
          ) : null}

          {tracks ? <EchoTimeline tracks={tracks} analysis={grade.timing} /> : null}
        </div>
      ) : null}

      {content === "koch" && phase !== "playing" ? (
        <div className="border-t border-border pt-5">
          <h3 className="text-body font-semibold text-ink">Your last {CHAR_STATS_WINDOW} tries of each character, copy and keying</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Each character of the lesson">
            {charset.map((c) => {
              const s = stats[c];
              const pct = s && s.tries > 0 ? Math.round(((s.tries - s.misses) / s.tries) * 100) : null;
              return (
                <li
                  key={c}
                  className={cn(
                    "inline-flex items-baseline gap-1.5 rounded-control bg-surface-strong px-2 py-1",
                    c === newest && "ring-1 ring-primary",
                  )}
                >
                  <span className="font-mono font-semibold text-ink">{c}</span>
                  <span className="tabular text-micro text-ink-muted">
                    {pct === null || !s ? "untried" : `${pct}% of ${s.tries}`}
                    {c === newest ? ", newest" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-small text-ink-muted">
            Weak and little-tried characters come up more often.{" "}
            {lesson < KOCH_LESSON_COUNT ? unlock.reason : "Every Koch character is unlocked."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
