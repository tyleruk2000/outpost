/**
 * The household's own MQTT broker (a Mosquitto the household already runs), as far as
 * Outpost can look after it from the screen, each only when a person presses its button:
 *
 *  - Find: is a broker answering on this computer (127.0.0.1, ports 1883 and 8883) or, in a
 *    container, on the computer the container runs on (the container's default gateway),
 *    or at an address the person names; and does it ask for a password. Outpost's own
 *    broker is named as such, never offered as the household's.
 *  - Test: sign in as the form says, subscribe to the radio's topics, send one check
 *    message under the root topic and see it come back, then listen a few seconds for a
 *    radio, saying in words what happened at each step.
 *  - Dynamic security (Mosquitto's plugin, mosquitto.org/documentation/dynamic-security/):
 *    whether it is on and Outpost's account may manage it, and if so add an account for a
 *    radio limited to the radio's topics. Commands go to `$CONTROL/dynamic-security/v1`;
 *    answers come on `.../response`. Outpost never edits the broker's files or container.
 *
 * Everything here was tried against Mosquitto 2.1 (docs/mesh-radio.md).
 */
import fs from "node:fs";
import net from "node:net";
import type { MeshBrokerFound, MeshBrokerTestInput, MeshBrokerTestResult, MeshDynsecResult, MeshFindResponse } from "@outpost/shared";
import { badRequest } from "../../core/errors.ts";
import { isLoopbackAddress } from "../../core/local.ts";
import { parseTopic } from "./meshtastic/json.ts";
import { openSession, type Session, SessionError, type SessionOptions } from "./mqtt/session.ts";

const DYNSEC = "$CONTROL/dynamic-security/v1";
export const LISTEN_MS = 8000;
const CHECK_MS = 2000;

/**
 * The address of the computer a container runs on, as the container sees it: the default
 * route's gateway in /proc/net/route (proc_net(5); the gateway is little-endian hex). On the
 * owner's Raspberry Pi, Docker's bridge gave 172.19.0.1, and Mosquitto published on the Pi
 * answered there. Null outside Linux or when there is no default route.
 */
export function containerHost(read: () => string | null = readRoute): string | null {
  const text = read();
  if (!text) return null;
  for (const line of text.split("\n").slice(1)) {
    const [, destination, gateway] = line.trim().split(/\s+/);
    if (destination !== "00000000" || !gateway || !/^[0-9A-Fa-f]{8}$/.test(gateway)) continue;
    const value = Number.parseInt(gateway, 16);
    const address = [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, value >>> 24].join(".");
    return address === "0.0.0.0" ? null : address;
  }
  return null;
}

function readRoute(): string | null {
  try {
    return fs.readFileSync("/proc/net/route", "utf8").slice(0, 64 * 1024);
  } catch {
    return null;
  }
}

/** One look at host:port: CONNECT with no user name, then DISCONNECT. Nothing else is sent. */
async function look(host: string, port: number, tls: boolean, where: MeshBrokerFound["where"]): Promise<MeshBrokerFound> {
  const base = { host, port, tls, where };
  try {
    const session = await openSession({ host, port, tls: tls ? { verify: false } : null, timeoutMs: 2500 });
    const certificate = session.certificate;
    await session.close();
    return {
      ...base,
      answer: "open-to-anyone",
      words:
        "Answers, and lets anyone on the network in without a password. Give it user names and passwords before a radio uses it (see the guide below).",
      certificate,
    };
  } catch (error) {
    if (!(error instanceof SessionError)) throw error;
    if (error.kind === "refused-login") return { ...base, answer: "needs-login", words: "Answers, and asks for a user name and password." };
    if (error.kind === "unreachable" && /Nothing is accepting/.test(error.message))
      return { ...base, answer: "nothing", words: "Nothing there." };
    if (error.kind === "timeout") return { ...base, answer: "no-answer", words: "Did not answer in time." };
    return { ...base, answer: "not-mqtt", words: error.message };
  }
}

export interface FindContext {
  inContainer: boolean;
  /** Outpost's own broker, when it is running: its port. */
  ownBrokerPort: number | null;
  host?: () => string | null;
}

export async function findBrokers(context: FindContext, named?: { host: string; port: number }): Promise<MeshFindResponse> {
  const places: Array<{ host: string; where: MeshBrokerFound["where"] }> = [{ host: "127.0.0.1", where: "this-computer" }];
  if (context.inContainer) {
    const outside = (context.host ?? containerHost)();
    if (outside) places.push({ host: outside, where: "container-host" });
  }
  const tries: Array<Promise<MeshBrokerFound>> = [];
  for (const place of places) {
    for (const [port, tls] of [
      [1883, false],
      [8883, true],
    ] as const) {
      if (place.where === "this-computer" && port === context.ownBrokerPort)
        tries.push(
          Promise.resolve({
            host: place.host,
            port,
            tls,
            where: place.where,
            answer: "outpost",
            words: "Outpost's own broker. Turn it off before using another broker on this port.",
          }),
        );
      else tries.push(look(place.host, port, tls, place.where));
    }
  }
  if (named) {
    const own = context.ownBrokerPort === named.port && (isLoopbackAddress(named.host) || named.host === "localhost");
    if (!own && !places.some((place) => place.host === named.host && [1883, 8883].includes(named.port)))
      tries.push(
        look(named.host, named.port, named.port === 8883, "named").then((found) =>
          // A port that closes on a plain greeting may be a TLS one: look again that way.
          found.answer === "not-mqtt" && !found.tls
            ? look(named.host, named.port, true, "named").then((again) => (again.answer === "not-mqtt" ? found : again))
            : found,
        ),
      );
  }
  return { found: await Promise.all(tries), inContainer: context.inContainer, containerHost: places[1]?.host ?? null };
}

function sessionOptions(
  input: { host: string; port: number; tls: boolean; ca?: string | null; userName: string },
  password: string | null,
): SessionOptions {
  return {
    host: input.host,
    port: input.port,
    tls: input.tls ? { ca: input.ca ?? null } : null,
    userName: input.userName || undefined,
    password: password ?? undefined,
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms).unref());

/** Signs in, subscribes, sends one check message and listens: each step said in words. */
export async function testBroker(input: MeshBrokerTestInput, password: string | null, listenMs = LISTEN_MS): Promise<MeshBrokerTestResult> {
  const root = input.rootTopic;
  const steps: MeshBrokerTestResult["steps"] = [];
  const where = `${input.host}:${input.port}`;
  const over = input.tls ? ", over TLS with its certificate checked" : "";
  let session: Session;
  try {
    session = await openSession(sessionOptions(input, password));
  } catch (error) {
    if (!(error instanceof SessionError)) throw error;
    steps.push({ step: "connect", ok: false, words: error.message });
    return { ok: false, steps, heard: [] };
  }
  steps.push({
    step: "connect",
    ok: true,
    words: `Signed in to ${where}${input.userName ? ` as ${input.userName}` : " with no user name"}${over}.`,
  });
  const heard = new Map<string, number>();
  const check = `${root}/outpost-check/${Math.random().toString(36).slice(2, 10)}`;
  let checked = false;
  session.onMessage((topic) => {
    if (topic === check) {
      checked = true;
      return;
    }
    const parts = parseTopic(topic);
    if (!parts) return;
    const radio = parts.gatewayId ?? "a radio that gives no id";
    heard.set(radio, (heard.get(radio) ?? 0) + 1);
  });
  try {
    const codes = await session.subscribe([`${root}/2/json/#`, `${root}/2/e/#`]);
    if (codes.some((code) => code === 0x80)) {
      steps.push({
        step: "subscribe",
        ok: false,
        words: `The broker will not let this account read ${root}/2/…. Its access list must allow Outpost's account to read ${root}/#.`,
      });
      return { ok: false, steps, heard: [] };
    }
    steps.push({ step: "subscribe", ok: true, words: `Subscribed to the radio's topics under ${root}.` });

    await session.subscribe([check]);
    session.publish(check, Buffer.from("Outpost checking it can read and write here"));
    for (let waited = 0; waited < CHECK_MS && !checked; waited += 100) await wait(100);
    steps.push(
      checked
        ? { step: "check", ok: true, words: `A check message sent under ${root} came back: this account may read and write there.` }
        : {
            step: "check",
            ok: false,
            words: `A check message sent under ${root} did not come back. The broker's access list may not let this account write or read under ${root}: give Outpost's account readwrite on ${root}/#. (Mosquitto still says yes to the subscription when its access list says no, so this is the step that tells.)`,
          },
    );

    for (let waited = 0; waited < listenMs; waited += 200) {
      if (heard.size > 0 && waited >= 1000) break;
      await wait(200);
    }
    const radios = [...heard].map(([radio, messages]) => ({ radio, messages }));
    steps.push(
      radios.length > 0
        ? {
            step: "listen",
            ok: true,
            words: `Heard ${radios.map((entry) => `${entry.messages} message${entry.messages === 1 ? "" : "s"} from ${entry.radio}`).join(", ")}.`,
          }
        : {
            step: "listen",
            ok: null,
            words: `Nothing heard from a radio in ${Math.round(listenMs / 1000)} seconds. A radio publishes when it hears something on the mesh, so this can be quiet; if it stays so, check the radio's MQTT server, user name and root topic (${root}).`,
          },
    );
    return { ok: steps.every((step) => step.ok !== false), steps, heard: radios };
  } finally {
    await session.close();
  }
}

/** A dynamic security command and its answer; null when none came. */
async function command(
  session: Session,
  commands: Array<Record<string, unknown>>,
  ms = 3000,
): Promise<Array<Record<string, unknown>> | null> {
  let answer: Array<Record<string, unknown>> | null = null;
  session.onMessage((topic, payload) => {
    if (topic !== `${DYNSEC}/response`) return;
    try {
      const parsed = JSON.parse(payload.toString("utf8")) as { responses?: Array<Record<string, unknown>> };
      if (Array.isArray(parsed.responses)) answer = parsed.responses;
    } catch {
      // Not an answer.
    }
  });
  session.publish(DYNSEC, Buffer.from(JSON.stringify({ commands })));
  for (let waited = 0; waited < ms && !answer; waited += 100) await wait(100);
  return answer;
}

const NOT_ON =
  "No answer from Mosquitto's dynamic security: it is not switched on, or the broker drops what this account sends to it. Accounts and access are then in Mosquitto's own files, which Outpost does not change: use the lines in the guide below.";

/** Opens a session as Outpost's account and asks the plugin something; the refusals in words. */
async function withDynsec<T>(
  input: { host: string; port: number; tls: boolean; ca?: string | null; userName: string },
  password: string | null,
  then: (session: Session) => Promise<T>,
): Promise<T | MeshDynsecResult> {
  let session: Session;
  try {
    session = await openSession(sessionOptions(input, password));
  } catch (error) {
    if (!(error instanceof SessionError)) throw error;
    return { state: "failed", words: error.message, clients: [] };
  }
  try {
    const [code] = await session.subscribe([`${DYNSEC}/response`]);
    if (code === 0x80)
      return {
        state: "not-allowed",
        words:
          "Mosquitto refused this account its dynamic security topics: the plugin is on (or the broker forbids them), and Outpost's account may not manage it. To let it add radio accounts, give it the dynsec-admin role (see the guide), or add them yourself with mosquitto_ctrl.",
        clients: [],
      };
    return await then(session);
  } finally {
    await session.close();
  }
}

export async function dynsecStatus(
  input: { host: string; port: number; tls: boolean; ca?: string | null; userName: string },
  password: string | null,
): Promise<MeshDynsecResult> {
  return withDynsec(input, password, async (session) => {
    const answer = await command(session, [{ command: "listClients" }]);
    const first = answer?.[0];
    if (!first) return { state: "off", words: NOT_ON, clients: [] };
    if (typeof first.error === "string")
      return { state: "not-allowed", words: `Mosquitto answered: ${first.error.slice(0, 200)}`, clients: [] };
    const clients = ((first.data as { clients?: unknown } | undefined)?.clients ?? []) as unknown[];
    const names = clients.filter((name): name is string => typeof name === "string").slice(0, 200);
    return {
      state: "on",
      words: `Mosquitto's dynamic security is on, and Outpost's account may manage it. It has ${names.length} account${names.length === 1 ? "" : "s"}.`,
      clients: names,
    };
  });
}

const USER = /^[A-Za-z0-9_.-]{1,64}$/;

/** The role every radio account Outpost adds is given: the radio's own topics, nothing else. */
export const radioRole = (root: string) => `outpost-radio-${root.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60)}`;

export async function addRadioAccount(
  input: { host: string; port: number; tls: boolean; ca?: string | null; userName: string; rootTopic: string },
  password: string | null,
  radio: { userName: string; password: string },
): Promise<MeshDynsecResult> {
  if (!USER.test(radio.userName))
    throw badRequest("A user name for the radio is letters, digits, dots, dashes and underscores, at most 64.");
  if (radio.password.length < 12) throw badRequest("Give the radio's account a password of at least 12 characters: press Suggest one.");
  const role = radioRole(input.rootTopic);
  const topic = `${input.rootTopic}/#`;
  return withDynsec(input, password, async (session) => {
    const answer = await command(session, [
      {
        command: "createRole",
        rolename: role,
        textname: "Added by Outpost: a Meshtastic radio's own topics",
        acls: [
          { acltype: "publishClientSend", topic, allow: true },
          { acltype: "publishClientReceive", topic, allow: true },
          { acltype: "subscribePattern", topic, allow: true },
        ],
      },
      {
        command: "createClient",
        username: radio.userName,
        password: radio.password,
        textname: "Added by Outpost for a radio",
        roles: [{ rolename: role }],
      },
    ]);
    if (!answer) return { state: "off", words: NOT_ON, clients: [] };
    const [made, client] = answer;
    if (typeof made?.error === "string" && made.error !== "Role already exists")
      return { state: "failed", words: `Mosquitto would not make the radio's role: ${made.error.slice(0, 200)}`, clients: [] };
    if (typeof client?.error === "string")
      return {
        state: "failed",
        words:
          client.error === "Client already exists"
            ? `There is already an account called ${radio.userName}. Choose another name.`
            : `Mosquitto would not make the account: ${client.error.slice(0, 200)}`,
        clients: [],
      };
    return {
      state: "on",
      words: `Added ${radio.userName}, allowed to publish and subscribe under ${topic} only (role ${role}). Type the same user name and password into the radio.`,
      clients: [],
    };
  });
}

/** A port near `port` that nothing listens on now, to offer when the one chosen is taken; null if none is found. */
export async function freePortNear(host: string, port: number, tries = 10): Promise<number | null> {
  for (let candidate = port + 1; candidate <= Math.min(65_535, port + tries); candidate += 1) {
    const free = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen({ host, port: candidate }, () => server.close(() => resolve(true)));
    });
    if (free) return candidate;
  }
  return null;
}
