/**
 * Receive: the Koch method's copy trainer (LCWO's order, 40 lessons), and drills of
 * callsigns, words, abbreviations and QSO phrases.
 *
 * Press Play, type what you hear as it comes in, and see what was sent with anything
 * missed marked. 90% or better in a Koch drill offers the next lesson. Characters that
 * get away (from the kept sessions, and from this sitting) come up more often.
 */
import {
  type CopyGrade,
  CW_ABBREVIATIONS,
  callsignCharset,
  charTries,
  type DrillTier,
  drillCharset,
  farnsworthTiming,
  gradeCopy,
  KOCH_LESSON_COUNT,
  kochWeights,
  lessonCharset,
  lessonNewChars,
  newestKochChar,
  PASS_THRESHOLD,
  randomCallsigns,
  randomGroups,
  randomQsoPhrase,
  randomWords,
  textToTimeline,
  wordPool,
} from "@outpost/shared";
import { CheckCircle2, Ear, Eraser, Play, RotateCcw, Snail, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Segmented, Select } from "@/components/ui/misc";
import { cn, plural } from "@/lib/utils";
import { getSidetone, type PlayHandle } from "../audio/sidetone";
import { MUTED_PHONE_HINT, SoundNotice } from "../audio/sound-notice";
import { Stepper } from "../components/stepper";
import { pushMorseProgress, useCharStats, useRecordMorseSession } from "../data";
import { applyMorsePrefs, useMorsePrefs } from "../prefs";
import { CopyDiff } from "./receive-copy-diff";
import { UnkeptNotice } from "./receive-unkept-notice";

type DrillId = "koch" | "groups" | "callsigns" | "words" | "abbrev" | "qso";

const DRILLS: { value: DrillId; label: string }[] = [
  { value: "koch", label: "Koch lesson (random groups)" },
  { value: "groups", label: "All learned characters" },
  { value: "callsigns", label: "Callsigns" },
  { value: "words", label: "Common words" },
  { value: "abbrev", label: "CW abbreviations" },
  { value: "qso", label: "QSO phrases" },
];

/** Drills with a simple and a complex pool. */
const TIERED_DRILLS: readonly DrillId[] = ["words", "callsigns"];

const TIER_OPTIONS: { value: DrillTier; label: string }[] = [
  { value: "simple", label: "Simple" },
  { value: "complex", label: "Complex" },
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

/** Everything a drill can send, so the characters to tap and hear are the ones being drilled. */
function drillCharsFor(drill: DrillId, tier: DrillTier, learned: readonly string[]): string[] {
  switch (drill) {
    case "koch":
    case "groups":
      return [...learned];
    case "callsigns":
      return callsignCharset(tier);
    case "words":
      return drillCharset(wordPool(tier));
    case "abbrev":
      return drillCharset(CW_ABBREVIATIONS);
    case "qso":
      return drillCharset([LETTERS, DIGITS, "?", "="]);
  }
}

function tierHint(drill: DrillId, tier: DrillTier): string {
  if (drill === "words") return tier === "simple" ? "Short common words." : "Longer words mixed with common ones.";
  return tier === "simple" ? "Short calls with one-letter prefixes." : "Longer prefixes, and now and then /P or /M.";
}

type Phase = "idle" | "playing" | "answer" | "graded";

interface Attempt {
  accuracy: number;
  passed: boolean;
}

const chip =
  "inline-flex size-9 items-center justify-center rounded-control font-mono text-small transition-colors disabled:opacity-50 max-md:size-11 md:pointer-coarse:size-11";

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function ReceiveTab() {
  const prefs = useMorsePrefs();
  const recordSession = useRecordMorseSession();
  const { stats, noteOutcome, markSynced } = useCharStats();
  const [drill, setDrill] = useState<DrillId>("koch");
  const [tier, setTier] = useState<DrillTier>("simple");
  const [phase, setPhase] = useState<Phase>("idle");
  const [sentText, setSentText] = useState("");
  const [typed, setTyped] = useState("");
  const [grade, setGrade] = useState<CopyGrade | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [missCounts, setMissCounts] = useState<Record<string, number>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [unkept, setUnkept] = useState(0);
  const handleRef = useRef<PlayHandle | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const lesson = prefs.kochLesson;
  const charset = useMemo(() => lessonCharset(lesson), [lesson]);
  const newChars = useMemo(() => lessonNewChars(lesson), [lesson]);
  const drillChars = useMemo(() => drillCharsFor(drill, tier, charset), [drill, tier, charset]);
  const drillLabel = DRILLS.find((d) => d.value === drill)?.label ?? "";

  useEffect(() => () => handleRef.current?.stop(), []);

  function makeText(seed: number): string {
    // The kept per-character stats (copy and keying, each character's last 20 tries) set the base
    // weights, with the lesson's newest character lifted while it is new; this sitting's misses go on top.
    const base = kochWeights(charset, stats, drill === "koch" ? newestKochChar(lesson) : null);
    const weights = charset.map((c, i) => (base[i] ?? 1) + 3 * (missCounts[c] ?? 0));
    switch (drill) {
      case "koch":
      case "groups":
        return randomGroups(charset, { groups: prefs.groupCount, groupSize: prefs.groupSize, seed, weights });
      case "callsigns":
        return randomCallsigns({ count: Math.max(3, Math.round(prefs.groupCount / 2)), seed, tier });
      case "words":
        return randomWords({ count: prefs.groupCount, seed, tier });
      case "abbrev":
        return randomWords({ count: prefs.groupCount, seed, pool: CW_ABBREVIATIONS });
      case "qso":
        return randomQsoPhrase({ seed });
    }
  }

  async function play(text: string, effWpm = prefs.effWpm): Promise<void> {
    handleRef.current?.stop();
    const tone = getSidetone();
    await tone.ensure();
    tone.setFrequency(prefs.toneHz);
    tone.setVolume(prefs.volume);
    const encoded = textToTimeline(text, farnsworthTiming(prefs.charWpm, effWpm));
    setPhase("playing");
    // Copy as you listen: operators write while the code is coming in.
    inputRef.current?.focus();
    const handle = tone.playTimeline(encoded.segments);
    handleRef.current = handle;
    const finished = await handle.done;
    if (finished) {
      setPhase((current) => (current === "playing" ? "answer" : current));
      inputRef.current?.focus();
    }
  }

  async function start(): Promise<void> {
    const text = makeText(Math.floor(Math.random() * 1e9));
    setSentText(text);
    setTyped("");
    setGrade(null);
    await play(text);
  }

  function stop(): void {
    handleRef.current?.stop();
    setPhase(sentText ? "answer" : "idle");
  }

  function check(): void {
    if (!sentText) return;
    const result = gradeCopy(sentText, typed);
    setGrade(result);
    setPhase("graded");
    setAttempts((list) => [...list, { accuracy: result.accuracy, passed: result.accuracy >= PASS_THRESHOLD }]);
    const misses: Record<string, number> = {};
    for (const ch of result.misses) misses[ch] = (misses[ch] ?? 0) + 1;
    setMissCounts((previous) => {
      const next = { ...previous };
      for (const [ch, n] of Object.entries(misses)) next[ch] = (next[ch] ?? 0) + n;
      return next;
    });
    const tries = charTries(sentText);
    const outcomeId = noteOutcome({ tries, misses });
    recordSession.mutate(
      {
        kind: "receive",
        accuracy: result.accuracy,
        charWpm: prefs.charWpm,
        effWpm: prefs.effWpm,
        ...(drill === "koch" ? { lesson } : {}),
        misses,
        tries,
      },
      { onSuccess: () => markSynced(outcomeId), onError: () => setUnkept((n) => n + 1) },
    );
  }

  async function playChar(ch: string): Promise<void> {
    // The characters share the drill's key: playing one during a drill would cut off the rest of it,
    // which would then be graded as if it had been heard.
    if (phase === "playing") return;
    const tone = getSidetone();
    await tone.ensure();
    tone.setFrequency(prefs.toneHz);
    tone.setVolume(prefs.volume);
    tone.playTimeline(textToTimeline(ch, farnsworthTiming(prefs.charWpm, prefs.charWpm)).segments);
  }

  function setLesson(next: number): void {
    applyMorsePrefs({ kochLesson: next });
    void pushMorseProgress({ kochLesson: next });
  }

  const passed = grade !== null && grade.accuracy >= PASS_THRESHOLD;
  const kochMode = drill === "koch";
  const sessionAverage = attempts.length > 0 ? attempts.reduce((sum, a) => sum + a.accuracy, 0) / attempts.length : null;
  const passes = attempts.filter((a) => a.passed).length;
  const weakChars = Object.entries(missCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div className="grid items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* The drill comes first: on a phone the settings would otherwise push Play far down the screen. */}
      <div className="min-w-0 space-y-8">
        <section aria-label="Drill" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {phase === "playing" ? (
              <Button onClick={stop}>
                <Square aria-hidden /> Stop
              </Button>
            ) : (
              <Button variant="primary" onClick={() => void start()}>
                <Play aria-hidden />
                {phase === "idle" ? "Play" : "New drill"}
              </Button>
            )}
            {sentText && phase !== "playing" ? (
              <>
                <Button onClick={() => void play(sentText)}>
                  <RotateCcw aria-hidden /> Replay
                </Button>
                <Button onClick={() => void play(sentText, Math.max(4, prefs.effWpm - 3))} title="Replay with wider gaps">
                  <Snail aria-hidden /> Slower
                </Button>
              </>
            ) : null}
            {phase === "playing" ? (
              <span className="inline-flex items-center gap-2 text-small text-ink-muted">
                <Ear className="size-4 text-lamp" aria-hidden /> Listen…
              </span>
            ) : null}
          </div>
          <SoundNotice />

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (phase === "answer") check();
              else if (phase === "playing") {
                // Enter during playback: they have finished copying, so stop and grade. With nothing
                // typed it only stops: grading nothing would keep a 0% session and count every
                // character sent as a miss.
                handleRef.current?.stop();
                if (typed.trim() === "") setPhase("answer");
                else check();
              }
            }}
          >
            <Field label="What did you hear?">
              {(ids) => (
                <Input
                  {...ids}
                  ref={inputRef}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  disabled={phase === "idle"}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={phase === "idle" ? "Press Play to start" : "Type as you listen, then press Enter"}
                  className="h-12 font-mono text-lead tracking-widest uppercase placeholder:font-sans placeholder:text-body placeholder:tracking-normal placeholder:normal-case max-md:h-12"
                />
              )}
            </Field>
            {phase === "answer" ? (
              <Button type="submit" variant="primary" disabled={typed.trim() === ""}>
                <CheckCircle2 aria-hidden /> Check copy
              </Button>
            ) : null}
          </form>

          {phase === "graded" && grade ? (
            <div className="space-y-3" aria-live="polite">
              <p className="text-lead text-ink">
                <span className={cn("tabular font-semibold", passed && "text-success")}>{percent(grade.accuracy)}</span> copied
                <span className="tabular text-body text-ink-muted">
                  : {grade.correct} of {plural(grade.total, "character")}.
                  {kochMode && !passed ? ` ${percent(PASS_THRESHOLD)} moves you on to the next lesson.` : ""}
                </span>
              </p>
              <CopyDiff sent={sentText} typed={typed} className="rounded-panel bg-surface px-3 py-3 text-lead" />
              <p className="text-small text-ink-muted">What was sent, with anything you missed or mistyped marked.</p>
              {kochMode && passed && lesson < KOCH_LESSON_COUNT ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel bg-success-soft px-4 py-3">
                  <p className="text-body text-ink">
                    Solid copy. Ready for lesson {lesson + 1}, which adds{" "}
                    <span className="font-mono font-semibold">{lessonNewChars(lesson + 1).join(", ")}</span>.
                  </p>
                  <Button size="sm" variant="primary" onClick={() => setLesson(lesson + 1)}>
                    Go to lesson {lesson + 1}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <UnkeptNotice count={unkept} />

          {/* While nothing plays, the characters stay to hand: tap one to hear it between drills. */}
          {phase !== "playing" && kochMode ? (
            <div>
              <p id="koch-chars" className="text-small font-medium text-ink">
                Lesson {lesson} of {KOCH_LESSON_COUNT}: characters so far
              </p>
              {/* biome-ignore lint/a11y/useSemanticElements: a row of buttons named by the line above it */}
              <div role="group" aria-labelledby="koch-chars" className="mt-2 flex flex-wrap gap-1">
                {charset.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => void playChar(c)}
                    title={`Play ${c}`}
                    className={cn(
                      chip,
                      newChars.includes(c)
                        ? "bg-primary font-semibold text-primary-ink hover:bg-primary-hover"
                        : "bg-surface-strong text-ink hover:bg-border",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-small text-ink-muted">
                Tap a character to hear it. {newChars.length === 1 ? "New this lesson: " : "Lesson 1 starts with "}
                <span className="font-mono font-medium text-ink">{newChars.join(" and ")}</span>.
              </p>
            </div>
          ) : null}

          {/* Other drills draw on their own pool, so these are the characters of that pool. */}
          {phase !== "playing" && !kochMode ? (
            <div data-testid="drill-charset">
              <p id="drill-chars" className="text-small font-medium text-ink">
                {drillLabel}: characters in this drill
              </p>
              {/* biome-ignore lint/a11y/useSemanticElements: a row of buttons named by the line above it */}
              <div role="group" aria-labelledby="drill-chars" className="mt-2 flex flex-wrap gap-1">
                {drillChars.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => void playChar(c)}
                    title={`Play ${c}`}
                    className={cn(chip, "bg-surface-strong text-ink hover:bg-border")}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-small text-ink-muted">Tap a character to hear it.</p>
            </div>
          ) : null}
        </section>

        {attempts.length > 0 ? (
          <section className="border-t border-border pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lead font-semibold text-ink">This session</h2>
              <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}>
                <Eraser aria-hidden /> Reset session
              </Button>
            </div>
            <p className="tabular mt-2 text-body text-ink">
              {plural(attempts.length, "drill")}
              {sessionAverage !== null ? `, ${percent(sessionAverage)} copied on average` : ""}, {plural(passes, "pass", "passes")} at{" "}
              {percent(PASS_THRESHOLD)} or better.
            </p>
            {weakChars.length > 0 ? (
              <div className="mt-4">
                <p id="needs-work" className="text-small font-medium text-ink">
                  Needs work
                </p>
                {/* biome-ignore lint/a11y/useSemanticElements: a row of buttons named by the line above it */}
                <div role="group" aria-labelledby="needs-work" className="mt-2 flex flex-wrap gap-1.5">
                  {weakChars.map(([ch, n]) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => void playChar(ch)}
                      disabled={phase === "playing"}
                      title={`Play ${ch}`}
                      aria-label={`${ch}, missed ${plural(n, "time")}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-control bg-warning-soft px-2.5 font-mono text-small text-ink transition-colors hover:bg-surface-strong disabled:opacity-50 max-md:h-11"
                    >
                      {ch}
                      <span className="tabular font-sans text-micro text-ink-muted">×{n}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-small text-ink-muted">These come up in your next drills more often. Tap one to hear it.</p>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <section aria-labelledby="receive-settings" className="min-w-0 space-y-5 rounded-panel border border-border p-3 sm:p-4">
        <h2 id="receive-settings" className="text-lead font-semibold text-ink">
          Settings
        </h2>
        <Field label="Drill">{(ids) => <Select {...ids} value={drill} options={DRILLS} onChange={setDrill} />}</Field>
        {TIERED_DRILLS.includes(drill) ? (
          <div className="grid gap-1.5">
            <span className="text-small font-medium text-ink">Difficulty</span>
            <Segmented label="Difficulty" value={tier} onChange={setTier} options={TIER_OPTIONS} />
            <p className="text-small text-ink-muted">{tierHint(drill, tier)}</p>
          </div>
        ) : null}
        <Stepper
          label="Koch lesson"
          value={lesson}
          min={1}
          max={KOCH_LESSON_COUNT}
          onChange={setLesson}
          hint={`Lesson ${lesson} of ${KOCH_LESSON_COUNT}`}
        />
        <Stepper
          label="Character speed"
          value={prefs.charWpm}
          min={10}
          max={40}
          unit="wpm"
          onChange={(n) => applyMorsePrefs({ charWpm: n, effWpm: Math.min(prefs.effWpm, n) })}
          hint="How fast each character sounds."
        />
        <Stepper
          label="Effective speed"
          value={prefs.effWpm}
          min={4}
          max={prefs.charWpm}
          unit="wpm"
          onChange={(n) => applyMorsePrefs({ effWpm: n })}
          hint="Farnsworth spacing: the gaps stretch to this overall speed."
        />
        {/* One under the other: two steppers side by side are wider than a phone, and than this column. */}
        <Stepper label="Groups" value={prefs.groupCount} min={3} max={20} onChange={(n) => applyMorsePrefs({ groupCount: n })} />
        <Stepper label="Group size" value={prefs.groupSize} min={3} max={8} onChange={(n) => applyMorsePrefs({ groupSize: n })} />
        <Stepper
          label="Tone"
          value={prefs.toneHz}
          min={400}
          max={900}
          step={25}
          unit="Hz"
          onChange={(n) => {
            applyMorsePrefs({ toneHz: n });
            getSidetone().setFrequency(n);
          }}
        />
        {/* Stored as 0 to 1, shown as a percentage. */}
        <Stepper
          label="Volume"
          value={Math.round(prefs.volume * 100)}
          min={0}
          max={100}
          step={10}
          unit="%"
          onChange={(n) => {
            applyMorsePrefs({ volume: n / 100 });
            getSidetone().setVolume(n / 100);
          }}
          hint="The tone's own level, apart from the system volume."
        />
        <p className="text-small text-ink-muted">{MUTED_PHONE_HINT}</p>
      </section>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset this session?"
        description={`This clears ${plural(attempts.length, "drill")} and the needs-work list from this screen. Kept progress is not affected.`}
        confirmLabel="Reset"
        onConfirm={() => {
          setAttempts([]);
          setMissCounts({});
          setConfirmReset(false);
        }}
      />
    </div>
  );
}
