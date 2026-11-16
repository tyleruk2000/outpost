/**
 * Reading and writing vCard files. Every person and number here is made up: the
 * numbers are from the ranges set aside for drama (UK 07700 900xxx, US 555-01xx) and
 * the email addresses are at example domains.
 */
import { emptyContactFields } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { cardLines, contactFromCard, contactFromPicked, otherFieldsOf, vcardOf } from "../src/modules/contacts/card.ts";
import { foldLine, parseVcards, VCARD_LIMITS, VcardError } from "../src/modules/contacts/vcard.ts";

const crlf = (lines: string[]) => Buffer.from(`${lines.join("\r\n")}\r\n`, "utf8");
const read = async (bytes: Buffer) => (await parseVcards(bytes)).cards.map(contactFromCard);

/** As an iPhone writes it: 3.0, grouped properties with labels beside them, a folded photo. */
const IPHONE = crlf([
  "BEGIN:VCARD",
  "VERSION:3.0",
  "PRODID:-//Apple Inc.//iPhone OS 18.1//EN",
  "N:Okafor;Adaeze;Ngozi;Dr.;",
  "FN:Dr. Adaeze Ngozi Okafor",
  "NICKNAME:Ada",
  "ORG:Fell Road Surgery;Out of hours",
  "TITLE:General practitioner",
  "EMAIL;type=INTERNET;type=WORK;type=pref:adaeze.okafor@fellroad.example",
  "TEL;type=CELL;type=VOICE;type=pref:+44 7700 900123",
  "TEL;type=WORK;type=VOICE:01632 960045",
  "item1.TEL:+44 7700 900188",
  "item1.X-ABLabel:Satellite phone",
  "item2.ADR;type=WORK;type=pref:;;12 Fell Road\\nUnit 3;Keswick;Cumbria;CA12 9ZZ;United Kingdom",
  "item2.X-ABADR:gb",
  "item3.URL;type=pref:https://fellroad.example/out-of-hours?a=1\\,2",
  "item3.X-ABLabel:_$!<HomePage>!$_",
  "item4.X-ABRELATEDNAMES;type=pref:Tunde Okafor",
  "item4.X-ABLabel:_$!<Spouse>!$_",
  "item5.X-ABDATE;type=pref:2011-06-18",
  "item5.X-ABLabel:_$!<Anniversary>!$_",
  "BDAY;X-APPLE-OMIT-YEAR=1604:1604-03-09",
  "NOTE:Rings back within the hour\\; leave a message.\\nAsk for the duty doctor\\, not reception. A long line that an iPhone would fo",
  " ld part of the way through a word, joined again with nothing added. 📟",
  "PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEm",
  " KzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7",
  " Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA",
  "X-SOCIALPROFILE;type=mastodon:https://social.example/@ada",
  "UID:6C2B1B0E-0000-4000-8000-00000000A001",
  "REV:2026-11-02T09:15:00Z",
  "END:VCARD",
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N:;;;;",
  "FN:Borrowdale Mountain Rescue",
  "ORG:Borrowdale Mountain Rescue;",
  "TEL;type=MAIN:01632 960999",
  "X-ABShowAs:COMPANY",
  "UID:6C2B1B0E-0000-4000-8000-00000000A002",
  "END:VCARD",
]);

describe("an iPhone's export (vCard 3.0)", () => {
  it("reads names, labelled numbers, an address, and the things Apple writes in groups", async () => {
    const [person, company] = await read(IPHONE);
    expect(person!.uid).toBe("6C2B1B0E-0000-4000-8000-00000000A001");
    expect(person!.fields.name).toEqual({ prefix: "Dr.", given: "Adaeze", additional: "Ngozi", family: "Okafor", suffix: "" });
    expect(person!.fields.nickname).toBe("Ada");
    expect(person!.fields.organisation).toBe("Fell Road Surgery");
    expect(person!.fields.department).toBe("Out of hours");
    expect(person!.fields.title).toBe("General practitioner");
    expect(person!.fields.phones).toEqual([
      { value: "+44 7700 900123", label: "mobile" },
      { value: "01632 960045", label: "work" },
      { value: "+44 7700 900188", label: "Satellite phone" },
    ]);
    expect(person!.fields.emails).toEqual([{ value: "adaeze.okafor@fellroad.example", label: "work" }]);
    expect(person!.fields.addresses).toEqual([
      {
        label: "work",
        street: "12 Fell Road\nUnit 3",
        locality: "Keswick",
        region: "Cumbria",
        postcode: "CA12 9ZZ",
        country: "United Kingdom",
      },
    ]);
    expect(person!.fields.links).toEqual([{ value: "https://fellroad.example/out-of-hours?a=1,2", label: "website" }]);
    expect(person!.fields.related).toEqual([{ name: "Tunde Okafor", label: "spouse" }]);
    expect(person!.fields.birthday).toBe("--03-09");
    expect(person!.fields.note).toBe(
      "Rings back within the hour; leave a message.\nAsk for the duty doctor, not reception. A long line that an iPhone would fold part of the way through a word, joined again with nothing added. 📟",
    );

    expect(company!.fields.kind).toBe("organisation");
    expect(company!.fields.organisation).toBe("Borrowdale Mountain Rescue");
    expect(company!.fields.phones).toEqual([{ value: "01632 960999", label: "main" }]);
  });

  it("leaves the photo out, says so, and keeps what it has no field for", async () => {
    const parsed = await parseVcards(IPHONE);
    expect(parsed.binaryLeftOut).toBe(1);
    expect(parsed.versions).toEqual(["3.0"]);
    const person = contactFromCard(parsed.cards[0]!);
    expect(person.extra.join("\n")).not.toContain("/9j/");
    // The anniversary keeps its group and its label; the address-format hint and the profile are kept too.
    expect(person.extra).toContain("item5.X-ABDATE;TYPE=pref:2011-06-18");
    expect(person.extra).toContain("item5.X-ABLabel:_$!<Anniversary>!$_");
    expect(person.extra).toContain("item2.X-ABADR:gb");
    expect(person.extra).toContain("X-SOCIALPROFILE;TYPE=mastodon:https://social.example/@ada");
    expect(otherFieldsOf(person.extra)).toEqual(["Date: 2011-06-18", "Social profile: https://social.example/@ada"]);
  });
});

describe("vCard 2.1", () => {
  it("reads quoted-printable with soft line breaks, bare parameters and a photo ended by a blank line", async () => {
    const file = crlf([
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C5=81ukasiewicz;Zo=C3=AB;;;",
      "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Zo=C3=AB =C5=81ukasiewicz",
      "TEL;CELL;VOICE:07700 900456",
      "TEL;WORK;FAX:01632 960111",
      "EMAIL;INTERNET;HOME:zoe@lukasiewicz.example",
      "ADR;HOME;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;;4 K=C3=A4stner Lane=0D=0AThe Old Forge;Ambleside;;LA22 9ZZ;UK",
      "NOTE;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Neighbour two doors up. Has a generator=3B a chainsaw, and the keys t=",
      "o the village hall.=0D=0ASecond line: 50=25 of the time she is at C:\\new=",
      "\\cabin",
      "PHOTO;ENCODING=BASE64;JPEG:",
      " /9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEm",
      " KzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7",
      "",
      "CATEGORIES:Neighbours,Has a key",
      "END:VCARD",
    ]);
    const parsed = await parseVcards(file);
    expect(parsed.versions).toEqual(["2.1"]);
    expect(parsed.binaryLeftOut).toBe(1);
    const { fields } = contactFromCard(parsed.cards[0]!);
    expect(fields.name.family).toBe("Łukasiewicz");
    expect(fields.name.given).toBe("Zoë");
    expect(fields.phones).toEqual([
      { value: "07700 900456", label: "mobile" },
      { value: "01632 960111", label: "work fax" },
    ]);
    expect(fields.emails).toEqual([{ value: "zoe@lukasiewicz.example", label: "home" }]);
    expect(fields.addresses[0]).toMatchObject({
      street: "4 Kästner Lane\nThe Old Forge",
      locality: "Ambleside",
      postcode: "LA22 9ZZ",
      label: "home",
    });
    // A semicolon and a comma inside the note are the note's own; a backslash is a backslash, not an escape.
    expect(fields.note).toBe(
      "Neighbour two doors up. Has a generator; a chainsaw, and the keys to the village hall.\nSecond line: 50% of the time she is at C:\\new\\cabin",
    );
    expect(fields.tags).toEqual(["Neighbours", "Has a key"]);
  });

  it("reads a file in the Western European character set, and a line that names another", async () => {
    const latin = Buffer.concat([
      Buffer.from("BEGIN:VCARD\r\nVERSION:2.1\r\nN:Br", "latin1"),
      Buffer.from([0xfc]), // ü in windows-1252
      Buffer.from("ckner;Ren", "latin1"),
      Buffer.from([0xe9]), // é
      Buffer.from("e\r\nTEL;HOME:01632 960222\r\n", "latin1"),
      // Shift_JIS for 山田, as an old Japanese handset wrote it.
      Buffer.from("NOTE;CHARSET=SHIFT_JIS;ENCODING=QUOTED-PRINTABLE:=8ER=93c\r\nORG:Caf", "latin1"),
      Buffer.from([0xe9, 0x20, 0x80]), // "é €" (the euro sign is 0x80 in windows-1252 only)
      Buffer.from("\r\nEND:VCARD\r\n", "latin1"),
    ]);
    const [contact] = await read(latin);
    expect(contact!.fields.name).toMatchObject({ family: "Brückner", given: "Renée" });
    expect(contact!.fields.note).toBe("山田");
    expect(contact!.fields.organisation).toBe("Café €");
  });

  it("keeps the space a 2.1 line was folded at", async () => {
    const file = crlf(["BEGIN:VCARD", "VERSION:2.1", "FN:Harbour Master", "NOTE:Channel sixteen", " then twelve", "END:VCARD"]);
    const [contact] = await read(file);
    expect(contact!.fields.note).toBe("Channel sixteen then twelve");
  });

  it("takes a card with nothing but a formatted name", async () => {
    const [contact] = await read(crlf(["BEGIN:VCARD", "VERSION:2.1", "FN:Wasdale Head Inn", "TEL:01632 960333", "END:VCARD"]));
    expect(contact!.fields.name.given).toBe("Wasdale Head Inn");
    expect(contact!.uid).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("vCard 4.0", () => {
  it("reads its own ways of writing a number, a kind, a birthday and a related name", async () => {
    const file = crlf([
      "BEGIN:VCARD",
      "VERSION:4.0",
      "KIND:individual",
      "FN:Ibrahim Al-Sayed",
      "N:Al-Sayed;Ibrahim;;;",
      'TEL;VALUE=uri;TYPE="cell,text";PREF=1:tel:+1-202-555-0143',
      "TEL;TYPE=home:+1 202 555 0177",
      'EMAIL;TYPE=work;X-NOTE="on call; nights, weekends":ibrahim@alsayed.example',
      `ADR;TYPE=home;LABEL="7 Canal St^nLock Keeper^'s Cottage":;;7 Canal St;Georgetown;DC;20007;USA`,
      "BDAY:19840229",
      "RELATED;TYPE=sibling;VALUE=text:Layla Al-Sayed",
      "PHOTO:data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "URL:https://alsayed.example",
      "UID:urn:uuid:4fbe8971-0bc3-424c-9c26-36c3e1eff6b1",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:4.0",
      "KIND:org",
      "FN:Georgetown Water Board",
      "ORG:Georgetown Water Board",
      "TEL:+1 202 555 0100",
      "BDAY:--0412",
      "END:VCARD",
    ]);
    const parsed = await parseVcards(file);
    expect(parsed.binaryLeftOut).toBe(1);
    const [person, board] = parsed.cards.map(contactFromCard);
    expect(person!.uid).toBe("urn:uuid:4fbe8971-0bc3-424c-9c26-36c3e1eff6b1");
    expect(person!.fields.phones).toEqual([
      { value: "+1-202-555-0143", label: "cell text" },
      { value: "+1 202 555 0177", label: "home" },
    ]);
    expect(person!.fields.emails).toEqual([{ value: "ibrahim@alsayed.example", label: "work" }]);
    expect(person!.fields.addresses[0]).toMatchObject({ street: "7 Canal St", locality: "Georgetown", region: "DC", postcode: "20007" });
    expect(person!.fields.birthday).toBe("1984-02-29");
    expect(person!.fields.related).toEqual([{ name: "Layla Al-Sayed", label: "sibling" }]);
    expect(board!.fields.kind).toBe("organisation");
    expect(board!.fields.birthday).toBe("--04-12");
  });
});

describe("awkward files", () => {
  it("reads bare line feeds, old Mac line endings and UTF-16", async () => {
    const lines = ["BEGIN:VCARD", "VERSION:3.0", "N:Ferreira;João;;;", "FN:João Ferreira", "TEL;TYPE=CELL:07700 900654", "END:VCARD", ""];
    for (const bytes of [
      Buffer.from(lines.join("\n")),
      Buffer.from(lines.join("\r")),
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(lines.join("\r\n"), "utf16le")]),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join("\r\n"))]),
    ]) {
      const [contact] = await read(bytes);
      expect(contact!.fields.name.given).toBe("João");
      expect(contact!.fields.phones).toEqual([{ value: "07700 900654", label: "mobile" }]);
    }
  });

  it("lists a card it cannot read and still reads the others", async () => {
    const big = `NOTE:${"x".repeat(VCARD_LIMITS.line + 10)}`;
    const parsed = await parseVcards(
      crlf([
        "Some text a mail program put before the cards.",
        "BEGIN:VCARD",
        "VERSION:3.0",
        "END:VCARD",
        "BEGIN:VCARD",
        "VERSION:3.0",
        "FN:Too Long",
        big,
        "END:VCARD",
        "begin:vcard",
        "version:3.0",
        "fn:Lower Case",
        "tel;type=home:01632 960444",
        "this line is not a property at all",
        "end:vcard",
        "BEGIN:VCARD",
        "VERSION:3.0",
        "FN:Cut Off",
      ]),
    );
    expect(parsed.cards.map((card) => contactFromCard(card).fields.name.given)).toEqual(["Lower Case"]);
    expect(contactFromCard(parsed.cards[0]!).fields.phones).toEqual([{ value: "01632 960444", label: "home" }]);
    expect(parsed.unreadable).toEqual([
      { position: 1, reason: "It is empty." },
      { position: 2, reason: "It is larger than a contact is, so it was not read." },
      { position: 4, reason: "The file ends part of the way through it." },
    ]);
  });

  it("does not read a card inside a card as a contact of its own", async () => {
    const parsed = await parseVcards(
      crlf([
        "BEGIN:VCARD",
        "VERSION:2.1",
        "FN:Principal",
        "AGENT:",
        "BEGIN:VCARD",
        "VERSION:2.1",
        "FN:Assistant",
        "TEL:01632 960555",
        "END:VCARD",
        "TEL:01632 960556",
        "END:VCARD",
      ]),
    );
    expect(parsed.cards).toHaveLength(1);
    const { fields } = contactFromCard(parsed.cards[0]!);
    expect(fields.name.given).toBe("Principal");
    expect(fields.phones).toEqual([{ value: "01632 960556", label: "" }]);
  });

  it("refuses a file that is not vCard, and one with more cards than the limit", async () => {
    await expect(parseVcards(Buffer.from("name,phone\nSam,01632 960777\n"))).rejects.toThrow(VcardError);
    await expect(parseVcards(Buffer.alloc(0))).rejects.toThrow(/holds no contacts/);
    const many = Buffer.from("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:A\r\nEND:VCARD\r\n".repeat(VCARD_LIMITS.cards + 1));
    await expect(parseVcards(many)).rejects.toThrow(/more than 20,000 contacts/);
  });

  it("treats everything as text", async () => {
    const [contact] = await read(
      crlf([
        "BEGIN:VCARD",
        "VERSION:3.0",
        "FN:<script>alert(1)</script>",
        "N:<img src=x onerror=alert(1)>;=cmd|' /C calc'!A0;;;",
        "URL:javascript:alert(1)",
        'NOTE:=HYPERLINK("http://example.invalid")',
        "END:VCARD",
      ]),
    );
    expect(contact!.fields.name.family).toBe("<img src=x onerror=alert(1)>");
    expect(contact!.fields.name.given).toBe("=cmd|' /C calc'!A0");
    expect(contact!.fields.links).toEqual([{ value: "javascript:alert(1)", label: "website" }]);
    expect(contact!.fields.note).toBe('=HYPERLINK("http://example.invalid")');
  });
});

describe("writing", () => {
  const fields = () => ({
    ...emptyContactFields(),
    name: { prefix: "", given: "Maya", additional: "", family: "Okafor-Lindqvist", suffix: "" },
    nickname: "May",
    organisation: "Lindqvist; Sons, Ltd",
    department: "Boats",
    title: "Skipper",
    phones: [
      { value: "+44 7700 900777", label: "mobile" },
      { value: "01632 960888", label: "boat shed" },
      { value: "01632 960889", label: "" },
    ],
    emails: [{ value: "maya@lindqvist.example", label: "work" }],
    addresses: [
      {
        label: "meeting point",
        street: "The slipway\nHarbour Road",
        locality: "Portree",
        region: "Skye",
        postcode: "IV51 9ZZ",
        country: "UK",
      },
    ],
    links: [{ value: "https://lindqvist.example/tides", label: "website" }],
    related: [{ name: "Sven Lindqvist", label: "partner" }],
    birthday: "--07-04",
    note: "Line one\nLine two, with a comma; a semicolon and a back\\slash.",
    tags: ["Family", "Has a boat"],
    isEmergency: true,
    emergencyNote: "Can take six people off the island.",
    callsign: "MM0XYZ",
    channels: [
      { frequency: "145.500 MHz", mode: "FM; calling" },
      { frequency: "Marine 16", mode: "" },
    ],
  });

  it("writes a 3.0 card a phone reads, and reads its own card back unchanged", async () => {
    const contact = {
      uid: "0f6d3b1e-1111-4222-8333-444455556666",
      fields: fields(),
      extra: ["item1.X-ABDATE:2019-05-01", "item1.X-ABLabel:_$!<Anniversary>!$_"],
      updatedAt: Date.UTC(2026, 10, 16, 12, 0, 0),
    };
    const card = vcardOf(contact, "3.0");
    expect(card.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(card.endsWith("END:VCARD\r\n")).toBe(true);
    expect(card).toContain("N:Okafor-Lindqvist;Maya;;;\r\n");
    expect(card).toContain("FN:Maya Okafor-Lindqvist\r\n");
    expect(card).toContain("ORG:Lindqvist\\; Sons\\, Ltd;Boats\r\n");
    expect(card).toContain("TEL;TYPE=CELL:+44 7700 900777\r\n");
    // A label a phone does not know is written the way Apple writes its own, in a group that is not already taken.
    expect(card).toContain("item2.TEL:01632 960888\r\nitem2.X-ABLabel:boat shed\r\n");
    expect(card).toContain("EMAIL;TYPE=INTERNET,WORK:maya@lindqvist.example\r\n");
    expect(card).toContain("BDAY;X-APPLE-OMIT-YEAR=1604:1604-07-04\r\n");
    expect(card).toContain("REV:20261116T120000Z\r\n");
    for (const line of card.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);

    const [back] = await read(Buffer.from(card));
    expect(back!.uid).toBe(contact.uid);
    expect(back!.fields).toEqual(contact.fields);
    expect(back!.extra).toEqual(contact.extra);
  });

  it("writes 4.0 when asked, and reads that back unchanged too", async () => {
    const contact = {
      uid: "0f6d3b1e-1111-4222-8333-444455556667",
      fields: { ...fields(), kind: "organisation" as const, birthday: "1990-12-31" },
      extra: [],
      updatedAt: 0,
    };
    const lines = cardLines(contact, "4.0");
    expect(lines).toContain("KIND:org");
    expect(lines).toContain("BDAY:19901231");
    expect(lines).toContain("TEL;TYPE=cell:+44 7700 900777");
    const [back] = await read(Buffer.from(vcardOf(contact, "4.0")));
    expect(back!.fields).toEqual(contact.fields);
  });

  it("folds at 75 bytes without splitting a character", () => {
    const folded = foldLine(`NOTE:${"é".repeat(60)}${"📟".repeat(20)}`);
    for (const line of folded.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n ").join("")).toBe(`NOTE:${"é".repeat(60)}${"📟".repeat(20)}`);
    expect(folded).not.toContain("\ufffd");
  });

  it("keeps a full name that the parts of the name do not make", async () => {
    const [contact] = await read(
      crlf(["BEGIN:VCARD", "VERSION:3.0", "N:Whitfield;Margaret;;;", "FN:Peggy at the post office", "END:VCARD"]),
    );
    expect(contact!.fields.name).toMatchObject({ given: "Margaret", family: "Whitfield" });
    expect(otherFieldsOf(contact!.extra)).toEqual(["Full name as written: Peggy at the post office"]);
  });
});

describe("the phone's contact picker", () => {
  it("makes a contact from what the picker gives", () => {
    const { fields } = contactFromPicked({
      name: ["  Sam   Whitlock "],
      tel: ["07700 900321", ""],
      email: ["sam@whitlock.example"],
      address: [{ addressLine: ["3 Mill Lane"], city: "Hawes", region: "North Yorkshire", postalCode: "DL8 9ZZ", country: "GB" }],
    });
    expect(fields.name.given).toBe("Sam Whitlock");
    expect(fields.phones).toEqual([{ value: "07700 900321", label: "" }]);
    expect(fields.addresses).toEqual([
      { label: "", street: "3 Mill Lane", locality: "Hawes", region: "North Yorkshire", postcode: "DL8 9ZZ", country: "GB" },
    ]);
  });
});
