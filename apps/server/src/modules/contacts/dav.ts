/**
 * The address book for phones: a small CardDAV server (RFC 6352) with one address book
 * that can be read and cannot be written.
 *
 * What it is for. A phone or computer that is given this address keeps a copy of
 * Outpost's contacts in its own contacts app and brings the copy up to date by itself.
 * The copy is still on the phone when Outpost cannot be reached, which is when an
 * emergency list is wanted.
 *
 * Which way it goes: from Outpost to the phone, and never back. Outpost's contacts are
 * the original. Every request that would add, change or delete is refused, so nothing a
 * phone does, and no mistake in a phone's software, can alter or remove a contact here;
 * and because the phone holds this address book as an account of its own, beside the
 * contacts it already has, nothing here can alter or remove those. Bringing contacts
 * from a phone into Outpost is done with a file, where a person sees what will change.
 *
 * No user name or password is checked. Outpost has no accounts, and everything this
 * serves can be read by the same devices in the web app with no password either, so a
 * password here would protect nothing; it would only be one more thing sent across the
 * network. A CardDAV client insists on being given a user name all the same: any is
 * accepted, and whatever is sent is ignored and never stored. The server never asks for
 * a password (it never answers 401), so a client that behaves does not send one.
 *
 * What is served: the discovery address (RFC 6764), PROPFIND on the five kinds of
 * resource, the `addressbook-multiget` and `addressbook-query` reports, and GET of one
 * card. A client finds what changed by the collection's CTag and each card's ETag, both
 * of which are worked out from the cards themselves, so they are right after a restart
 * or a restore. The `sync-collection` report (RFC 6578) is not offered: it needs a
 * record of what was deleted and when, and the listing does the same job for an
 * address book of this size.
 *
 * It has been tested with a CardDAV client library (see test/contacts-dav.test.ts),
 * not with a phone.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppContext } from "../../core/context.ts";
import { sha256Hex } from "../../core/ids.ts";
import { XML_CLOSE, XML_END, XML_OPEN, XML_TEXT, XmlLimitError, XmlSyntaxError, XmlTokenizer } from "../maps/gpx-xml.ts";
import type { ContactsService } from "./service.ts";

export const DAV_ROOT = "/dav/";
export const DAV_PRINCIPAL_PATH = "/dav/principal/";
const HOME = "/dav/addressbooks/";
const BOOK = "/dav/addressbooks/contacts/";
/** What to type where a phone asks for a user name. It is a label, not a secret. */
export const DAV_USER_NAME = "outpost";

const DAV = "DAV:";
const CARD = "urn:ietf:params:xml:ns:carddav";
const CS = "http://calendarserver.org/ns/";
const PREFIX: Record<string, string> = { [DAV]: "D", [CARD]: "C", [CS]: "CS" };
const ROOT_ATTRIBUTES = `xmlns:D="${DAV}" xmlns:C="${CARD}" xmlns:CS="${CS}"`;
/** A request body is a few lines naming properties, or a list of cards to fetch. */
const MAX_BODY = 2 * 1024 * 1024;
const MAX_HREFS = 20_000;
const DAV_HEADER = "1, 3, addressbook";
const READ_METHODS = "OPTIONS, GET, HEAD, PROPFIND, REPORT";

interface PropName {
  ns: string;
  local: string;
}

interface DavRequest {
  root: PropName | null;
  /** Properties asked for; empty with `all` set when everything is wanted. */
  props: PropName[];
  all: boolean;
  hrefs: string[];
  textMatches: string[];
  matchAll: boolean;
}

export const escapeXml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Characters XML 1.0 cannot hold at all.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: these are exactly the characters being removed
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "");

/** Reads the little XML a client sends. Throws `XmlSyntaxError` for anything that is not well-formed. */
export function readDavRequest(body: string): DavRequest {
  const result: DavRequest = { root: null, props: [], all: false, hrefs: [], textMatches: [], matchAll: false };
  if (!body.trim()) {
    result.all = true;
    return result;
  }
  const xml = new XmlTokenizer(body);
  /** What the text being read belongs to. */
  let collecting: "href" | "match" | null = null;
  let text = "";
  let inProp = false;
  for (let event = xml.next(); event !== XML_END; event = xml.next()) {
    if (event === XML_OPEN) {
      const name = { ns: xml.uri, local: xml.local };
      if (xml.depth === 1) result.root = name;
      else if (xml.depth === 2 && name.ns === DAV && (name.local === "allprop" || name.local === "propname")) result.all = true;
      else if (xml.depth === 2 && name.ns === DAV && name.local === "prop") inProp = true;
      else if (xml.depth === 3 && inProp) result.props.push(name);
      else if (xml.depth === 2 && name.ns === DAV && name.local === "href") {
        collecting = "href";
        text = "";
      } else if (name.ns === CARD && name.local === "filter") result.matchAll = xml.attribute("test") === "allof";
      else if (name.ns === CARD && name.local === "text-match") {
        collecting = "match";
        text = "";
      }
    } else if (event === XML_TEXT) {
      if (collecting) text += xml.text();
    } else if (event === XML_CLOSE) {
      if (collecting === "href" && xml.depth === 1) {
        if (result.hrefs.length >= MAX_HREFS) throw new XmlLimitError("run");
        result.hrefs.push(text.trim());
        collecting = null;
      } else if (collecting === "match") {
        if (text.trim() && result.textMatches.length < 50) result.textMatches.push(text.trim().toLowerCase());
        collecting = null;
      }
      if (xml.depth === 1) inProp = false;
    }
  }
  if (result.props.length === 0 && result.root?.local === "propfind") result.all = true;
  return result;
}

type Props = Map<string, string>;
const key = (name: PropName) => `${name.ns}|${name.local}`;
const prop = (ns: string, local: string, value: string): [string, string] => [`${ns}|${local}`, value];

function element(name: PropName, inner: string | null): string {
  const prefix = PREFIX[name.ns];
  // A name is only ever echoed from a request the XML reader accepted, so it is a legal name.
  const open = prefix ? `${prefix}:${name.local}` : `x:${name.local} xmlns:x="${escapeXml(name.ns)}"`;
  const close = prefix ? `${prefix}:${name.local}` : `x:${name.local}`;
  return inner ? `<${open}>${inner}</${close}>` : `<${open}/>`;
}

function nameOf(propKey: string): PropName {
  const bar = propKey.lastIndexOf("|");
  return { ns: propKey.slice(0, bar), local: propKey.slice(bar + 1) };
}

/** One resource in a multistatus answer: what was asked for and found, and what was asked for and is not there. */
function response(href: string, has: Props, request: DavRequest, hidden: string[] = []): string {
  const found: string[] = [];
  const missing: string[] = [];
  if (request.all) {
    for (const [propKey, value] of has) if (!hidden.includes(propKey)) found.push(element(nameOf(propKey), value));
  } else {
    for (const name of request.props) {
      const value = has.get(key(name));
      if (value === undefined) missing.push(element(name, null));
      else found.push(element(name, value));
    }
  }
  let out = `<D:response><D:href>${escapeXml(href)}</D:href>`;
  if (found.length > 0 || missing.length === 0)
    out += `<D:propstat><D:prop>${found.join("")}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>`;
  if (missing.length > 0) out += `<D:propstat><D:prop>${missing.join("")}</D:prop><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat>`;
  return `${out}</D:response>`;
}

const gone = (href: string): string =>
  `<D:response><D:href>${escapeXml(href)}</D:href><D:status>HTTP/1.1 404 Not Found</D:status></D:response>`;
const multistatus = (responses: string[]): string =>
  `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus ${ROOT_ATTRIBUTES}>${responses.join("")}</D:multistatus>`;
const href = (path: string) => `<D:href>${path}</D:href>`;
const READ_ONLY = "<D:privilege><D:read/></D:privilege><D:privilege><D:read-current-user-privilege-set/></D:privilege>";

/** The contact a card address names, or null when it is not the address of a card. */
export function cardIdOf(address: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(new URL(address, "http://outpost.invalid").pathname);
  } catch {
    return null;
  }
  const match = /^\/dav\/addressbooks\/contacts\/([0-9a-z]{1,64})\.vcf$/.exec(path);
  return match ? match[1]! : null;
}

export async function registerContactsDav(app: FastifyInstance, ctx: AppContext, contacts: ContactsService): Promise<void> {
  const enabled = () => ctx.services.settings.get("contacts.carddav") && !ctx.config.portable;

  // The methods WebDAV adds to HTTP. The ones that write are known so that they can be refused in words.
  for (const [method, hasBody] of [
    ["PROPFIND", true],
    ["REPORT", true],
    ["PROPPATCH", true],
    ["MKCOL", true],
    ["MOVE", false],
    ["COPY", false],
  ] as const) {
    // biome-ignore lint/suspicious/noExplicitAny: Fastify's types name only the methods of plain HTTP
    if (!app.supportedMethods.includes(method)) app.addHttpMethod(method as any, { hasBody });
  }

  const principalProps = (): Props =>
    new Map([
      prop(DAV, "resourcetype", "<D:collection/><D:principal/>"),
      prop(DAV, "displayname", "Outpost contacts"),
      prop(DAV, "current-user-principal", href(DAV_PRINCIPAL_PATH)),
      prop(DAV, "principal-URL", href(DAV_PRINCIPAL_PATH)),
      prop(CARD, "addressbook-home-set", href(HOME)),
      prop(DAV, "current-user-privilege-set", READ_ONLY),
    ]);
  const rootProps = (): Props =>
    new Map([
      prop(DAV, "resourcetype", "<D:collection/>"),
      prop(DAV, "displayname", "Outpost"),
      prop(DAV, "current-user-principal", href(DAV_PRINCIPAL_PATH)),
      prop(DAV, "current-user-privilege-set", READ_ONLY),
    ]);
  const homeProps = (): Props =>
    new Map([
      prop(DAV, "resourcetype", "<D:collection/>"),
      prop(DAV, "displayname", "Address books"),
      prop(DAV, "current-user-principal", href(DAV_PRINCIPAL_PATH)),
      prop(DAV, "owner", href(DAV_PRINCIPAL_PATH)),
      prop(DAV, "current-user-privilege-set", READ_ONLY),
    ]);
  const bookProps = (cards: Array<{ id: string; etag: string }>): Props =>
    new Map([
      prop(DAV, "resourcetype", "<D:collection/><C:addressbook/>"),
      prop(DAV, "displayname", "Outpost"),
      prop(CARD, "addressbook-description", "Contacts kept in Outpost. They are changed in Outpost, not here."),
      // Changes whenever a card is added, changed or removed, and at no other time.
      prop(CS, "getctag", sha256Hex(cards.map((card) => `${card.id}:${card.etag}`).join("\n")).slice(0, 32)),
      prop(
        DAV,
        "supported-report-set",
        "<D:supported-report><D:report><C:addressbook-multiget/></D:report></D:supported-report><D:supported-report><D:report><C:addressbook-query/></D:report></D:supported-report>",
      ),
      prop(CARD, "supported-address-data", '<C:address-data-type content-type="text/vcard" version="3.0"/>'),
      prop(DAV, "current-user-principal", href(DAV_PRINCIPAL_PATH)),
      prop(DAV, "owner", href(DAV_PRINCIPAL_PATH)),
      prop(DAV, "current-user-privilege-set", READ_ONLY),
    ]);
  const cardProps = (card: { etag: string; body?: string }): Props => {
    const props: Props = new Map([
      prop(DAV, "getetag", `"${card.etag}"`),
      prop(DAV, "getcontenttype", "text/vcard; charset=utf-8"),
      prop(DAV, "resourcetype", ""),
    ]);
    if (card.body !== undefined) {
      props.set(`${DAV}|getcontentlength`, String(Buffer.byteLength(card.body)));
      props.set(`${CARD}|address-data`, escapeXml(card.body));
    }
    return props;
  };
  const cardHref = (id: string) => `${BOOK}${id}.vcf`;
  const wants = (request: DavRequest, ns: string, local: string) => request.props.some((name) => name.ns === ns && name.local === local);

  const send = (reply: FastifyReply, status: number, body: string) =>
    reply.status(status).header("Content-Type", "application/xml; charset=utf-8").header("DAV", DAV_HEADER).send(body);

  function propfind(request: FastifyRequest, reply: FastifyReply, path: string, body: DavRequest) {
    const deep = (request.headers.depth ?? "0") !== "0";
    const responses: string[] = [];
    if (path === DAV_ROOT) {
      responses.push(response(DAV_ROOT, rootProps(), body));
      if (deep) responses.push(response(DAV_PRINCIPAL_PATH, principalProps(), body), response(HOME, homeProps(), body));
    } else if (path === DAV_PRINCIPAL_PATH) {
      responses.push(response(DAV_PRINCIPAL_PATH, principalProps(), body));
    } else if (path === HOME) {
      responses.push(response(HOME, homeProps(), body));
      if (deep) responses.push(response(BOOK, bookProps(contacts.cards()), body));
    } else if (path === BOOK) {
      const cards = contacts.cards();
      responses.push(response(BOOK, bookProps(cards), body));
      if (deep) {
        // The card itself is only made when its text or its size is asked for.
        const whole = wants(body, CARD, "address-data") || wants(body, DAV, "getcontentlength");
        for (const card of cards) {
          const full = whole ? contacts.card(card.id) : null;
          responses.push(response(cardHref(card.id), cardProps(full ?? card), body, [`${CARD}|address-data`]));
        }
      }
    } else {
      const id = cardIdOf(path);
      const card = id ? contacts.card(id) : null;
      if (!id || !card) return reply.status(404).header("DAV", DAV_HEADER).send();
      responses.push(response(cardHref(id), cardProps(card), body, [`${CARD}|address-data`]));
    }
    return send(reply, 207, multistatus(responses));
  }

  function report(reply: FastifyReply, path: string, body: DavRequest) {
    if (path !== BOOK) return reply.status(404).header("DAV", DAV_HEADER).send();
    const kind = body.root?.ns === CARD ? body.root.local : "";
    const answer: DavRequest = { ...body, all: body.props.length === 0 };
    if (kind === "addressbook-multiget") {
      const responses = body.hrefs.map((address) => {
        const id = cardIdOf(address);
        const card = id ? contacts.card(id) : null;
        return id && card ? response(cardHref(id), cardProps(card), answer) : gone(address);
      });
      return send(reply, 207, multistatus(responses));
    }
    if (kind === "addressbook-query") {
      const responses: string[] = [];
      for (const entry of contacts.cards()) {
        const card = contacts.card(entry.id);
        if (!card) continue;
        // A filter is read as words to look for in the card; with none, every card answers.
        const text = body.textMatches.length > 0 ? card.body.toLowerCase() : "";
        const matches =
          body.textMatches.length === 0 ||
          (body.matchAll ? body.textMatches.every((word) => text.includes(word)) : body.textMatches.some((word) => text.includes(word)));
        if (matches) responses.push(response(cardHref(entry.id), cardProps(card), answer));
      }
      return send(reply, 207, multistatus(responses));
    }
    return send(reply, 403, `<?xml version="1.0" encoding="utf-8"?>\n<D:error ${ROOT_ATTRIBUTES}><D:supported-report/></D:error>`);
  }

  async function handle(request: FastifyRequest, reply: FastifyReply) {
    if (!enabled()) {
      return reply
        .status(404)
        .type("text/plain; charset=utf-8")
        .send("Contacts are not being shared with phones. It is turned on in Outpost, under Contacts, From a phone.");
    }
    let path = request.url.split("?")[0] ?? "";
    try {
      path = decodeURIComponent(path);
    } catch {
      return reply.status(400).send();
    }
    if (path === "/dav" || path === "/dav/principal" || path === "/dav/addressbooks" || path === "/dav/addressbooks/contacts") path += "/";
    const method = request.method;

    if (method === "OPTIONS") return reply.status(200).header("Allow", READ_METHODS).header("DAV", DAV_HEADER).send();

    if (method === "PROPFIND" || method === "REPORT") {
      let body: DavRequest;
      try {
        body = readDavRequest(typeof request.body === "string" ? request.body : "");
      } catch (error) {
        if (error instanceof XmlSyntaxError || error instanceof XmlLimitError) {
          return reply.status(400).type("text/plain; charset=utf-8").send("The request is not well-formed XML.");
        }
        throw error;
      }
      return method === "PROPFIND" ? propfind(request, reply, path, body) : report(reply, path, body);
    }

    if (method === "GET" || method === "HEAD") {
      const id = cardIdOf(path);
      const card = id ? contacts.card(id) : null;
      if (card) {
        reply
          .header("Content-Type", "text/vcard; charset=utf-8")
          .header("ETag", `"${card.etag}"`)
          .header("Content-Length", Buffer.byteLength(card.body));
        return method === "HEAD" ? reply.send() : reply.send(card.body);
      }
      if ([DAV_ROOT, DAV_PRINCIPAL_PATH, HOME, BOOK].includes(path)) {
        return reply
          .type("text/plain; charset=utf-8")
          .header("DAV", DAV_HEADER)
          .send(
            "This is Outpost's address book for phones (CardDAV). Give this address to a contacts app; there is nothing to read here in a browser.\n",
          );
      }
      return reply.status(404).send();
    }

    // Everything else would add, change or delete. The address book is Outpost's to change, on its own screen.
    return send(
      reply.header("Allow", READ_METHODS),
      403,
      `<?xml version="1.0" encoding="utf-8"?>\n<D:error ${ROOT_ATTRIBUTES}><D:need-privileges><D:resource><D:href>${escapeXml(path)}</D:href><D:privilege><D:write/></D:privilege></D:resource></D:need-privileges></D:error>`,
    );
  }

  const methods = ["OPTIONS", "GET", "HEAD", "PROPFIND", "REPORT", "PUT", "DELETE", "POST", "PATCH", "PROPPATCH", "MKCOL", "MOVE", "COPY"];

  await app.register(async (dav) => {
    // Clients send their XML as application/xml, text/xml, or with no type at all. It is read as text and nothing else.
    dav.removeAllContentTypeParsers();
    dav.addContentTypeParser("*", { parseAs: "string", bodyLimit: MAX_BODY }, (_request, body, done) => done(null, body));
    for (const url of ["/dav", "/dav/*"]) {
      // biome-ignore lint/suspicious/noExplicitAny: Fastify's types name only the methods of plain HTTP
      dav.route({ method: methods as any, url, handler: handle });
    }
    /** Where a client that was given only the server's name looks first (RFC 6764). */
    dav.route({
      // biome-ignore lint/suspicious/noExplicitAny: as above
      method: ["GET", "HEAD", "PROPFIND", "OPTIONS"] as any,
      url: "/.well-known/carddav",
      handler: async (_request, reply) => {
        if (!enabled()) return reply.status(404).send();
        return reply.status(301).header("Location", DAV_ROOT).send();
      },
    });
  });
}
