/** What goes inside each kind of code. Every name, number and network here is made up. */
import { emptyContactFields } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { describe as describeContent, missing, printAdvice, webAddress } from "./content";
import { encodeQr } from "./encoder";
import { escapeVcard, escapeWifi, geoPayload, mailtoPayload, telPayload, vcardPayload, wifiPayload } from "./payloads";
import { contactChoices, contactFromChoices, usualChoices } from "./qr-forms";

describe("Wi-Fi", () => {
  it("escapes the five characters ZXing's page names, and nothing else", () => {
    expect(escapeWifi(`a\\b;c,d"e:f g'h`)).toBe(`a\\\\b\\;c\\,d\\"e\\:f g'h`);
    // The page's own example: an SSID of "foo;bar\baz" in quotes.
    expect(`WIFI:S:${escapeWifi('"foo;bar\\baz"')};;`).toBe('WIFI:S:\\"foo\\;bar\\\\baz\\";;');
  });

  it("writes the fields a phone reads", () => {
    expect(wifiPayload({ ssid: "Hut", security: "WPA", password: "correct horse", hidden: false })).toBe(
      "WIFI:T:WPA;S:Hut;P:correct horse;;",
    );
    expect(wifiPayload({ ssid: "Barn; upstairs", security: "WPA", password: "a:b", hidden: true })).toBe(
      "WIFI:T:WPA;S:Barn\\; upstairs;P:a\\:b;H:true;;",
    );
    expect(wifiPayload({ ssid: "Café", security: "nopass", password: "ignored", hidden: false })).toBe("WIFI:T:nopass;S:Café;;");
    expect(wifiPayload({ ssid: "Old", security: "WEP", password: "12345", hidden: false })).toBe("WIFI:T:WEP;S:Old;P:12345;;");
  });

  it("does not write the password in words unless asked", () => {
    const content = { kind: "wifi" as const, wifi: { ssid: "Hut", security: "WPA" as const, password: "s3cret", hidden: false } };
    const quiet = describeContent(content, { showPassword: false });
    expect(JSON.stringify(quiet.lines)).not.toContain("s3cret");
    expect(quiet.title).toBe("Wi-Fi code for Hut");
    expect(quiet.payload).toContain("P:s3cret");
    expect(describeContent(content, { showPassword: true }).lines).toContainEqual({ label: "Password", value: "s3cret" });
  });

  it("says what is missing", () => {
    expect(missing({ kind: "wifi", wifi: { ssid: "", security: "WPA", password: "", hidden: false } })).toMatch(/network’s name/);
    expect(missing({ kind: "wifi", wifi: { ssid: "Hut", security: "WPA", password: "", hidden: false } })).toMatch(/password/);
    expect(missing({ kind: "wifi", wifi: { ssid: "Hut", security: "nopass", password: "", hidden: false } })).toBeNull();
  });
});

describe("contacts", () => {
  it("escapes as Outpost's own vCard writer does", () => {
    expect(escapeVcard("a\\b,c;d\r\ne")).toBe("a\\\\b\\,c\\;d\\ne");
  });

  it("writes a small vCard 3.0 of the fields given", () => {
    const card = vcardPayload({
      fullName: "Maya Okafor",
      given: "Maya",
      family: "Okafor",
      organisation: "Keswick MRT",
      title: "",
      phones: [{ value: "+44 7700 900123", label: "mobile" }],
      emails: [{ value: "maya@okafor.example", label: "work" }],
      addresses: [{ value: "4 Mill Lane, Keswick", label: "home" }],
      links: [],
      note: "Has a key; ask first",
    });
    expect(card.split("\r\n")).toEqual([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Okafor;Maya;;;",
      "FN:Maya Okafor",
      "ORG:Keswick MRT",
      "TEL;TYPE=CELL:+44 7700 900123",
      "EMAIL;TYPE=WORK:maya@okafor.example",
      "ADR;TYPE=HOME:;;4 Mill Lane\\, Keswick;;;;",
      "NOTE:Has a key\\; ask first",
      "END:VCARD",
    ]);
  });

  it("offers each field of a contact and starts with a number and an email", () => {
    const contact = {
      ...emptyContactFields(),
      id: "c1",
      displayName: "Maya Okafor",
      name: { prefix: "", given: "Maya", additional: "", family: "Okafor", suffix: "" },
      organisation: "Keswick MRT",
      phones: [
        { value: "+44 7700 900123", label: "mobile" },
        { value: "01632 960000", label: "home" },
      ],
      emails: [{ value: "maya@okafor.example", label: "" }],
      addresses: [{ label: "home", street: "4 Mill Lane", locality: "Keswick", region: "", postcode: "CA12 4AB", country: "" }],
      note: "A note",
      place: null,
      pages: [],
      otherFields: [],
      source: "manual" as const,
      createdAt: 0,
      updatedAt: 0,
    };
    const choices = contactChoices(contact);
    expect(choices.map((choice) => choice.id)).toEqual(["org", "tel-0", "tel-1", "email-0", "adr-0", "note"]);
    const usual = usualChoices(choices);
    expect([...usual]).toEqual(["tel-0", "email-0"]);
    const small = contactFromChoices(contact, usual);
    expect(small.phones).toEqual([{ value: "+44 7700 900123", label: "mobile" }]);
    expect(small.addresses).toEqual([]);
    expect(small.note).toBe("");
    const all = contactFromChoices(contact, new Set(choices.map((choice) => choice.id)));
    expect(all.addresses[0]!.value).toContain("Keswick");
    // Fewer fields, a smaller code.
    expect(encodeQr(vcardPayload(small)).version).toBeLessThan(encodeQr(vcardPayload(all)).version);
  });
});

describe("the small ones", () => {
  it("writes tel:, mailto: and geo:", () => {
    expect(telPayload("+44 (0)17687 72645")).toBe("tel:+441768772645");
    expect(mailtoPayload(" hut@example.org ")).toBe("mailto:hut@example.org");
    expect(geoPayload(54.6009, -3.13742)).toBe("geo:54.600900,-3.137420");
  });

  it("tells a web address from text", () => {
    expect(webAddress("https://example.org/path")?.host).toBe("example.org");
    expect(webAddress("javascript:alert(1)")).toBeNull();
    expect(webAddress("see https://example.org")).toBeNull();
  });

  it("gives the print size by the rule of thumb", () => {
    const advice = printAdvice(encodeQr("HELLO"));
    expect(advice.minimumCm).toBe(5);
    expect(advice.sentence).toMatch(/rule of thumb/);
  });
});
