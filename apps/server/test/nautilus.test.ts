import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type Literal, LiteralError, parseDatabaseLiteral } from "../src/modules/kiwix/literal.ts";
import { isNautilusHome, MAX_DOCUMENTS, nautilusFilePath, readNautilusDatabase } from "../src/modules/kiwix/nautilus.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import {
  databaseJs,
  NAUTILUS_BOOK,
  NAUTILUS_DOCUMENTS,
  type NautilusArchive,
  pythonRepr,
  startNautilusArchive,
  zimHeader,
} from "./nautilus-archive.ts";

const list = (inside: string) => parseDatabaseLiteral(`var DATABASE = [${inside}];`);
const refused = (source: string) => {
  try {
    parseDatabaseLiteral(source);
  } catch (error) {
    if (error instanceof LiteralError) return error.message;
    throw error;
  }
  return undefined;
};
const plain = (value: Literal): unknown =>
  value instanceof Map
    ? Object.fromEntries([...value].map(([key, item]) => [key, plain(item)]))
    : Array.isArray(value)
      ? value.map(plain)
      : value;

describe("reading a list written as a script, without running it", () => {
  it("reads the file nautilus writes", () => {
    const source = [
      "var DATABASE = [",
      "{'_id': '00000', 'ti': 'Three days', 'dsc': 'Guides & checklists', 'aut': 'Various', 'fp': ['Preparedness (1).pdf']},",
      `{'_id': '00001', 'ti': "A camper's stove", 'dsc': '', 'aut': '', 'fp': ['a.ogg', 'b.ogg']},`,
      "];",
      "",
    ].join("\n");
    expect(parseDatabaseLiteral(source).map(plain)).toEqual([
      { _id: "00000", ti: "Three days", dsc: "Guides & checklists", aut: "Various", fp: ["Preparedness (1).pdf"] },
      { _id: "00001", ti: "A camper's stove", dsc: "", aut: "", fp: ["a.ogg", "b.ogg"] },
    ]);
  });

  it("reads strings in either quote, with the escapes Python and JavaScript write", () => {
    expect(list(String.raw`'it\'s', "say \"hi\"", 'back\\slash', 'a\nb\tc\rd'`)).toEqual(["it's", 'say "hi"', "back\\slash", "a\nb\tc\rd"]);
    expect(list(String.raw`'\x41\xe9', 'é中', '😀', '\u{1F600}', '\U0001f600', '\0', '\b\f\v'`)).toEqual([
      "Aé",
      "é中",
      "😀",
      "😀",
      "😀",
      "\0",
      "\b\f\v",
    ]);
    // Text that is not ASCII is written as it is, and read as it is.
    expect(list("'Sütterlin — 初級 😀', 'right’s “quotes”'")).toEqual(["Sütterlin — 初級 😀", "right’s “quotes”"]);
    // The other quote needs no escape inside a string.
    expect(list(`'"', "'"`)).toEqual(['"', "'"]);
  });

  it("reads numbers, empty things, trailing commas and a list with nothing after it", () => {
    expect(list("")).toEqual([]);
    expect(list("1, -2.5, 3e2, 0").map(plain)).toEqual([1, -2.5, 300, 0]);
    expect(list("[], {}, [[],], {'a': [],},").map(plain)).toEqual([[], {}, [[]], { a: [] }]);
    expect(parseDatabaseLiteral("﻿  var\tDATABASE=[ 'a' ]")).toEqual(["a"]);
    expect(parseDatabaseLiteral("var DATABASE = ['a'] ; \r\n")).toEqual(["a"]);
  });

  it("keeps names that mean something to JavaScript as plain names", () => {
    const [entry] = list(`{'__proto__': {'polluted': 'yes'}, 'constructor': 'c', 'toString': 't', 'hasOwnProperty': 'h', 'ti': 'x'}`);
    expect(entry).toBeInstanceOf(Map);
    const map = entry as Map<string, Literal>;
    expect([...map.keys()]).toEqual(["__proto__", "constructor", "toString", "hasOwnProperty", "ti"]);
    expect(map.get("constructor")).toBe("c");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
    // A name given twice keeps its last value, as it would in a script.
    expect((list("{'a': '1', 'a': '2'}")[0] as Map<string, Literal>).get("a")).toBe("2");
  });

  it("refuses anything that is not a list of plain values", () => {
    for (const source of [
      "",
      "DATABASE = []",
      "var DATABASE",
      "var DATABASE = ",
      "varDATABASE = []",
      "var OTHER = []",
      "let DATABASE = []",
      "var DATABASE = {}",
      "var DATABASE = 'text'",
      "var DATABASE = []; alert(1)",
      "var DATABASE = []; var MORE = []",
      "var DATABASE = [] []",
      "alert(1); var DATABASE = []",
      "var DATABASE = [alert(1)]",
      "var DATABASE = [fetch('/api/settings')]",
      "var DATABASE = [(1)]",
      "var DATABASE = [a]",
      "var DATABASE = [true]",
      "var DATABASE = [null]",
      "var DATABASE = [undefined]",
      "var DATABASE = [None]",
      "var DATABASE = [NaN]",
      "var DATABASE = [Infinity]",
      "var DATABASE = [1 + 1]",
      "var DATABASE = ['a' + 'b']",
      "var DATABASE = [`template`]",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder is the hostile input
      "var DATABASE = [`${1}`]",
      "var DATABASE = [/regex/]",
      "var DATABASE = [new Date()]",
      "var DATABASE = [function(){}]",
      "var DATABASE = [() => 1]",
      "var DATABASE = [...[]]",
      "var DATABASE = [{a: 1}]",
      "var DATABASE = [{'a'}]",
      "var DATABASE = [{'a': }]",
      "var DATABASE = [{1: 'a'}]",
      "var DATABASE = [{['a']: 1}]",
      "var DATABASE = [{'a': 1 'b': 2}]",
      "var DATABASE = [{get 'a'() { return 1 }}]",
      "var DATABASE = [,]",
      "var DATABASE = [1,,2]",
      "var DATABASE = [1 2]",
      "var DATABASE = ['a' 'b']",
      "var DATABASE = [0x10]",
      "var DATABASE = [010]",
      "var DATABASE = [1.]",
      "var DATABASE = [.5]",
      "var DATABASE = [+1]",
      "var DATABASE = [1n]",
      "var DATABASE = [1e]",
      "var DATABASE = [1_000]",
      "var DATABASE = [1.2.3]",
      "var DATABASE = [12abc]",
      "var DATABASE = [1e9999]",
      "var DATABASE = [] // comment",
      "var DATABASE = [ /* comment */ ]",
      "// comment\nvar DATABASE = []",
      "var DATABASE = [<!-- -->]",
      "var DATABASE = [']",
      "var DATABASE = ['unterminated",
      'var DATABASE = ["unterminated]',
      "var DATABASE = ['one\ntwo']",
      "var DATABASE = ['one\rtwo']",
      "var DATABASE = ['ends with a backslash\\",
      String.raw`var DATABASE = ['\q']`,
      String.raw`var DATABASE = ['\8']`,
      String.raw`var DATABASE = ['\01']`,
      String.raw`var DATABASE = ['\x4']`,
      String.raw`var DATABASE = ['\xZZ']`,
      String.raw`var DATABASE = ['\u12']`,
      String.raw`var DATABASE = ['\u{}']`,
      String.raw`var DATABASE = ['\u{110000}']`,
      String.raw`var DATABASE = ['\u{1F600']`,
      String.raw`var DATABASE = ['\U00110000']`,
      String.raw`var DATABASE = ['\U0001f6']`,
      "var DATABASE = ['line \\\n continued']",
      "var DATABASE = [",
      "var DATABASE = [[",
      "var DATABASE = [{",
      "var DATABASE = [{'a'",
      "var DATABASE = [{'a':",
      "var DATABASE = [{'a': 1",
      "var DATABASE = [}",
      "var DATABASE = ]",
      "var DATABASE = [ ]",
      "var DATABASE = [ ]",
      "var DATABASE = [\0]",
    ]) {
      expect(refused(source), JSON.stringify(source)).toEqual(expect.any(String));
    }
  });

  it("refuses what is too deep, too long or too many, without running out of anything", () => {
    // Twelve lists inside each other is past the limit; a hundred thousand must not overflow the stack either.
    expect(refused(`var DATABASE = ${"[".repeat(12)}${"]".repeat(12)}`)).toMatch(/nested deeper/);
    expect(refused(`var DATABASE = ${"[".repeat(100_000)}`)).toMatch(/nested deeper/);
    expect(refused(`var DATABASE = [${"{'a':".repeat(100_000)}`)).toMatch(/nested deeper/);
    // The depth the format needs is accepted: a list, an entry, its list of files.
    expect(list("{'fp': ['a', ['b']]}")).toHaveLength(1);

    const limits = { maxLength: 1000, maxDepth: 6, maxValues: 50 };
    expect(() => parseDatabaseLiteral(`var DATABASE = ['${"x".repeat(1000)}']`, limits)).toThrow(/larger than Outpost reads/);
    expect(() => parseDatabaseLiteral(`var DATABASE = [${"1,".repeat(60)}]`, limits)).toThrow(/more values/);
    expect(parseDatabaseLiteral(`var DATABASE = [${"1,".repeat(40)}]`, limits)).toHaveLength(40);

    // At the real limits: four megabytes that are one string, and a file past the limit.
    const big = `var DATABASE = ['${"x".repeat(4 * 1024 * 1024 - 40)}']`;
    const started = performance.now();
    expect(parseDatabaseLiteral(big)).toHaveLength(1);
    expect(refused(`${big}${" ".repeat(64)}`)).toMatch(/larger than Outpost reads/);
    // And one made of as many values as will fit, which is the most work a file can ask for.
    expect(refused(`var DATABASE = [${"1,".repeat(2_000_000)}]`)).toMatch(/more values/);
    expect(parseDatabaseLiteral(`var DATABASE = [${"1,".repeat(900_000)}]`)).toHaveLength(900_000);
    expect(performance.now() - started).toBeLessThan(5000);
  });

  it("never evaluates what it is given", () => {
    const marker = "__outpost_literal_test__";
    const hostile = [
      `var DATABASE = [globalThis.${marker} = 1]`,
      `var DATABASE = [{'ti': (globalThis.${marker} = 1)}]`,
      `var DATABASE = []; globalThis.${marker} = 1;`,
      `var DATABASE = ['${"${"}globalThis.${marker} = 1}']`,
      `var DATABASE = [{'toString': 'x', 'valueOf': 'y', 'ti': 'z'}]\n;globalThis.${marker} = 1`,
    ];
    for (const source of hostile) {
      try {
        parseDatabaseLiteral(source);
      } catch (error) {
        expect(error).toBeInstanceOf(LiteralError);
      }
    }
    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
    // A string that looks like code is a string.
    expect(list(`'</script><script>alert(1)</script>', '\${alert(1)}', 'require("fs")'`)).toEqual([
      "</script><script>alert(1)</script>",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder must come back as plain text
      "${alert(1)}",
      'require("fs")',
    ]);
  });
});

describe("where a listed file is inside its archive", () => {
  it("puts a name under files/, folders and awkward characters included", () => {
    expect(nautilusFilePath("Water (7).pdf")).toBe("files/Water (7).pdf");
    expect(nautilusFilePath("guides/first aid/splint.pdf")).toBe("files/guides/first aid/splint.pdf");
    expect(nautilusFilePath("Schrift & Zeichen #1?.pdf")).toBe("files/Schrift & Zeichen #1?.pdf");
    expect(nautilusFilePath("初級 😀.pdf")).toBe("files/初級 😀.pdf");
    expect(nautilusFilePath(".hidden/v1.2.pdf")).toBe("files/.hidden/v1.2.pdf");
    // Percent signs are text: escaped whole when put into an address, they cannot turn into dots or slashes.
    expect(nautilusFilePath("%2e%2e%2fhome")).toBe("files/%2e%2e%2fhome");
    expect(encodeURIComponent("%2e%2e%2fhome")).toBe("%252e%252e%252fhome");
    // An address is only a strange file name once it is under files/.
    expect(nautilusFilePath("javascript:alert(1)")).toBe("files/javascript:alert(1)");
  });

  it("refuses a name that could lead anywhere else", () => {
    for (const name of [
      "",
      "..",
      ".",
      "../home",
      "../../raw/book/meta/Title",
      "a/../../home",
      "a/./b.pdf",
      // Two dots inside a name climb nowhere, but the proxy serves no address that holds them.
      "...pdf",
      "a..b/c.pdf",
      "a//b.pdf",
      "/etc/passwd",
      "/files/a.pdf",
      "a.pdf/",
      "a\\..\\b.pdf",
      "..\\home",
      "a\0.pdf",
      "a\n.pdf",
      "a\u007f.pdf",
      "https://example.org/a.pdf",
      "//example.org/a.pdf",
      "\ud800.pdf",
      "a\udc00",
      "x".repeat(501),
      undefined,
      null,
      7,
      ["a.pdf"],
      new Map(),
    ]) {
      expect(nautilusFilePath(name), JSON.stringify(name)).toBeUndefined();
    }
  });
});

describe("the documents a list names", () => {
  it("recognises the page nautilus writes, and no other", () => {
    expect(isNautilusHome('<ul id="doc-list" class="event-list">\n</ul> … <script src="nautilus.js"></script>')).toBe(true);
    expect(isNautilusHome("<UL class='x' id='doc-list'></UL><SCRIPT type='text/javascript' src='./nautilus.js'></SCRIPT>")).toBe(true);
    expect(isNautilusHome('<ul id="doc-list"></ul>')).toBe(false);
    expect(isNautilusHome('<script src="nautilus.js"></script>')).toBe(false);
    expect(isNautilusHome('<ul id="doc-list-2"></ul><script src="vendor/nautilus.js.map"></script>')).toBe(false);
    expect(isNautilusHome("<html><body>Bowline</body></html>")).toBe(false);
  });

  it("turns entries into documents and leaves out what cannot be one", () => {
    const read = readNautilusDatabase(
      `var DATABASE = [
        {'_id': '00000', 'ti': 'Water', 'dsc': 'How to\\n  boil it', 'aut': 'A. Writer', 'fp': ['Water (1).pdf']},
        {'_id': '00001', 'ti': '', 'dsc': '', 'aut': ['One', 'Two'], 'fp': ['talk.ogg', 'talk.ogg', '../home', 'slides.pdf']},
        {'_id': '00002', 'ti': 2024, 'fp': 'report.pdf'},
        {'_id': '00003', 'ti': 'No files', 'fp': []},
        {'_id': '00004', 'ti': 'Only a way out', 'fp': ['../../raw/x']},
        {'_id': '00005', 'ti': 'Files that are not names', 'fp': [1, ['a.pdf'], {'a': 'b'}]},
        {'_id': '00006', 'ti': 'No list of files at all'},
        'not an entry',
        ['nor', 'this'],
        {'ti': {'nested': 'title'}, 'dsc': 7, 'aut': {'x': 'y'}, 'fp': ['odd.pdf']},
        {'__proto__': {'fp': ['inherited.pdf']}, 'ti': 'Inherits nothing'},
      ];`,
    );
    expect(read.documents).toEqual([
      {
        title: "Water",
        description: "How to boil it",
        author: "A. Writer",
        files: [{ name: "Water (1).pdf", path: "files/Water (1).pdf" }],
      },
      {
        // An entry with no title is named after its first file, as there is nothing else to call it.
        title: "talk.ogg",
        description: "",
        author: "One, Two",
        files: [
          { name: "talk.ogg", path: "files/talk.ogg" },
          { name: "slides.pdf", path: "files/slides.pdf" },
        ],
      },
      { title: "2024", description: "", author: "", files: [{ name: "report.pdf", path: "files/report.pdf" }] },
      { title: "odd.pdf", description: "7", author: "", files: [{ name: "odd.pdf", path: "files/odd.pdf" }] },
    ]);
    expect(read.skipped).toBe(7);
    expect(read.truncated).toBe(false);
  });

  it("keeps every string as one line of text, cut to length", () => {
    const [document] = readNautilusDatabase(
      `var DATABASE = [{'ti': '<img src=x onerror=alert(1)>\\u0000\\u001b[31m  \\ud800 ${"t".repeat(400)}', 'dsc': '${"d".repeat(2500)}', 'aut': '😀${"a".repeat(297)}😀', 'fp': ['a.pdf']}]`,
    ).documents;
    expect(document!.title.startsWith("<img src=x onerror=alert(1)> [31m � ttt")).toBe(true);
    expect(document!.title).toHaveLength(300);
    expect(document!.description).toHaveLength(2000);
    // Cut between characters: the last one would have been split in two.
    expect(document!.author).toBe(`😀${"a".repeat(297)}`);
  });

  it("reads no more documents than its limit, and says when there were more", () => {
    const entry = "{'ti': 't', 'fp': ['a.pdf']},";
    const read = readNautilusDatabase(`var DATABASE = [${entry.repeat(MAX_DOCUMENTS + 5)}]`);
    expect(read.documents).toHaveLength(MAX_DOCUMENTS);
    expect(read.truncated).toBe(true);
    // More files than one document may have are cut too.
    const many = readNautilusDatabase(
      `var DATABASE = [{'ti': 't', 'fp': [${Array.from({ length: 80 }, (_, i) => `'${i}.pdf'`).join(",")}]}]`,
    );
    expect(many.documents[0]!.files).toHaveLength(50);
  });

  it("writes test lists the way Python does, so the reader is tried against that", () => {
    expect(pythonRepr("it's")).toBe(`"it's"`);
    expect(pythonRepr(`"quoted"`)).toBe(`'"quoted"'`);
    expect(pythonRepr(`both ' and "`)).toBe(`'both \\' and "'`);
    const written = databaseJs(NAUTILUS_DOCUMENTS);
    const read = readNautilusDatabase(written);
    expect(read.documents.map((document) => document.title)).toEqual(NAUTILUS_DOCUMENTS.slice(0, -1).map((document) => document.title));
    expect(read.skipped).toBe(1);
  });
});

describe("an archive that lists documents", () => {
  const cleanups: Array<() => Promise<void> | void> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  async function waitFor(check: () => boolean | Promise<boolean>, ms = 5000): Promise<void> {
    const until = Date.now() + ms;
    while (!(await check())) {
      if (Date.now() > until) throw new Error("timed out waiting");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async function setup(prepare?: (archive: NautilusArchive) => void) {
    const archive = await startNautilusArchive();
    cleanups.push(() => archive.close());
    prepare?.(archive);
    const app: TestApp = await createTestApp({ OUTPOST_KIWIX_URL: archive.url });
    cleanups.push(() => app.close());
    const location = app.ctx.services.storage.getDefault();
    const relPath = `collections/zim/${NAUTILUS_BOOK}.zim`;
    fs.mkdirSync(path.dirname(path.join(location.path, relPath)), { recursive: true });
    fs.writeFileSync(path.join(location.path, relPath), zimHeader());
    const imported = await app.api("POST", "/api/kiwix/import", { locationId: location.id, relPath });
    expect(imported.status).toBe(200);
    const id = imported.body.collection.id as string;
    // Wait until its details have been read from the archive: its title is part of how a saved file is recognised.
    await waitFor(() => fs.readFileSync(app.ctx.config.kiwix.libraryPath, "utf8").includes('name="field-library_en"'));
    const documents = (query = "") => app.api("GET", `/api/kiwix/books/${id}/documents${query}`);
    return { app, archive, id, documents };
  }

  it("gives the reader the documents, with where each file is and what kind it is", async () => {
    const { documents, archive } = await setup();
    const { status, body } = await documents();
    expect(status).toBe(200);
    expect(body.problem).toBeNull();
    expect(body.list).toMatchObject({ home: "home", total: 10, matched: 10, offset: 0, skipped: 1, truncated: false });
    expect(body.list.documents).toHaveLength(10);
    expect(body.list.documents[0]).toEqual({
      id: "0",
      title: "Boiling water to make it safe",
      description: "Water: how long to boil",
      author: "Outpost tests",
      files: [{ name: "Water (1).pdf", path: "files/Water (1).pdf", kind: "pdf", documentId: null, adding: null, problem: null }],
    });
    expect(body.list.documents[1]).toMatchObject({ title: "A camper's rocket stove", files: [{ path: "files/stoves/rocket stove.pdf" }] });
    expect(body.list.documents[2]).toMatchObject({
      title: "Sütterlin für Anfänger — 初級",
      author: "Élodie Müller",
      files: [{ name: "Schrift & Zeichen #1?.pdf", path: "files/Schrift & Zeichen #1?.pdf", kind: "pdf" }],
    });
    expect(body.list.documents[3].files.map((file: { kind: string }) => file.kind)).toEqual(["pdf", "audio"]);
    expect(body.list.documents[5].files[0]).toMatchObject({ name: "kit list.ods", kind: "other" });
    // The entry whose only file climbs out of the archive is not among them.
    expect(JSON.stringify(body)).not.toContain("Climbs out");
    expect(JSON.stringify(body)).not.toContain("elsewhere");
    // The script the list is in was fetched as a file. Nothing but the page and the list was asked for.
    expect(archive.requests.filter((url) => url.startsWith("/content/"))).toEqual(
      expect.arrayContaining([`/content/${NAUTILUS_BOOK}`, `/content/${NAUTILUS_BOOK}/home`, `/content/${NAUTILUS_BOOK}/database.js`]),
    );
    expect(archive.requests.some((url) => url.includes("nautilus.js") || url.includes("/files/"))).toBe(false);
  });

  it("finds documents by the words of their title, author, description or file name", async () => {
    const { documents } = await setup();
    const titles = async (q: string) =>
      ((await documents(`?q=${encodeURIComponent(q)}`)).body.list.documents as Array<{ title: string }>).map((document) => document.title);
    // Both have "water" in the title; a document that only mentions it would come after.
    expect(await titles("water")).toEqual(["Boiling water to make it safe", "Purifying water with bleach"]);
    expect(await titles("WATER boil")).toEqual(["Boiling water to make it safe"]);
    // The start of a word is enough; the middle of one is not.
    expect(await titles("puri")).toEqual(["Purifying water with bleach"]);
    expect(await titles("ater")).toEqual([]);
    // Accents do not have to be typed.
    expect(await titles("sutterlin anfanger")).toEqual(["Sütterlin für Anfänger — 初級"]);
    expect(await titles("elodie")).toEqual(["Sütterlin für Anfänger — 初級"]);
    // A title match comes before a match in a description or a file name.
    expect(await titles("radio")).toEqual(["Radio check procedure"]);
    expect(await titles("cooking")).toEqual(["A camper's rocket stove"]);
    expect(await titles("splint")).toEqual(["Splinting a forearm"]);
    expect(await titles("nothing like this")).toEqual([]);
    const some = (await documents("?q=water&limit=1&offset=1")).body.list;
    expect(some).toMatchObject({ total: 10, matched: 2, offset: 1 });
    expect(some.documents.map((document: { title: string }) => document.title)).toEqual(["Purifying water with bleach"]);
    expect((await documents("?limit=0")).body.list).toMatchObject({ total: 10, documents: [] });
    for (const bad of ["?limit=501", "?limit=-1", "?offset=-1", "?offset=x", `?q=${"x".repeat(201)}`]) {
      expect((await documents(bad)).status, bad).toBe(400);
    }
  });

  it("reads the list once, and says which files are already in the library", async () => {
    const { app, archive, id, documents } = await setup();
    await documents();
    await documents("?q=water");
    await documents("?offset=5");
    expect(archive.requests.filter((url) => url.endsWith("/database.js"))).toHaveLength(1);

    // A file the list names is saved by the same route as any file inside an archive.
    const saved = await app.api("POST", `/api/kiwix/books/${id}/files/save`, {
      path: "files/Schrift & Zeichen #1?.pdf",
      title: "Sütterlin für Anfänger — 初級",
    });
    expect(saved.body).toMatchObject({ status: "created", document: { title: "Sütterlin für Anfänger — 初級", type: "pdf" } });
    expect(archive.requests).toContain(`/content/${NAUTILUS_BOOK}/files/Schrift%20%26%20Zeichen%20%231%3F.pdf`);
    const after = (await documents()).body.list.documents;
    expect(after[2].files[0].documentId).toBe(saved.body.document.id);
    expect(after[0].files[0].documentId).toBeNull();
    // The proxy serves it to the viewer from the same address, in its sandbox.
    const viewed = await app.app.inject({
      method: "GET",
      url: `/kiwix/open/content/${NAUTILUS_BOOK}/files/${encodeURIComponent("Schrift & Zeichen #1?.pdf")}`,
      headers: { host: "localhost" },
    });
    expect(viewed.statusCode).toBe(200);
    expect(viewed.headers["content-type"]).toBe("application/pdf");
    expect(String(viewed.headers["content-security-policy"])).not.toContain("allow-same-origin");
  });

  it("lets Outpost's own search find a document by its title, and leads to the reader", async () => {
    const { app, id, documents } = await setup();
    await documents();
    const results = (await app.api("GET", "/api/search?q=rocket+stove")).body.results as Array<Record<string, unknown>>;
    expect(results).toEqual([
      expect.objectContaining({
        kind: "reference",
        title: "A camper's rocket stove",
        collection: "Field library",
        url: `/library/read/${id}/home?file=${encodeURIComponent("files/stoves/rocket stove.pdf")}`,
        sources: ["reference"],
      }),
    ]);
    // A document of several files, or of a kind the reader cannot show, opens the list at that document.
    const several = (await app.api("GET", "/api/search?q=radio+check")).body.results;
    expect(several[0]).toMatchObject({ title: "Radio check procedure", url: `/library/read/${id}/home?q=Radio%20check%20procedure` });
    // Descriptions are not searched from there: "litre" is in one, and in no title.
    expect((await app.api("GET", "/api/search?q=litre")).body.results).toEqual([]);
    await app.api("PATCH", "/api/settings", { "search.includeReference": false });
    expect((await app.api("GET", "/api/search?q=rocket+stove")).body.results).toEqual([]);
  });

  it("reads the list in the background when an archive is added, so search need not wait for the reader", async () => {
    const { app, archive } = await setup();
    await waitFor(() => archive.requests.some((url) => url.endsWith("/database.js")), 20_000);
    await waitFor(async () => (await app.api("GET", "/api/search?q=compass")).body.results.length === 1);
  }, 30_000);

  it("says an ordinary archive has no list", async () => {
    const { documents, archive } = await setup((made) => {
      made.home = "<html><head><title>Bowline</title></head><body><a href='./Clove_hitch'>Clove hitch</a></body></html>";
    });
    expect((await documents()).body).toEqual({ list: null, problem: null });
    await documents();
    // It is not asked for a list it does not keep, and is looked at only once.
    expect(archive.requests.some((url) => url.endsWith("/database.js"))).toBe(false);
    expect(archive.requests.filter((url) => url === `/content/${NAUTILUS_BOOK}/home`)).toHaveLength(1);
  });

  it("says so when the list is missing, too large or not a list, and shows nothing from it", async () => {
    const cases: Array<[string | Buffer | undefined, RegExp]> = [
      [undefined, /not where Outpost looks for it/],
      [`var DATABASE = [{'ti': 'x', 'fp': ['a.pdf']}]; fetch('/api/settings')`, /not written the way Outpost reads it/],
      ["var DATABASE = [{'ti': 'unterminated", /not written the way Outpost reads it/],
      [`var DATABASE = ['${"x".repeat(4 * 1024 * 1024 + 10)}']`, /larger than Outpost reads \(4 MB\)/],
      // Not text at all.
      [Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xfe, 0xfd]), /not written the way Outpost reads it/],
    ];
    for (const [database, problem] of cases) {
      const { documents } = await setup((made) => {
        made.database = database;
      });
      const { status, body } = await documents();
      expect(status).toBe(200);
      expect(body.list).toBeNull();
      expect(body.problem).toMatch(problem);
      for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    }
  }, 30_000);

  it("answers nothing for a collection that is not there or cannot be read", async () => {
    const { app, archive, id, documents } = await setup();
    expect((await app.api("GET", "/api/kiwix/books/nope/documents")).status).toBe(404);
    // While kiwix-serve is away the reader already says why, so no list is offered: its files could not be opened.
    await archive.close();
    await new Promise((resolve) => setTimeout(resolve, 5100));
    expect((await app.api("GET", `/api/kiwix/books/${id}`)).body.book.ready).toBe(false);
    expect((await documents()).body).toEqual({ list: null, problem: null });
  }, 20_000);
});
