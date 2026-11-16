import { AdaptiveDecoder, standardTiming } from "@outpost/shared";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UseKeyerResult } from "../keyer/use-keyer";
import { applyMorsePrefs } from "../prefs";
import { EchoPractice } from "./echo-practice";

let resolvePlayback: (finished: boolean) => void = () => {};
const playTimeline = vi.fn(() => ({
  stop: vi.fn(() => resolvePlayback(false)),
  done: new Promise<boolean>((resolve) => {
    resolvePlayback = resolve;
  }),
  positionMs: () => 0,
  totalMs: 0,
}));
vi.mock("../audio/sidetone", () => ({
  getSidetone: () => ({
    ensure: vi.fn(() => Promise.resolve()),
    setFrequency: vi.fn(),
    setVolume: vi.fn(),
    playTimeline,
    subscribe: () => () => {},
    soundState: () => "none",
  }),
}));

const recordMutate = vi.fn();
const noteOutcome = vi.fn();
const pushMorseProgress = vi.fn((_patch: unknown) => Promise.resolve(null));
vi.mock("../data", () => ({
  pushMorseProgress: (patch: unknown) => pushMorseProgress(patch),
  useRecordMorseSession: () => ({ mutate: recordMutate }),
  useCharStats: () => ({ stats: {}, outcomes: [], markSynced: vi.fn(), noteOutcome }),
  useKochLesson: () => 1,
}));

vi.mock("@outpost/shared", async (original) => ({
  ...(await original<typeof import("@outpost/shared")>()),
  echoTarget: () => "K",
}));

const timing = standardTiming(20); // a 60 ms dit

function fakeKeyer(decoder: AdaptiveDecoder): UseKeyerResult {
  return {
    keyDown: false,
    text: "",
    pending: "",
    wpm: 20,
    press: vi.fn(),
    release: vi.fn(),
    clear: () => decoder.reset(),
    clearAt: (ms: number) => decoder.reset(ms),
    decoder,
  };
}

/** Keys K (-.-) cleanly into the decoder at 60 ms a dit. */
function keyK(decoder: AdaptiveDecoder, dahUnits = 3) {
  let t = 10_000;
  for (const units of [dahUnits, 1, dahUnits]) {
    decoder.keyDown(t);
    t += units * 60;
    decoder.keyUp(t);
    t += 60;
  }
}

async function playToReply() {
  fireEvent.click(screen.getByRole("button", { name: /^Play$/ }));
  await waitFor(() => expect(playTimeline).toHaveBeenCalled());
  await act(async () => resolvePlayback(true));
  await screen.findByText("Your turn: key it back.");
}

describe("EchoPractice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMorsePrefs({ echoContent: "callsigns", echoAdaptive: true, echoWpm: 20, echoSilenceWords: 2, kochLesson: 1 });
  });

  it("hides the text while it plays, locks the keyer, then shows and grades the reply", async () => {
    const decoder = new AdaptiveDecoder({ initialDitMs: 60 });
    const onPlayingChange = vi.fn();
    render(<EchoPractice keyer={fakeKeyer(decoder)} timing={timing} keyerTimed={false} onPlayingChange={onPlayingChange} />);
    expect(screen.getByText(/Press Play and listen: the text stays hidden/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Play$/ }));
    await screen.findByText(/Listen/);
    expect(onPlayingChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByTestId("echo-result")).toBeNull();
    expect(screen.queryByText("K")).toBeNull();

    await waitFor(() => expect(playTimeline).toHaveBeenCalled());
    await act(async () => resolvePlayback(true));
    await screen.findByText("Your turn: key it back.");
    expect(onPlayingChange).toHaveBeenLastCalledWith(false);

    keyK(decoder, 2.2);
    fireEvent.click(screen.getByRole("button", { name: /Done/ }));

    const result = await screen.findByTestId("echo-result");
    expect(within(result).getAllByText("K").length).toBeGreaterThan(0);
    expect(within(result).getByText("1 of 1 characters right.")).toBeInTheDocument();
    expect(within(result).getByText("Your dahs average 2.2 dits, aim for 3.")).toBeInTheDocument();
    // The timeline has the same numbers as a table.
    expect(within(result).getByRole("table", { name: /Your timing against standard proportions/ })).toBeInTheDocument();
    expect(within(result).getByRole("region", { name: /^Timeline: Played 3 marks/ })).toBeInTheDocument();
    expect(recordMutate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "echo", accuracy: 1, tries: { K: 1 }, misses: {} }),
      expect.anything(),
    );
    expect(noteOutcome).toHaveBeenCalledWith({ tries: { K: 1 }, misses: {} });
  });

  it("ends the reply on its own after the configured silence", async () => {
    applyMorsePrefs({ echoSilenceWords: 1 });
    const decoder = new AdaptiveDecoder({ initialDitMs: 60 });
    render(<EchoPractice keyer={fakeKeyer(decoder)} timing={timing} keyerTimed={false} onPlayingChange={vi.fn()} />);
    await playToReply();
    const now = performance.now();
    decoder.keyDown(now - 700);
    decoder.keyUp(now - 520); // a dah, then more than one word space (420 ms) of silence
    await waitFor(() => expect(screen.getByTestId("echo-result")).toBeInTheDocument());
    expect(screen.getByTestId("echo-result")).toHaveTextContent("Played");
  });

  it("takes Enter as Done while replying", async () => {
    const decoder = new AdaptiveDecoder({ initialDitMs: 60 });
    render(<EchoPractice keyer={fakeKeyer(decoder)} timing={timing} keyerTimed={false} onPlayingChange={vi.fn()} />);
    await playToReply();
    keyK(decoder);
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", bubbles: true }));
    });
    expect(await screen.findByTestId("echo-result")).toHaveTextContent("1 of 1 characters right.");
  });

  it("lets the playing be skipped to go straight to the reply", async () => {
    const decoder = new AdaptiveDecoder({ initialDitMs: 60 });
    render(<EchoPractice keyer={fakeKeyer(decoder)} timing={timing} keyerTimed={false} onPlayingChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Play$/ }));
    await waitFor(() => expect(playTimeline).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Skip to my turn/ }));
    expect(await screen.findByText("Your turn: key it back.")).toBeInTheDocument();
  });

  it("raises the speed after three clean replies when adaptive", async () => {
    const decoder = new AdaptiveDecoder({ initialDitMs: 60 });
    render(<EchoPractice keyer={fakeKeyer(decoder)} timing={timing} keyerTimed={false} onPlayingChange={vi.fn()} />);
    for (let reply = 0; reply < 3; reply++) {
      if (reply === 0) await playToReply();
      else {
        fireEvent.click(screen.getByRole("button", { name: /^Next$/ }));
        await waitFor(() => expect(playTimeline).toHaveBeenCalledTimes(reply + 1));
        await act(async () => resolvePlayback(true));
        await screen.findByText("Your turn: key it back.");
      }
      keyK(decoder);
      fireEvent.click(screen.getByRole("button", { name: /Done/ }));
      await screen.findByTestId("echo-result");
    }
    expect(screen.getByTestId("echo-speed-change")).toHaveTextContent("Speed 21 wpm.");
    expect(screen.getByTestId("echo-speed")).toHaveTextContent("21 wpm");
  });

  it("shows the lesson's characters and what unlocks the next one for Koch groups", () => {
    applyMorsePrefs({ echoContent: "koch" });
    const decoder = new AdaptiveDecoder({ initialDitMs: 60 });
    render(<EchoPractice keyer={fakeKeyer(decoder)} timing={timing} keyerTimed={false} onPlayingChange={vi.fn()} />);
    const chars = screen.getByRole("list", { name: "Each character of the lesson" });
    expect(within(chars).getAllByRole("listitem")).toHaveLength(2);
    expect(within(chars).getAllByText("untried")).toHaveLength(2);
    expect(screen.getByText(/before the next character can unlock/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Group size" })).toBeInTheDocument();
  });

  it("says when Farnsworth spacing plays the characters faster than the speed", () => {
    applyMorsePrefs({ echoFarnsworth: true, echoWpm: 10 });
    const decoder = new AdaptiveDecoder({ initialDitMs: 60 });
    render(<EchoPractice keyer={fakeKeyer(decoder)} timing={timing} keyerTimed={false} onPlayingChange={vi.fn()} />);
    expect(screen.getByTestId("echo-speed")).toHaveTextContent("10 wpm (characters at 20)");
    applyMorsePrefs({ echoFarnsworth: false });
  });
});
