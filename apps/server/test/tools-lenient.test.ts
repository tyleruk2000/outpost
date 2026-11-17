import { describe, expect, it } from "vitest";
import { lenient } from "../src/modules/tools/index.ts";

const schema = {
  type: "object",
  properties: { kind: { type: "string" }, count: { type: "integer" }, radius_km: { type: "number" }, near: { type: "string" } },
  required: ["kind"],
};

describe("what a small model sends, made to fit", () => {
  it("reads numbers written as digits where the schema asks for numbers, as llama3.2:3b sent them", () => {
    expect(lenient({ kind: "supermarket", count: "3", radius_km: " 2.5 " }, schema)).toEqual({ kind: "supermarket", count: 3, radius_km: 2.5 });
  });

  it("leaves out empty or null optional arguments, and keeps a required one for the schema to refuse", () => {
    expect(lenient({ kind: "", near: "", count: null }, schema)).toEqual({ kind: "" });
  });

  it("changes nothing else: words stay words, and a string where a string is wanted stays a string", () => {
    expect(lenient({ kind: "12", count: "three" }, schema)).toEqual({ kind: "12", count: "three" });
    expect(lenient("not an object", schema)).toBe("not an object");
  });
});
