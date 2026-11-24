import { afterEach, describe, expect, it } from "vitest";
import { guessEmergencyNumber, templatesFor, templatesWhereLine } from "@/features/emergency-plans/words";
import { rootTopicHint, suggestedRoot } from "@/features/mesh/root-topic";
import { energyTableLine } from "@/features/supplies/household-view";
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
  it("is Home's country's, else the device's, and never a guess", () => {
    expect(guessEmergencyNumber("en-GB", "US")).toBe("911");
    expect(guessEmergencyNumber("en-US", null)).toBe("911");
    setDeviceRegion("NZ");
    expect(guessEmergencyNumber()).toBe("111");
    expect(guessEmergencyNumber(undefined, "AU")).toBe("000");
    expect(guessEmergencyNumber(undefined, "CA")).toBe("911");
    // A home in a country Outpost has no source for is not given the device's number, nor 112.
    expect(guessEmergencyNumber(undefined, "BR")).toBe("");
    setDeviceRegion(null);
    expect(guessEmergencyNumber()).toBe("");
    expect(guessEmergencyNumber(undefined, "ZZ")).toBe("");
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

describe("templates from the household's own government", () => {
  it("lists them first and says whose they are, in Australia and the Netherlands", () => {
    expect(
      templatesFor({ code: "AU" })
        .slice(0, 2)
        .map((template) => template.id),
    ).toEqual(["qld-evacuate", "qld-storm"]);
    expect(templatesFor(null, "NL")[0]!.id).toBe("nl-72-hours");
    expect(templatesFor(null, "GB")[0]!.id).toBe("power-cut");
    expect(templatesWhereLine({ code: "AU", name: "Australia" })).toMatch(
      /^Home is in Australia: the first 2 templates are from the Queensland Government, Australia \(Leaving home \(Queensland\), Storm or cyclone \(Queensland\)\)\./,
    );
    expect(templatesWhereLine(null, "NL")).toMatch(/^The first template is from the Government of the Netherlands/);
  });
});

describe("a Meshtastic radio's root topic", () => {
  it("starts on the region Meshtastic's table gives Home's country, else the device's, else none", () => {
    expect(suggestedRoot({ code: "US" }, "GB")).toBe("msh/US");
    expect(suggestedRoot(null, "NZ")).toBe("msh/ANZ");
    expect(suggestedRoot(null, "DE")).toBe("msh/EU_868");
    expect(suggestedRoot(null, "ZZ")).toBeNull();
    expect(rootTopicHint({ code: "IN", name: "India" }, "GB")).toBe(
      "As set on the radio. Home is in India: Meshtastic's table of regions by country gives IN, so a radio with none set uses msh/IN.",
    );
    expect(rootTopicHint(null, null)).toMatch(/^As set on the radio. A radio with none set uses msh\//);
  });
});

describe("the energy table Supplies works to", () => {
  it("says which table, and why", () => {
    expect(energyTableLine("home", { table: "uk", country: "GB" }, "United Kingdom")).toBe(
      "Home is in United Kingdom: the UK's figures (Public Health England) are used.",
    );
    expect(energyTableLine("home", { table: "international", country: null })).toMatch(/^No saved place has the home icon/);
    expect(energyTableLine("uk", undefined)).toMatch(/^The UK's figures/);
  });
});
