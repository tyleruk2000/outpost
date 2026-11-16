/**
 * CQ conversations: a whole contact keyed one over at a time. You key every CQ or
 * activator's over; the trainer plays the made-up station that answers (Q4RTF).
 * Three kinds: a standard CQ, a SOTA activation and a POTA activation. Each over is
 * graded against what the decoder heard; the averages are kept as one send session
 * when the contact is finished.
 */
import {
  type AdaptiveDecoder,
  buildCqConversation,
  CQ_CONVERSATION_DEFINITIONS,
  type CqConversationKind,
  farnsworthTiming,
  gradeSending,
  type SendingGrade,
  textToTimeline,
} from "@outpost/shared";
import { CheckCircle2, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getSidetone, type PlayHandle } from "../audio/sidetone";
import { SoundNotice } from "../audio/sound-notice";
import { useRecordMorseSession } from "../data";
import { useMorsePrefs } from "../prefs";
import { MarkedDiff } from "./echo-diff";

export interface CqConversationPracticeProps {
  decoder: AdaptiveDecoder;
  decodedText: string;
  clearKeyer: () => void;
  charWpm: number;
  toneHz: number;
  volume: number;
}

/** The station that answers: a Q call, which is never issued, so it is plainly made up. */
export const CQ_OTHER_CALL = "Q4RTF";
/** The practice call when the trainer has no callsign set. */
export const CQ_DEFAULT_CALL = "Q7XYZ";

const DEFAULT_REFERENCES: Record<Exclude<CqConversationKind, "standard">, string> = {
  sota: "G/LD-001",
  pota: "GB-0099",
};

const average = (grades: readonly SendingGrade[], pick: (grade: SendingGrade) => number) =>
  grades.reduce((sum, grade) => sum + pick(grade), 0) / Math.max(1, grades.length);

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Scores({ grade }: { grade: SendingGrade }) {
  return (
    <p className="tabular text-body text-ink" aria-live="polite">
      <span className="font-semibold">{pct(grade.accuracy)} accuracy</span>,{" "}
      <span className="font-semibold">{pct(grade.rhythm)} rhythm</span>, about {Math.round(grade.wpm)} wpm.
    </p>
  );
}

export function CqConversationPractice({ decoder, decodedText, clearKeyer, charWpm, toneHz, volume }: CqConversationPracticeProps) {
  const prefs = useMorsePrefs();
  const recordSession = useRecordMorseSession();
  const [kind, setKind] = useState<CqConversationKind>("standard");
  const [myCallOverride, setMyCall] = useState<string | null>(null);
  const [myName, setMyName] = useState("PAT");
  const [myQth, setMyQth] = useState("LEEDS");
  const [reference, setReference] = useState(DEFAULT_REFERENCES.sota);
  const [started, setStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [grade, setGrade] = useState<SendingGrade | null>(null);
  const [grades, setGrades] = useState<SendingGrade[]>([]);
  const [complete, setComplete] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playHandle = useRef<PlayHandle | null>(null);

  useEffect(() => () => playHandle.current?.stop(), []);

  const myCall = myCallOverride ?? (prefs.callsign.trim().toUpperCase() || CQ_DEFAULT_CALL);
  const conversation = useMemo(
    () => buildCqConversation(kind, { myCall, myName, myQth, otherCall: CQ_OTHER_CALL, reference }),
    [kind, myCall, myName, myQth, reference],
  );
  const step = conversation.stages[stepIndex] ?? conversation.stages[0]!;
  const definition = CQ_CONVERSATION_DEFINITIONS.find((item) => item.id === kind) ?? CQ_CONVERSATION_DEFINITIONS[0]!;
  const last = stepIndex === conversation.stages.length - 1;

  function stopPlayback(): void {
    playHandle.current?.stop();
    playHandle.current = null;
    setPlaying(false);
  }

  function reset(nextKind = kind): void {
    stopPlayback();
    setKind(nextKind);
    if (nextKind !== "standard") setReference(DEFAULT_REFERENCES[nextKind]);
    setStarted(false);
    setStepIndex(0);
    setGrade(null);
    setGrades([]);
    setComplete(false);
    clearKeyer();
  }

  function begin(): void {
    stopPlayback();
    setStarted(true);
    setStepIndex(0);
    setGrade(null);
    setGrades([]);
    setComplete(false);
    clearKeyer();
  }

  async function playIncoming(): Promise<void> {
    if (!step.incoming || playing) return;
    const tone = getSidetone();
    await tone.ensure();
    tone.setFrequency(toneHz);
    tone.setVolume(volume);
    playHandle.current?.stop();
    // The other station's characters at your speed, its gaps a little longer, as a friendly operator sends.
    const effectiveWpm = Math.max(6, Math.min(charWpm, Math.round(charWpm * 0.65)));
    const handle = tone.playTimeline(textToTimeline(step.incoming, farnsworthTiming(charWpm, effectiveWpm)).segments);
    playHandle.current = handle;
    setPlaying(true);
    await handle.done;
    setPlaying(false);
  }

  function nextStage(): void {
    if (!grade) return;
    const nextGrades = [...grades, grade];
    setGrades(nextGrades);
    setGrade(null);
    clearKeyer();
    if (last) {
      setComplete(true);
      recordSession.mutate({
        kind: "send",
        accuracy: average(nextGrades, (g) => g.accuracy),
        rhythm: average(nextGrades, (g) => g.rhythm),
        charWpm: Math.min(
          100,
          Math.max(
            1,
            average(nextGrades, (g) => g.wpm),
          ),
        ),
      });
    } else {
      setStepIndex((current) => current + 1);
    }
  }

  if (!started) {
    return (
      <div className="grid gap-5">
        <div>
          <h3 className="text-lead font-semibold text-ink">CQ conversation</h3>
          <p className="mt-1 max-w-[65ch] text-body text-ink-muted">
            Learn the rhythm of a whole contact, one over at a time. You key every over of the station calling CQ or activating; the trainer
            plays the station answering you.
          </p>
        </div>

        {/* biome-ignore lint/a11y/useSemanticElements: a set of pressed buttons, each with a line of description */}
        <div role="group" aria-label="CQ conversation type" className="grid gap-2 sm:grid-cols-3">
          {CQ_CONVERSATION_DEFINITIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={kind === item.id}
              onClick={() => reset(item.id)}
              className={cn(
                "grid gap-1 rounded-panel border px-3 py-3 text-left transition-colors",
                kind === item.id ? "border-primary bg-primary-soft" : "border-border-strong bg-page hover:bg-surface",
              )}
            >
              <span className={cn("text-body font-semibold", kind === item.id ? "text-primary-soft-ink" : "text-ink")}>{item.label}</span>
              <span className="text-small text-ink-muted">{item.description}</span>
            </button>
          ))}
        </div>

        <p className="text-small text-ink-muted">{definition.role}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Practice callsign">
            {(ids) => (
              <Input
                {...ids}
                value={myCall}
                onChange={(event) => setMyCall(event.target.value.toUpperCase())}
                autoComplete="off"
                spellCheck={false}
                className="font-mono uppercase"
              />
            )}
          </Field>
          {kind === "standard" ? (
            <>
              <Field label="Your name">
                {(ids) => (
                  <Input
                    {...ids}
                    value={myName}
                    onChange={(event) => setMyName(event.target.value.toUpperCase())}
                    autoComplete="off"
                    className="font-mono uppercase"
                  />
                )}
              </Field>
              <Field label="Your QTH">
                {(ids) => (
                  <Input
                    {...ids}
                    value={myQth}
                    onChange={(event) => setMyQth(event.target.value.toUpperCase())}
                    autoComplete="off"
                    className="font-mono uppercase"
                  />
                )}
              </Field>
            </>
          ) : (
            <Field label={definition.referenceLabel ?? "Reference"}>
              {(ids) => (
                <Input
                  {...ids}
                  value={reference}
                  onChange={(event) => setReference(event.target.value.toUpperCase())}
                  placeholder={definition.referenceExample ?? undefined}
                  autoComplete="off"
                  className="font-mono uppercase"
                />
              )}
            </Field>
          )}
        </div>
        <div>
          <Button variant="primary" onClick={begin} disabled={!myCall.trim() || (kind !== "standard" && !reference.trim())}>
            Start the {definition.shortLabel} conversation
          </Button>
        </div>
      </div>
    );
  }

  if (complete) {
    return (
      <div className="grid gap-4" aria-live="polite">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-1 size-5 shrink-0 text-success" aria-hidden />
          <div>
            <h3 className="text-lead font-semibold text-ink">{conversation.label} complete</h3>
            <p className="mt-1 text-body text-ink-muted">
              You called, exchanged the important details and handed back the frequency cleanly.
            </p>
          </div>
        </div>
        <p className="tabular text-body text-ink">
          Over the {conversation.stages.length} overs:{" "}
          <span className="font-semibold">{pct(average(grades, (g) => g.accuracy))} average accuracy</span> and{" "}
          <span className="font-semibold">{pct(average(grades, (g) => g.rhythm))} rhythm consistency</span>.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={begin}>
            Run it again
          </Button>
          <Button onClick={() => reset()}>Change conversation</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="tabular text-small text-ink-muted">
            Over {stepIndex + 1} of {conversation.stages.length}, {conversation.label}
          </p>
          <h3 className="mt-0.5 text-lead font-semibold text-ink">{step.title}</h3>
        </div>
        <Button variant="ghost" onClick={() => reset()}>
          Change setup
        </Button>
      </div>

      {step.incoming ? (
        <div className="grid gap-2 rounded-panel bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-small font-medium text-ink-muted">{CQ_OTHER_CALL} sends</span>
            <Button onClick={() => void playIncoming()} disabled={playing}>
              <Play aria-hidden /> {playing ? "Playing…" : "Hear the reply"}
            </Button>
          </div>
          <p className="break-all font-mono text-body tracking-wider text-ink">{step.incoming}</p>
          <SoundNotice />
        </div>
      ) : null}

      <div>
        <p className="text-small font-medium text-ink">Your turn: key this over</p>
        <div className="mt-1.5 rounded-panel border border-primary bg-primary-soft px-4 py-3 text-primary-soft-ink">
          {grade ? (
            <MarkedDiff target={step.target} decoded={decodedText} className="text-body tracking-wider" />
          ) : (
            <p className="break-all font-mono text-body tracking-wider">{step.target}</p>
          )}
        </div>
        <p className="mt-2 text-small text-ink-muted">{step.guidance}</p>
      </div>

      {grade ? <Scores grade={grade} /> : null}

      <div className="flex flex-wrap gap-2">
        {grade ? (
          <>
            <Button variant="primary" onClick={nextStage}>
              {last ? "Finish the conversation" : "Next over"}
            </Button>
            <Button
              onClick={() => {
                setGrade(null);
                clearKeyer();
              }}
            >
              <RotateCcw aria-hidden /> Try this over again
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => setGrade(gradeSending(step.target, decoder))} disabled={!decodedText.trim()}>
            Grade this over
          </Button>
        )}
      </div>
    </div>
  );
}
