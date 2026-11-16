/**
 * QSO simulator: a made-up station for turn-based CW
 * conversation practice. Pure and seeded: the same seed produces the same
 * station and script, so tests are exact.
 *
 * The NPC runs a standard exchange (CQ → answer → RST/name/QTH → 73) and
 * reacts to what the user's keying actually decoded to:
 *  - `QRS` → slows down (and says "QRS OK")   - `QRQ` → speeds up
 *  - `AGN` / `?` alone → repeats the last over
 *  - the user busting its callsign → corrects them ("DE <call> <call>")
 *  - `73` / `<SK>` → wraps up
 * Intent parsing is deliberately forgiving: real decoded copy is ragged.
 */
import { seededRandom } from "./drills.ts";

export type QsoLevel = "beginner" | "intermediate" | "advanced";

export interface QsoStation {
  call: string;
  name: string;
  qth: string;
  rstGiven: string;
}

export interface QsoTurn {
  from: "npc" | "user";
  text: string;
  /** what phase produced this over */
  phase: QsoPhase;
}

export type QsoPhase = "cq" | "exchange" | "final" | "done";

export interface QsoScorecard {
  /** did the user's first reply include a recognisable callsign? */
  answeredCall: boolean;
  /** did the user copy the NPC call correctly at least once? */
  copiedNpcCall: boolean;
  sentRst: boolean;
  sentName: boolean;
  signedOff: boolean;
  /** repeats the user needed */
  repeatsAsked: number;
  /** 0–1 overall */
  score: number;
}

export interface QsoSimConfig {
  /** the learner's callsign, as they intend to send it */
  userCall: string;
  level: QsoLevel;
  seed: number;
  /** weak characters to weave into the NPC's identity where possible */
  weakChars?: readonly string[];
}

export const LEVEL_SPEEDS: Record<QsoLevel, { charWpm: number; effWpm: number }> = {
  beginner: { charWpm: 15, effWpm: 6 },
  intermediate: { charWpm: 18, effWpm: 12 },
  advanced: { charWpm: 24, effWpm: 20 },
};

// Made up: no administration issues calls that start with Q, which the ITU keeps for the Q code.
const NPC_CALLS = [
  "Q4RTF",
  "Q0XKQ",
  "Q2YBZ",
  "Q5NWJ",
  "Q1DVX",
  "Q5CPK",
  "Q4UHL",
  "Q3GWB",
  "Q0MJR",
  "Q7DKC",
  "Q9FTW",
  "Q7LQY",
  "Q2BND",
  "Q6HVG",
  "Q1QSZ",
  "Q2TKM",
];
const NPC_NAMES = ["JAN", "KURT", "PETR", "MARC", "LARS", "IVAN", "HANS", "ERIK", "PAUL", "JOSE"];
const NPC_QTHS = ["LEEDS", "PRAHA", "MALMO", "GENT", "KIEL", "BREST", "TURKU", "SPLIT", "CORK", "LODZ"];

function pickWeighted<T extends string>(rnd: () => number, pool: readonly T[], weakChars: readonly string[]): T {
  if (weakChars.length > 0) {
    const containing = pool.filter((p) => weakChars.some((c) => p.includes(c)));
    if (containing.length > 0 && rnd() < 0.7) {
      return containing[Math.floor(rnd() * containing.length)]!;
    }
  }
  return pool[Math.floor(rnd() * pool.length)]!;
}

/** Normalise decoded copy for intent matching: strip '?' noise, upper, spaces. */
function words(text: string): string[] {
  return text
    .toUpperCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

const CALL_RE = /^[A-Z0-9]{1,3}\d[A-Z0-9]{0,4}[A-Z]$/;

export class QsoSimulator {
  readonly station: QsoStation;
  readonly level: QsoLevel;
  private userCall: string;
  private phase: QsoPhase = "cq";
  private turns: QsoTurn[] = [];
  private lastNpcText = "";
  private repeats = 0;
  private slowedBy = 0;
  private card = {
    answeredCall: false,
    copiedNpcCall: false,
    sentRst: false,
    sentName: false,
    signedOff: false,
  };

  constructor(config: QsoSimConfig) {
    const rnd = seededRandom(config.seed);
    const weak = config.weakChars ?? [];
    this.station = {
      call: pickWeighted(rnd, NPC_CALLS, weak),
      name: pickWeighted(rnd, NPC_NAMES, weak),
      qth: pickWeighted(rnd, NPC_QTHS, weak),
      rstGiven: ["599", "579", "569", "559"][Math.floor(rnd() * 4)]!,
    };
    this.level = config.level;
    this.userCall = config.userCall.toUpperCase().trim();
  }

  get currentPhase(): QsoPhase {
    return this.phase;
  }

  get log(): readonly QsoTurn[] {
    return this.turns;
  }

  get done(): boolean {
    return this.phase === "done";
  }

  /** wpm reduction the user has asked for via QRS (units of 2 wpm) */
  get qrsWpmReduction(): number {
    return this.slowedBy;
  }

  /** The NPC's opening over. Call once to start. */
  start(): string {
    const text = `CQ CQ CQ DE ${this.station.call} ${this.station.call} K`;
    return this.say(text, "cq");
  }

  /**
   * Feed the user's over (as decoded from their keying) and get the NPC's
   * reply. Returns null when the QSO has ended and there is nothing to send.
   */
  reply(userText: string): string | null {
    if (this.phase === "done") return null;
    const w = words(userText);
    this.turns.push({ from: "user", text: userText.toUpperCase().trim(), phase: this.phase });

    // -- universal intents -------------------------------------------------
    if (w.includes("QRS")) {
      this.slowedBy = Math.min(this.slowedBy + 2, 10);
      return this.say(`QRS OK ${this.lastOrNothing()}`, this.phase);
    }
    if (w.includes("QRQ")) {
      this.slowedBy = Math.max(this.slowedBy - 2, 0);
      return this.say(`QRQ OK ${this.lastOrNothing()}`, this.phase);
    }
    if (w.includes("AGN") || (w.length === 1 && w[0] === "?")) {
      this.repeats += 1;
      return this.say(this.lastNpcText, this.phase);
    }
    if (w.includes("73") || w.includes("<SK>") || w.includes("SK")) {
      this.card.signedOff = true;
      if (this.phase === "final") {
        // they returned our 73 — answer with the classic dit-dit and clear
        const out = this.say("E E", "done");
        this.phase = "done";
        return out;
      }
      const text = `73 ES GUD DX ${this.userHandle()} DE ${this.station.call} <SK>`;
      const out = this.say(text, "final");
      this.phase = "done";
      return out;
    }

    // -- phase flow --------------------------------------------------------
    if (this.phase === "cq") {
      const foundCall = w.find((x) => CALL_RE.test(x) && x !== this.station.call);
      if (this.mentionsNpcCall(w)) this.card.copiedNpcCall = true;
      if (foundCall) {
        this.card.answeredCall = true;
        // the NPC answers the call it HEARD — a bust teaches accurate sending
        this.userCall = foundCall;
        const s = this.station;
        const text =
          this.level === "beginner"
            ? `${foundCall} DE ${s.call} GM UR RST ${s.rstGiven} ${s.rstGiven} = NAME ${s.name} ${s.name} = HW? ${foundCall} DE ${s.call} KN`
            : `${foundCall} DE ${s.call} GM ES TNX FER CALL = UR RST ${s.rstGiven} ${s.rstGiven} = NAME ${s.name} ${s.name} QTH ${s.qth} ${s.qth} = HW CPY? ${foundCall} DE ${s.call} KN`;
        this.phase = "exchange";
        return this.say(text, "exchange");
      }
      // heard something that wasn't a call — ask again
      this.repeats += 1;
      return this.say(`QRZ? DE ${this.station.call} K`, "cq");
    }

    if (this.phase === "exchange") {
      if (w.some((x) => /^[1-5][1-9N][1-9N]$/.test(x))) this.card.sentRst = true;
      if (w.includes("NAME") || w.includes("OP")) this.card.sentName = true;
      if (this.mentionsNpcCall(w)) {
        this.card.copiedNpcCall = true;
      } else if (w.some((x) => CALL_RE.test(x) && x !== this.userCall)) {
        // they addressed a busted version of the NPC call — correct them
        return this.say(`DE ${this.station.call} ${this.station.call} <AR>`, "exchange");
      }
      const s = this.station;
      const text = `R R FB ${this.userHandle()} TNX FER FB QSO = 73 ${this.userHandle()} DE ${s.call} <SK>`;
      this.phase = "final";
      return this.say(text, "final");
    }

    // final phase: anything from the user ends it politely
    this.card.signedOff = this.card.signedOff || w.includes("73") || w.includes("SK");
    this.phase = "done";
    return null;
  }

  scorecard(): QsoScorecard {
    const parts = [this.card.answeredCall, this.card.copiedNpcCall, this.card.sentRst, this.card.sentName, this.card.signedOff];
    const score = parts.filter(Boolean).length / parts.length;
    return { ...this.card, repeatsAsked: this.repeats, score };
  }

  private say(text: string, phase: QsoPhase): string {
    this.lastNpcText = text;
    this.turns.push({ from: "npc", text, phase });
    return text;
  }

  private lastOrNothing(): string {
    return this.lastNpcText;
  }

  private userHandle(): string {
    return this.userCall || "OM";
  }

  private mentionsNpcCall(w: string[]): boolean {
    return w.includes(this.station.call);
  }
}
