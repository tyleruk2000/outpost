/**
 * Send: the four kinds of key (straight, iambic paddle, single lever and bug), a real
 * keyer with the radio makers' presets, and three ways to practise. Free keying is
 * decoded onto the tape as you go; Quick targets grade a word or callsign against what
 * the decoder actually heard; Echo plays a hidden group to key back by ear; CQ
 * conversations take you through a whole contact.
 *
 * On a phone the key comes first and the settings follow it, so the thing you came to
 * press is at the top.
 */
import {
  CW_ABBREVIATIONS,
  echoTiming,
  gradeSending,
  presetById,
  RADIO_PRESETS,
  randomCallsigns,
  randomWords,
  type SendingGrade,
} from "@outpost/shared";
import { ChevronRight, Eraser, Target } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Segmented, Select } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { getSidetone } from "../audio/sidetone";
import { MUTED_PHONE_HINT, SoundNotice } from "../audio/sound-notice";
import { CqConversationPractice } from "../components/cq-conversation-practice";
import { MarkedDiff } from "../components/echo-diff";
import { EchoPractice } from "../components/echo-practice";
import { Stepper } from "../components/stepper";
import { TickerTape } from "../components/ticker-tape";
import { useRecordMorseSession } from "../data";
import { MousePaddleCapture } from "../input/mouse-paddle-capture";
import { PhysicalKeyPanel } from "../input/physical-key-panel";
import { KeyBindingEditor } from "../keyer/key-binding-editor";
import { KeyPad } from "../keyer/key-pad";
import { useKeyer } from "../keyer/use-keyer";
import { applyMorsePrefs, DEFAULT_MORSE_PREFS, type KeyType, useMorsePrefs } from "../prefs";

const KEY_TYPES: { value: KeyType; label: string }[] = [
  { value: "straight", label: "Straight" },
  { value: "paddle", label: "Iambic paddle" },
  { value: "single", label: "Single lever" },
  { value: "bug", label: "Bug" },
];

/** The id of the real-key section, which On the air links to (`?tab=send#real-key`). */
export const REAL_KEY_ID = "real-key";

/** Said once under the preset: the presets are as LogBook73 recorded them, not checked against each manual here. */
export const PRESET_NOTE = "Each preset is that maker's default as LogBook73 recorded it: check it against your radio's manual.";

type TargetKind = "words" | "callsigns" | "abbrev";
type PracticeMode = "targets" | "echo" | "conversation";

const PRACTICE_MODE_HINTS: Record<PracticeMode, string> = {
  targets: "See it, key it: a word or callsign on screen to send at your own pace.",
  echo: "Hear a hidden group, key it back by ear, then compare it and get timing tips.",
  conversation: "Key your side of a whole CQ contact, one over at a time.",
};

const TARGET_OPTIONS: { value: TargetKind; label: string }[] = [
  { value: "words", label: "Common words" },
  { value: "callsigns", label: "Callsigns" },
  { value: "abbrev", label: "CW abbreviations" },
];

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function SendTab() {
  const prefs = useMorsePrefs();
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("targets");
  // In Echo the text plays at the echo timing and the keyer runs at its character speed; the keyer is locked while it plays.
  const echoMode = practiceMode === "echo";
  const echoTimingNow = useMemo(
    () => echoTiming(prefs.echoWpm, { farnsworth: prefs.echoFarnsworth, charWpm: prefs.charWpm }),
    [prefs.echoWpm, prefs.echoFarnsworth, prefs.charWpm],
  );
  const echoCharWpm = Math.round(1200 / echoTimingNow.ditMs);
  const [echoPlaying, setEchoPlaying] = useState(false);
  const live = !(echoMode && echoPlaying);
  const keyer = useKeyer(live, { wpm: echoMode ? echoCharWpm : undefined });
  const recordSession = useRecordMorseSession();
  const [target, setTarget] = useState("");
  const [targetKind, setTargetKind] = useState<TargetKind>("words");
  const [grade, setGrade] = useState<SendingGrade | null>(null);
  const preset = useMemo(() => presetById(prefs.presetId), [prefs.presetId]);

  function newTarget(): void {
    const seed = Math.floor(Math.random() * 1e9);
    const text =
      targetKind === "callsigns"
        ? randomCallsigns({ count: 2, seed })
        : targetKind === "abbrev"
          ? randomWords({ count: 4, seed, pool: CW_ABBREVIATIONS })
          : randomWords({ count: 3, seed });
    setTarget(text);
    setGrade(null);
    keyer.clear();
  }

  function gradeAttempt(): void {
    const result = gradeSending(target, keyer.decoder);
    setGrade(result);
    const misses: Record<string, number> = {};
    for (const ch of result.misses) misses[ch] = (misses[ch] ?? 0) + 1;
    recordSession.mutate({
      kind: "send",
      accuracy: result.accuracy,
      rhythm: result.rhythm,
      charWpm: Math.min(100, Math.max(1, result.wpm)),
      misses,
    });
  }

  const showKeyerControls = prefs.keyType === "paddle" || prefs.keyType === "single";
  const customBindings =
    prefs.keyDit !== DEFAULT_MORSE_PREFS.keyDit ||
    prefs.keyDah !== DEFAULT_MORSE_PREFS.keyDah ||
    prefs.keyStraight !== DEFAULT_MORSE_PREFS.keyStraight ||
    prefs.swapPaddles !== DEFAULT_MORSE_PREFS.swapPaddles;
  const deepLinked = useRef(typeof window !== "undefined" && window.location.hash === `#${REAL_KEY_ID}`);
  const [realKeyOpen, setRealKeyOpen] = useState(customBindings || deepLinked.current);
  useEffect(() => {
    if (deepLinked.current) document.getElementById(REAL_KEY_ID)?.scrollIntoView?.();
  }, []);

  return (
    // Both columns are min-w-0: a grid track's automatic minimum is its widest child, and the ticker tape never wraps.
    <div className="grid gap-8 lg:grid-cols-[18.75rem_minmax(0,1fr)] lg:gap-10">
      <div className="order-2 grid min-w-0 content-start gap-8 lg:order-1">
        <section aria-labelledby="send-key-heading" className="grid gap-5">
          <h2 id="send-key-heading" className="text-lead font-semibold text-ink">
            Key and keyer
          </h2>
          <div className="grid gap-1.5">
            <span id="send-key-type" className="text-small font-medium text-ink">
              Key type
            </span>
            <Segmented
              label="Key type"
              value={prefs.keyType}
              onChange={(keyType) => applyMorsePrefs({ keyType })}
              options={KEY_TYPES}
              className="grid w-full grid-cols-2 [&>*]:justify-center"
            />
          </div>

          {showKeyerControls ? (
            <Field
              label="Radio keyer preset"
              hint={
                <>
                  {preset?.blurb ? <span className="block">{preset.blurb}.</span> : null}
                  <span className="block">{PRESET_NOTE}</span>
                </>
              }
            >
              {(ids) => (
                <Select
                  {...ids}
                  value={prefs.presetId}
                  options={RADIO_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
                  onChange={(presetId) => applyMorsePrefs({ presetId })}
                />
              )}
            </Field>
          ) : null}

          {prefs.keyType !== "straight" && !echoMode ? (
            <Stepper
              label="Keyer speed"
              value={prefs.keyerWpm}
              min={8}
              max={40}
              unit="wpm"
              onChange={(keyerWpm) => applyMorsePrefs({ keyerWpm })}
            />
          ) : null}
          {prefs.keyType !== "straight" && echoMode ? (
            <p className="text-small text-ink-muted">In Echo the keyer runs at the played character speed ({echoCharWpm} wpm).</p>
          ) : null}
          <Stepper
            label="Tone"
            value={prefs.toneHz}
            min={400}
            max={900}
            step={25}
            unit="Hz"
            onChange={(toneHz) => {
              applyMorsePrefs({ toneHz });
              getSidetone().setFrequency(toneHz);
            }}
          />
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
            hint="The tone's level here, apart from the device's own volume."
          />
          <p className="text-small text-ink-muted">{MUTED_PHONE_HINT}</p>
        </section>

        {/* The hardware set-up folds away: a beginner with no key needs only what is above. It opens by itself for
            bindings of one's own or a #real-key link, and stays mounted while closed so a connected key keeps working. */}
        <section id={REAL_KEY_ID} className="scroll-mt-20 border-t border-border pt-5">
          <h2 className="text-lead font-semibold text-ink">
            <button
              type="button"
              aria-expanded={realKeyOpen}
              aria-controls={`${REAL_KEY_ID}-panel`}
              onClick={() => setRealKeyOpen(!realKeyOpen)}
              className="-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center gap-1.5 rounded-control px-1 text-left hover:text-primary"
            >
              <ChevronRight
                className={cn(
                  "size-4 shrink-0 text-ink-muted transition-transform motion-reduce:transition-none",
                  realKeyOpen && "rotate-90",
                )}
                aria-hidden
              />
              Use a real key or paddle
            </button>
          </h2>
          {!realKeyOpen ? (
            <p className="mt-1 text-small text-ink-muted">Key bindings, a mouse paddle, or a key on USB serial or a game controller.</p>
          ) : null}
          <div id={`${REAL_KEY_ID}-panel`} hidden={!realKeyOpen} className="mt-3 grid gap-6">
            <section className="grid gap-3">
              <h3 className="text-body font-semibold text-ink">Key bindings</h3>
              <KeyBindingEditor keyType={prefs.keyType} />
            </section>
            <section className="grid gap-3 border-t border-border pt-4">
              <h3 className="text-body font-semibold text-ink">Physical key or paddle</h3>
              <MousePaddleCapture
                // Closing the section turns the mouse paddle off: a capture that kept the page's clicks out of sight would surprise.
                enabled={realKeyOpen}
                keyType={prefs.keyType}
                swapPaddles={prefs.swapPaddles}
                onPress={keyer.press}
                onRelease={keyer.release}
              />
              <div className="border-t border-border pt-3">
                <PhysicalKeyPanel keyType={prefs.keyType} onPress={keyer.press} onRelease={keyer.release} />
              </div>
            </section>
          </div>
        </section>
      </div>

      <div className="order-1 grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5 lg:order-2">
        <KeyPad
          keyType={prefs.keyType}
          keyDown={keyer.keyDown}
          bindings={{ dit: prefs.keyDit, dah: prefs.keyDah, straight: prefs.keyStraight }}
          swapPaddles={prefs.swapPaddles}
          onPress={keyer.press}
          onRelease={keyer.release}
          live={live}
          className="max-sm:-mx-1"
        />
        <SoundNotice />

        <div className="flex items-start gap-2">
          <TickerTape text={keyer.text} pending={keyer.pending} wpm={keyer.wpm} className="min-w-0 flex-1" />
          <Button
            variant="ghost"
            className="mt-1.5"
            onClick={keyer.clear}
            disabled={keyer.text === "" && keyer.pending === ""}
            aria-label="Clear decoded text"
          >
            <Eraser aria-hidden /> <span className="max-sm:sr-only">Clear</span>
          </Button>
        </div>

        <section aria-labelledby="send-practice-heading" className="grid gap-5 border-t border-border pt-5">
          <div className="grid gap-2">
            <h2 id="send-practice-heading" className="text-lead font-semibold text-ink">
              Practise
            </h2>
            <Segmented
              label="Send practice mode"
              value={practiceMode}
              onChange={(mode) => {
                setPracticeMode(mode);
                setGrade(null);
                keyer.clear();
              }}
              options={[
                { value: "targets", label: "Quick targets" },
                { value: "echo", label: "Echo" },
                { value: "conversation", label: "CQ conversations" },
              ]}
            />
            <p className="text-small text-ink-muted">{PRACTICE_MODE_HINTS[practiceMode]}</p>
          </div>

          {practiceMode === "echo" ? (
            <EchoPractice
              keyer={keyer}
              timing={echoTimingNow}
              keyerTimed={prefs.keyType === "paddle" || prefs.keyType === "single"}
              onPlayingChange={setEchoPlaying}
            />
          ) : practiceMode === "targets" ? (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Practice target" className="w-full sm:w-52">
                  {(ids) => <Select {...ids} value={targetKind} options={TARGET_OPTIONS} onChange={setTargetKind} />}
                </Field>
                <Button onClick={newTarget}>
                  <Target aria-hidden /> New target
                </Button>
                {target ? (
                  <Button variant="primary" onClick={gradeAttempt} disabled={keyer.text.trim() === ""}>
                    Grade my sending
                  </Button>
                ) : null}
              </div>

              {target ? (
                <div className="rounded-panel bg-surface px-4 py-3" data-testid="send-target">
                  {grade ? (
                    <MarkedDiff target={target} decoded={keyer.text} />
                  ) : (
                    <p className="break-all font-mono text-lead tracking-widest text-ink">{target.toUpperCase()}</p>
                  )}
                </div>
              ) : (
                <p className="text-small text-ink-muted">
                  Key freely onto the tape above, or take a target and send it: the decoder grades what it actually hears.
                </p>
              )}

              {grade ? (
                <p className="tabular text-body text-ink" aria-live="polite">
                  <span className={cn("font-semibold", grade.accuracy >= 0.9 && "text-success")}>{pct(grade.accuracy)} copy accuracy</span>,{" "}
                  <span className="font-semibold">{pct(grade.rhythm)} rhythm consistency</span>, your speed about {Math.round(grade.wpm)}{" "}
                  wpm.
                </p>
              ) : null}
            </div>
          ) : (
            <CqConversationPractice
              decoder={keyer.decoder}
              decodedText={keyer.text}
              clearKeyer={keyer.clear}
              charWpm={prefs.keyerWpm}
              toneHz={prefs.toneHz}
              volume={prefs.volume}
            />
          )}
        </section>
      </div>
    </div>
  );
}
