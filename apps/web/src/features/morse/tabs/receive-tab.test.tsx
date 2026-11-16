import { KOCH_LESSON_COUNT, kochWeights, lessonCharset, randomGroups } from "@outpost/shared";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMorsePrefs, resetMorsePrefs } from "../prefs";
import { ReceiveTab } from "./receive-tab";

const playTimeline = vi.fn((_segments: unknown, _options?: unknown) => ({
  stop: vi.fn(),
  done: Promise.resolve(true),
  positionMs: () => 0,
  totalMs: 0,
}));

vi.mock("../audio/sidetone", () => ({
  getSidetone: () => ({
    ensure: vi.fn(() => Promise.resolve()),
    unlock: vi.fn(),
    setFrequency: vi.fn(),
    setVolume: vi.fn(),
    setImpairments: vi.fn(),
    subscribe: () => () => {},
    soundState: () => "running",
    playTimeline,
  }),
}));

const recordMutate = vi.fn();
const pushMorseProgress = vi.fn((_patch: unknown) => Promise.resolve(null));
vi.mock("../data", () => ({
  pushMorseProgress: (patch: unknown) => pushMorseProgress(patch),
  useRecordMorseSession: () => ({ mutate: recordMutate }),
  useCharStats: () => ({ stats: {}, outcomes: [], markSynced: vi.fn(), noteOutcome: vi.fn(() => 1) }),
}));

function chipsPanel() {
  return screen.getByTestId("drill-charset");
}

async function chooseDrill(name: string) {
  await userEvent.click(screen.getByRole("combobox", { name: "Drill" }));
  await userEvent.click(await screen.findByRole("option", { name }));
}

/** Runs one drill to a graded result, so the session appears. */
async function completeOneDrill(copy = "KMKMK") {
  fireEvent.click(screen.getByRole("button", { name: /^Play$/ }));
  const input = screen.getByLabelText("What did you hear?");
  await waitFor(() => expect(input).not.toBeDisabled());
  await screen.findByRole("button", { name: /Check copy/ });
  fireEvent.change(input, { target: { value: copy } });
  fireEvent.click(screen.getByRole("button", { name: /Check copy/ }));
  await screen.findByRole("heading", { name: "This session" });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  resetMorsePrefs();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Receive: the characters to tap and hear", () => {
  it("shows the Koch lesson's characters for the Koch drill", () => {
    render(<ReceiveTab />);
    expect(screen.getByText(`Lesson 1 of ${KOCH_LESSON_COUNT}: characters so far`)).toBeInTheDocument();
    expect(screen.getByText(/Lesson 1 starts with/)).toHaveTextContent("Lesson 1 starts with K and M.");
    expect(screen.queryByTestId("drill-charset")).not.toBeInTheDocument();
  });

  it("shows the chosen drill's own characters for the other drills, and plays one on a tap", async () => {
    render(<ReceiveTab />);
    await chooseDrill("CW abbreviations");

    expect(screen.queryByText(/characters so far/)).not.toBeInTheDocument();
    const panel = chipsPanel();
    expect(within(panel).getByText("CW abbreviations: characters in this drill")).toBeInTheDocument();
    // "QRM" and "599" are abbreviations, so Q and 5 are drilled though neither is in lesson 1.
    expect(within(panel).getByRole("button", { name: "Q" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "5" })).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Q" }));
    await waitFor(() => expect(playTimeline).toHaveBeenCalledTimes(1));
  });

  it("does not let a needs-work character cut into a drill that is playing", async () => {
    render(<ReceiveTab />);
    await completeOneDrill();
    const needsWork = screen.getByRole("group", { name: "Needs work" });
    const chip = within(needsWork).getAllByRole("button")[0]!;
    // The next drill plays until its handle resolves.
    playTimeline.mockImplementationOnce(() => ({ stop: vi.fn(), done: new Promise<boolean>(() => {}), positionMs: () => 0, totalMs: 0 }));
    const before = playTimeline.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /New drill/ }));
    await waitFor(() => expect(playTimeline).toHaveBeenCalledTimes(before + 1));
    // It shares the drill's key: playing it would cut off the rest of the drill, graded as if heard.
    expect(chip).toBeDisabled();
    fireEvent.click(chip);
    await Promise.resolve();
    expect(playTimeline).toHaveBeenCalledTimes(before + 1);
  });

  it("offers simple and complex only for the word and callsign drills, and the choice changes the pool", async () => {
    render(<ReceiveTab />);
    expect(screen.queryByRole("radiogroup", { name: "Difficulty" })).not.toBeInTheDocument();

    await chooseDrill("Callsigns");
    const switcher = screen.getByRole("radiogroup", { name: "Difficulty" });
    expect(within(switcher).getByRole("radio", { name: "Simple" })).toHaveAttribute("aria-checked", "true");
    // Simple callsigns never have a /P-style suffix.
    expect(within(chipsPanel()).queryByRole("button", { name: "/" })).not.toBeInTheDocument();

    fireEvent.click(within(switcher).getByRole("radio", { name: "Complex" }));
    expect(within(switcher).getByRole("radio", { name: "Complex" })).toHaveAttribute("aria-checked", "true");
    expect(within(chipsPanel()).getByRole("button", { name: "/" })).toBeInTheDocument();

    await chooseDrill("Common words");
    expect(screen.getByRole("radiogroup", { name: "Difficulty" })).toBeInTheDocument();
    await chooseDrill("QSO phrases");
    expect(screen.queryByRole("radiogroup", { name: "Difficulty" })).not.toBeInTheDocument();
  });
});

describe("Receive: grading and keeping a drill", () => {
  it("marks what was missed, keeps the session with its tries and misses, and offers the next lesson at 90%", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    const seed = Math.floor(0.25 * 1e9);
    const charset = lessonCharset(1);
    const sent = randomGroups(charset, { groups: 10, groupSize: 5, seed, weights: kochWeights(charset, {}, null) });
    render(<ReceiveTab />);
    await completeOneDrill(sent);

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Sent:", { exact: false })).toHaveTextContent("Nothing missed.");
    expect(recordMutate).toHaveBeenCalledTimes(1);
    const [input] = recordMutate.mock.calls[0]!;
    expect(input).toMatchObject({ kind: "receive", accuracy: 1, charWpm: 18, effWpm: 10, lesson: 1, misses: {} });
    expect(Object.values(input.tries as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(50);

    expect(screen.getByText(/Ready for lesson 2, which adds/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to lesson 2" }));
    expect(getMorsePrefs().kochLesson).toBe(2);
    expect(pushMorseProgress).toHaveBeenCalledWith({ kochLesson: 2 });
  });

  it("says what was missed and does not offer the next lesson below 90%", async () => {
    render(<ReceiveTab />);
    await completeOneDrill("KMKMK");
    expect(screen.getByText(/moves you on to the next lesson/)).toBeInTheDocument();
    expect(screen.getByText("Sent:", { exact: false })).toHaveTextContent(/Missed or mistyped: /);
    expect(screen.queryByRole("button", { name: /Go to lesson/ })).not.toBeInTheDocument();
    const [input] = recordMutate.mock.calls[0]!;
    expect(Object.keys(input.misses as object).length).toBeGreaterThan(0);
  });

  it("says plainly when a session could not be kept", async () => {
    recordMutate.mockImplementation((_input, options: { onError?: () => void }) => options.onError?.());
    render(<ReceiveTab />);
    await completeOneDrill();
    expect(screen.getByText("A practice session was not kept")).toBeInTheDocument();
    expect(screen.getByText(/The server could not be reached/)).toBeInTheDocument();
  });

  it("stops without grading when Enter is pressed during playback with nothing typed", async () => {
    playTimeline.mockImplementationOnce(() => ({ stop: vi.fn(), done: new Promise<boolean>(() => {}), positionMs: () => 0, totalMs: 0 }));
    render(<ReceiveTab />);
    fireEvent.click(screen.getByRole("button", { name: /^Play$/ }));
    await screen.findByRole("button", { name: /Stop/ });
    const input = screen.getByLabelText("What did you hear?");
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    expect(await screen.findByRole("button", { name: /Check copy/ })).toBeDisabled();
    expect(recordMutate).not.toHaveBeenCalled();
  });
});

describe("Receive: resetting the session", () => {
  it("asks first, and keeps the session when cancelled", async () => {
    render(<ReceiveTab />);
    await completeOneDrill();

    fireEvent.click(screen.getByRole("button", { name: /Reset session/ }));
    const dialog = await screen.findByRole("alertdialog", { name: "Reset this session?" });
    expect(dialog).toHaveTextContent("This clears 1 drill and the needs-work list");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "This session" })).toBeInTheDocument();
  });

  it("clears the session and the needs-work list once confirmed", async () => {
    render(<ReceiveTab />);
    await completeOneDrill();
    expect(recordMutate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Reset session/ }));
    const dialog = await screen.findByRole("alertdialog", { name: "Reset this session?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "This session" })).not.toBeInTheDocument());
    expect(screen.queryByText("Needs work")).not.toBeInTheDocument();
  });
});
