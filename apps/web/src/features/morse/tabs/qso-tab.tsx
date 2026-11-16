/**
 * QSO practice: a turn-based contact in Morse with a made-up station.
 *
 * The station sends real Morse; you copy it into a scratchpad (graded against what was
 * sent), then reply by keying: what the decoder makes of your keying, not typed text,
 * is what the station hears. The level sets the speed and adds band noise, fading and
 * an interfering station; QRS in your keying slows the other operator down, AGN asks
 * for a repeat.
 */
import {
  farnsworthTiming,
  gradeCopy,
  LEVEL_SPEEDS,
  type QsoLevel,
  QsoSimulator,
  randomCallsigns,
  rhythmScore,
  textToTimeline,
} from "@outpost/shared";
import { Check, Minus, Play, Radio, RotateCcw, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { cn, plural } from "@/lib/utils";
import { getSidetone, type PlayHandle } from "../audio/sidetone";
import { MUTED_PHONE_HINT, SoundNotice } from "../audio/sound-notice";
import { TickerTape } from "../components/ticker-tape";
import { useMorse, useRecordMorseSession } from "../data";
import { MousePaddleCapture } from "../input/mouse-paddle-capture";
import { KeyPad } from "../keyer/key-pad";
import { useKeyer } from "../keyer/use-keyer";
import { applyMorsePrefs, useMorsePrefs } from "../prefs";
import { CopyDiff } from "./receive-copy-diff";
import { UnkeptNotice } from "./receive-unkept-notice";

/**
 * The call to practise with when there is none of your own yet: a missing call must never
 * stop someone who is not licensed from practising, and the station needs something to
 * call back. Made up: no country is given calls that start with Q.
 */
export const STANDIN_CALL = "Q7XYZ";

const LEVELS: { id: QsoLevel; label: string; blurb: string }[] = [
  { id: "beginner", label: "Beginner", blurb: "15 wpm characters, wide gaps, a clean signal" },
  { id: "intermediate", label: "Intermediate", blurb: "18 wpm characters at 12 wpm, light band noise" },
  { id: "advanced", label: "Advanced", blurb: "24 wpm, noise, fading and another station nearby" },
];

interface StationOver {
  id: number;
  from: "station";
  text: string;
  revealed: boolean;
  copyAccuracy?: number;
  /** What was typed in the scratchpad, for the diff. */
  copy?: string;
}
interface YourOver {
  id: number;
  from: "you";
  text: string;
}
type Over = StationOver | YourOver;

type Stage = "setup" | "listening" | "copy" | "reply" | "done";

const average = (values: readonly number[]) => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function QsoTab() {
  const prefs = useMorsePrefs();
  const morse = useMorse();
  const recordSession = useRecordMorseSession();

  const [level, setLevel] = useState<QsoLevel>("beginner");
  const [myCall, setMyCall] = useState(prefs.callsign);
  const [stage, setStage] = useState<Stage>("setup");
  const [overs, setOvers] = useState<Over[]>([]);
  const [scratch, setScratch] = useState("");
  const [copyAccs, setCopyAccs] = useState<number[]>([]);
  const [rhythms, setRhythms] = useState<number[]>([]);
  const [showCrib, setShowCrib] = useState(true);
  const [unkept, setUnkept] = useState(0);
  const keyer = useKeyer(stage === "reply");

  const simRef = useRef<QsoSimulator | null>(null);
  const handleRef = useRef<PlayHandle | null>(null);
  const qrmTimer = useRef<number | undefined>(undefined);
  const overId = useRef(0);
  const logRef = useRef<HTMLOListElement | null>(null);

  // The saved callsign can arrive after the tab opens (from the contact log, on the first sync).
  const savedCall = prefs.callsign;
  useEffect(() => {
    if (savedCall) setMyCall((current) => (current === "" ? savedCall : current));
  }, [savedCall]);

  // Everything downstream (the simulator, the cribs, the summary) works from this, so an empty field is allowed.
  const effectiveCall = myCall.trim() || STANDIN_CALL;
  const usingStandin = myCall.trim() === "";

  // biome-ignore lint/correctness/useExhaustiveDependencies: keeps the newest over in view as overs arrive
  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [overs, stage]);

  useEffect(
    () => () => {
      handleRef.current?.stop();
      window.clearTimeout(qrmTimer.current);
      getSidetone().setImpairments({ noise: 0, qsb: 0 });
    },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: the simulator is a ref; a QRS shows in the next stage or over
  const speeds = useMemo(() => {
    const base = LEVEL_SPEEDS[level];
    const qrs = simRef.current?.qrsWpmReduction ?? 0;
    return { charWpm: Math.max(10, base.charWpm - qrs), effWpm: Math.max(4, base.effWpm - qrs) };
  }, [level, stage, overs]);

  function applyImpairments(): void {
    const tone = getSidetone();
    if (level === "advanced") tone.setImpairments({ noise: 0.5, qsb: 0.45 });
    else if (level === "intermediate") tone.setImpairments({ noise: 0.25, qsb: 0 });
    else tone.setImpairments({ noise: 0, qsb: 0 });
  }

  function scheduleQrm(): void {
    if (level !== "advanced") return;
    window.clearTimeout(qrmTimer.current);
    qrmTimer.current = window.setTimeout(
      () => {
        const text = `CQ CQ DE ${randomCallsigns({ count: 1, seed: Math.floor(Math.random() * 1e9) })}`;
        getSidetone().playTimeline(textToTimeline(text, farnsworthTiming(22, 18)).segments, { channel: "qrm" });
        scheduleQrm();
      },
      4000 + Math.random() * 8000,
    );
  }

  async function playStation(text: string): Promise<void> {
    const tone = getSidetone();
    await tone.ensure();
    tone.setFrequency(prefs.toneHz);
    tone.setVolume(prefs.volume);
    applyImpairments();
    scheduleQrm();
    handleRef.current?.stop();
    setStage("listening");
    const handle = tone.playTimeline(textToTimeline(text, farnsworthTiming(speeds.charWpm, speeds.effWpm)).segments);
    handleRef.current = handle;
    const finished = await handle.done;
    if (finished) setStage((current) => (current === "listening" ? "copy" : current));
  }

  function pushStation(text: string, revealed = false): StationOver {
    const over: StationOver = { id: ++overId.current, from: "station", text, revealed };
    setOvers((previous) => [...previous, over]);
    return over;
  }

  async function start(): Promise<void> {
    if (myCall.trim() !== prefs.callsign) applyMorsePrefs({ callsign: myCall.trim().toUpperCase() });
    const sim = new QsoSimulator({
      userCall: effectiveCall,
      level,
      seed: Math.floor(Math.random() * 1e9),
      weakChars: Object.keys(morse.data?.weakChars ?? {}),
    });
    simRef.current = sim;
    setOvers([]);
    setCopyAccs([]);
    setRhythms([]);
    setScratch("");
    keyer.clear();
    setShowCrib(level === "beginner");
    const opening = sim.start();
    pushStation(opening);
    await playStation(opening);
  }

  function checkCopy(skip = false): void {
    const index = overs.findLastIndex((over) => over.from === "station" && !over.revealed);
    const over = overs[index];
    if (over && over.from === "station") {
      const accuracy = skip ? undefined : gradeCopy(over.text, scratch).accuracy;
      const next = [...overs];
      next[index] = { ...over, revealed: true, copyAccuracy: accuracy, copy: skip ? undefined : scratch };
      setOvers(next);
      if (accuracy !== undefined) setCopyAccs((list) => [...list, accuracy]);
    }
    setScratch("");
    setStage("reply");
  }

  async function sendReply(): Promise<void> {
    const sim = simRef.current;
    if (!sim) return;
    keyer.decoder.flush(performance.now());
    const yours = keyer.decoder.text.trim();
    if (yours === "") return;
    const rhythm = rhythmScore(keyer.decoder.ditMarks, keyer.decoder.dahMarks);
    const nextRhythms = [...rhythms, rhythm];
    setRhythms(nextRhythms);
    setOvers((previous) => [...previous, { id: ++overId.current, from: "you", text: yours }]);
    const answer = sim.reply(yours);
    keyer.clear();
    if (answer !== null && !sim.done) {
      pushStation(answer);
      await playStation(answer);
      return;
    }
    if (answer !== null) {
      // The station's last over is shown at once: there is nothing more to copy.
      pushStation(answer, true);
      await playStation(answer);
    }
    finish(sim, nextRhythms);
  }

  function finish(sim: QsoSimulator, rhythmList: readonly number[]): void {
    setStage("done");
    window.clearTimeout(qrmTimer.current);
    getSidetone().setImpairments({ noise: 0, qsb: 0 });
    const card = sim.scorecard();
    const copyAverage = average(copyAccs);
    const rhythmAverage = average(rhythmList);
    const accuracy = copyAverage !== null ? 0.5 * card.score + 0.5 * copyAverage : card.score;
    recordSession.mutate(
      {
        kind: "qso",
        accuracy: clamp01(accuracy),
        charWpm: speeds.charWpm,
        effWpm: speeds.effWpm,
        ...(rhythmAverage !== null ? { rhythm: clamp01(rhythmAverage) } : {}),
      },
      { onError: () => setUnkept((n) => n + 1) },
    );
  }

  const sim = simRef.current;
  const activeStation = overs.filter((over): over is StationOver => over.from === "station").at(-1);
  // Worked out on every render: the simulator's phase is held in a ref, and each over redraws this.
  const crib = ((): string | null => {
    if (!sim || !showCrib) return null;
    switch (sim.currentPhase) {
      case "cq":
        return `${sim.station.call} DE ${effectiveCall} ${effectiveCall} K`;
      case "exchange":
        return `R R UR RST 599 599 = NAME <yours> QTH <yours> = ${sim.station.call} DE ${effectiveCall} KN`;
      case "final":
        return `73 ES TNX ${sim.station.call} DE ${effectiveCall} <SK>`;
      default:
        return null;
    }
  })();

  if (stage === "setup") {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="text-lead font-semibold text-ink">Work a made-up station</h2>
          <p className="mt-1 text-body text-ink-muted">
            It calls CQ in real Morse. You answer on the key, not by typing. Copy each of its overs in the scratchpad, send yours on the
            key, and close with a 73.
          </p>
        </div>
        <fieldset>
          <legend className="text-small font-medium text-ink">Level</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
            {LEVELS.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => setLevel(choice.id)}
                aria-pressed={level === choice.id}
                className={cn(
                  "min-h-11 rounded-control border px-3 py-2.5 text-left transition-colors",
                  level === choice.id ? "border-primary bg-primary-soft text-primary-soft-ink" : "border-border-strong hover:bg-surface",
                )}
              >
                <span className="block text-small font-semibold">{choice.label}</span>
                <span className="mt-0.5 block text-small text-ink-muted">{choice.blurb}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <Field
          label="Your callsign (if you have one)"
          hint={
            usingStandin
              ? `No licence yet? Leave this empty and you will practise as ${STANDIN_CALL}, a made-up call: no country is given calls that start with Q.`
              : "What you will send on the key. The station answers what it hears."
          }
        >
          {(ids) => (
            <Input
              {...ids}
              value={myCall}
              onChange={(event) => setMyCall(event.target.value.toUpperCase())}
              placeholder={STANDIN_CALL}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="max-w-60 font-mono uppercase"
            />
          )}
        </Field>
        <div className="space-y-3">
          <Button variant="primary" onClick={() => void start()}>
            <Radio aria-hidden /> Start listening
          </Button>
          <SoundNotice />
          <p className="text-small text-ink-muted">{MUTED_PHONE_HINT}</p>
        </div>
      </div>
    );
  }

  const card = sim?.scorecard();
  const copyAverage = average(copyAccs);

  return (
    <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-5">
        <ol ref={logRef} aria-label="The contact so far" className="max-h-96 divide-y divide-border overflow-y-auto border-y border-border">
          {overs.map((over) => (
            <li key={over.id} className="grid gap-x-4 gap-y-0.5 py-2.5 sm:grid-cols-[6rem_minmax(0,1fr)]">
              <span className={cn("text-small", over.from === "you" ? "font-semibold text-ink" : "font-mono text-ink-muted")}>
                {over.from === "you" ? "You" : (sim?.station.call ?? "Station")}
              </span>
              {over.from === "you" ? (
                <p className="font-mono font-semibold tracking-wider break-all text-ink">{over.text}</p>
              ) : over.revealed ? (
                <div>
                  {over.copy !== undefined ? (
                    <CopyDiff sent={over.text} typed={over.copy} className="tracking-wider" />
                  ) : (
                    <p className="font-mono tracking-wider break-all text-ink">{over.text}</p>
                  )}
                  {over.copyAccuracy !== undefined ? (
                    <p className="tabular text-small text-ink-muted">
                      You copied {Math.round(over.copyAccuracy * 100)}%; anything you missed is marked.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="inline-flex items-center gap-2 text-small text-ink-muted">
                  <Radio className="size-4 text-lamp" aria-hidden /> On the air…
                </p>
              )}
            </li>
          ))}
        </ol>

        {stage === "listening" ? (
          <p className="inline-flex items-center gap-2 text-small text-ink-muted" aria-live="polite">
            <Radio className="size-4 text-lamp" aria-hidden /> The other station is sending. Copy what you hear.
          </p>
        ) : null}
        <SoundNotice />

        {(stage === "copy" || stage === "listening") && activeStation ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (stage === "copy") checkCopy();
            }}
            className="space-y-3"
          >
            <Field label="Scratchpad: what did they send?">
              {(ids) => (
                <Input
                  {...ids}
                  value={scratch}
                  onChange={(event) => setScratch(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="Copy here as you listen"
                  className="font-mono tracking-widest uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case"
                />
              )}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={stage !== "copy" || scratch.trim() === ""}>
                Check my copy
              </Button>
              <Button size="sm" disabled={stage !== "copy"} onClick={() => void playStation(activeStation.text)}>
                <RotateCcw aria-hidden /> Hear it again
              </Button>
              <Button size="sm" variant="ghost" disabled={stage !== "copy"} onClick={() => checkCopy(true)}>
                Skip to reply
              </Button>
            </div>
          </form>
        ) : null}

        {stage === "reply" ? (
          <div className="space-y-4">
            <MousePaddleCapture
              compact
              keyType={prefs.keyType}
              swapPaddles={prefs.swapPaddles}
              onPress={keyer.press}
              onRelease={keyer.release}
            />
            <KeyPad
              keyType={prefs.keyType}
              keyDown={keyer.keyDown}
              bindings={{ dit: prefs.keyDit, dah: prefs.keyDah, straight: prefs.keyStraight }}
              swapPaddles={prefs.swapPaddles}
              onPress={keyer.press}
              onRelease={keyer.release}
            />
            <div className="flex flex-wrap items-start gap-2">
              <TickerTape
                text={keyer.text}
                pending={keyer.pending}
                wpm={keyer.wpm}
                placeholder="Key your reply: it is decoded here"
                className="min-w-0 flex-1 basis-60"
              />
              <Button variant="primary" onClick={() => void sendReply()} disabled={keyer.text.trim() === ""}>
                <Send aria-hidden /> Send over
              </Button>
            </div>
            {crib ? (
              <p className="text-small text-ink-muted">
                Crib: <span className="font-mono break-all text-ink">{crib}</span>{" "}
                <Button variant="link" size="sm" onClick={() => setShowCrib(false)}>
                  Hide the crib
                </Button>
              </p>
            ) : (
              <Button variant="link" size="sm" onClick={() => setShowCrib(true)}>
                Show a crib for this over
              </Button>
            )}
          </div>
        ) : null}

        {stage === "done" && sim && card ? (
          <section aria-labelledby="qso-done" className="space-y-4" aria-live="polite">
            <h2 id="qso-done" className="text-lead font-semibold text-ink">
              Contact complete: {sim.station.call} is in the log
            </h2>
            <Rows aria-label="How the contact went">
              {(
                [
                  ["Answered their CQ", card.answeredCall],
                  ["Copied their call", card.copiedNpcCall],
                  ["Sent a report", card.sentRst],
                  ["Sent your name", card.sentName],
                  ["Signed off (73)", card.signedOff],
                ] as const
              ).map(([label, ok]) => (
                <li key={label} className="flex items-center gap-2.5 py-2 text-body">
                  {ok ? <Check className="size-4 text-success" aria-hidden /> : <Minus className="size-4 text-ink-muted" aria-hidden />}
                  <span className={ok ? "text-ink" : "text-ink-muted"}>{label}</span>
                  <span className="sr-only">{ok ? ": done" : ": not done"}</span>
                </li>
              ))}
            </Rows>
            <p className="tabular text-body text-ink-muted">
              {copyAverage !== null ? `You copied ${Math.round(copyAverage * 100)}% on average. ` : ""}
              The station was {sim.station.name} in {sim.station.qth}, and gave you {sim.station.rstGiven}.
              {card.repeatsAsked > 0 ? ` You asked for ${plural(card.repeatsAsked, "repeat")}: that is what AGN is for.` : ""}
            </p>
            <UnkeptNotice count={unkept} />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void start()}>
                <Play aria-hidden /> Work another station
              </Button>
              <Button onClick={() => setStage("setup")}>Change level or callsign</Button>
            </div>
          </section>
        ) : null}
      </div>

      <section aria-labelledby="qso-contact" className="min-w-0 rounded-panel border border-border p-4">
        <h2 id="qso-contact" className="text-lead font-semibold text-ink">
          This contact
        </h2>
        <dl className="mt-2 space-y-1.5 text-body">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Level</dt>
            <dd className="font-medium text-ink">{LEVELS.find((choice) => choice.id === level)?.label}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Their speed</dt>
            <dd className="tabular font-medium text-ink">
              {speeds.charWpm === speeds.effWpm ? `${speeds.charWpm} wpm` : `${speeds.charWpm} wpm at ${speeds.effWpm} wpm`}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Your call</dt>
            <dd className="font-mono text-ink">{effectiveCall}</dd>
          </div>
        </dl>
        {usingStandin ? (
          <p className="mt-3 text-small text-ink-muted">
            {STANDIN_CALL} is made up, to practise with. Put your own call in under “Change level or callsign” once you have one.
          </p>
        ) : null}
        <p className="mt-3 text-small text-ink-muted">
          Struggling? Key <span className="font-mono text-ink">QRS</span> and they slow down.{" "}
          <span className="font-mono text-ink">AGN</span> asks for a repeat.
        </p>
      </section>
    </div>
  );
}
