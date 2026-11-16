/**
 * The address book for phones (CardDAV).
 *
 * Two kinds of test. The first speaks the protocol by hand and checks each answer
 * against what the RFCs ask for. The second drives a real client library, tsdav, which
 * finds the address book from nothing but the server's address, the way a phone does.
 * No phone was used: what an iPhone or DAVx5 does with these answers is not tested here.
 */
import type { AddressInfo } from "node:net";
import type { ContactDto } from "@outpost/shared";
import { DAVClient } from "tsdav";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contactFromCard } from "../src/modules/contacts/card.ts";
import { cardIdOf, readDavRequest } from "../src/modules/contacts/dav.ts";
import { parseVcards } from "../src/modules/contacts/vcard.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(async () => {
  await app.close();
});

const BOOK = "/dav/addressbooks/contacts/";
const named = (given: string, family: string) => ({ name: { prefix: "", given, additional: "", family, suffix: "" } });
const create = async (body: Record<string, unknown>) =>
  (await app.api<{ contact: ContactDto }>("POST", "/api/contacts", body)).body.contact;
const turnOn = () => app.api("PATCH", "/api/settings", { "contacts.carddav": true });

/** A request as a CardDAV client makes it: no Outpost header, no cookie, XML in and out. */
async function dav(
  method: string,
  url: string,
  options: { body?: string; depth?: string; headers?: Record<string, string> } = {},
  target: TestApp = app,
) {
  const response = await target.app.inject({
    method: method as "GET",
    url,
    payload: options.body,
    headers: {
      host: "localhost",
      ...(options.body ? { "content-type": "application/xml; charset=utf-8" } : {}),
      ...(options.depth ? { depth: options.depth } : {}),
      ...options.headers,
    },
  });
  return { status: response.statusCode, body: response.body, headers: response.headers };
}

const propfind = (props: string) =>
  `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:cs="http://calendarserver.org/ns/"><d:prop>${props}</d:prop></d:propfind>`;
const between = (text: string, open: string, close: string) => text.split(open)[1]?.split(close)[0] ?? "";
const ctagOf = async (target: TestApp = app) =>
  between((await dav("PROPFIND", BOOK, { body: propfind("<cs:getctag/>"), depth: "0" }, target)).body, "<CS:getctag>", "</CS:getctag>");

describe("the address book for phones", () => {
  it("is not there until it is turned on", async () => {
    await create(named("Maya", "Okafor"));
    expect((await dav("PROPFIND", "/dav/", { body: propfind("<d:current-user-principal/>") })).status).toBe(404);
    expect((await dav("GET", "/.well-known/carddav")).status).toBe(404);
    expect((await dav("GET", `${BOOK}anything.vcf`)).status).toBe(404);
    expect((await app.api("GET", "/api/contacts/phones")).body).toMatchObject({
      enabled: false,
      userName: "outpost",
      path: "/dav/principal/",
      contacts: 1,
    });
    await turnOn();
    expect((await dav("PROPFIND", "/dav/", { body: propfind("<d:current-user-principal/>") })).status).toBe(207);
    expect((await app.api("GET", "/api/contacts/phones")).body.enabled).toBe(true);
  });

  it("is never offered from a portable drive", async () => {
    const drive = await createTestApp({ OUTPOST_PORTABLE: "true" });
    try {
      await drive.api("PATCH", "/api/settings", { "contacts.carddav": true });
      expect((await dav("PROPFIND", "/dav/", {}, drive)).status).toBe(404);
      expect((await drive.api("GET", "/api/contacts/phones")).body).toMatchObject({ enabled: false, unavailable: "portable" });
    } finally {
      await drive.close();
    }
  });

  it("leads a client from the server's name to the address book", async () => {
    await turnOn();
    const wellKnown = await dav("PROPFIND", "/.well-known/carddav", { body: propfind("<d:current-user-principal/>") });
    expect(wellKnown.status).toBe(301);
    expect(wellKnown.headers.location).toBe("/dav/");

    const options = await dav("OPTIONS", "/dav/");
    expect(options.headers.dav).toBe("1, 3, addressbook");
    expect(options.headers.allow).toBe("OPTIONS, GET, HEAD, PROPFIND, REPORT");

    const root = await dav("PROPFIND", "/dav", { body: propfind("<d:current-user-principal/><d:resourcetype/>"), depth: "0" });
    expect(root.status).toBe(207);
    expect(root.headers["content-type"]).toBe("application/xml; charset=utf-8");
    expect(root.body).toContain("<D:current-user-principal><D:href>/dav/principal/</D:href></D:current-user-principal>");

    const principal = await dav("PROPFIND", "/dav/principal/", {
      body: propfind(
        '<card:addressbook-home-set/><d:principal-URL/><card:directory-gateway/><x:made-up xmlns:x="https://example.invalid/ns"/>',
      ),
      depth: "0",
    });
    expect(principal.body).toContain("<C:addressbook-home-set><D:href>/dav/addressbooks/</D:href></C:addressbook-home-set>");
    // What it does not have is said to be missing, by name, as the protocol asks.
    expect(principal.body).toContain(
      '<D:propstat><D:prop><C:directory-gateway/><x:made-up xmlns:x="https://example.invalid/ns"/></D:prop><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat>',
    );

    const home = await dav("PROPFIND", "/dav/addressbooks/", {
      body: propfind("<d:resourcetype/><d:displayname/><cs:getctag/>"),
      depth: "1",
    });
    expect(home.body).toContain(`<D:href>${BOOK}</D:href>`);
    expect(home.body).toContain("<D:resourcetype><D:collection/><C:addressbook/></D:resourcetype>");

    const book = await dav("PROPFIND", BOOK, { depth: "0" });
    expect(book.body).toContain("<C:addressbook-multiget/>");
    expect(book.body).toContain('<C:address-data-type content-type="text/vcard" version="3.0"/>');
    // Reading only, and no sync report that would need a record of deletions.
    expect(book.body).toContain("<D:current-user-privilege-set><D:privilege><D:read/></D:privilege>");
    expect(book.body).not.toContain("write");
    expect(book.body).not.toContain("sync-collection");
  });

  it("still lists and exports the whole address book when one contact has a label named like something every object has", async () => {
    await create({ ...named("Sam", "Whitlock") });
    const maya = await create({
      ...named("Maya", "Okafor"),
      phones: [{ value: "07700 900123", label: "constructor" }],
      emails: [{ value: "maya@example.org", label: "__proto__" }],
      addresses: [{ label: "constructor", street: "1 Shore Road", locality: "Portree", region: "", postcode: "", country: "" }],
    });
    await turnOn();

    const listing = await dav("PROPFIND", BOOK, { body: propfind("<d:getetag/>"), depth: "1" });
    expect(listing.status).toBe(207);
    expect([...listing.body.matchAll(/\.vcf<\/D:href>/g)]).toHaveLength(2);
    const card = await dav("GET", `${BOOK}${maya.id}.vcf`);
    expect(card.status).toBe(200);
    expect(card.body).toContain("X-ABLabel:constructor");
    expect(card.body).toContain("X-ABLabel:__proto__");
    const exported = await app.app.inject({ method: "GET", url: "/api/contacts/export.vcf", headers: { host: "localhost" } });
    expect(exported.statusCode).toBe(200);
    expect(exported.body.match(/BEGIN:VCARD/g)).toHaveLength(2);

    // A property asked for in a namespace of that name is answered as not found, in well-formed XML.
    const odd = await dav("PROPFIND", BOOK, { body: propfind('<x:colour xmlns:x="constructor"/>'), depth: "0" });
    expect(odd.status).toBe(207);
    expect(odd.body).toContain('<x:colour xmlns:x="constructor"/>');
    expect(odd.body).not.toContain("native code");
  });

  it("lists the cards with fingerprints that change when a card does, and at no other time", async () => {
    const maya = await create({ ...named("Maya", "Okafor"), phones: [{ value: "07700 900123", label: "mobile" }] });
    const sam = await create(named("Sam", "Whitlock"));
    await turnOn();

    const listing = await dav("PROPFIND", BOOK, { body: propfind("<d:getetag/><d:getcontenttype/>"), depth: "1" });
    const hrefs = [...listing.body.matchAll(/<D:href>([^<]+\.vcf)<\/D:href>/g)].map((match) => match[1]);
    expect(hrefs.sort()).toEqual([`${BOOK}${maya.id}.vcf`, `${BOOK}${sam.id}.vcf`].sort());
    const etagOf = (body: string, id: string) =>
      between(between(body, `${id}.vcf</D:href>`, "</D:response>"), "<D:getetag>", "</D:getetag>");
    const before = { ctag: await ctagOf(), maya: etagOf(listing.body, maya.id), sam: etagOf(listing.body, sam.id) };
    expect(before.maya).toMatch(/^"[0-9a-f]{32}"$/);

    // Asked again, and after a restart on the same data: the same answers.
    expect(await ctagOf()).toBe(before.ctag);
    const dir = app.dir;
    await app.app.close();
    app = await createTestApp({}, dir);
    expect(await ctagOf()).toBe(before.ctag);

    await new Promise((resolve) => setTimeout(resolve, 3));
    await app.api("PATCH", `/api/contacts/${maya.id}`, { nickname: "May" });
    const after = await dav("PROPFIND", BOOK, { body: propfind("<d:getetag/>"), depth: "1" });
    expect(await ctagOf()).not.toBe(before.ctag);
    expect(etagOf(after.body, maya.id)).not.toBe(before.maya);
    expect(etagOf(after.body, sam.id)).toBe(before.sam);

    const afterChange = await ctagOf();
    await app.api("DELETE", `/api/contacts/${sam.id}`);
    expect(await ctagOf()).not.toBe(afterChange);
    expect((await dav("PROPFIND", BOOK, { body: propfind("<d:getetag/>"), depth: "1" })).body).not.toContain(sam.id);
    // Because the temporary directory was handed to a second server, it is removed by hand.
    const { rmSync } = await import("node:fs");
    const close = app.close;
    app.close = async () => {
      await close();
      rmSync(dir, { recursive: true, force: true });
    };
  });

  it("gives cards as vCard 3.0, one or many at a time", async () => {
    const maya = await create({
      ...named("Maya", "Okafor"),
      phones: [{ value: "07700 900123", label: "boat shed" }],
      note: 'Tides & <weather> "quoted"',
      tags: ["Family"],
    });
    await turnOn();
    const one = await dav("GET", `${BOOK}${maya.id}.vcf`);
    expect(one.status).toBe(200);
    expect(one.headers["content-type"]).toBe("text/vcard; charset=utf-8");
    expect(one.headers.etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect(one.body).toContain("VERSION:3.0\r\n");
    expect(one.body).toContain("FN:Maya Okafor\r\n");
    const head = await dav("HEAD", `${BOOK}${maya.id}.vcf`);
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
    expect(head.headers.etag).toBe(one.headers.etag);

    const multiget = await dav("REPORT", BOOK, {
      depth: "1",
      body: `<?xml version="1.0"?><card:addressbook-multiget xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><card:address-data/></d:prop><d:href>${BOOK}${maya.id}.vcf</d:href><d:href>http://192.168.1.20:8080${BOOK}nobody.vcf</d:href><d:href>/api/settings</d:href></card:addressbook-multiget>`,
    });
    expect(multiget.status).toBe(207);
    expect(multiget.body).toContain(`<D:getetag>${one.headers.etag}</D:getetag>`);
    // The card is carried as text inside the XML, with what XML reserves escaped.
    expect(multiget.body).toContain("NOTE:Tides &amp; &lt;weather&gt; &quot;quoted&quot;");
    expect(multiget.body).toContain(
      `<D:href>http://192.168.1.20:8080${BOOK}nobody.vcf</D:href><D:status>HTTP/1.1 404 Not Found</D:status>`,
    );
    expect(multiget.body).toContain("<D:href>/api/settings</D:href><D:status>HTTP/1.1 404 Not Found</D:status>");
    expect(multiget.body).not.toContain("downloads.concurrency");

    const query = (filter: string) =>
      dav("REPORT", BOOK, {
        depth: "1",
        body: `<?xml version="1.0"?><card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/></d:prop>${filter}</card:addressbook-query>`,
      });
    expect((await query("")).body).toContain(`${maya.id}.vcf`);
    expect(
      (await query('<card:filter><card:prop-filter name="FN"><card:text-match>okaf</card:text-match></card:prop-filter></card:filter>'))
        .body,
    ).toContain(`${maya.id}.vcf`);
    expect(
      (await query('<card:filter><card:prop-filter name="FN"><card:text-match>nobody</card:text-match></card:prop-filter></card:filter>'))
        .body,
    ).not.toContain(".vcf");

    const sync = await dav("REPORT", BOOK, {
      body: '<?xml version="1.0"?><d:sync-collection xmlns:d="DAV:"><d:sync-token/><d:prop><d:getetag/></d:prop></d:sync-collection>',
    });
    expect(sync.status).toBe(403);
    expect(sync.body).toContain("<D:supported-report/>");
  });

  it("refuses every request that would add, change or delete, and changes nothing", async () => {
    const maya = await create({ ...named("Maya", "Okafor"), phones: [{ value: "07700 900123" }] });
    await turnOn();
    const card = "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:from-a-phone\r\nFN:Changed From A Phone\r\nEND:VCARD\r\n";
    const attempts = [
      await dav("PUT", `${BOOK}${maya.id}.vcf`, { body: card, headers: { "content-type": "text/vcard", "if-match": "*" } }),
      await dav("PUT", `${BOOK}new-from-phone.vcf`, { body: card, headers: { "content-type": "text/vcard", "if-none-match": "*" } }),
      await dav("DELETE", `${BOOK}${maya.id}.vcf`),
      await dav("DELETE", BOOK),
      await dav("PROPPATCH", BOOK, {
        body: '<?xml version="1.0"?><d:propertyupdate xmlns:d="DAV:"><d:set><d:prop><d:displayname>Mine now</d:displayname></d:prop></d:set></d:propertyupdate>',
      }),
      await dav("MKCOL", "/dav/addressbooks/another/"),
      await dav("MOVE", `${BOOK}${maya.id}.vcf`, { headers: { destination: `${BOOK}elsewhere.vcf` } }),
      await dav("POST", BOOK, { body: card, headers: { "content-type": "text/vcard" } }),
    ];
    for (const attempt of attempts) {
      expect(attempt.status).toBe(403);
      expect(attempt.body).toContain("<D:need-privileges>");
      expect(attempt.headers.allow).toBe("OPTIONS, GET, HEAD, PROPFIND, REPORT");
    }
    const after = (await app.api<{ contact: ContactDto }>("GET", `/api/contacts/${maya.id}`)).body.contact;
    expect(after.displayName).toBe("Maya Okafor");
    expect(after.updatedAt).toBe(maya.updatedAt);
    expect((await app.api("GET", "/api/contacts")).body.all).toBe(1);
  });

  it("asks for no password, takes none, and keeps none", async () => {
    await create(named("Maya", "Okafor"));
    await turnOn();
    const secret = "correct horse battery staple";
    const withPassword = await dav("PROPFIND", "/dav/principal/", {
      body: propfind("<d:displayname/>"),
      headers: { authorization: `Basic ${Buffer.from(`somebody:${secret}`).toString("base64")}` },
    });
    const without = await dav("PROPFIND", "/dav/principal/", { body: propfind("<d:displayname/>") });
    expect(withPassword.status).toBe(207);
    expect(without.status).toBe(207);
    expect(without.body).toBe(withPassword.body);
    for (const response of [withPassword, without]) expect(response.headers["www-authenticate"]).toBeUndefined();
    // Nothing that was sent as a password is in the database afterwards.
    const dump = app.ctx.sqlite.serialize().toString("latin1");
    expect(dump).not.toContain(secret);
    expect(dump).not.toContain(Buffer.from(`somebody:${secret}`).toString("base64"));
  });

  it("is held to the same check of the address it is reached by as the rest of Outpost", async () => {
    await turnOn();
    const rebound = await dav("PROPFIND", "/dav/", { headers: { host: "attacker.example.com" } });
    expect(rebound.status).toBe(403);
  });

  it("reads requests strictly and refuses what is not well-formed", async () => {
    await turnOn();
    expect((await dav("PROPFIND", BOOK, { body: "<d:propfind xmlns:d='DAV:'><d:prop>" })).status).toBe(400);
    // A document type could name files or addresses to read; none is ever accepted.
    const doctype =
      '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><d:propfind xmlns:d="DAV:"><d:prop><d:displayname>&x;</d:displayname></d:prop></d:propfind>';
    expect((await dav("PROPFIND", BOOK, { body: doctype })).status).toBe(400);
    expect((await dav("PROPFIND", BOOK, { body: "x".repeat(3 * 1024 * 1024) })).status).toBe(413);
    // An address that climbs out of the address book is an address of the API, and is held to the API's rules.
    const climbed = await dav("PROPFIND", "/dav/addressbooks/contacts/../../../api/settings");
    expect(climbed.status).toBe(403);
    expect(climbed.body).not.toContain("downloads.concurrency");
    expect((await dav("PROPFIND", "/dav/addressbooks/contacts/%2e%2e%2f%2e%2e%2fsecret")).status).toBe(404);

    expect(readDavRequest("")).toMatchObject({ all: true, props: [] });
    expect(readDavRequest('<a:propfind xmlns:a="DAV:"><a:allprop/></a:propfind>')).toMatchObject({ all: true });
    expect(readDavRequest(propfind("<d:getetag/><card:address-data><card:prop name='FN'/></card:address-data>")).props).toEqual([
      { ns: "DAV:", local: "getetag" },
      { ns: "urn:ietf:params:xml:ns:carddav", local: "address-data" },
    ]);
    expect(cardIdOf(`${BOOK}01jabc.vcf`)).toBe("01jabc");
    expect(cardIdOf(`https://outpost.local:8443${BOOK}01jabc.vcf?x=1`)).toBe("01jabc");
    expect(cardIdOf(`${BOOK}..%2F..%2Fsecret.vcf`)).toBeNull();
    expect(cardIdOf(`${BOOK}UPPER.vcf`)).toBeNull();
    expect(cardIdOf("/dav/addressbooks/other/01jabc.vcf")).toBeNull();
  });
});

describe("with a CardDAV client library (tsdav)", () => {
  it("finds the address book from the server's address alone, reads every card, sees a change, and cannot write", async () => {
    const maya = await create({
      ...named("Maya", "Okafor"),
      phones: [
        { value: "07700 900123", label: "mobile" },
        { value: "01632 960888", label: "boat shed" },
      ],
      emails: [{ value: "maya@okafor.example", label: "home" }],
      note: "Tides & <weather>\nSecond line",
      tags: ["Family"],
      isEmergency: true,
    });
    await create({ kind: "organisation", organisation: "Borrowdale Mountain Rescue", phones: [{ value: "01632 960999", label: "main" }] });
    await turnOn();
    await app.app.listen({ port: 0, host: "127.0.0.1" });
    const serverUrl = `http://127.0.0.1:${(app.app.server.address() as AddressInfo).port}`;

    // Any user name and password: a client insists on sending them, and Outpost ignores them.
    const client = new DAVClient({
      serverUrl,
      credentials: { username: "outpost", password: "not-a-real-password" },
      authMethod: "Basic",
      defaultAccountType: "carddav",
    });
    await client.login();
    expect(client.account?.principalUrl).toBe(`${serverUrl}/dav/principal/`);
    expect(client.account?.homeUrl).toBe(`${serverUrl}/dav/addressbooks/`);

    const books = await client.fetchAddressBooks();
    expect(books).toHaveLength(1);
    const book = books[0]!;
    expect(book.url).toBe(`${serverUrl}${BOOK}`);
    expect(book.displayName).toBe("Outpost");
    expect(book.ctag).toMatch(/^[0-9a-f]{32}$/);

    const cards = await client.fetchVCards({ addressBook: book });
    expect(cards).toHaveLength(2);
    const mine = cards.find((card) => card.url.endsWith(`${maya.id}.vcf`))!;
    expect(mine.etag).toMatch(/^"[0-9a-f]{32}"$/);
    // What the client was given reads back as the contact Outpost holds.
    const [read] = (await parseVcards(Buffer.from(mine.data as string))).cards.map(contactFromCard);
    expect(read!.fields).toMatchObject({
      name: { given: "Maya", family: "Okafor" },
      phones: [
        { value: "07700 900123", label: "mobile" },
        { value: "01632 960888", label: "boat shed" },
      ],
      emails: [{ value: "maya@okafor.example", label: "home" }],
      note: "Tides & <weather>\nSecond line",
      tags: ["Family"],
      isEmergency: true,
    });

    // Nothing changed: the client is told so. Then a change in Outpost: it is told that too, and finds which card.
    expect((await client.isCollectionDirty({ collection: book })).isDirty).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 3));
    await app.api("PATCH", `/api/contacts/${maya.id}`, { phones: [{ value: "07700 900999", label: "mobile" }] });
    expect((await client.isCollectionDirty({ collection: book })).isDirty).toBe(true);
    const again = await client.fetchVCards({ addressBook: book });
    const changed = again.find((card) => card.url === mine.url)!;
    expect(changed.etag).not.toBe(mine.etag);
    expect(changed.data).toContain("TEL;TYPE=CELL:07700 900999");
    expect(again.find((card) => card.url !== mine.url)!.etag).toBe(cards.find((card) => card.url !== mine.url)!.etag);

    // The client asks to add, change and delete. Each is refused, and Outpost's contacts are as they were.
    const vCardString = "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:from-a-phone\r\nFN:Added From A Phone\r\nEND:VCARD\r\n";
    const added = await client.createVCard({ addressBook: book, filename: "from-a-phone.vcf", vCardString });
    expect(added.status).toBe(403);
    const updated = await client.updateVCard({ vCard: { url: changed.url, etag: changed.etag, data: vCardString } });
    expect(updated.status).toBe(403);
    const deleted = await client.deleteVCard({ vCard: { url: changed.url, etag: changed.etag } });
    expect(deleted.status).toBe(403);
    const after = await client.fetchVCards({ addressBook: book });
    expect(after.map((card) => card.etag).sort()).toEqual(again.map((card) => card.etag).sort());
    expect((await app.api("GET", "/api/contacts")).body.all).toBe(2);
  });
});
