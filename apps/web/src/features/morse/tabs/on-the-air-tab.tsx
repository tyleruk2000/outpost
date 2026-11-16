/**
 * On the air: learn to send a call that a Reverse Beacon Network skimmer can spot,
 * practise it on your own key with the echo grading judged against what a skimmer
 * needs, and read what to do before calling on the air.
 *
 * The trainer never keys a radio: the practice is on its own keyer and tone. Outpost
 * makes no request to the network either: the section on whether it heard you links
 * to the network's own site, which opens only if you press the link.
 */
import {
  type EchoGrade,
  gradeEcho,
  isPlausibleCallsign,
  RBN_MESSAGE_KINDS,
  RBN_ON_AIR_CHECKLIST,
  RBN_REPEAT_TIP,
  type RbnMessageKind,
  rbnMessage,
  type SkimmerCheck,
  skimmerChecks,
  standardTiming,
  type TimelineTracks,
  textToTimeline,
  timelineTracks,
} from "@outpost/shared";
import { CheckCircle2, CircleAlert, ExternalLink, Play, Square } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { getSidetone, type PlayHandle } from "../audio/sidetone";
import { SoundNotice } from "../audio/sound-notice";
import { MarkedDiff, normalizeMorseText } from "../components/echo-diff";
import { SwitchField } from "../components/echo-switch";
import { EchoTimeline } from "../components/echo-timeline";
import { Stepper } from "../components/stepper";
import { TickerTape } from "../components/ticker-tape";
import { useRecordMorseSession } from "../data";
import { KeyPad } from "../keyer/key-pad";
import { useKeyer } from "../keyer/use-keyer";
import { applyMorsePrefs, useMorsePrefs } from "../prefs";

/** The Reverse Beacon Network's own page of spots. Opened only by the person, never fetched here. */
export const RBN_SPOTS_URL = "https://www.reversebeacon.net/main.php";

function CheckRow({ check }: { check: SkimmerCheck }) {
  return (
    <li className="flex gap-2.5 py-2">
      {check.ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
      ) : (
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      )}
      <div>
        <p className="text-body font-medium text-ink">
          {check.label}: <span className={check.ok ? "text-success" : "text-warning"}>{check.ok ? "pass" : "needs work"}</span>
        </p>
        <p className="text-small text-ink-muted">{check.detail}</p>
      </div>
    </li>
  );
}

function DidTheRbnHearYou() {
  return (
    <section aria-labelledby="rbn-heard-heading" className="grid max-w-[65ch] gap-3 border-t border-border pt-6">
      <h2 id="rbn-heard-heading" className="text-lead font-semibold text-ink">
        Did the RBN hear you?
      </h2>
      <p className="text-body text-ink">
        The Reverse Beacon Network is a network of receiving stations, called skimmers, run by volunteers. They decode CW calls such as CQ
        and TEST and publish who they heard, where, how strongly and when. A spot is a reception report, a skimmer hearing your signal: it
        is not a contact.
      </p>
      <p className="text-body text-ink">
        <a
          href={RBN_SPOTS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2 md:min-h-0"
        >
          Open the Reverse Beacon Network's spots
          <ExternalLink className="size-4" aria-hidden />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <span className="block">Type your call into the box for the spotted station there.</span>
      </p>
      <p className="text-small text-ink-muted">Outpost itself asks the network nothing: the page opens only if you press the link.</p>
    </section>
  );
}

export default function OnTheAirTab() {
  const prefs = useMorsePrefs();
  const callId = useId();
  const callsign = prefs.callsign.trim().toUpperCase();
  const callOk = isPlausibleCallsign(callsign);

  const [kind, setKind] = useState<RbnMessageKind>("cq");
  const [wpm, setWpm] = useState(() => Math.min(35, Math.max(10, prefs.keyerWpm)));
  const [playing, setPlaying] = useState(false);
  const [grade, setGrade] = useState<EchoGrade | null>(null);
  const [checks, setChecks] = useState<SkimmerCheck[] | null>(null);
  const [tracks, setTracks] = useState<TimelineTracks | null>(null);
  const [decoded, setDecoded] = useState("");
  const [threeCalls, setThreeCalls] = useState(false);
  // One session kept per attempt: Check my call stays done until Clear and try again (or Hear it) starts a new one.
  const [checked, setChecked] = useState(false);
  const [heard, setHeard] = useState(false);
  const handleRef = useRef<PlayHandle | null>(null);
  const recordSession = useRecordMorseSession();

  const timing = useMemo(() => standardTiming(wpm), [wpm]);
  const keyer = useKeyer(!playing, { wpm });
  const message = useMemo(
    () => rbnMessage(kind, callOk ? callsign : "YOURCALL", { repeats: threeCalls ? 3 : 2 }),
    [kind, callOk, callsign, threeCalls],
  );
  const keyerTimed = prefs.keyType === "paddle" || prefs.keyType === "single";

  useEffect(() => () => handleRef.current?.stop(), []);

  function reset(): void {
    keyer.clearAt(timing.ditMs);
    setGrade(null);
    setChecks(null);
    setTracks(null);
    setChecked(false);
  }

  async function hear(): Promise<void> {
    handleRef.current?.stop();
    setPlaying(true);
    const tone = getSidetone();
    await tone.ensure();
    tone.setFrequency(prefs.toneHz);
    tone.setVolume(prefs.volume);
    const handle = tone.playTimeline(textToTimeline(message.text, timing).segments);
    handleRef.current = handle;
    await handle.done;
    handleRef.current = null;
    setPlaying(false);
    // A new attempt starts after listening: keying from before is not part of it.
    reset();
    setHeard(true);
  }

  function check(): void {
    if (checked) return;
    setChecked(true);
    const decoder = keyer.decoder;
    decoder.flush(performance.now());
    const text = decoder.text;
    const marks = [...decoder.marks];
    const result = gradeEcho(message.text, text, marks, timing, { keyerTimed, heard });
    setDecoded(text);
    setGrade(result);
    setTracks(timelineTracks(message.text, timing, marks));
    setChecks(skimmerChecks({ call: callsign, decoded: text, analysis: result.timing, marks }));
    recordSession.mutate({
      kind: "send",
      accuracy: result.copy.accuracy,
      rhythm: result.timing.score,
      charWpm: wpm,
      misses: result.misses,
      tries: result.tries,
    });
  }

  const allOk = checks?.every((c) => c.ok) ?? false;
  const noneOk = checks?.every((c) => !c.ok) ?? false;

  return (
    <div className="grid gap-8">
      <p className="max-w-[65ch] text-body text-ink-muted">
        The Reverse Beacon Network is a worldwide set of receivers that decode Morse. Call CQ on the air and, if one hears you, it publishes
        a spot within a minute or two: a free check of how far your signal gets. Practise the call here first. This page does not key your
        radio.
      </p>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-10">
        <div className="grid min-w-0 gap-8">
          <section aria-labelledby="rbn-call-heading" className="grid gap-5">
            <h2 id="rbn-call-heading" className="text-lead font-semibold text-ink">
              Your call
            </h2>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
              <div className="grid gap-1.5">
                <label htmlFor={callId} className="text-small font-medium text-ink">
                  Your callsign
                </label>
                <Input
                  id={callId}
                  value={prefs.callsign}
                  onChange={(event) => applyMorsePrefs({ callsign: event.target.value.toUpperCase().replace(/\s+/g, "") })}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-describedby={`${callId}-hint`}
                  aria-invalid={callsign !== "" && !callOk ? true : undefined}
                  className="w-44 font-mono uppercase"
                />
              </div>
              <div className="grid gap-1.5">
                <span className="text-small font-medium text-ink">Call style</span>
                <Segmented
                  label="Call style"
                  value={kind}
                  onChange={(next) => {
                    setKind(next);
                    reset();
                  }}
                  options={RBN_MESSAGE_KINDS.map((k) => ({ value: k, label: rbnMessage(k, "X1X").label }))}
                />
              </div>
            </div>
            <p id={`${callId}-hint`} className="-mt-2 text-small text-ink-muted">
              {callOk
                ? "Practising with this callsign. The trainer keeps it with its settings, and the CQ conversation on Send starts from it."
                : callsign
                  ? "That does not look like a callsign yet: a prefix, a digit and a suffix, such as Q7XYZ."
                  : "Enter your callsign to build the call. The trainer keeps it with its settings."}
            </p>

            <div>
              <p className="break-all rounded-panel bg-surface px-4 py-3 font-mono text-lead tracking-widest text-ink">{message.text}</p>
              <p className="mt-1.5 text-small text-ink-muted">{message.blurb}</p>
            </div>
            <SwitchField
              label="Send my call three times"
              hint={RBN_REPEAT_TIP}
              checked={threeCalls}
              onChange={(next) => {
                setThreeCalls(next);
                reset();
              }}
            />

            <ol className="divide-y divide-border border-y border-border" aria-label="Why each part is there">
              {message.parts.map((part, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the parts repeat (CQ CQ, the call twice); their place is their identity
                <li key={index} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-2">
                  <span className="break-all font-mono font-semibold text-ink">{part.text}</span>
                  <span className="text-small text-ink-muted">{part.why}</span>
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap items-end gap-4">
              <Stepper label="Speed" value={wpm} min={10} max={35} unit="wpm" onChange={setWpm} />
              {playing ? (
                <Button onClick={() => handleRef.current?.stop()}>
                  <Square aria-hidden /> Stop
                </Button>
              ) : (
                <Button onClick={() => void hear()} disabled={!callOk}>
                  <Play aria-hidden /> Hear it
                </Button>
              )}
            </div>
            <SoundNotice />
          </section>

          <section aria-labelledby="rbn-send-heading" className="grid gap-4 border-t border-border pt-6">
            <div>
              <h2 id="rbn-send-heading" className="text-lead font-semibold text-ink">
                Practise sending it
              </h2>
              <p className="mt-1 text-small text-ink-muted">
                Key the call on your {prefs.keyType === "straight" ? "key" : "paddle"} (the key type and bindings are on the{" "}
                <Link to="/morse?tab=send#real-key" className="text-primary underline decoration-1 underline-offset-2 hover:decoration-2">
                  Send tab
                </Link>
                ). The keyer runs at {wpm} wpm. Then check it against what a skimmer needs.
              </p>
            </div>
            <KeyPad
              keyType={prefs.keyType}
              keyDown={keyer.keyDown}
              bindings={{ dit: prefs.keyDit, dah: prefs.keyDah, straight: prefs.keyStraight }}
              swapPaddles={prefs.swapPaddles}
              onPress={keyer.press}
              onRelease={keyer.release}
              live={!playing}
              className="max-sm:-mx-1"
            />
            <TickerTape text={keyer.text} pending={keyer.pending} wpm={keyer.wpm} />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={check} disabled={checked || keyer.text.trim() === "" || !callOk}>
                Check my call
              </Button>
              <Button onClick={reset}>Clear and try again</Button>
            </div>
            {checked ? <p className="text-small text-ink-muted">Checked and kept. Clear and try again to start a new attempt.</p> : null}

            {grade && checks ? (
              <div className="grid gap-4" aria-live="polite" data-testid="rbn-result">
                <p className={cn("text-body font-medium", allOk ? "text-success" : "text-ink")}>
                  {allOk
                    ? "A skimmer should be able to spot that."
                    : noneOk
                      ? "Not yet: work through the points below before calling on the air."
                      : "Close: put right the points below before calling on the air."}
                </p>
                <ul className="divide-y divide-border border-y border-border">
                  {checks.map((c) => (
                    <CheckRow key={c.id} check={c} />
                  ))}
                </ul>
                <div className="rounded-panel bg-surface px-4 py-3">
                  <MarkedDiff target={message.text} decoded={decoded} />
                </div>
                <p className="tabular text-small text-ink-muted">
                  Decoded: <span className="font-mono text-ink">{normalizeMorseText(decoded) || "nothing"}</span>.{" "}
                  {Math.round(grade.copy.accuracy * 100)}% copy, {Math.round(grade.timing.score * 100)}% timing.
                </p>
                <ul className="grid list-disc gap-1 pl-5 text-body text-ink">
                  {grade.timing.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
                {tracks ? <EchoTimeline tracks={tracks} analysis={grade.timing} /> : null}
              </div>
            ) : null}
          </section>
        </div>

        <section aria-labelledby="rbn-before-heading" className="grid gap-3 max-lg:border-t max-lg:border-border max-lg:pt-6">
          <h2 id="rbn-before-heading" className="text-lead font-semibold text-ink">
            Before you call on the air
          </h2>
          <p className="text-small text-ink-muted">
            Your radio and keyer send the call. The trainer never keys a radio: it only trains you here.
          </p>
          <ol className="grid gap-3">
            {RBN_ON_AIR_CHECKLIST.map((item, index) => (
              <li key={item.title} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-1">
                <span className="tabular text-ink-muted">{index + 1}.</span>
                <div>
                  <p className="text-body font-medium text-ink">{item.title}</p>
                  <p className="text-small text-ink-muted">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <DidTheRbnHearYou />
    </div>
  );
}
