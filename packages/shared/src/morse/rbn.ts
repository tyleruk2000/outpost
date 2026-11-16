/**
 * On the air: build a call a CW Skimmer can spot, and judge a
 * keyed attempt against what the Reverse Beacon Network needs.
 *
 * Sources (checked 2026-10-31):
 *  - RBN, "How to get spotted by the RBN"
 *    (reversebeacon.net/pages/How+to+get+spotted+by+the+RBN+44): "you must
 *    send one of the key-words: TEST or CQ (FD, SS, NA and UP also work in
 *    appropriate settings)"; "Skimmer may want to "hear" two, three, or four
 *    repetitions of the call before it will be spotted"; a letter from the
 *    word before can be run into the call (the "T in CWT" problem); the
 *    repeats need not be in one transmission, "so long as you don't change
 *    frequency enough to confuse the software"; after a spot a node ignores
 *    you for 10 minutes unless you QSY 300 Hz or more between tests.
 *  - HamSCI, "Getting Spotted by the RBN" (hamsci.org/node/188): skimmers must
 *    recognise "(1) calling CQ and (2) having a valid call sign"; one extra
 *    word may sit between the keyword and the call; "send the entire message
 *    at the same speed and do not speed up parts of the message".
 * Neither source gives a speed range, so this module sets none.
 */
import type { KeyedMark } from "./decoder.ts";
import type { KeyingAnalysis } from "./echo.ts";

export type RbnMessageKind = "cq" | "test" | "test-de";
export const RBN_MESSAGE_KINDS: readonly RbnMessageKind[] = ["cq", "test", "test-de"];

export interface RbnMessagePart {
  text: string;
  why: string;
}

export interface RbnMessage {
  kind: RbnMessageKind;
  label: string;
  /** when to use this form */
  blurb: string;
  text: string;
  parts: RbnMessagePart[];
}

const WHY = {
  cq: "CQ is a keyword the skimmer listens for: your call only counts as a spot when CQ or TEST comes before it.",
  cqAgain: "A second CQ gives a human listener time to tune in. The skimmer needs only one keyword.",
  test: "TEST is the contest keyword; skimmers treat it like CQ. Outside a contest, call CQ.",
  de: 'DE means "from". Skimmers allow one word between the keyword and your call, so DE is fine.',
  call1: "Your callsign: always send it, so you are never transmitting unidentified.",
  call2: "Repeat it. Skimmers want two to four clean copies of a call before they spot it, more for unusual prefixes.",
  call3: "A third copy helps a new or uncommon prefix (a recent M7 Foundation call, say), which a skimmer may want to hear four times.",
  k: "K invites anyone to reply and ends your over.",
};

/** Plain-language advice shown with every form of the call. */
export const RBN_REPEAT_TIP =
  "New or uncommon prefixes may need four copies before a skimmer spots them: send your call three times, and call more than once with pauses to listen.";

/** The message for `kind`, built from the operator's own callsign, with the
 * call sent `repeats` times (2 by default, 3 for new or uncommon prefixes). */
export function rbnMessage(kind: RbnMessageKind, callsign: string, opts: { repeats?: 2 | 3 } = {}): RbnMessage {
  const call = callsign.trim().toUpperCase();
  const calls: RbnMessagePart[] = [
    { text: call, why: WHY.call1 },
    { text: call, why: WHY.call2 },
    ...(opts.repeats === 3 ? [{ text: call, why: WHY.call3 }] : []),
  ];
  let label: string;
  let blurb: string;
  let parts: RbnMessagePart[];
  switch (kind) {
    case "cq":
      label = "Everyday CQ";
      blurb = "A general call: anyone may answer, and the skimmers spot it.";
      parts = [
        { text: "CQ", why: WHY.cq },
        { text: "CQ", why: WHY.cqAgain },
        { text: "DE", why: WHY.de },
        ...calls,
        { text: "K", why: WHY.k },
      ];
      break;
    case "test":
      label = "Contest style";
      blurb = "Short and quick, the way contest stations call. Use it during a contest; to test your signal at other times, call CQ.";
      parts = [{ text: "TEST", why: WHY.test }, ...calls];
      break;
    case "test-de":
      label = "TEST DE";
      blurb = "TEST with DE before your call, as many operators remember it. TEST is a contest keyword: outside a contest, call CQ.";
      parts = [{ text: "TEST", why: WHY.test }, { text: "DE", why: WHY.de }, ...calls];
      break;
  }
  return { kind, label, blurb, text: parts.map((p) => p.text).join(" "), parts };
}

/** "Before you call on the air": the etiquette and rules shown with the RBN
 * practice on web and mobile (the app never keys a radio). */
export const RBN_ON_AIR_CHECKLIST: readonly { title: string; body: string }[] = [
  {
    title: "Your licence covers it",
    body: "Check your licence allows CW on the band, and the power you plan to use.",
  },
  {
    title: "Stay in the CW part of the band",
    body: "Use your band plan’s CW segment (in IARU Region 1, for example, 14.000–14.070 MHz on 20 m), away from beacons and the band edge.",
  },
  {
    title: "Listen first",
    body: "Listen for a while on and around the frequency. Someone may be there whom you cannot hear at first.",
  },
  {
    title: "Ask QRL?",
    body: "Send QRL? (is this frequency in use?) once or twice and listen. If anyone answers, move on.",
  },
  {
    title: "Always identify",
    body: "Your callsign goes in every transmission. Never transmit unidentified, even for a quick test.",
  },
  {
    title: "Call, then listen",
    body: "Send your call a few times with pauses to listen. Someone may answer: a CQ is an invitation.",
  },
  {
    title: "Testing again?",
    body: "A skimmer that has spotted you ignores you for about 10 minutes: wait, or QSY 300 Hz or more between tests.",
  },
];

// Prefix, digits, suffix; special-event calls carry several digits and a
// long suffix (GB100RSGB), and optional /P-style or EA8/-style parts.
const CALL_RE = /^([A-Z0-9]{1,4}\/)?[A-Z0-9]{1,3}[0-9]{1,4}[A-Z0-9]{0,6}[A-Z](\/[A-Z0-9]{1,4})?$/;
const PLACEHOLDERS = new Set(["N0CALL", "NOCALL", "MYCALL"]);

/** A callsign-shaped string (prefix, digit, suffix; optional /P-style parts). */
export function isPlausibleCallsign(raw: string): boolean {
  const call = raw.trim().toUpperCase();
  return call.length >= 3 && call.length <= 16 && CALL_RE.test(call) && !PLACEHOLDERS.has(call);
}

/** The base call without portable parts: EA8/Q7XYZ and Q7XYZ/P → Q7XYZ (the
 * longest '/'-separated part). */
export function baseCall(raw: string): string {
  const parts = raw.trim().toUpperCase().split("/").filter(Boolean);
  return parts.reduce((best, p) => (p.length > best.length ? p : best), "");
}

/** `heard` is the same station as `call`: the base calls match, so CALL, CALL/P and
 * EA8/CALL all count, whichever form was typed. */
export function matchesOwnCall(heard: string, call: string): boolean {
  const own = baseCall(call);
  return own !== "" && baseCall(heard) === own;
}

export interface SkimmerCheck {
  id: "keyword" | "repeats" | "separated" | "steady";
  label: string;
  ok: boolean;
  detail: string;
}

const KEYWORDS = new Set(["CQ", "TEST"]);
/** Copies of the call to aim for (the RBN says skimmers may want 2–4). */
export const RBN_MIN_REPEATS = 2;
/** Largest speed drift (slowest third vs fastest third) still called steady. */
const STEADY_RATIO = 1.25;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Judge a keyed attempt against what a skimmer needs: a keyword before the
 * call, at least two clean copies of the call, the call sent as its own word
 * (not run into the word before), and one steady speed through the message.
 */
export function skimmerChecks(input: {
  call: string;
  decoded: string;
  analysis: KeyingAnalysis;
  marks: readonly KeyedMark[];
}): SkimmerCheck[] {
  const call = input.call.trim().toUpperCase();
  const tokens = input.decoded.toUpperCase().split(/\s+/).filter(Boolean);
  const firstCall = tokens.findIndex((t) => matchesOwnCall(t, call));
  const keywordAt = tokens.findIndex((t) => KEYWORDS.has(t));
  const keywordOk = keywordAt !== -1 && (firstCall === -1 || keywordAt < firstCall);
  const copies = tokens.filter((t) => matchesOwnCall(t, call)).length;
  const runTogether = tokens.filter((t) => t.includes(call) && !matchesOwnCall(t, call));
  const letterGap = input.analysis.metrics.find((m) => m.id === "letter")?.keyedUnits ?? null;
  const crowded = letterGap !== null && letterGap < 2;

  // Implied dit length of every mark; compare the first and last thirds.
  const units = input.marks.map((m) => (m.element === "dit" ? m.upAt - m.downAt : (m.upAt - m.downAt) / 3));
  const third = Math.max(1, Math.floor(units.length / 3));
  const head = median(units.slice(0, third));
  const tail = median(units.slice(-third));
  const drift = head && tail ? Math.max(head, tail) / Math.min(head, tail) : 1;
  const steady = units.length < 6 || drift <= STEADY_RATIO;
  const faster = head && tail && tail < head ? "sped up" : "slowed down";

  return [
    {
      id: "keyword",
      label: "Keyword before your call",
      ok: keywordOk,
      detail: keywordOk
        ? `The decoder heard ${tokens[keywordAt]} before your call.`
        : "No CQ or TEST was heard before your call, so a skimmer would not treat it as a CQ.",
    },
    {
      id: "repeats",
      label: "Your call, at least twice",
      ok: copies >= RBN_MIN_REPEATS,
      detail: `${copies} of ${RBN_MIN_REPEATS} clean copies of ${call} decoded.${
        copies >= RBN_MIN_REPEATS ? "" : " A skimmer may want two to four."
      }`,
    },
    {
      id: "separated",
      label: "Your call as its own word",
      ok: runTogether.length === 0 && !crowded,
      detail:
        runTogether.length > 0
          ? `Heard ${runTogether.join(", ")}: leave a full word gap before your call so the skimmer does not read it as a different callsign.`
          : crowded
            ? `Your letter gaps average ${letterGap!.toFixed(1)} dits; at under 2 letters start to merge. Aim for 3.`
            : "Clear gaps between letters and around your call.",
    },
    {
      id: "steady",
      label: "One steady speed",
      ok: steady,
      detail: steady
        ? "Your speed held steady through the message."
        : `Your speed ${faster} by about ${Math.round((drift - 1) * 100)}% through the message; skimmers copy best at one speed throughout.`,
    },
  ];
}
