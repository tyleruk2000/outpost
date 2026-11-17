/**
 * Playing an audiobook: one `<audio>` element, a chapter at a time, from the server.
 *
 * Everything here is driven by the element's own events. There is no timer: while
 * nothing plays, nothing runs. While it plays, the time on screen follows the browser's
 * `timeupdate` (a few times a second) and is not redrawn while the page is hidden; the
 * place is written to this device's storage on pause, on a change of chapter, when the
 * page is hidden or left, and at most every five seconds while playing.
 *
 * A plain `<audio>` element is what a phone keeps playing with the screen off, and the
 * Media Session gives the lock screen its title and its buttons, where the browser has
 * one. Neither needs a secure page; both are checked for before use.
 */
import type { AudiobookChapterDto, AudiobookDto } from "@outpost/shared";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { forgetPlace, readPlace, readSpeed, savePlace, saveSpeed } from "./place";

export const SKIP_SECONDS = 30;
/** The longest the place goes unsaved while playing. */
export const SAVE_EVERY_MS = 5000;

export type PlayerProblem = { kind: "unplayable" | "failed"; message: string };

export interface Start {
  index: number;
  seconds: number;
  /** True when this is where the book was left on this device. */
  resumed: boolean;
}

/** Where to begin: the chapter asked for, or where this device left the book, or the start. */
export function startingPlace(book: Pick<AudiobookDto, "id" | "chapters">, startAt?: string): Start {
  const saved = readPlace(book.id);
  const savedIndex = saved ? book.chapters.findIndex((chapter) => chapter.documentId === saved.documentId) : -1;
  const asked = startAt ? book.chapters.findIndex((chapter) => chapter.documentId === startAt) : -1;
  if (asked >= 0)
    return { index: asked, seconds: asked === savedIndex ? saved!.seconds : 0, resumed: asked === savedIndex && saved!.seconds > 0 };
  if (savedIndex >= 0) return { index: savedIndex, seconds: saved!.seconds, resumed: saved!.seconds > 0 || savedIndex > 0 };
  return { index: 0, seconds: 0, resumed: false };
}

/** The name of a kind of file, for "This browser cannot play …". */
function kindName(chapter: AudiobookChapterDto): string {
  const names: Record<string, string> = {
    mp3: "MP3",
    m4a: "M4A",
    m4b: "M4B",
    aac: "AAC",
    ogg: "Ogg",
    oga: "Ogg",
    opus: "Opus",
    flac: "FLAC",
    wav: "WAV",
  };
  return names[chapter.ext] ?? chapter.ext.toUpperCase();
}

export const cannotPlay = (chapter: AudiobookChapterDto): PlayerProblem => ({
  kind: "unplayable",
  message: `This browser cannot play ${kindName(chapter)} files. Download the chapter to play it in another app, or open Outpost in another browser.`,
});

const failed: PlayerProblem = {
  kind: "failed",
  message:
    "This chapter could not be loaded from Outpost. Check that the server is running and its storage is connected, then press play again.",
};

const hasMediaSession = () => typeof navigator !== "undefined" && "mediaSession" in navigator;

export interface Player {
  audioRef: RefObject<HTMLAudioElement | null>;
  index: number;
  chapter: AudiobookChapterDto;
  playing: boolean;
  /** Waiting for the server to send more of the file. */
  waiting: boolean;
  time: number;
  duration: number | null;
  speed: number;
  problem: PlayerProblem | null;
  /** Set when the last chapter has played to its end. */
  finished: boolean;
  start: Start;
  toggle(): void;
  skip(seconds: number): void;
  seek(seconds: number): void;
  goTo(index: number, options?: { play?: boolean }): void;
  setSpeed(speed: number): void;
}

export function useAudiobookPlayer(book: AudiobookDto, startAt?: string): Player {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Worked out once for this book: later saves must not move where it began.
  const [start] = useState(() => startingPlace(book, startAt));
  const [index, setIndex] = useState(start.index);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(start.seconds);
  const [duration, setDuration] = useState<number | null>(book.chapters[start.index]?.seconds ?? null);
  const [speed, setSpeedState] = useState(readSpeed);
  const [problem, setProblem] = useState<PlayerProblem | null>(null);
  const [finished, setFinished] = useState(false);

  const chapter = book.chapters[index] ?? book.chapters[0]!;
  // The latest of everything, for event handlers that are attached once.
  const live = useRef({ book, index, speed });
  live.current = { book, index, speed };
  /** Where to go once the file's length is known; the element cannot seek before that. */
  const pendingSeek = useRef<number | null>(start.seconds);
  /** Whether the chapter being loaded should start playing by itself (the next one, after the last ended). */
  const autoplay = useRef(false);
  const lastSaved = useRef(0);
  /** Set once the person has played or moved in the book here: opening it and leaving keeps nothing. */
  const touched = useRef(false);

  // The element may be passed in: when the screen is left, React has let go of the ref before the last save.
  const position = useCallback((element?: HTMLAudioElement | null): number => {
    const audio = element ?? audioRef.current;
    if (pendingSeek.current !== null) return pendingSeek.current;
    return audio ? audio.currentTime : 0;
  }, []);

  const save = useCallback(
    (element?: HTMLAudioElement | null) => {
      const { book: current, index: at } = live.current;
      const here = current.chapters[at];
      if (!here) return;
      lastSaved.current = Date.now();
      savePlace(current.id, here.documentId, position(element));
    },
    [position],
  );

  const updatePositionState = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !hasMediaSession() || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: Math.min(audio.currentTime, audio.duration),
      });
    } catch {
      // Some browsers refuse a position state they do not like; the lock screen just shows less.
    }
  }, []);

  // ── Loading a chapter ──
  // Keyed on the chapter's file, not on the book: the book is fetched again whenever the
  // library changes, and that must not reload what is playing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the file is what decides; the rest is read fresh
  useEffect(() => {
    const audio = audioRef.current;
    const { book: current } = live.current;
    const here = current.chapters[index];
    if (!audio || !here) return;
    setProblem(null);
    setWaiting(false);
    setDuration(here.seconds);
    setTime(pendingSeek.current ?? 0);
    if (audio.canPlayType(here.mime) === "") {
      setProblem(cannotPlay(here));
      audio.removeAttribute("src");
      autoplay.current = false;
      return;
    }
    audio.src = here.fileUrl;
    audio.defaultPlaybackRate = live.current.speed;
    audio.playbackRate = live.current.speed;
    audio.load();
    if (autoplay.current) {
      // Asked for straight away, so a phone that moved on to the next chapter with the screen off keeps going.
      void audio.play().catch(() => undefined);
    }
    if (hasMediaSession() && typeof MediaMetadata !== "undefined") {
      navigator.mediaSession.metadata = new MediaMetadata({ title: here.title, artist: current.author ?? "", album: current.title });
    }
  }, [chapter.fileUrl, index]);

  // ── The element's events ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMetadata = () => {
      const length = Number.isFinite(audio.duration) ? audio.duration : null;
      setDuration(length);
      if (pendingSeek.current !== null) {
        const target = length ? Math.min(pendingSeek.current, Math.max(0, length - 1)) : pendingSeek.current;
        if (target > 0) audio.currentTime = target;
        pendingSeek.current = null;
        setTime(target);
      }
      updatePositionState();
    };
    const onTime = () => {
      if (pendingSeek.current !== null) return;
      if (!document.hidden) setTime(audio.currentTime);
      if (!audio.paused && Date.now() - lastSaved.current >= SAVE_EVERY_MS) save();
    };
    const onPlay = () => {
      touched.current = true;
      setPlaying(true);
      setFinished(false);
      if (hasMediaSession()) navigator.mediaSession.playbackState = "playing";
      updatePositionState();
    };
    const onPause = () => {
      setPlaying(false);
      if (hasMediaSession()) navigator.mediaSession.playbackState = "paused";
      if (!audio.ended) save();
    };
    const onEnded = () => {
      const { book: current, index: at } = live.current;
      if (at < current.chapters.length - 1) {
        pendingSeek.current = 0;
        autoplay.current = true;
        savePlace(current.id, current.chapters[at + 1]!.documentId, 0);
        setIndex(at + 1);
      } else {
        // The whole book has been heard: next time it starts again from the beginning.
        forgetPlace(current.id);
        autoplay.current = false;
        setPlaying(false);
        setFinished(true);
      }
    };
    const onError = () => {
      const code = audio.error?.code;
      if (!audio.getAttribute("src")) return;
      const here = live.current.book.chapters[live.current.index];
      setProblem(code === 4 && here ? cannotPlay(here) : failed);
      setPlaying(false);
      setWaiting(false);
    };
    const onWaiting = () => setWaiting(true);
    const onFlowing = () => setWaiting(false);
    const listeners: Array<[string, () => void]> = [
      ["loadedmetadata", onMetadata],
      ["timeupdate", onTime],
      ["play", onPlay],
      ["pause", onPause],
      ["ended", onEnded],
      ["error", onError],
      ["waiting", onWaiting],
      ["playing", onFlowing],
      ["canplay", onFlowing],
      ["ratechange", updatePositionState],
      ["seeked", updatePositionState],
    ];
    for (const [type, listener] of listeners) audio.addEventListener(type, listener);
    return () => {
      for (const [type, listener] of listeners) audio.removeEventListener(type, listener);
    };
  }, [save, updatePositionState]);

  // ── Leaving, hiding, coming back ──
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && touched.current) save();
      else if (audioRef.current && pendingSeek.current === null) setTime(audioRef.current.currentTime);
    };
    const onPageHide = () => touched.current && save();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    const audio = audioRef.current;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      // Leaving the screen stops the book where it is, and remembers the place.
      if (touched.current && audio && !audio.ended && audio.getAttribute("src")) save(audio);
      audio?.pause();
      audio?.removeAttribute("src");
    };
  }, [save]);

  // ── Controls ──
  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio?.getAttribute("src")) return;
    if (audio.paused) {
      if (finished) {
        setFinished(false);
        if (live.current.index !== 0) {
          pendingSeek.current = 0;
          autoplay.current = true;
          setIndex(0);
          return;
        }
        audio.currentTime = 0;
      }
      setProblem(null);
      void audio.play().catch((error: unknown) => {
        // A browser that wants a press first says NotAllowedError; anything else is a fault worth naming.
        if ((error as DOMException | null)?.name !== "NotAllowedError" && (error as DOMException | null)?.name !== "AbortError") {
          setProblem(failed);
        }
      });
    } else {
      audio.pause();
    }
  }, [finished]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const length = Number.isFinite(audio.duration) ? audio.duration : null;
    const target = Math.max(0, length ? Math.min(seconds, length) : seconds);
    touched.current = true;
    if (pendingSeek.current !== null) pendingSeek.current = target;
    else audio.currentTime = target;
    setTime(target);
  }, []);

  const skip = useCallback((seconds: number) => seek(position() + seconds), [seek, position]);

  const goTo = useCallback(
    (next: number, options: { play?: boolean } = {}) => {
      const audio = audioRef.current;
      const { book: current, index: at } = live.current;
      if (next < 0 || next >= current.chapters.length) return;
      touched.current = true;
      save();
      setFinished(false);
      autoplay.current = options.play ?? Boolean(audio && !audio.paused);
      if (next === at) {
        seek(0);
        if (autoplay.current) void audio?.play().catch(() => undefined);
        return;
      }
      pendingSeek.current = 0;
      savePlace(current.id, current.chapters[next]!.documentId, 0);
      setIndex(next);
    },
    [save, seek],
  );

  const setSpeed = useCallback((next: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.defaultPlaybackRate = next;
      audio.playbackRate = next;
    }
    saveSpeed(next);
    setSpeedState(next);
  }, []);

  // ── The lock screen ──
  const controls = useRef({ toggle, skip, seek, goTo });
  controls.current = { toggle, skip, seek, goTo };
  useEffect(() => {
    if (!hasMediaSession()) return;
    const session = navigator.mediaSession;
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => audioRef.current?.paused && controls.current.toggle()],
      ["pause", () => audioRef.current && !audioRef.current.paused && controls.current.toggle()],
      ["seekbackward", (details) => controls.current.skip(-(details.seekOffset ?? SKIP_SECONDS))],
      ["seekforward", (details) => controls.current.skip(details.seekOffset ?? SKIP_SECONDS)],
      ["previoustrack", () => controls.current.goTo(live.current.index - 1)],
      ["nexttrack", () => controls.current.goTo(live.current.index + 1)],
      ["seekto", (details) => details.seekTime !== undefined && controls.current.seek(details.seekTime)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // An action this browser does not offer.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // As above.
        }
      }
      session.metadata = null;
      session.playbackState = "none";
    };
  }, []);

  return {
    audioRef,
    index,
    chapter,
    playing,
    waiting,
    time,
    duration,
    speed,
    problem,
    finished,
    start,
    toggle,
    skip,
    seek,
    goTo,
    setSpeed,
  };
}
