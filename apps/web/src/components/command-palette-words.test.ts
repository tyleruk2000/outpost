/**
 * Fifty-odd words a household types into the quick search, and where each lands: the first
 * place offered under "Go to", read from the real navigation. `null` means no screen fits,
 * and none is offered: the words go to the library search instead.
 */
import { describe, expect, it } from "vitest";
import { everyPlace, findPlaces, placeName } from "./find-places";

const lands: Array<[string, string | null]> = [
  // The words of the walk that found nothing.
  ["wifi", "Tools: QR codes"],
  ["calibre", "Library: Import from Calibre"],
  ["compass", "Tools: Compass"],
  ["torch", null],
  ["battery", "Tools: Power and batteries"],
  ["frequency", "Radio: Frequencies to listen to"],
  ["iss", "Radio: Satellites"],
  ["band plan", "Radio: Licences and band plans"],
  ["first aid", null],
  ["dark mode", "Settings: Appearance"],
  ["print", "Maps: Print"],
  ["directions", "Maps: Plan a route"],
  ["walking directions", "Maps: Plan a route"],
  ["drive time", "Maps: Reachable from here"],
  ["driving directions", "Maps: Plan a route"],
  ["gpx", "Maps: Routes"],
  ["sunrise", "Tools: Outdoors"],
  ["food", "Preparedness: Supplies"],
  ["password", "Tools: QR codes"],
  ["update", "Settings: Updates"],
  ["usb stick update", "Settings: Updates"],
  ["sd card", "Settings: Server status"],
  ["wrong time", "Settings: Server status"],
  // Settings, section by section.
  ["backup", "Settings: Backup"],
  ["restore", "Settings: Backup"],
  ["export", "Settings: Take everything out"],
  ["take out", "Settings: Take everything out"],
  ["theme", "Settings: Appearance"],
  ["text size", "Settings: Text size"],
  ["font size", "Settings: Text size"],
  ["bigger text", "Settings: Text size"],
  ["zoom", "Settings: Text size"],
  ["feet", "Settings: Heights in metres or feet"],
  ["24-hour clock", "Settings: Appearance"],
  ["certificate", "Settings: HTTPS"],
  ["version", "Settings: This installation"],
  ["ollama", "Settings: Set-up guide"],
  ["share with phones", "Settings: Who can use it"],
  // Screens by their everyday words.
  ["water", "Tools: Water"],
  ["safe drinking water", "Tools: Water"],
  ["rationing", "Tools: Rations"],
  ["stockpile", "Tools: Rations"],
  ["weather", "Preparedness: Weather and hazards"],
  ["flood", "Preparedness: Emergency plans"],
  ["river levels", "Preparedness: Weather and hazards"],
  ["power cut", "Tools: Power and batteries"],
  ["grab bag", "Preparedness: Emergency plans"],
  ["radiation", "Preparedness: Nuclear preparedness"],
  ["shopping list", "Preparedness: Supplies"],
  ["allergies", "Preparedness: Medical sheets"],
  ["wallet card", "Preparedness: Grab cards"],
  ["binder", "Preparedness: Household book"],
  ["emergency book", "Preparedness: Household book"],
  ["roll call", "Preparedness: Check-in and roll call"],
  ["insurance", "Preparedness: Log of events"],
  ["overdue", "Preparedness: Routine checks"],
  ["offline drill", "Preparedness: Offline drill"],
  ["pace", "Preparedness: Keeping in touch"],
  ["wikipedia", "Explore"],
  ["country file", "Maps: Map data"],
  ["terrain", "Maps: Map data"],
  ["download", "Downloads and tasks"],
  ["background work", "Downloads and tasks"],
  ["disk space", "Storage"],
  ["delete", "Storage: Manage and clean up"],
  ["pages", "Notes"],
  ["notion", "Notes: Import"],
  ["phone numbers", "Contacts"],
  ["family", "Contacts"],
  ["secret message", "Encryption"],
  ["morse", "Radio: Morse trainer"],
  ["aprs", "Radio: Heard on the radio"],
  ["aircraft", "Radio: Heard on the radio"],
  ["repeater", "Radio: Repeaters"],
  ["logbook", "Radio: Contact log"],
  ["recipe", "Tools: Cooking"],
  ["generator", "Tools: Power and batteries"],
  ["hiking", "Tools: Outdoors"],
  ["sundial", "Tools: Solar clock"],
  ["printer", "Tools: Devices on this network"],
  ["concrete", "Tools: Building"],
  ["antenna", "Tools: Radio calculators"],
  ["patience", "Games: Solitaire"],
  ["checkers", "Games: Draughts"],
  ["chess", "Games: Chess"],
  ["worm", "Games: Snake"],
  ["help", "Help"],
  ["manual", "Help"],
  ["docker", "Help"],
  ["ask a question", "Chat"],
  // What was added on 17 November.
  ["message", "Messages"],
  ["check in", "Preparedness: Check-in and roll call"],
  ["audiobook", "Library"],
  ["postcode", "Maps"],
  ["river", "Preparedness: Weather and hazards"],
  ["compass", "Tools: Compass"],
  ["declination", "Tools: Compass"],
  ["garden", "Tools: Garden"],
  ["sow", "Tools: Garden"],
  ["frost", "Tools: Garden"],
  ["tide", "Tools: Tide times"],
  ["high water", "Tools: Tide times"],
  ["moon phase", "Tools: Night sky"],
  ["star chart", "Tools: Night sky"],
  ["sextant", "Tools: Celestial navigation"],
  ["allotment", "Games: Allotment"],
  ["command line", "Games: Skerry"],
  ["terminal", "Games: Skerry"],
  ["settlement", "Games: Steading"],
  ["city builder", "Games: Steading"],
  ["mesh", "Settings: Mesh radio"],
  ["calories", "Preparedness: Supplies"],
  ["caravan", "Preparedness: Households"],
  ["family members", "Preparedness: Households"],
  ["text size", "Settings: Text size"],
  ["heights", "Settings: Heights in metres or feet"],
  ["supermarket", "Maps: Layers"],
  ["shop", "Maps: Layers"],
  ["pharmacy", "Maps: Layers"],
  ["drinking water", "Maps: Layers"],
  // The Help section.
  // A guide by its own name comes first; Help, with every guide, is offered next (below).
  ["guide", "Settings: Set-up guide"],
  ["raspberry pi", "Help"],
  ["docker", "Help"],
];

describe("the quick search's places, for the words people use", () => {
  it.each(lands)("“%s” lands on %s", (typed, expected) => {
    const found = findPlaces(typed);
    expect(found[0] ? placeName(found[0]) : null).toBe(expected);
  });

  it("checks at least fifty words", () => {
    expect(lands.length).toBeGreaterThanOrEqual(50);
  });

  it("offers every section of Settings, each at its own address on the Settings screen", () => {
    const sections = everyPlace.filter((place) => place.section && place.parent?.to === "/settings");
    expect(sections.length).toBeGreaterThanOrEqual(13);
    for (const section of sections) expect(section.to).toMatch(/^\/settings#[a-z-]+$/);
    expect(findPlaces("backup").map((place) => place.to)).toEqual(
      expect.arrayContaining(["/settings#backup", "/settings#automatic-backups"]),
    );
  });

  it("lists the Settings screen for “settings”, not each of its sections as well", () => {
    expect(findPlaces("settings").map(placeName)).toEqual(["Settings", "Settings: Server status", "Settings: Set-up guide"]);
  });

  it("offers Help, where every guide is, for “guide”", () => {
    expect(findPlaces("guide").map(placeName).slice(0, 2)).toEqual(["Settings: Set-up guide", "Help"]);
  });

  it("opens a tab of Maps by its words, at an address the Maps screen reads", () => {
    expect(findPlaces("supermarket")[0]?.to).toBe("/maps?tab=layers");
    // Road route and printing open the tool itself, not only its tab.
    expect(findPlaces("directions")[0]?.to).toBe("/maps?tab=routes&road=1");
    expect(findPlaces("print")[0]?.to).toBe("/maps?print=1");
    expect(findPlaces("reachable")[0]?.to).toBe("/maps?reach=1");
    // "maps" alone is the Maps screen, not each of its tabs as well.
    expect(findPlaces("maps").map(placeName)).not.toContain("Maps: Layers");
  });

  it("finds a screen by its own name before one that only mentions the word", () => {
    expect(findPlaces("download").map(placeName).slice(0, 3)).toEqual(["Downloads and tasks", "Settings: Downloads", "Explore"]);
  });

  it("leaves out the small words of a question, but not when they are all there is", () => {
    expect(placeName(findPlaces("how do I make water safe")[0]!)).toBe("Tools: Water");
    expect(findPlaces("the").length).toBeGreaterThanOrEqual(0);
  });
});
