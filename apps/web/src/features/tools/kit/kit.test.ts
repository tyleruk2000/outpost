import { describe, expect, it } from "vitest";
import { formatDuration, formatFigure, formatRange, roughMinutes, roundSignificant } from "./format";
import { readNumber } from "./read-number";
import { celsius, convert, fahrenheit, ft, kg, lb, litre, ukGallon, usGallon } from "./units";

describe("reading a typed figure", () => {
  it("accepts plain figures, grouped thousands and a typed minus sign", () => {
    expect(readNumber("12.5")).toEqual({ ok: true, value: 12.5 });
    expect(readNumber(" 1,250 ")).toEqual({ ok: true, value: 1250 });
    expect(readNumber("−4")).toEqual({ ok: true, value: -4 });
    expect(readNumber(".5")).toEqual({ ok: true, value: 0.5 });
  });

  it("says what is wrong, in words", () => {
    expect(readNumber("")).toEqual({ ok: false, error: "Type a figure." });
    expect(readNumber("abc")).toEqual({ ok: false, error: "Type a figure in numbers, such as 12.5." });
    expect(readNumber("1,5")).toEqual({ ok: false, error: "Use a point for decimals, such as 12.5." });
    expect(readNumber("2.5", { integer: true })).toEqual({ ok: false, error: "Type a whole number." });
    expect(readNumber("0", { above: 0 })).toEqual({ ok: false, error: "Must be more than 0." });
  });

  it("says a limit back in the unit the person chose, with the reason for it", () => {
    // The limit is in metres; the person is typing feet.
    expect(readNumber("40000", { max: 9000, reason: "the formula holds only that far" }, ft)).toEqual({
      ok: false,
      error: "Must be no more than 29,530 ft: the formula holds only that far.",
    });
    expect(readNumber("100", {}, ft)).toEqual({ ok: true, value: 30.48 });
  });
});

describe("writing figures", () => {
  it("groups thousands, drops trailing zeros and rounds to what is asked", () => {
    expect(formatFigure(1234.56)).toBe("1,234.6");
    expect(formatFigure(2, { decimals: 2 })).toBe("2");
    expect(formatFigure(-0.04)).toBe("0");
    expect(roundSignificant(1234, 2)).toBe(1200);
    expect(formatFigure(0.012345, { decimals: 4, significant: 2 })).toBe("0.012");
  });

  it("writes durations and ranges as people say them", () => {
    expect(formatDuration(155)).toBe("2 hours 35 minutes");
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(0)).toBe("0 minutes");
    expect(formatDuration(24 * 60 + 1)).toBe("1 day 1 minute");
    expect(formatRange(2.5, 3, "litres")).toBe("2.5 to 3 litres");
    expect(formatRange(3, 3, "litres")).toBe("3 litres");
  });

  it("rounds a time worked out from rough figures to about two figures, never to the minute", () => {
    expect(roughMinutes(23)).toBe(25);
    expect(roughMinutes(118)).toBe(120);
    expect(roughMinutes(204)).toBe(210);
    expect(roughMinutes(12 * 60 + 33)).toBe(13 * 60);
    expect(roughMinutes(4 * 24 * 60 + 5 * 60)).toBe(4 * 24 * 60 + 6 * 60);
    expect(roughMinutes(0)).toBe(0);
    expect(formatDuration(roughMinutes(12.549 * 60))).toBe("13 hours");
  });
});

describe("units", () => {
  it("follow the legal definitions", () => {
    expect(convert(1, ukGallon, litre)).toBe(4.54609);
    expect(convert(1, usGallon, litre)).toBeCloseTo(3.785411784, 9);
    expect(convert(1, lb, kg)).toBe(0.45359237);
    expect(convert(100, celsius, fahrenheit)).toBe(212);
    expect(convert(-40, fahrenheit, celsius)).toBe(-40);
  });
});
