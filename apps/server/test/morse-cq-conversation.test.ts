import { buildCqConversation, CQ_CONVERSATION_DEFINITIONS } from "@outpost/shared";
import { describe, expect, it } from "vitest";

const context = {
  myCall: "q7xyz",
  myName: "tyler",
  myQth: "northampton",
  otherCall: "q4rtf",
};

describe("guided CQ conversations", () => {
  it("offers standard, SOTA and POTA drills", () => {
    expect(CQ_CONVERSATION_DEFINITIONS.map((item) => item.id)).toEqual(["standard", "sota", "pota"]);
  });

  it("builds a complete standard CQ, exchange and sign-off", () => {
    const drill = buildCqConversation("standard", context);
    expect(drill.stages).toHaveLength(3);
    expect(drill.stages[0]?.target).toBe("CQ CQ CQ DE Q7XYZ Q7XYZ K");
    expect(drill.stages[1]?.incoming).toContain("Q4RTF");
    expect(drill.stages[1]?.target).toContain("NAME TYLER TYLER");
    expect(drill.stages[1]?.target).toContain("QTH NORTHAMPTON NORTHAMPTON");
    expect(drill.stages[2]?.target).toContain("<SK>");
  });

  it("teaches a portable SOTA exchange with a summit reference", () => {
    const drill = buildCqConversation("sota", { ...context, reference: "g/ld-001" });
    expect(drill.stages[0]?.target).toContain("CQ SOTA");
    expect(drill.stages[0]?.target).toContain("Q7XYZ/P");
    expect(drill.stages[1]?.target).toContain("REF G/LD-001 G/LD-001");
    expect(drill.stages[2]?.target.endsWith("K")).toBe(true);
  });

  it("teaches the optional POTA reference and returns to the pile-up with QRZ", () => {
    const drill = buildCqConversation("pota", { ...context, reference: "gb-0099" });
    expect(drill.stages[0]?.target).toContain("CQ POTA");
    expect(drill.stages[1]?.target).toContain("REF GB-0099 GB-0099");
    expect(drill.stages[1]?.guidance).toContain("no mandatory formal exchange");
    expect(drill.stages[2]?.target.endsWith("QRZ?")).toBe(true);
  });

  it("does not append a second portable suffix", () => {
    const drill = buildCqConversation("sota", { ...context, myCall: "Q7XYZ/P" });
    expect(drill.stages[0]?.target).not.toContain("/P/P");
  });
});
