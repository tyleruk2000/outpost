import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyMorsePrefs, getMorsePrefs, resetMorsePrefs } from "../prefs";
import { QsoTab } from "./qso-tab";

const playTimeline = vi.fn((_segments: unknown, _options?: unknown) => ({
  stop: vi.fn(),
  done: Promise.resolve(true),
  positionMs: () => 0,
  totalMs: 0,
}));
const setImpairments = vi.fn();

vi.mock("../audio/sidetone", () => ({
  getSidetone: () => ({
    ensure: vi.fn(() => Promise.resolve()),
    unlock: vi.fn(),
    setFrequency: vi.fn(),
    setVolume: vi.fn(),
    setImpairments,
    subscribe: () => () => {},
    soundState: () => "running",
    playTimeline,
  }),
}));

const recordMutate = vi.fn();
vi.mock("../data", () => ({
  useMorse: () => ({ data: { weakChars: {} } }),
  useRecordMorseSession: () => ({ mutate: recordMutate }),
}));

// What the decoder has made of the keying: a test keys a reply by setting it.
const keyed = { text: "" };
vi.mock("../keyer/use-keyer", () => ({
  useKeyer: () => ({
    keyDown: false,
    text: keyed.text,
    pending: "",
    wpm: 15,
    press: vi.fn(),
    release: vi.fn(),
    clear: () => {
      keyed.text = "";
    },
    clearAt: vi.fn(),
    decoder: {
      flush: vi.fn(),
      get text() {
        return keyed.text;
      },
      ditMarks: [80, 80, 80],
      dahMarks: [240, 240],
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  resetMorsePrefs();
  keyed.text = "";
});

function contactLog() {
  return screen.getByRole("list", { name: "The contact so far" });
}

/** The station's call, from the margin of its first over. */
function stationCall(): string {
  return within(contactLog()).getAllByRole("listitem")[0]!.querySelector("span")!.textContent!;
}

async function key(text: string, rerender: () => void) {
  await screen.findByRole("button", { name: /Send over/ });
  keyed.text = text;
  rerender();
  fireEvent.click(screen.getByRole("button", { name: /Send over/ }));
}

async function skipToReply() {
  const skip = await screen.findByRole("button", { name: "Skip to reply" });
  await waitFor(() => expect(skip).toBeEnabled());
  fireEvent.click(skip);
}

describe("QSO practice: setup", () => {
  it("starts with the made-up stand-in call, says it is made up, and offers three levels", () => {
    render(<QsoTab />);
    expect(screen.getByRole("heading", { name: "Work a made-up station" })).toBeInTheDocument();
    const level = screen.getByRole("group", { name: "Level" });
    expect(within(level).getAllByRole("button")).toHaveLength(3);
    expect(within(level).getByRole("button", { name: /Beginner/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(level).getByRole("button", { name: /Advanced/ }));
    expect(within(level).getByRole("button", { name: /Advanced/ })).toHaveAttribute("aria-pressed", "true");
    const call = screen.getByLabelText("Your callsign (if you have one)");
    expect(call).toHaveValue("");
    expect(call).toHaveAttribute("placeholder", "Q7XYZ");
    expect(screen.getByText(/you will practise as Q7XYZ, a made-up call/)).toBeInTheDocument();
  });

  it("starts from the saved callsign, and keeps an edited one for next time", async () => {
    applyMorsePrefs({ callsign: "Q4ABC" });
    render(<QsoTab />);
    const call = screen.getByLabelText("Your callsign (if you have one)");
    expect(call).toHaveValue("Q4ABC");
    fireEvent.change(call, { target: { value: "q2def" } });
    expect(call).toHaveValue("Q2DEF");
    fireEvent.click(screen.getByRole("button", { name: /Start listening/ }));
    expect(getMorsePrefs().callsign).toBe("Q2DEF");
    expect(await screen.findByRole("list", { name: "The contact so far" })).toBeInTheDocument();
    expect(screen.getByText("Your call").nextElementSibling).toHaveTextContent("Q2DEF");
  });
});

describe("QSO practice: a contact", () => {
  it("plays the station's CQ, grades the copy, and answers what was keyed", async () => {
    const { rerender } = render(<QsoTab />);
    fireEvent.click(screen.getByRole("button", { name: /Start listening/ }));
    const scratch = await screen.findByLabelText("Scratchpad: what did they send?");
    expect(playTimeline).toHaveBeenCalledTimes(1);
    const call = stationCall();
    expect(call).toMatch(/^Q\d[A-Z]{3}$/);
    expect(screen.getByText("On the air…")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check my copy" })).toBeDisabled());
    fireEvent.change(scratch, { target: { value: `CQ CQ CQ DE ${call} ${call}` } });
    fireEvent.click(screen.getByRole("button", { name: "Check my copy" }));
    expect(await screen.findByText(/You copied \d+%; anything you missed is marked/)).toBeInTheDocument();
    expect(screen.getByText(/^Crib:/)).toHaveTextContent(`${call} DE Q7XYZ Q7XYZ K`);

    await key(`${call} DE Q7XYZ Q7XYZ K`, () => rerender(<QsoTab />));
    const log = within(contactLog());
    expect(await log.findByText(`${call} DE Q7XYZ Q7XYZ K`)).toBeInTheDocument();
    expect(log.getByText("You")).toBeInTheDocument();
    // The station answers the call it heard, and its over is hidden until it has been copied.
    await waitFor(() => expect(playTimeline).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText("Scratchpad: what did they send?")).toBeInTheDocument();
    expect(log.getAllByText("On the air…")).toHaveLength(1);
  });

  it("runs a whole contact to the scorecard and keeps it as a QSO session", async () => {
    const { rerender } = render(<QsoTab />);
    const again = () => rerender(<QsoTab />);
    fireEvent.click(screen.getByRole("button", { name: /Start listening/ }));
    await screen.findByLabelText("Scratchpad: what did they send?");
    const call = stationCall();

    await skipToReply();
    await key(`${call} DE Q7XYZ Q7XYZ K`, again);
    await skipToReply();
    await key(`R R ${call} DE Q7XYZ UR RST 599 599 NAME TOM QTH LEEDS KN`, again);
    await skipToReply();
    await key("73 TU <SK>", again);

    expect(await screen.findByRole("heading", { name: `Contact complete: ${call} is in the log` })).toBeInTheDocument();
    const card = screen.getByRole("list", { name: "How the contact went" });
    for (const line of ["Answered their CQ", "Copied their call", "Sent a report", "Sent your name", "Signed off (73)"]) {
      expect(within(card).getByText(line).parentElement).toHaveTextContent(`${line}: done`);
    }
    expect(screen.getByText(/The station was [A-Z]+ in [A-Z]+, and gave you \d{3}\./)).toBeInTheDocument();
    expect(recordMutate).toHaveBeenCalledTimes(1);
    expect(recordMutate.mock.calls[0]![0]).toMatchObject({ kind: "qso", accuracy: 1, charWpm: 15, effWpm: 6 });
    expect(recordMutate.mock.calls[0]![0].rhythm).toBeGreaterThanOrEqual(0);
    // The band is quiet again after the contact.
    expect(setImpairments).toHaveBeenLastCalledWith({ noise: 0, qsb: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Change level or callsign" }));
    expect(screen.getByRole("heading", { name: "Work a made-up station" })).toBeInTheDocument();
  });

  it("says plainly when the contact could not be kept", async () => {
    recordMutate.mockImplementation((_input, options: { onError?: () => void }) => options.onError?.());
    const { rerender } = render(<QsoTab />);
    fireEvent.click(screen.getByRole("button", { name: /Start listening/ }));
    await screen.findByLabelText("Scratchpad: what did they send?");
    await skipToReply();
    // Signing off at once ends the contact.
    await key("73 <SK>", () => rerender(<QsoTab />));
    expect(await screen.findByText("A practice session was not kept")).toBeInTheDocument();
  });
});
