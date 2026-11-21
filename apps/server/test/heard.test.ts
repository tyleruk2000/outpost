/**
 * Heard on the radio, end to end, against stand-in decoders on this computer: a KISS TCP
 * server playing back the frames recorded from Dire Wolf, an SBS server playing back
 * readsb's lines, an NMEA server and an NMEA datagram sender playing the AIS samples.
 * Each stand-in also records every byte Outpost sends it, which must be none.
 */

import dgram from "node:dgram";
import { readFileSync } from "node:fs";
import net from "node:net";
import type { HeardReceiversResponse, HeardStation, HeardStationResponse, HeardStationsResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { socketBytes } from "../src/core/socket-bytes.ts";
import { encodeTnc2 } from "../src/modules/heard/ax25.ts";
import { kissEncode } from "../src/modules/heard/kiss.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/heard/${name}`, import.meta.url));
const ais = JSON.parse(fixture("ais-pyais.json").toString("utf8")) as Array<{ label: string; sentences: string[] }>;

async function waitFor<T>(check: () => Promise<T | undefined | null | false> | T | undefined | null | false, ms = 6000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > until) throw new Error("Waited too long");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** A decoder's port: sends `payload` to each client that connects, and keeps whatever a client sends it. */
function standIn(payload: () => Buffer) {
  const received: Buffer[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("data", (chunk) => received.push(socketBytes(chunk)));
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    socket.write(payload());
  });
  return {
    received,
    sockets,
    listen: (port = 0) =>
      new Promise<number>((resolve) => server.listen(port, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port))),
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

describe("heard on the radio", () => {
  let app: TestApp;
  const kiss = standIn(() => fixture("direwolf-kiss.bin"));
  const sbs = standIn(() => fixture("readsb-sbs.txt"));
  const nmea = standIn(() => Buffer.from(`${ais.flatMap((sample) => sample.sentences).join("\r\n")}\r\n`));
  let kissPort = 0;

  const stations = async (source?: string) =>
    (await app.api<HeardStationsResponse>("GET", `/api/heard/stations${source ? `?source=${source}` : ""}`)).body.stations;
  const byName = (list: HeardStation[], name: string) => list.find((station) => station.name === name);
  const flush = () => app.ctx.services.heard.flushNow();

  beforeAll(async () => {
    app = await createTestApp();
    kissPort = await kiss.listen();
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([kiss.close(), sbs.close(), nmea.close()]);
  });

  it("is off until a receiver is added", async () => {
    const { body } = await app.api<HeardReceiversResponse>("GET", "/api/heard/receivers");
    expect(body.receivers).toEqual([]);
    expect(body.right.allowed).toBe(true);
    expect(body.space.stations).toBe(0);
    expect(body.pi).toBeNull();
  });

  it("reads APRS from a KISS port, and never writes to it", async () => {
    const added = await app.api<HeardReceiversResponse>("POST", "/api/heard/receivers", {
      kind: "aprs",
      name: "Radio at home",
      host: "127.0.0.1",
      port: kissPort,
      transport: "tcp",
      enabled: true,
    });
    expect(added.status).toBe(200);
    const receiver = added.body.receivers[0]!;
    await waitFor(async () => {
      flush();
      return (await stations("aprs")).length === 7;
    });
    const list = await stations("aprs");
    const walker = byName(list, "M0ABC-9")!;
    expect(walker).toMatchObject({ source: "aprs", kindWords: "Car", direct: true, receiverId: receiver.id, comment: "Walking test" });
    expect(walker.lat).toBeCloseTo(51.5, 5);
    const viaDigi = byName(list, "M0ABC-7")!;
    expect(viaDigi).toMatchObject({ direct: false, via: "M0DIG-3", course: 251 });
    const object = byName(list, "NET-1")!;
    expect(object.key).toBe(";NET-1");
    expect(object.details.sentBy).toBe("G4OBJ");
    const weather = byName(list, "G4WX2")!;
    expect(weather.lat).toBeNull();
    expect(weather.details.weather?.pressureHpa).toBe(1005);

    const status = (await app.api<HeardReceiversResponse>("GET", "/api/heard/receivers")).body.receivers[0]!.status;
    expect(status).toMatchObject({ state: "connected", packets: 7, positions: 6, malformed: 0 });
    expect(status.lastPacketAt).not.toBeNull();
    expect(Buffer.concat(kiss.received).length).toBe(0);

    const { body } = await app.api<HeardStationResponse>("GET", `/api/heard/stations/${walker.id}`);
    expect(body.trail).toHaveLength(1);
    expect(body.trail[0]).toMatchObject({ direct: true, receiverId: receiver.id });
  });

  it("adds a point to a station's trail as each report arrives", async () => {
    const socket = [...kiss.sockets][0]!;
    socket.write(kissEncode(encodeTnc2("M0ABC-9>APRS,M0DIG-3*,WIDE2-1:!5131.00N/00011.00W>Further on")));
    // And a frame that does not read, counted and dropped.
    socket.write(kissEncode(Buffer.from([1, 2, 3])));
    await waitFor(async () => {
      flush();
      const walker = byName(await stations("aprs"), "M0ABC-9");
      return walker && walker.reports === 2;
    });
    const walker = byName(await stations("aprs"), "M0ABC-9")!;
    expect(walker).toMatchObject({ direct: false, via: "M0DIG-3", comment: "Further on" });
    const { body } = await app.api<HeardStationResponse>("GET", `/api/heard/stations/${walker.id}`);
    expect(body.trail.map((point) => point.lat)).toEqual([51.5, 51 + 31 / 60]);
    const status = (await app.api<HeardReceiversResponse>("GET", "/api/heard/receivers")).body.receivers[0]!.status;
    expect(status.malformed).toBe(1);
  });

  it("says plainly when the decoder goes away, and connects again when it is back", async () => {
    await kiss.close();
    const away = await waitFor(async () => {
      const receiver = (await app.api<HeardReceiversResponse>("GET", "/api/heard/receivers")).body.receivers[0]!;
      return receiver.status.state === "away" && receiver;
    });
    expect(away.status.lastError).toBeTruthy();
    expect(away.status.retryAt).not.toBeNull();
    await kiss.listen(kissPort);
    await waitFor(
      async () => (await app.api<HeardReceiversResponse>("GET", "/api/heard/receivers")).body.receivers[0]!.status.state === "connected",
      8000,
    );
  });

  it("pins one of the household's own stations under a name of its own", async () => {
    const walker = byName(await stations("aprs"), "M0ABC-9")!;
    const { body } = await app.api("PUT", `/api/heard/stations/${walker.id}/pin`, { pinned: true, name: "Sam walking" });
    expect(body.station).toMatchObject({ pinned: true, pinName: "Sam walking" });
  });

  it("reads aircraft from an SBS port", async () => {
    const port = await sbs.listen();
    await app.api("POST", "/api/heard/receivers", {
      kind: "adsb",
      name: "Aircraft",
      host: "127.0.0.1",
      port,
      transport: "tcp",
      enabled: true,
    });
    await waitFor(async () => {
      flush();
      return (await stations("adsb")).length === 3;
    });
    const list = await stations("adsb");
    expect(byName(list, "KLM1023")).toMatchObject({ key: "4840D6", kindWords: "Aircraft" });
    const placed = list.find((station) => station.key === "40621D")!;
    expect(placed.lat).toBeCloseTo(52.26578, 5);
    expect(placed.altitude).toBeCloseTo(38000 * 0.3048, 1);
    expect(list.find((station) => station.key === "485020")).toMatchObject({ speed: 159, course: 183 });
    expect(Buffer.concat(sbs.received).length).toBe(0);
  });

  it("reads ships from an NMEA port, putting a ship's static data with its position", async () => {
    const port = await nmea.listen();
    await app.api("POST", "/api/heard/receivers", { kind: "ais", name: "Ships", host: "127.0.0.1", port, transport: "tcp", enabled: true });
    await waitFor(async () => {
      flush();
      return (await stations("ais")).length >= 9;
    });
    const list = await stations("ais");
    const blue = list.find((station) => station.key === "235055555")!;
    expect(blue).toMatchObject({ name: "BLUE HERON", kindWords: "Sailing vessel" });
    expect(blue.details.ship).toMatchObject({ callsign: "MABC1", lengthM: 9, aisClass: "B" });
    expect(list.find((station) => station.key === "992351234")).toMatchObject({ name: "NAB TOWER", kindWords: "Aid to navigation" });
    expect(list.find((station) => station.key === "369190000")).toMatchObject({ name: "MT.MITCHELL" });
    expect(Buffer.concat(nmea.received).length).toBe(0);
  });

  it("listens for ships on UDP from one address only", async () => {
    const probe = dgram.createSocket("udp4");
    const port = await new Promise<number>((resolve) => probe.bind(0, "127.0.0.1", () => resolve(probe.address().port)));
    probe.close();
    const refused = await app.api("POST", "/api/heard/receivers", {
      kind: "ais",
      name: "Ships by UDP",
      host: "decoder.local",
      port,
      transport: "udp",
      enabled: true,
    });
    expect(refused.status).toBe(400);
    await app.api("POST", "/api/heard/receivers", {
      kind: "ais",
      name: "Ships by UDP",
      host: "127.0.0.1",
      port,
      transport: "udp",
      enabled: true,
    });
    await waitFor(async () => {
      const list = (await app.api<HeardReceiversResponse>("GET", "/api/heard/receivers")).body.receivers;
      return list.find((receiver) => receiver.transport === "udp")?.status.state === "listening";
    });
    const sender = dgram.createSocket("udp4");
    const line = "!AIVDO,1,1,,A,B3P80v@0@7vUUB7@iFR4ea000000,0*72";
    await new Promise<void>((resolve) => sender.send(line, port, "127.0.0.1", () => resolve()));
    sender.close();
    const receiver = await waitFor(async () => {
      const list = (await app.api<HeardReceiversResponse>("GET", "/api/heard/receivers")).body.receivers;
      const udp = list.find((entry) => entry.transport === "udp")!;
      return udp.status.packets === 1 && udp;
    });
    expect(receiver.status.positions).toBe(1);
  });

  it("states the space taken", async () => {
    const { body } = await app.api<HeardReceiversResponse>("GET", "/api/heard/receivers");
    expect(body.space.bySource.aprs.stations).toBe(7);
    expect(body.space.bySource.adsb.stations).toBe(3);
    expect(body.space.reports).toBeGreaterThan(5);
    if (body.space.bytes !== null) expect(body.space.bytes).toBeGreaterThan(0);
  });

  it("clears one station, one source, or what is older than a time", async () => {
    // The decoder stops first, so that nothing heard again while this runs comes back in.
    await kiss.close();
    const object = byName(await stations("aprs"), "NET-1")!;
    expect((await app.api("DELETE", `/api/heard/stations/${object.id}`)).body.stations).toBe(1);
    expect(byName(await stations("aprs"), "NET-1")).toBeUndefined();

    const aircraft = await app.api("POST", "/api/heard/clear", { source: "adsb" });
    expect(aircraft.body.stations).toBe(3);
    expect(await stations("adsb")).toEqual([]);

    const older = await app.api("POST", "/api/heard/clear", { before: 0 });
    expect(older.body).toEqual({ stations: 0, reports: 0 });

    const all = await app.api("POST", "/api/heard/clear", {});
    expect(all.body.stations).toBeGreaterThan(0);
    expect(await stations()).toEqual([]);
  });

  it("keeps mesh positions for the range view, apart from the heard list", async () => {
    app.ctx.services.heard.recordMesh({
      id: "!a1b2c3d4",
      name: "Sam's radio",
      lat: 51.6,
      lon: -0.2,
      altitude: null,
      at: Date.now(),
      hops: 0,
      snr: 6.5,
      rssi: -90,
    });
    flush();
    expect((await stations()).map((station) => `${station.source} ${station.name}`)).toEqual([]);
    const mesh = await stations("mesh");
    expect(mesh).toHaveLength(1);
    const { body } = await app.api("GET", "/api/heard/reports?receiverId=mesh");
    expect(body.reports[0]).toMatchObject({ name: "Sam's radio", source: "mesh", snr: 6.5, rssi: -90, hops: 0, direct: true });
  });

  it("keeps range tests by name", async () => {
    const made = await app.api("POST", "/api/heard/range-tests", {
      name: "Saturday walk",
      receiverId: null,
      stationId: null,
      from: 1,
      to: 2,
    });
    expect(made.body.tests[0]).toMatchObject({ name: "Saturday walk", from: 1, to: 2 });
    expect(
      (await app.api("POST", "/api/heard/range-tests", { name: "Backwards", receiverId: null, stationId: null, from: 5, to: 2 })).status,
    ).toBe(400);
    expect((await app.api("DELETE", `/api/heard/range-tests/${made.body.tests[0].id}`)).body.tests).toEqual([]);
  });

  it("refuses receivers that make no sense, and removes one", async () => {
    expect(
      (
        await app.api("POST", "/api/heard/receivers", {
          kind: "aprs",
          name: "x",
          host: "http://x",
          port: 1,
          transport: "tcp",
          enabled: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await app.api("POST", "/api/heard/receivers", {
          kind: "aprs",
          name: "x",
          host: "127.0.0.1",
          port: 9000,
          transport: "udp",
          enabled: true,
        })
      ).status,
    ).toBe(400);
    const list = (await app.api<HeardReceiversResponse>("GET", "/api/heard/receivers")).body.receivers;
    const removed = await app.api<HeardReceiversResponse>("DELETE", `/api/heard/receivers/${list[0]!.id}`);
    expect(removed.body.receivers).toHaveLength(list.length - 1);
  });

  it("goes with erase-everything", () => {
    expect(app.ctx.services.heard.kept.eraseAll()).toBeGreaterThanOrEqual(0);
    expect(app.ctx.services.heard.receivers()).toEqual([]);
  });
});

describe("who may set receivers up", () => {
  it("only the computer Outpost runs on; any device may see what was heard", async () => {
    const app = await createTestApp({ OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0" }, undefined, { voacapData: false });
    try {
      const phone = { remoteAddress: "192.168.1.20" };
      const seen = await app.api<HeardReceiversResponse>("GET", "/api/heard/receivers", undefined, phone);
      expect(seen.body.right.allowed).toBe(false);
      const refused = await app.api(
        "POST",
        "/api/heard/receivers",
        { kind: "aprs", name: "x", host: "127.0.0.1", port: 8001, transport: "tcp", enabled: true },
        phone,
      );
      expect(refused.status).toBe(403);
      expect(refused.body.error.message).toMatch(/OUTPOST_ALLOW_REMOTE_SETTINGS=true/);
      expect((await app.api("POST", "/api/heard/clear", {}, phone)).status).toBe(200);
    } finally {
      await app.close();
    }
  });
});
