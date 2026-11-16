import { type AdaptiveDecoder, buildCqConversation, type CqConversationKind } from "@outpost/shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMorsePrefs } from "../prefs";
import { CQ_DEFAULT_CALL, CQ_OTHER_CALL, CqConversationPractice } from "./cq-conversation-practice";

const tone = vi.hoisted(() => ({
  ensure: vi.fn(() => Promise.resolve()),
  setFrequency: vi.fn(),
  setVolume: vi.fn(),
  playTimeline: vi.fn(() => ({ stop: vi.fn(), done: Promise.resolve(true), positionMs: () => 0, totalMs: 0 })),
  subscribe: () => () => {},
  soundState: () => "none",
}));
vi.mock("../audio/sidetone", () => ({ getSidetone: () => tone }));

const mutate = vi.fn();
vi.mock("../data", () => ({ useRecordMorseSession: () => ({ mutate }) }));

/** A decoder that heard exactly `text`, keyed with a steady hand at 15 wpm. */
const heard = (text: string) => ({ text, ditMarks: [80, 80, 80], dahMarks: [240, 240, 240], wpm: 15 }) as unknown as AdaptiveDecoder;

function setup() {
  const clearKeyer = vi.fn();
  const props = { clearKeyer, charWpm: 15, toneHz: 600, volume: 0.7 };
  const view = render(<CqConversationPractice decoder={heard("")} decodedText="" {...props} />);
  const key = (text: string) => view.rerender(<CqConversationPractice decoder={heard(text)} decodedText={text} {...props} />);
  return { key, clearKeyer };
}

const stagesOf = (kind: CqConversationKind, reference?: string) =>
  buildCqConversation(kind, { myCall: CQ_DEFAULT_CALL, myName: "PAT", myQth: "LEEDS", otherCall: CQ_OTHER_CALL, reference }).stages;

describe("CQ conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMorsePrefs({ callsign: "" });
  });
  afterEach(() => applyMorsePrefs({ callsign: "" }));

  it("starts from a made-up call when none is set, and from the trainer's callsign when it is", () => {
    const { unmount } = render(
      <CqConversationPractice decoder={heard("")} decodedText="" clearKeyer={vi.fn()} charWpm={15} toneHz={600} volume={0.7} />,
    );
    expect(screen.getByLabelText("Practice callsign")).toHaveValue("Q7XYZ");
    unmount();
    applyMorsePrefs({ callsign: "Q4ABC" });
    render(<CqConversationPractice decoder={heard("")} decodedText="" clearKeyer={vi.fn()} charWpm={15} toneHz={600} volume={0.7} />);
    expect(screen.getByLabelText("Practice callsign")).toHaveValue("Q4ABC");
  });

  it("offers the three kinds, each with its own fields", () => {
    setup();
    const kinds = screen.getByRole("group", { name: "CQ conversation type" });
    expect(screen.getByRole("button", { name: /Standard CQ/ })).toHaveAttribute("aria-pressed", "true");
    expect(kinds).toHaveTextContent("SOTA activation");
    expect(kinds).toHaveTextContent("POTA activation");
    expect(screen.getByLabelText("Your name")).toHaveValue("PAT");
    expect(screen.getByLabelText("Your QTH")).toHaveValue("LEEDS");

    fireEvent.click(screen.getByRole("button", { name: /SOTA activation/ }));
    expect(screen.getByLabelText("Summit reference")).toHaveValue("G/LD-001");
    expect(screen.queryByLabelText("Your name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /POTA activation/ }));
    expect(screen.getByLabelText("Park reference")).toHaveValue("GB-0099");
    expect(screen.getByRole("button", { name: "Start the POTA conversation" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Park reference"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Start the POTA conversation" })).toBeDisabled();
  });

  it("takes you through the three overs, grading each, and keeps one session at the end", async () => {
    const { key, clearKeyer } = setup();
    const stages = stagesOf("standard");
    fireEvent.click(screen.getByRole("button", { name: "Start the Standard conversation" }));

    // Over 1: calling CQ, with nothing heard before it.
    expect(screen.getByText("Over 1 of 3, Standard CQ")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Call CQ" })).toBeInTheDocument();
    expect(screen.getByText(stages[0]!.target)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hear the reply/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Grade this over" })).toBeDisabled();
    key(stages[0]!.target);
    fireEvent.click(screen.getByRole("button", { name: "Grade this over" }));
    expect(screen.getByText(/100% accuracy/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next over" }));
    key("");

    // Over 2: Q4RTF answers, and its over can be heard.
    expect(screen.getByText("Over 2 of 3, Standard CQ")).toBeInTheDocument();
    expect(screen.getByText(`${CQ_OTHER_CALL} sends`)).toBeInTheDocument();
    expect(screen.getByText(stages[1]!.incoming!)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Hear the reply/ }));
    });
    expect(tone.playTimeline).toHaveBeenCalledTimes(1);
    // A poor try can be had again.
    key("EEEE");
    fireEvent.click(screen.getByRole("button", { name: "Grade this over" }));
    expect(screen.getAllByText("(missed)", { exact: false }).length).toBeGreaterThan(0);
    clearKeyer.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Try this over again/ }));
    expect(clearKeyer).toHaveBeenCalled();
    key(stages[1]!.target);
    fireEvent.click(screen.getByRole("button", { name: "Grade this over" }));
    fireEvent.click(screen.getByRole("button", { name: "Next over" }));
    key("");

    // Over 3: signing off.
    expect(screen.getByRole("heading", { name: "Acknowledge and sign off" })).toBeInTheDocument();
    key(stages[2]!.target);
    fireEvent.click(screen.getByRole("button", { name: "Grade this over" }));
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Finish the conversation" }));

    expect(screen.getByRole("heading", { name: "Standard CQ complete" })).toBeInTheDocument();
    expect(screen.getByText(/100% average accuracy/)).toBeInTheDocument();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ kind: "send", accuracy: 1, charWpm: 15 }));

    fireEvent.click(screen.getByRole("button", { name: "Run it again" }));
    expect(screen.getByText("Over 1 of 3, Standard CQ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change setup" }));
    expect(screen.getByRole("group", { name: "CQ conversation type" })).toBeInTheDocument();
  });

  it("builds a SOTA activation on the portable call with the summit reference", () => {
    const { key } = setup();
    fireEvent.click(screen.getByRole("button", { name: /SOTA activation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start the SOTA conversation" }));
    expect(screen.getByText("CQ SOTA CQ SOTA DE Q7XYZ/P Q7XYZ/P K")).toBeInTheDocument();
    key("CQ SOTA CQ SOTA DE Q7XYZ/P Q7XYZ/P K");
    fireEvent.click(screen.getByRole("button", { name: "Grade this over" }));
    fireEvent.click(screen.getByRole("button", { name: "Next over" }));
    expect(screen.getByText(stagesOf("sota", "G/LD-001")[1]!.target)).toBeInTheDocument();
  });
});
