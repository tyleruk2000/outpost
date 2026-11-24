/**
 * Recording a track, as it appears on the Maps screen: the Record button in the map's
 * column of tools, and the card over the map that goes with it.
 *
 * The card is one thing in several states, in the order a walk goes through them: what
 * to know before starting; the recording as it runs; the recording once stopped,
 * waiting for a name; and any recordings that are named and waiting for Outpost to be
 * back in reach. A recording left unfinished by an earlier visit is offered in the same
 * place. The workings are in `recorder.ts`; this file only shows them and passes on
 * what is pressed.
 */
import { MAX_RECORDING_POINTS, type MarkerColor, type TrackDto } from "@outpost/shared";
import { ChevronDown, ChevronUp, CircleAlert, Download, Pause, Play, Square, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Disclosure, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { formatTimeOfDay } from "@/lib/clock";
import { notify } from "@/lib/notify";
import { usePageVisible } from "@/lib/page-visible";
import { cn, formatDate, formatNumber, plural } from "@/lib/utils";
import { formatDistance, formatDistanceWithMiles, formatHeight } from "../lib/geo";
import type { MapEngine } from "../map/engine";
import type { MapTool } from "../map-chrome";
import { ColorPicker, ControlButton, ControlGroup, Fact, mapCard, mapCardFoot, mapCardHeader } from "../ui";
import { useRecorder } from "./browser";
import { recordingData } from "./overlay";
import type { PendingSave, Recorder, RecorderSnapshot } from "./recorder";
import type { Interruption } from "./store";
import { formatDuration, formatSpan, MAX_ACCURACY_METERS, type Totals } from "./track-log";

// ── What is open on screen. Shared by the button and the card, which sit in different places. ──

/** "closed": no card unless something needs one. "intro": what to know before starting. "open" and "folded": the card, whole or as one line. */
type CardView = "closed" | "intro" | "open" | "folded";

let cardView: CardView = "closed";
const viewListeners = new Set<() => void>();
function setCardView(next: CardView): void {
  cardView = next;
  for (const listener of viewListeners) listener();
}
const subscribeView = (listener: () => void) => {
  viewListeners.add(listener);
  return () => viewListeners.delete(listener);
};
const useCardView = () => useSyncExternalStore(subscribeView, () => cardView);

/**
 * Folds the recording's card to its one line, if it is open: on a phone, when another card comes up
 * over the map, the two would otherwise share the half of it that cards have. It unfolds as before.
 */
export function foldRecordingCard(): void {
  if (cardView === "open") setCardView("folded");
}

const timeOfDay = (time: number) => formatTimeOfDay(time);

/** The time, ticking once a second while something on screen is counting and the page is in sight. */
export function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  const visible = usePageVisible();
  useEffect(() => {
    if (!ticking || !visible) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking, visible]);
  return now;
}

/**
 * How often the line on the map follows a recording while fixes arrive. Each redraw of the
 * map costs frames and processor time, and a fix a second redrawn at once kept a phone
 * busy for nothing anyone looks at that closely; every fix is still kept as it arrives.
 */
export const REDRAW_EVERY_MS = 5_000;

/**
 * `value`, handed on at most once every `ms`: a change after a quiet spell at once, later
 * ones together at the end of the wait. When `now` changes (the recording is paused or
 * stopped, the page is shown) the latest value is handed on straight away.
 */
export function useAtMostEvery<T>(value: T, ms: number, now: unknown): T {
  const [handed, setHanded] = useState(value);
  const last = useRef(0);
  const latest = useRef(value);
  latest.current = value;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a change of `now` is what asks for the latest value
  useEffect(() => {
    last.current = Date.now();
    setHanded(latest.current);
  }, [now]);
  useEffect(() => {
    if (Object.is(value, handed)) return;
    const hand = () => {
      last.current = Date.now();
      setHanded(latest.current);
    };
    const wait = last.current + ms - Date.now();
    if (wait <= 0) {
      hand();
      return;
    }
    const timer = window.setTimeout(hand, wait);
    return () => window.clearTimeout(timer);
  }, [value, handed, ms]);
  return handed;
}

/** A ring with a dot in it: "record". The dot is the lamp while a recording is live. */
function RecordGlyph({ live }: { live: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" fill={live ? "var(--lamp)" : "currentColor"} stroke={live ? "var(--lamp)" : "currentColor"} />
    </svg>
  );
}

/** The small square lamp, as at the foot of the sidebar: steady, not blinking. */
function LampDot({ lit }: { lit: boolean }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-[2px]", lit ? "bg-lamp" : "bg-ink-faint")} />;
}

const PHASE_WORDS = { recording: "Recording", paused: "Paused", stopped: "Recording stopped" } as const;

/**
 * The Record button, for the map's column of tools. It opens what to know before
 * starting; while there is a recording it shows that there is one, and folds or
 * unfolds its card.
 */
export function RecordButton() {
  const tool = useRecordTool();
  if (!tool) return null;
  return (
    <ControlGroup>
      <ControlButton label={tool.label} pressed={tool.pressed} onClick={tool.onPress}>
        {tool.icon}
      </ControlButton>
    </ControlGroup>
  );
}

/** The same button as an entry in the list the map's controls are drawn from (`mapTools`), so the phone's menu has it too. */
export function useRecordTool(): MapTool | null {
  const { recorder, state } = useRecorder();
  const view = useCardView();
  // A browser with no geolocation at all has nothing to record with, as it has nothing to locate with.
  if (recorder.ability() === "unsupported") return null;
  const active = state.phase !== "idle";
  return {
    id: "record",
    group: "record",
    label: active
      ? `${PHASE_WORDS[state.phase as keyof typeof PHASE_WORDS]}: ${view === "folded" ? "show the figures" : "show less"}`
      : view === "intro"
        ? "Record a track: close"
        : "Record a track",
    icon: <RecordGlyph live={state.phase === "recording"} />,
    pressed: active || view === "intro",
    onPress: () => {
      if (active) setCardView(view === "folded" ? "open" : "folded");
      else setCardView(view === "intro" ? "closed" : "intro");
    },
  };
}

// ── Words ──

/** "0:42:10 since the first point, 0:38:02 of it moving" and what was climbed. */
function figures(totals: Totals, until: number): { elapsed: string; moving: string; climb: string } {
  const elapsed = totals.firstTime === null ? 0 : Math.max(0, until - totals.firstTime);
  return {
    elapsed: formatDuration(elapsed),
    moving: formatDuration(totals.movingMs),
    climb: totals.ascentMeters === null ? "no heights from this device" : `${formatHeight(totals.ascentMeters)} climbed`,
  };
}

/** What the device last said about where it is, in a sentence. */
function positionWords(state: RecorderSnapshot, now: number): { text: string; trouble: boolean } {
  if (state.problem === "unavailable") {
    return { text: "This device cannot find where it is just now. Recording carries on as soon as it can.", trouble: true };
  }
  if (!state.lastFix)
    return { text: "Waiting for a first position. Outdoors, with the sky in view, that usually takes under a minute.", trouble: false };
  const quiet = now - state.lastFix.at;
  if (state.lastFix.refusal === "inaccurate") {
    return {
      text: `The position is only good to ${formatDistance(state.lastFix.accuracy)}, so it is not being recorded. It needs ${MAX_ACCURACY_METERS} m or better.`,
      trouble: true,
    };
  }
  if (quiet > 30_000) return { text: `No position has arrived for ${formatSpan(quiet)}.`, trouble: false };
  return { text: `Position good to ${formatDistance(Math.max(1, state.lastFix.accuracy))}.`, trouble: false };
}

const SCREEN_OFF = "If it locks, recording stops until it is unlocked.";

function screenWords(state: RecorderSnapshot): { text: string; trouble: boolean; canAsk: boolean } {
  if (state.wake === "held") return { text: "The screen is asked to stay on. Keep Outpost in front.", trouble: false, canAsk: false };
  if (state.wake === "unsupported") return { text: `This browser cannot keep the screen on. ${SCREEN_OFF}`, trouble: true, canAsk: false };
  if (state.wake === "refused") return { text: `The browser would not keep the screen on. ${SCREEN_OFF}`, trouble: true, canAsk: true };
  return { text: `The browser has stopped keeping the screen on. ${SCREEN_OFF}`, trouble: true, canAsk: true };
}

function interruptionWords(interruptions: Interruption[]): string | null {
  if (interruptions.length === 0) return null;
  const total = interruptions.reduce((sum, gap) => sum + (gap.to - gap.from), 0);
  const last = interruptions.at(-1) as Interruption;
  if (interruptions.length === 1) {
    return `Not recorded: ${formatSpan(total)}, from ${timeOfDay(last.from)} to ${timeOfDay(last.to)}, while this page was closed or out of sight.`;
  }
  return `Not recorded: ${interruptions.length} gaps, ${formatSpan(total)} in all, while this page was closed or out of sight. The last was from ${timeOfDay(last.from)} to ${timeOfDay(last.to)}.`;
}

const PROBLEM_WORDS = {
  denied:
    "Outpost was not allowed to use this device's location. Allow it in the browser's settings for this site, then resume. What was recorded before is kept.",
  storage:
    "This device would not keep the last position: its storage may be full. Everything recorded before that is safe. Stop and save it.",
  full: `This recording has ${formatNumber(MAX_RECORDING_POINTS)} points, the most one track can hold, so it has been stopped. Save it, then start another.`,
} as const;

/** What to tell someone before they rely on a recording, as this browser will actually behave. */
export function beforeYouStart(wakeLock: boolean, fromHomeScreen: boolean): string[] {
  return [
    "A recording runs only while this screen is on and Outpost is in front. No browser gives a web page positions with the screen locked, or with another app or tab in front.",
    wakeLock
      ? `Outpost asks the browser to keep the screen on. It can refuse (battery saver does this), and the lock button still locks the phone.${
          fromHomeScreen
            ? " Opened from a Home Screen icon on an iPhone or iPad older than iOS 18.4, the screen is not kept on at all; open Outpost in Safari instead."
            : ""
        }`
      : "This browser cannot keep the screen on. Set the screen not to lock for the length of the walk, or recording stops when it does.",
    "Points are kept on this device as they arrive, and saved to Outpost when you stop. If Outpost is out of reach then, the track waits here until it is back.",
  ];
}

// ── The card ──

// The shell every card over the map has: where it sits and how tall it may be are settled in one place for all of them.
const cardShell = mapCard;

function CardHeader({ title, lamp, action }: { title: ReactNode; lamp?: boolean; action?: ReactNode }) {
  return (
    <div className={mapCardHeader}>
      <h2 className="flex min-w-0 items-center gap-2.5 text-body font-semibold text-ink">
        {lamp === undefined ? null : <LampDot lit={lamp} />}
        {title}
      </h2>
      {action}
    </div>
  );
}

const headerButton = "-mt-1 -mr-1.5 max-w-none";

function Intro({ recorder, state }: { recorder: Recorder; state: RecorderSnapshot }) {
  const [starting, setStarting] = useState(false);
  const able = recorder.ability();
  const lines = beforeYouStart("wakeLock" in navigator, (navigator as { standalone?: boolean }).standalone === true);
  // The first sentence is the one thing to know before starting; the reason for it folds away with the rest.
  const [first = "", why = ""] = (lines[0] ?? "").split(/(?<=\.) /, 2);
  const close = (
    <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setCardView("closed")} className={headerButton}>
      <X />
    </Button>
  );
  const start = async () => {
    setStarting(true);
    const outcome = await recorder.start();
    setStarting(false);
    if (outcome === "started") setCardView("open");
  };
  return (
    // Escape in the card closes it, as it puts down a tool's card; nothing is recording yet, so nothing is lost.
    <section
      className={cardShell}
      aria-label="Record a track"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        setCardView("closed");
      }}
    >
      <CardHeader title="Record a track" action={close} />
      {able === "insecure" ? (
        <p className="mt-1 text-small text-ink">
          Browsers share a device's location only with pages opened over HTTPS, or on the computer Outpost runs on. This page was opened
          over plain HTTP, so it cannot record. How to set that up is under{" "}
          <Link to="/settings#https" className="text-primary underline decoration-1 underline-offset-2 hover:decoration-2">
            Settings → HTTPS on your network
          </Link>
          .
        </p>
      ) : able === "storage" ? (
        <p className="mt-1 text-small text-ink">
          This browser keeps nothing on the device for this page (a private window does this), so a recording could not survive a reload.
          Open Outpost in an ordinary window to record.
        </p>
      ) : (
        <>
          {state.elsewhere ? (
            <Notice tone="warning" icon={<CircleAlert />} className="mt-2">
              A recording is open in another tab of this browser. Carry on with it there, or close that tab and start again here.
            </Notice>
          ) : null}
          {/* Start first: the card is short on a phone, and what it says before starting is read once. The one thing
              to know stays in sight; the rest folds away under it. */}
          <div className="mt-1.5">
            <Button variant="primary" onClick={start} loading={starting} disabled={!state.ready}>
              Start recording
            </Button>
          </div>
          <p className="mt-2 text-small text-ink">{first}</p>
          <Disclosure summary="Why, and where the points are kept">
            {[why, ...lines.slice(1)].map((line) => (
              <p key={line} className="text-ink-muted">
                {line}
              </p>
            ))}
          </Disclosure>
        </>
      )}
    </section>
  );
}

function Unfinished({
  recorder,
  unfinished,
  onDiscard,
}: {
  recorder: Recorder;
  unfinished: NonNullable<RecorderSnapshot["unfinished"]>;
  onDiscard: () => void;
}) {
  const [busy, setBusy] = useState<"continue" | "finish" | null>(null);
  const { totals } = unfinished;
  return (
    <section className={cardShell} aria-label="An unfinished recording">
      <CardHeader title="An unfinished recording" lamp={false} />
      <p className="tabular mt-1 text-small text-ink">
        Started {formatDate(unfinished.startedAt)} at {timeOfDay(unfinished.startedAt)}. {formatDistance(totals.distanceMeters)} in{" "}
        {plural(totals.points, "point")}
        {totals.lastTime === null ? "" : `, the last at ${timeOfDay(totals.lastTime)}`}.
      </p>
      <p className="mt-1 text-small text-ink-muted">It is kept on this device. Nothing has been recorded since that last point.</p>
      <div className={cn(mapCardFoot, "mt-3")}>
        <Button
          variant="primary"
          loading={busy === "continue"}
          disabled={busy !== null}
          onClick={async () => {
            setBusy("continue");
            const outcome = await recorder.continueUnfinished();
            setBusy(null);
            if (outcome === "started") setCardView("open");
            else if (outcome === "insecure")
              notify.error("This page was opened over plain HTTP, so it cannot record. The recording can still be saved.");
            else if (outcome === "elsewhere") notify.error("A recording is open in another tab of this browser.");
          }}
        >
          Continue
        </Button>
        <Button
          loading={busy === "finish"}
          disabled={busy !== null}
          onClick={async () => {
            setBusy("finish");
            await recorder.finishUnfinished();
            setBusy(null);
            setCardView("open");
          }}
        >
          Save what there is
        </Button>
        <Button variant="danger-ghost" disabled={busy !== null} onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </section>
  );
}

function Running({ recorder, state, folded }: { recorder: Recorder; state: RecorderSnapshot; folded: boolean }) {
  const recording = state.phase === "recording";
  const now = useNow(true);
  const { elapsed, moving, climb } = figures(state.totals, now);
  const distance = state.totals.points < 2 ? "0 m" : formatDistanceWithMiles(state.totals.distanceMeters);
  const position = positionWords(state, now);
  const screen = screenWords(state);
  const gaps = interruptionWords(state.interruptions);
  const problem = state.problem && state.problem !== "unavailable" ? PROBLEM_WORDS[state.problem] : null;
  const title = PHASE_WORDS[recording ? "recording" : "paused"];
  // Folded to one line, the card still has to say when something is wrong.
  const trouble = problem ?? (recording ? (screen.trouble ? screen.text : position.trouble ? position.text : null) : null);
  const fold = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={folded ? "Show the figures" : "Show less"}
      aria-expanded={!folded}
      onClick={() => setCardView(folded ? "open" : "folded")}
      className={headerButton}
    >
      {folded ? <ChevronUp /> : <ChevronDown />}
    </Button>
  );
  const pauseOrResume = recording ? (
    <Button
      size={folded ? "icon" : "md"}
      aria-label={folded ? "Pause" : undefined}
      title={folded ? "Pause" : undefined}
      onClick={() => void recorder.pause()}
    >
      <Pause /> {folded ? null : "Pause"}
    </Button>
  ) : (
    <Button
      size={folded ? "icon" : "md"}
      variant="primary"
      aria-label={folded ? "Resume" : undefined}
      title={folded ? "Resume" : undefined}
      disabled={state.problem === "storage"}
      onClick={() => void recorder.resume()}
    >
      <Play /> {folded ? null : "Resume"}
    </Button>
  );
  const stop = (
    <Button
      size={folded ? "icon" : "md"}
      aria-label={folded ? "Stop" : undefined}
      title={folded ? "Stop" : undefined}
      onClick={() => void recorder.stop()}
    >
      <Square /> {folded ? null : "Stop"}
    </Button>
  );

  if (folded) {
    return (
      // One line where it fits. On a narrow phone, or with larger text, the buttons go under the words rather than the words being cut short.
      <section className={cn(cardShell, "flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1 py-2")} aria-label={title}>
        <LampDot lit={recording} />
        <p className="tabular min-w-[9rem] flex-1 text-small text-ink">
          <span className="font-semibold">{title}</span>
          <span className="text-ink-muted">
            {" "}
            {state.totals.points < 2 ? "0 m" : formatDistance(state.totals.distanceMeters)}, {elapsed}
          </span>
        </p>
        {trouble ? (
          <span className="shrink-0 text-warning" title={trouble}>
            <CircleAlert aria-hidden className="size-4" />
            <span className="sr-only">{trouble}</span>
          </span>
        ) : null}
        {pauseOrResume}
        {stop}
        <Button variant="ghost" size="icon-sm" aria-label="Show the figures" aria-expanded={false} onClick={() => setCardView("open")}>
          <ChevronUp />
        </Button>
      </section>
    );
  }

  return (
    <section className={cardShell} aria-label={title}>
      <CardHeader title={title} lamp={recording} action={fold} />
      <p className="tabular mt-1 text-lead font-semibold text-ink">{distance}</p>
      <p className="tabular text-small text-ink-muted">
        {state.totals.firstTime === null ? "Nothing recorded yet" : `${elapsed} since the first point, ${moving} of it moving, ${climb}`}
      </p>
      {problem ? (
        <Notice tone="warning" icon={<CircleAlert />} className="mt-2.5">
          {problem}
        </Notice>
      ) : recording ? (
        <div className="mt-2 grid gap-1 text-small">
          <p className={position.trouble ? "text-warning" : "text-ink-muted"}>{position.text}</p>
          {/* Said aloud when it changes, which is seldom; the position line changes with every fix and is not. */}
          <p className={screen.trouble ? "text-warning" : "text-ink-muted"} aria-live="polite">
            {screen.text}
          </p>
          {screen.canAsk ? (
            <Button size="sm" className="mt-0.5 justify-self-start" onClick={() => void recorder.keepAwake()}>
              Ask the browser again
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-small text-ink-muted">Nothing is being recorded while paused. Resuming starts a new stretch of the line.</p>
      )}
      {gaps ? <p className="tabular mt-1 text-small text-ink-muted">{gaps}</p> : null}
      <div className={cn(mapCardFoot, "mt-3 max-md:mt-1")}>
        {pauseOrResume}
        {stop}
      </div>
    </section>
  );
}

function Stopped({
  state,
  recorder,
  onName,
  onDiscard,
}: {
  state: RecorderSnapshot;
  recorder: Recorder;
  onName: () => void;
  onDiscard: () => void;
}) {
  const { totals } = state;
  const savable = totals.points >= 2 && totals.distanceMeters > 0;
  const full = state.problem === "full";
  return (
    <section className={cardShell} aria-label="Recording stopped">
      <CardHeader title="Recording stopped" lamp={false} />
      {full ? (
        <Notice tone="warning" icon={<CircleAlert />} className="mt-2">
          {PROBLEM_WORDS.full}
        </Notice>
      ) : null}
      <p className="tabular mt-1 text-small text-ink">
        {savable
          ? `${formatDistanceWithMiles(totals.distanceMeters)} in ${plural(totals.points, "point")}. It is on this device, and not yet saved to Outpost.`
          : "Fewer than two positions were recorded, so there is no line to save."}
      </p>
      <div className={cn(mapCardFoot, "mt-3")}>
        {savable ? (
          <Button variant="primary" onClick={onName}>
            Name and save
          </Button>
        ) : null}
        {full ? null : <Button onClick={() => void recorder.carryOn()}>Carry on</Button>}
        <Button variant="danger-ghost" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </section>
  );
}

/** Hands the browser a file to save. */
function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/gpx+xml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Waiting({
  recorder,
  pending,
  onDiscard,
}: {
  recorder: Recorder;
  pending: PendingSave[];
  onDiscard: (entry: PendingSave) => void;
}) {
  const [trying, setTrying] = useState(false);
  const waiting = pending.some((entry) => entry.state !== "refused");
  const refused = pending.some((entry) => entry.state === "refused");
  // One line while it is only a matter of waiting; opened by itself when Outpost has refused something, which needs a decision.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? refused;
  const tryNow = waiting ? (
    <Button
      size="sm"
      loading={trying}
      onClick={async () => {
        setTrying(true);
        await recorder.retryNow();
        setTrying(false);
      }}
    >
      Try now
    </Button>
  ) : null;
  const fold = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={open ? "Show less" : "Show the recordings that are waiting"}
      aria-expanded={open}
      onClick={() => setChosen(!open)}
      className={open ? headerButton : undefined}
    >
      {open ? <ChevronDown /> : <ChevronUp />}
    </Button>
  );
  const title =
    pending.length === 1
      ? waiting
        ? "A recording is waiting to be saved"
        : "A recording was not saved"
      : `${pending.length} recordings are waiting to be saved`;
  if (!open) {
    return (
      <section className={cn(cardShell, "flex items-center gap-2.5 py-2")} aria-label="Recordings waiting to be saved">
        <p className="min-w-0 flex-1 text-small font-semibold text-ink">{title}</p>
        {tryNow}
        {fold}
      </section>
    );
  }
  return (
    <section className={cardShell} aria-label="Recordings waiting to be saved">
      <CardHeader title={title} action={fold} />
      <ul className="mt-1.5 divide-y divide-border">
        {pending.map((entry) => (
          <li key={entry.id} className="py-2 first:pt-0.5">
            <p className="truncate text-small font-medium text-ink">{entry.name}</p>
            <p className="tabular text-small text-ink-muted">
              {formatDistance(entry.totals.distanceMeters)}, recorded {formatDate(entry.startedAt)}
            </p>
            <p className={cn("mt-0.5 text-small", entry.state === "refused" ? "text-danger" : "text-ink-muted")} aria-live="polite">
              {entry.state === "sending"
                ? "Sending it to Outpost."
                : entry.state === "refused"
                  ? `Outpost would not take it. ${entry.message ?? ""} It is still on this device.`
                  : "Outpost is out of reach. It is kept on this device and will be sent when Outpost is back."}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {entry.state === "refused" ? (
                <Button size="sm" onClick={() => void recorder.retryRefused(entry.id)}>
                  Send again
                </Button>
              ) : null}
              <Button
                size="sm"
                onClick={async () => {
                  const file = await recorder.gpxFile(entry.id, entry.name);
                  if (file) download(file.filename, file.gpx);
                  else notify.error("The recording could not be read from this device.");
                }}
              >
                <Download /> Download GPX
              </Button>
              <Button size="sm" variant="danger-ghost" disabled={entry.state === "sending"} onClick={() => onDiscard(entry)}>
                Discard
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {tryNow ? <div className="mt-1 border-t border-border pt-2.5">{tryNow}</div> : null}
    </section>
  );
}

function SaveDialog({
  open,
  onOpenChange,
  state,
  recorder,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: RecorderSnapshot;
  recorder: Recorder;
  onSaved: (track: TrackDto) => void;
}) {
  const { totals } = state;
  const [name, setName] = useState("");
  const [color, setColor] = useState<MarkerColor>("teal");
  const [saving, setSaving] = useState(false);
  const started = totals.firstTime;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a name is suggested each time the dialog opens, not while it is being typed
  useEffect(() => {
    if (open) setName(started === null ? "" : `Recorded ${formatDate(started)}`);
  }, [open]);
  const { elapsed, moving } = figures(totals, totals.lastTime ?? 0);

  const save = async () => {
    const chosen = name.trim();
    if (!chosen) return;
    setSaving(true);
    const outcome = await recorder.save(chosen, color);
    setSaving(false);
    onOpenChange(false);
    if (outcome.state === "saved") onSaved(outcome.track);
    else if (outcome.state === "waiting") {
      toast(`Outpost is out of reach. “${chosen}” is kept on this device and will be saved when Outpost is back.`, { duration: 10_000 });
    } else notify.error(`Outpost would not take “${chosen}”. ${outcome.message} It is still on this device.`, { duration: 10_000 });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent
        title="Save the recording"
        description="It becomes a route like any other: drawn on the map, found by search, and exported as GPX with the time of every point."
        size="sm"
      >
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <DialogBody className="grid gap-4">
            <Field label="Name">
              {(ids) => (
                <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required autoFocus />
              )}
            </Field>
            <div className="grid gap-1.5">
              <span className="text-small font-medium text-ink">Colour on the map</span>
              <ColorPicker label="Colour on the map" value={color} onChange={setColor} />
            </div>
            <dl>
              <Fact label="Distance">{formatDistanceWithMiles(totals.distanceMeters)}</Fact>
              <Fact label="Time, first point to last">{elapsed}</Fact>
              <Fact label="Moving">{moving}</Fact>
              <Fact label="Climb">{totals.ascentMeters === null ? "No heights from this device" : formatHeight(totals.ascentMeters)}</Fact>
            </dl>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!name.trim()}>
              Save to routes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** How much of the bottom of the map the recording's cards stand over. */
const coveredBy = (cards: HTMLElement | null) => (cards ? cards.offsetHeight + 8 : 0);

type Discarding =
  | { what: "in-hand"; points: number; distance: number }
  | { what: "unfinished"; points: number; distance: number }
  | { what: "waiting"; entry: PendingSave };

/**
 * The recording card and its dialogs, mounted over the map, and the recording drawn on
 * the map itself. `onShowTrack` opens a track that has just been saved.
 */
export function TrackRecording({ engine, onShowTrack }: { engine: MapEngine | null; onShowTrack: (track: TrackDto) => void }) {
  const { recorder, state } = useRecorder();
  const view = useCardView();
  const [naming, setNaming] = useState(false);
  const [discarding, setDiscarding] = useState<Discarding | null>(null);
  // What the question was about, kept so its words do not change while the dialog closes.
  const lastDiscarding = useRef(discarding);
  if (discarding) lastDiscarding.current = discarding;

  useEffect(() => {
    void recorder.init();
  }, [recorder]);

  // The line so far, and where it ends while it is live: redrawn at most every few seconds
  // while recording, and at once on a pause or a stop. Out of sight nothing is drawn, so the
  // line is handed to the map when the page is shown again.
  const visible = usePageVisible();
  const recording = state.phase === "recording";
  const drawn = useAtMostEvery(state, recording ? REDRAW_EVERY_MS : 0, `${state.phase}|${visible}`);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `drawn` says when to draw; what is drawn is the recorder's latest
  useEffect(() => {
    if (!engine || !visible) return;
    const latest = recorder.getSnapshot();
    engine.setOverlay("o-recording", recordingData(recorder.displayLines(), latest.phase === "recording" ? latest.position : null));
  }, [engine, recorder, visible, drawn]);

  // The first position after starting or resuming brings the map to where the walker is.
  const shown = useRef(false);
  const wasInView = useRef(false);
  // These cards stand over the bottom of the map; the walker has to be shown in what is left above them.
  const cards = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.phase !== "recording") {
      shown.current = false;
      return;
    }
    if (!engine || !state.position) return;
    if (!shown.current) {
      shown.current = true;
      wasInView.current = true;
      engine.flyTo(state.position, Math.max(engine.getZoom(), 15), coveredBy(cards.current));
      return;
    }
    // After that the map follows only when the walker walks off the edge of it. If the
    // map has been moved to look at somewhere else, it is left where it was put.
    const inView = engine.isInView(state.position, coveredBy(cards.current));
    if (!inView && wasInView.current) engine.panTo(state.position, coveredBy(cards.current));
    wasInView.current = inView || wasInView.current;
  }, [engine, state.phase, state.position]);

  // Moving the map by hand so that the walker is out of view ends the following, until they are back in view.
  useEffect(() => {
    if (!engine) return;
    return engine.on("moveend", () => {
      const position = recorder.getSnapshot().position;
      if (position && recorder.getSnapshot().phase === "recording") wasInView.current = engine.isInView(position, coveredBy(cards.current));
    });
  }, [engine, recorder]);

  // Stopping leads straight to the name, when there is something to name.
  const phase = state.phase;
  const savable = state.totals.points >= 2 && state.totals.distanceMeters > 0;
  const wasPhase = useRef(phase);
  useEffect(() => {
    if (phase === "stopped" && wasPhase.current !== "stopped" && savable) setNaming(true);
    if (phase !== "stopped") setNaming(false);
    wasPhase.current = phase;
  }, [phase, savable]);

  // With nothing in hand there is no card to fold; the button goes back to offering a start.
  useEffect(() => {
    if (phase === "idle" && (view === "open" || view === "folded")) setCardView("closed");
  }, [phase, view]);

  const folded = view === "folded";
  const question = lastDiscarding.current;
  const questionPoints = question && question.what !== "waiting" ? plural(question.points, "point") : "";

  return (
    <>
      <div
        ref={cards}
        className="pointer-events-none flex w-full flex-col items-center gap-2 empty:hidden max-md:min-h-[52px] max-md:shrink"
      >
        {state.pending.length > 0 ? (
          <Waiting recorder={recorder} pending={state.pending} onDiscard={(entry) => setDiscarding({ what: "waiting", entry })} />
        ) : null}
        {phase === "recording" || phase === "paused" ? (
          <Running recorder={recorder} state={state} folded={folded} />
        ) : phase === "stopped" ? (
          <Stopped
            state={state}
            recorder={recorder}
            onName={() => setNaming(true)}
            onDiscard={() => setDiscarding({ what: "in-hand", points: state.totals.points, distance: state.totals.distanceMeters })}
          />
        ) : state.unfinished ? (
          <Unfinished
            recorder={recorder}
            unfinished={state.unfinished}
            onDiscard={() =>
              state.unfinished &&
              setDiscarding({
                what: "unfinished",
                points: state.unfinished.totals.points,
                distance: state.unfinished.totals.distanceMeters,
              })
            }
          />
        ) : view === "intro" ? (
          <Intro recorder={recorder} state={state} />
        ) : null}
      </div>

      <SaveDialog open={naming && phase === "stopped"} onOpenChange={setNaming} state={state} recorder={recorder} onSaved={onShowTrack} />

      <ConfirmDialog
        open={discarding !== null}
        onOpenChange={(open) => !open && setDiscarding(null)}
        title={question?.what === "waiting" ? `Discard “${question.entry.name}”?` : "Discard this recording?"}
        description={
          question?.what === "waiting"
            ? `It has not been saved to Outpost: this device holds the only copy of its ${formatDistance(question.entry.totals.distanceMeters)}. Discarding removes it, and that cannot be undone. Download it as GPX first if you want to keep it.`
            : `Its ${questionPoints} (${formatDistance(question?.distance ?? 0)}) are on this device only, and have not been saved to Outpost. Discarding removes them, and that cannot be undone.`
        }
        confirmLabel="Discard recording"
        cancelLabel="Keep it"
        onConfirm={() => {
          const chosen = discarding;
          setDiscarding(null);
          if (!chosen) return;
          if (chosen.what === "waiting") void recorder.discardPending(chosen.entry.id);
          else if (chosen.what === "unfinished") void recorder.discardUnfinished();
          else void recorder.discard().then(() => setCardView("closed"));
        }}
      />
    </>
  );
}
