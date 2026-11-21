import { afterEach, describe, expect, it } from "vitest";
import { guessEmergencyNumber, templatesWhereLine } from "@/features/emergency-plans/words";
import {
  appLocale,
  deviceRegion,
  isUkRegion,
  likelyHeightUnit,
  likelyPaperFor,
  likelyTemperatureUnit,
  likelyWindUnit,
  regionOfLanguage,
  setDeviceRegion,
} from "./region";
import { formatDate } from "./utils";

afterEach(() => setDeviceRegion("GB"));

const DAY = Date.UTC(2026, 10, 21, 12);

describe("the device's region", () => {
  it("is read from the browser's language", () => {
    expect(regionOfLanguage("en-GB")).toBe("GB");
    expect(regionOfLanguage("de-DE")).toBe("DE");
    expect(regionOfLanguage("pt_br")).toBe("BR");
    expect(regionOfLanguage("zh-Hans-CN")).toBe("CN");
    expect(regionOfLanguage("fr")).toBeNull();
    expect(regionOfLanguage(undefined)).toBeNull();
  });

  it("writes dates in English as that region does, and as Britain does when it names none", () => {
    setDeviceRegion("GB");
    expect(appLocale()).toBe("en-GB");
    expect(formatDate(DAY)).toBe("21 Nov 2026");
    setDeviceRegion("US");
    expect(appLocale()).toBe("en-US");
    expect(formatDate(DAY)).toBe("Nov 21, 2026");
    setDeviceRegion(null);
    expect(deviceRegion()).toBeNull();
    expect(appLocale()).toBe("en-GB");
    expect(formatDate(DAY)).toBe("21 Nov 2026");
  });

  it("chooses the first units and paper, each changeable on its screen", () => {
    expect([likelyTemperatureUnit("US"), likelyWindUnit("US"), likelyHeightUnit("US"), likelyPaperFor("US")]).toEqual([
      "f",
      "mph",
      "ft",
      "letter",
    ]);
    expect([likelyTemperatureUnit("GB"), likelyWindUnit("GB"), likelyHeightUnit("GB"), likelyPaperFor("GB")]).toEqual([
      "c",
      "mph",
      "m",
      "a4",
    ]);
    expect([likelyTemperatureUnit("DE"), likelyWindUnit("DE"), likelyHeightUnit("DE"), likelyPaperFor("DE")]).toEqual([
      "c",
      "kmh",
      "m",
      "a4",
    ]);
    expect([likelyTemperatureUnit(null), likelyWindUnit(null), likelyHeightUnit(null), likelyPaperFor(null)]).toEqual([
      "c",
      "kmh",
      "m",
      "a4",
    ]);
    setDeviceRegion("US");
    expect(likelyTemperatureUnit()).toBe("f");
  });

  it("knows the United Kingdom and the Crown Dependencies", () => {
    expect(["GB", "uk", "JE", "IM", "GG"].every(isUkRegion)).toBe(true);
    expect(isUkRegion("IE")).toBe(false);
    expect(isUkRegion(null)).toBe(false);
  });
});

describe("the emergency number offered first", () => {
  it("is Home's country's, then the device's, then 112", () => {
    expect(guessEmergencyNumber("en-GB", "US")).toBe("911");
    expect(guessEmergencyNumber("en-US", null)).toBe("911");
    setDeviceRegion("NZ");
    expect(guessEmergencyNumber()).toBe("111");
    expect(guessEmergencyNumber(undefined, "AU")).toBe("000");
    setDeviceRegion(null);
    expect(guessEmergencyNumber()).toBe("112");
    expect(guessEmergencyNumber(undefined, "ZZ")).toBe("112");
  });
});

describe("what a new plan says about its templates", () => {
  it("says nothing in the UK and plainly that they are UK guidance elsewhere", () => {
    expect(templatesWhereLine({ code: "GB", name: "United Kingdom" })).toBeNull();
    expect(templatesWhereLine(null, "GB")).toBeNull();
    expect(templatesWhereLine({ code: "DE", name: "Germany" }, "GB")).toMatch(
      /^Home is in Germany: the templates are drawn mostly from UK guidance/,
    );
    expect(templatesWhereLine(null, "US")).toMatch(/^The templates are drawn mostly from UK guidance/);
    expect(templatesWhereLine(null, null)).toContain("Outpost has no templates from your own country's government");
  });
});
