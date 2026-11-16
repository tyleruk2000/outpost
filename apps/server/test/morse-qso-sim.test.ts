import { LEVEL_SPEEDS, QsoSimulator } from "@outpost/shared";
import { describe, expect, it } from "vitest";

const make = (over: Partial<ConstructorParameters<typeof QsoSimulator>[0]> = {}) =>
  new QsoSimulator({ userCall: "Q7XYZ", level: "beginner", seed: 42, ...over });

describe("qso simulator", () => {
  it("is deterministic for a seed", () => {
    const a = make();
    const b = make();
    expect(a.station).toEqual(b.station);
    expect(a.start()).toBe(b.start());
  });

  it("opens with a CQ call carrying its own callsign", () => {
    const sim = make();
    const cq = sim.start();
    expect(cq).toMatch(/^CQ CQ CQ DE /);
    expect(cq).toContain(sim.station.call);
    expect(cq.endsWith("K")).toBe(true);
  });

  it("runs a full exchange to completion", () => {
    const sim = make();
    sim.start();
    const answer = sim.reply(`${sim.station.call} DE Q7XYZ Q7XYZ K`);
    expect(answer).toContain("Q7XYZ DE");
    expect(answer).toContain(sim.station.rstGiven);
    expect(answer).toContain(sim.station.name);
    expect(sim.currentPhase).toBe("exchange");
    const final = sim.reply(`R R UR RST 599 599 = NAME TYLER = ${sim.station.call} DE Q7XYZ KN`);
    expect(final).toContain("73");
    expect(sim.currentPhase).toBe("final");
    // returning their 73 draws the classic dit-dit
    const didit = sim.reply("73 <SK>");
    expect(didit).toBe("E E");
    expect(sim.currentPhase).toBe("done");
    const card = sim.scorecard();
    expect(card.answeredCall).toBe(true);
    expect(card.copiedNpcCall).toBe(true);
    expect(card.sentRst).toBe(true);
    expect(card.sentName).toBe(true);
    expect(card.score).toBeGreaterThan(0.7);
  });

  it("replies to the callsign it actually heard (busted user call)", () => {
    const sim = make();
    sim.start();
    const answer = sim.reply(`${sim.station.call} DE Q7XYK Q7XYK K`); // bust: K not L
    expect(answer).toContain("Q7XYK DE");
  });

  it("asks QRZ? when the answer contains no callsign", () => {
    const sim = make();
    sim.start();
    const r = sim.reply("??? E T");
    expect(r).toContain("QRZ?");
    expect(sim.currentPhase).toBe("cq");
    expect(sim.scorecard().repeatsAsked).toBe(1);
  });

  it("QRS slows the station down (and QRQ speeds it back up)", () => {
    const sim = make();
    sim.start();
    expect(sim.qrsWpmReduction).toBe(0);
    const r = sim.reply("QRS QRS");
    expect(r).toContain("QRS OK");
    expect(sim.qrsWpmReduction).toBe(2);
    sim.reply("QRS");
    expect(sim.qrsWpmReduction).toBe(4);
    sim.reply("QRQ");
    expect(sim.qrsWpmReduction).toBe(2);
  });

  it("AGN repeats the last over verbatim", () => {
    const sim = make();
    const cq = sim.start();
    const again = sim.reply("AGN");
    expect(again).toBe(cq);
    expect(sim.scorecard().repeatsAsked).toBe(1);
  });

  it("corrects a busted copy of its own call during the exchange", () => {
    const sim = make();
    sim.start();
    sim.reply(`${sim.station.call} DE Q7XYZ K`);
    // user addresses a wrong call (not the NPC's)
    const r = sim.reply("Q0XXX DE Q7XYZ UR 599 KN");
    expect(r).toContain(`DE ${sim.station.call} ${sim.station.call}`);
    expect(sim.currentPhase).toBe("exchange"); // still waiting
  });

  it("73 ends the QSO from any phase", () => {
    const sim = make();
    sim.start();
    const r = sim.reply("73 <SK>");
    expect(r).toContain("73");
    expect(sim.done).toBe(true);
    expect(sim.scorecard().signedOff).toBe(true);
  });

  it("weaves weak characters into the station identity when possible", () => {
    // 'Z' appears in some NPC calls; with weak char Z the pick prefers those
    let hits = 0;
    for (let seed = 0; seed < 30; seed++) {
      const sim = new QsoSimulator({
        userCall: "Q7XYZ",
        level: "beginner",
        seed,
        weakChars: ["Z"],
      });
      const idents = sim.station.call + sim.station.name + sim.station.qth;
      if (idents.includes("Z")) hits++;
    }
    expect(hits).toBeGreaterThan(10);
  });

  it("level speeds are sensible and ordered", () => {
    expect(LEVEL_SPEEDS.beginner.effWpm).toBeLessThan(LEVEL_SPEEDS.intermediate.effWpm);
    expect(LEVEL_SPEEDS.intermediate.effWpm).toBeLessThan(LEVEL_SPEEDS.advanced.effWpm);
  });
});
