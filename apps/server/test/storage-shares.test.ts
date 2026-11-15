/**
 * Network shares. Nothing here mounts anything or touches a real keychain: a pretend
 * Mac stands in for every program the server would run, and records what it was given.
 */
import fs from "node:fs";
import path from "node:path";
import {
  dockerShareInstructions,
  isValidShareName,
  isValidSharePassword,
  isValidShareUser,
  linuxShareInstructions,
  PASSWORD_PLACEHOLDER,
  parseShareAddress,
  parseShareServer,
  shareHostKind,
  shareInstructionProblem,
} from "@outpost/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloads, networkShares } from "../src/db/schema.ts";
import { isShareAddressAllowed, resolveShareHost, urlHost } from "../src/modules/storage/shares/address.ts";
import {
  type CommandRunner,
  MAC_HELPER_ARGS,
  mountShare,
  parseBrowse,
  parseMountTable,
  parseResolve,
} from "../src/modules/storage/shares/commands.ts";
import { detectHost, shareHostMode } from "../src/modules/storage/shares/host.ts";
import { MAC_HELPER } from "../src/modules/storage/shares/mac-helper.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const PASSWORD = "hunter2 \"quoted\" back\\slash $(id) `id` 'single'";

/** Things people (or attackers) might type where a name belongs. */
const hostile = [
  'nas"; do shell script "id',
  'nas" & (do shell script "id") & "',
  "nas\\",
  "nas\nlocal",
  "na\rs",
  "nas\u0000",
  "nas/../etc",
  "$(id)",
  "`id`",
  "nas;id",
  "nas|id",
  "-oProxyCommand=id",
  "nas'",
  "",
];

interface Call {
  file: string;
  args: string[];
  input: string | undefined;
}

interface FakeMount {
  host: string;
  port: number;
  share: string;
  user: string;
  mountPoint: string;
}

/** A pretend Mac: a mount table, a keychain and a file server that knows one password. */
function fakeMac(root: string, options: { password?: string; shares?: string[] } = {}) {
  /** Where a share's files are while it is not mounted: out of the server's sight, like a NAS. */
  const away = (mountPoint: string) => path.join(path.dirname(root), "nas", path.basename(mountPoint));
  const state = {
    away,
    calls: [] as Call[],
    mounts: [] as FakeMount[],
    keychain: new Map<string, string>(),
    password: options.password ?? PASSWORD,
    shares: options.shares ?? ["media"],
    /** Make `diskutil unmount` refuse, as when a program has files open. */
    busy: false,
    /** Make keychain deletions fail. */
    keychainBroken: false,
    advertised: [] as Array<{ name: string; host: string; port: number }>,
  };
  const ok = (stdout: string) => ({ code: 0, stdout, stderr: "", timedOut: false });
  const run: CommandRunner = async (file, args, opts) => {
    state.calls.push({ file, args: [...args], input: opts.input });
    if (file === "/sbin/mount") {
      const lines = state.mounts.map(
        (mount) =>
          `//${encodeURIComponent(mount.user)}@${mount.host}${mount.port === 445 ? "" : `:${mount.port}`}/${encodeURIComponent(mount.share)} on ${mount.mountPoint} (smbfs, nodev, nosuid, mounted by someone)`,
      );
      return ok(["/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)", ...lines].join("\n"));
    }
    if (file === "/usr/sbin/diskutil") {
      const target = args[1]!;
      if (state.busy) {
        return { code: 1, stdout: "", stderr: `Unmount failed for ${target}: dissented by PID 4242 (/usr/bin/vim)`, timedOut: false };
      }
      state.mounts = state.mounts.filter((mount) => mount.mountPoint !== target);
      fs.mkdirSync(path.dirname(away(target)), { recursive: true });
      fs.renameSync(target, away(target));
      return ok(`Unmount successful for ${target}`);
    }
    if (file === "/usr/bin/dns-sd") {
      if (args[0] === "-B") {
        const rows = state.advertised.map(
          (entry) => `19:55:44.511  Add        2  14 local.               _smb._tcp.           ${entry.name}`,
        );
        return { code: null, stdout: ["Browsing for _smb._tcp.local.", ...rows].join("\n"), stderr: "", timedOut: true };
      }
      const entry = state.advertised.find((candidate) => candidate.name === args[1]);
      return {
        code: null,
        stdout: entry ? `19:55:50.283  ${entry.name}._smb._tcp.local. can be reached at ${entry.host}.:${entry.port} (interface 14)` : "",
        stderr: "",
        timedOut: true,
      };
    }
    if (file === "/usr/bin/osascript") {
      const input = JSON.parse(opts.input ?? "{}") as {
        op: string;
        url: string;
        user: string;
        password?: string;
        remember?: boolean;
        keychain: { service: string; account: string };
      };
      const key = `${input.keychain.service}|${input.keychain.account}`;
      if (input.op === "forget") {
        if (state.keychainBroken) return ok(JSON.stringify({ keychain: -25308 }));
        const had = state.keychain.delete(key);
        return ok(JSON.stringify({ keychain: had ? 0 : -25300 }));
      }
      let password = input.password;
      if (typeof password !== "string") {
        const kept = state.keychain.get(key);
        if (kept === undefined) return ok(JSON.stringify({ status: null, keychain: -25300 }));
        password = kept;
      }
      const url = new URL(input.url);
      const share = decodeURIComponent(url.pathname.slice(1));
      if (password !== state.password) return ok(JSON.stringify({ status: 80 }));
      if (!state.shares.includes(share)) return ok(JSON.stringify({ status: 2 }));
      const mountPoint = path.join(root, share);
      if (state.mounts.some((mount) => mount.mountPoint === mountPoint)) return ok(JSON.stringify({ status: 17 }));
      if (fs.existsSync(away(mountPoint))) fs.renameSync(away(mountPoint), mountPoint);
      else fs.mkdirSync(mountPoint, { recursive: true });
      state.mounts.push({ host: url.hostname, port: url.port ? Number(url.port) : 445, share, user: input.user, mountPoint });
      const answer: Record<string, unknown> = { status: 0, mountPoints: [mountPoint] };
      if (input.remember === true) {
        state.keychain.set(key, password);
        answer.stored = true;
        answer.storeStatus = 0;
      }
      return ok(JSON.stringify(answer));
    }
    return { code: null, stdout: "", stderr: "", timedOut: false };
  };
  return { state, run };
}

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** A server that believes it is a Mac, wired to the pretend one. */
async function macApp(options: { password?: string; shares?: string[]; env?: Record<string, string> } = {}) {
  app = await createTestApp(options.env);
  const mac = fakeMac(path.join(app.dir, "storage"), options);
  const deps = app.ctx.services.shares.deps;
  deps.mode = "macos";
  deps.run = mac.run;
  deps.lookup = async (host) => {
    if (host === "nas.local") return [{ address: "192.168.1.20", family: 4 }];
    if (host === "dual.local") {
      return [
        { address: "2a00:1450:4009:81f::200e", family: 6 },
        { address: "fe80::1%en0", family: 6 },
        { address: "192.168.1.21", family: 4 },
      ];
    }
    if (host === "example.com") return [{ address: "93.184.216.34", family: 4 }];
    if (host === "rebind.example") return [{ address: "127.0.0.1", family: 4 }];
    throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
  };
  deps.probe = async () => "open";
  return { app, mac, deps };
}

const connectBody = (extra: Record<string, unknown> = {}) => ({
  server: "nas.local",
  share: "media",
  userName: "walker",
  password: PASSWORD,
  rememberPassword: true,
  ...extra,
});

/** Every byte SQLite has written, including what is still in the write-ahead log. */
function databaseBytes(dir: string): string {
  const data = path.join(dir, "data");
  return fs
    .readdirSync(data)
    .filter((name) => name.startsWith("outpost.db"))
    .map((name) => fs.readFileSync(path.join(data, name)).toString("latin1"))
    .join("\n");
}

describe("what may be typed", () => {
  it("accepts ordinary servers and refuses anything that is not a host", () => {
    expect(parseShareServer("NAS.local")).toEqual({ host: "nas.local", port: null });
    expect(parseShareServer(" 192.168.1.20:4450 ")).toEqual({ host: "192.168.1.20", port: 4450 });
    expect(parseShareServer("[fd00::20]:445")).toEqual({ host: "fd00::20", port: 445 });
    expect(parseShareServer("fd00::20")).toEqual({ host: "fd00::20", port: null });
    expect(parseShareServer("workshop-nas")).toEqual({ host: "workshop-nas", port: null });
    // Stray white space around a pasted name is dropped, never passed on.
    expect(parseShareServer("nas.local\r\n")).toEqual({ host: "nas.local", port: null });
    for (const value of [
      ...hostile,
      "nas local",
      "nas.local:0",
      "nas.local:70000",
      "1.2.3",
      "2130706433",
      "256.1.1.1",
      "nas_1.local",
      "-nas.local",
      "a..b",
      "user@nas",
    ]) {
      expect(parseShareServer(value), JSON.stringify(value)).toBeUndefined();
    }
    expect(shareHostKind("0x7f000001")).toBe("name"); // a name as far as syntax goes; the address check is what stops it
  });

  it("holds share and user names to a short list of characters", () => {
    for (const good of ["media", "Family Photos", "backup$", "outpost-library", "Übungen", "a"])
      expect(isValidShareName(good), good).toBe(true);
    for (const good of ["walker", "tyler.allen", "nas-user", "me@home", "Jo Bloggs"]) expect(isValidShareUser(good), good).toBe(true);
    for (const bad of [...hostile, "..", ".", "a/b", "a\\b", 'a"b', "a:b", " media", "media ", "x".repeat(81)]) {
      expect(isValidShareName(bad), JSON.stringify(bad)).toBe(false);
    }
    for (const bad of [...hostile, "DOMAIN\\user", "a/b", 'a"b', "a;b", "x".repeat(65)]) {
      expect(isValidShareUser(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(isValidSharePassword(PASSWORD)).toBe(true);
    expect(isValidSharePassword("")).toBe(false);
    expect(isValidSharePassword("two\nlines")).toBe(false);
    expect(isValidSharePassword("nul\u0000")).toBe(false);
  });

  it("reads a pasted share address", () => {
    expect(parseShareAddress("smb://NAS.local/Family%20Photos")).toEqual({ server: "nas.local", share: "Family Photos" });
    expect(parseShareAddress("\\\\nas\\media")).toEqual({ server: "nas", share: "media" });
    expect(parseShareAddress("smb://me@192.168.1.20:4450/media/")).toEqual({ server: "192.168.1.20:4450", share: "media" });
    expect(parseShareAddress("nas.local")).toBeUndefined();
    expect(parseShareAddress('smb://nas.local/a"b')).toBeUndefined();
  });
});

describe("which addresses a share may be connected from", () => {
  it("allows private and link-local addresses only", () => {
    for (const address of [
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.1.20",
      "169.254.10.10",
      "fd12:3456::1",
      "fe80::1",
      "fe80::1%en0",
      "::ffff:192.168.1.20",
      "::ffff:c0a8:114",
    ]) {
      expect(isShareAddressAllowed(address, false), address).toBe(true);
    }
    for (const address of [
      "8.8.8.8",
      "172.32.0.1",
      "100.64.0.1",
      "192.169.0.1",
      "0.0.0.0",
      "224.0.0.251",
      "2a00:1450::200e",
      "::",
      "::ffff:8.8.8.8",
      "::ffff:808:808",
      "not-an-address",
      "",
    ]) {
      expect(isShareAddressAllowed(address, false), address).toBe(false);
      expect(isShareAddressAllowed(address, true), address).toBe(false);
    }
  });

  it("allows this computer itself only when that is switched on", () => {
    for (const address of ["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1"]) {
      expect(isShareAddressAllowed(address, false), address).toBe(false);
      expect(isShareAddressAllowed(address, true), address).toBe(true);
    }
  });

  it("resolves the name itself and picks an allowed address", async () => {
    const lookup = async (host: string) => {
      if (host === "dual.local") {
        return [
          { address: "2a00:1450:4009:81f::200e", family: 6 as const },
          { address: "fe80::1%en0", family: 6 as const },
          { address: "192.168.1.21", family: 4 as const },
        ];
      }
      if (host === "public.example") return [{ address: "93.184.216.34", family: 4 as const }];
      if (host === "rebind.example" || host === "0x7f000001") return [{ address: "127.0.0.1", family: 4 as const }];
      if (host === "six.local") return [{ address: "fe80::9%en0", family: 6 as const }];
      throw new Error("ENOTFOUND");
    };
    expect(await resolveShareHost("dual.local", { allowLoopback: false, lookup })).toEqual({
      ok: true,
      address: { address: "192.168.1.21", family: 4 },
    });
    expect(await resolveShareHost("public.example", { allowLoopback: false, lookup })).toMatchObject({ ok: false, reason: "not_private" });
    expect(await resolveShareHost("rebind.example", { allowLoopback: false, lookup })).toMatchObject({ ok: false, reason: "not_private" });
    expect(await resolveShareHost("0x7f000001", { allowLoopback: false, lookup })).toMatchObject({ ok: false, reason: "not_private" });
    expect(await resolveShareHost("rebind.example", { allowLoopback: true, lookup })).toMatchObject({ ok: true });
    expect(await resolveShareHost("nowhere.local", { allowLoopback: false, lookup })).toEqual({ ok: false, reason: "not_found" });
    expect(await resolveShareHost("8.8.8.8", { allowLoopback: true, lookup })).toMatchObject({ ok: false, reason: "not_private" });
    expect(await resolveShareHost("10.1.2.3", { allowLoopback: false, lookup })).toEqual({
      ok: true,
      address: { address: "10.1.2.3", family: 4 },
    });
    expect(urlHost("192.168.1.20")).toBe("192.168.1.20");
    expect(urlHost("fd00::20")).toBe("[fd00::20]");
    expect(urlHost("fe80::9%en0")).toBe("[fe80::9%25en0]");
  });
});

describe("the helper program", () => {
  it("is a constant: nothing a person types becomes part of it or of the arguments", async () => {
    const seen: Call[] = [];
    const run: CommandRunner = async (file, args, opts) => {
      seen.push({ file, args: [...args], input: opts.input });
      return { code: 0, stdout: JSON.stringify({ status: 0, mountPoints: ["/Volumes/media"], stored: true }), stderr: "", timedOut: false };
    };
    const nasty = [
      '"; do shell script "touch /tmp/pwned"; "',
      "back\\slash",
      "new\nline",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a hostile string, meant literally
      "`id` $(id) ${HOME}",
      "'; rm -rf ~; '",
      PASSWORD,
    ];
    for (const password of nasty) {
      const outcome = await mountShare(
        run,
        {
          url: "smb://192.168.1.20/media",
          user: "walker",
          password,
          remember: true,
          keychain: { service: "Outpost network share", account: "walker@nas.local/media", label: "Outpost: //nas.local/media" },
        },
        1000,
      );
      expect(outcome).toEqual({ kind: "mounted", mountPoint: "/Volumes/media", stored: true });
    }
    expect(seen).toHaveLength(nasty.length);
    for (const [index, call] of seen.entries()) {
      expect(call.file).toBe("/usr/bin/osascript");
      // Byte for byte the same arguments every time, and they are the fixed script.
      expect(call.args).toEqual(["-l", "JavaScript", "-e", MAC_HELPER]);
      expect(call.args).toEqual([...MAC_HELPER_ARGS]);
      expect(call.args.join("\n")).not.toContain(nasty[index]!);
      // The password travels on standard input, as data, and arrives exactly as typed.
      expect((JSON.parse(call.input!) as { password: string }).password).toBe(nasty[index]);
    }
    // The script is never built from pieces: no template holes, and no shell.
    expect(MAC_HELPER).not.toContain("${");
    expect(MAC_HELPER).not.toMatch(/do shell script|doShellScript|\beval\b|Function\(/);
  });

  it("reads each kind of answer, and never trusts a broken one", async () => {
    const answer = (result: Partial<Awaited<ReturnType<CommandRunner>>>): CommandRunner => {
      return async () => ({ code: 0, stdout: "", stderr: "", timedOut: false, ...result });
    };
    const request = {
      url: "smb://10.0.0.2/x",
      user: "u",
      password: "p",
      remember: false,
      keychain: { service: "s", account: "a", label: "l" },
    };
    expect(await mountShare(answer({ stdout: '{"status":80}' }), request, 10)).toEqual({ kind: "error", errno: 80 });
    expect(await mountShare(answer({ stdout: '{"status":17}' }), request, 10)).toEqual({ kind: "already_mounted" });
    expect(await mountShare(answer({ stdout: '{"status":null,"keychain":-25300}' }), request, 10)).toEqual({
      kind: "no_password",
      keychainStatus: -25300,
    });
    expect(await mountShare(answer({ timedOut: true, code: null }), request, 10)).toEqual({ kind: "timed_out" });
    expect(await mountShare(answer({ stdout: "execution error: something" }), request, 10)).toEqual({ kind: "broken", code: 0 });
    expect(await mountShare(answer({ code: 1, stdout: '{"status":0}' }), request, 10)).toEqual({ kind: "broken", code: 1 });
    expect(await mountShare(answer({ code: null }), request, 10)).toEqual({ kind: "broken", code: null });
  });

  it("reads the system's list of mounts and Bonjour answers", () => {
    const table = [
      "/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)",
      "//tallen@TALLEN-NAS._smb._tcp.local/Docs on /Volumes/Docs (smbfs, nodev, nosuid, mounted by someone)",
      "//outposttest@127.0.0.1:44445/outpost-test on /Volumes/outpost-test (smbfs, nodev, nosuid, mounted by someone)",
      "//me@192.168.1.20/Family%20Photos on /Volumes/Family Photos (smbfs, nodev, nosuid, mounted by someone)",
      "nas:/volume1/x on /Volumes/x (nfs, nodev, nosuid, mounted by someone)",
    ].join("\n");
    expect(parseMountTable(table)).toEqual([
      { host: "tallen-nas._smb._tcp.local", port: 445, share: "Docs", user: "tallen", mountPoint: "/Volumes/Docs" },
      { host: "127.0.0.1", port: 44445, share: "outpost-test", user: "outposttest", mountPoint: "/Volumes/outpost-test" },
      { host: "192.168.1.20", port: 445, share: "Family Photos", user: "me", mountPoint: "/Volumes/Family Photos" },
    ]);
    const browse = [
      "Browsing for _smb._tcp.local.",
      "DATE: ---Sun 15 Nov 2026---",
      "19:55:44.511  ...STARTING...",
      "Timestamp     A/R    Flags  if Domain               Service Type         Instance Name",
      "19:55:44.511  Add        3  14 local.               _smb._tcp.           Felicity’s MacBook Pro",
      "19:55:44.511  Add        2  14 local.               _smb._tcp.           WORKSHOP-NAS",
      "19:55:45.000  Rmv        0  14 local.               _smb._tcp.           Gone",
    ].join("\n");
    expect(parseBrowse(browse)).toEqual(["Felicity’s MacBook Pro", "WORKSHOP-NAS"]);
    expect(parseResolve("19:55:50.283  WORKSHOP-NAS._smb._tcp.local. can be reached at WORKSHOP-NAS.local.:445 (interface 14)")).toEqual({
      host: "workshop-nas.local",
      port: 445,
    });
    expect(parseResolve("nothing useful")).toBeUndefined();
  });
});

describe("where Outpost runs", () => {
  it("decides what it can do about shares", () => {
    expect(shareHostMode(detectHost({}, "darwin"), { portable: false })).toBe("macos");
    expect(shareHostMode(detectHost({ OUTPOST_IN_CONTAINER: "true" }, "linux"), { portable: false })).toBe("docker");
    expect(shareHostMode({ os: "linux", inContainer: false }, { portable: false })).toBe("linux");
    expect(shareHostMode({ os: "windows", inContainer: false }, { portable: false })).toBe("unsupported");
    expect(shareHostMode({ os: "macos", inContainer: false }, { portable: true })).toBe("unsupported");
    expect(detectHost({ OUTPOST_IN_CONTAINER: "1" }, "darwin")).toEqual({ os: "macos", inContainer: true });
  });

  it("tells the web app in the system information", async () => {
    app = await createTestApp();
    const { body } = await app.api("GET", "/api/system");
    expect(["macos", "linux", "windows", "other"]).toContain(body.host.os);
    expect(typeof body.host.inContainer).toBe("boolean");
  });

  it("refuses to connect anything in a container or on Linux, and says why", async () => {
    app = await createTestApp();
    const mac = fakeMac(path.join(app.dir, "storage"));
    app.ctx.services.shares.deps.run = mac.run;
    for (const mode of ["docker", "linux", "unsupported"] as const) {
      app.ctx.services.shares.deps.mode = mode;
      const listing = await app.api("GET", "/api/storage/shares");
      expect(listing.body).toMatchObject({ mode, shares: [] });
      const refused = await app.api("POST", "/api/storage/shares", connectBody());
      expect(refused.status).toBe(415);
      expect(JSON.stringify(refused.body)).not.toContain(PASSWORD);
      expect((await app.api("GET", "/api/storage/shares/discover")).body).toEqual({ supported: false, servers: [] });
    }
    expect(mac.state.calls).toEqual([]);
  });
});

describe("connecting a share on a Mac", () => {
  it("connects, remembers the share, and never keeps or repeats the password", async () => {
    const { app, mac } = await macApp();
    const events: unknown[] = [];
    app.ctx.events.subscribe((event) => events.push(event));
    const logged: unknown[] = [];
    for (const level of ["info", "warn", "error", "debug"] as const) {
      vi.spyOn(app.ctx.log, level).mockImplementation((...args: unknown[]) => {
        // Fastify's own request lines pass the whole request object here; the real logger
        // writes only its method, address and status. Everything else is kept as given.
        const first = args[0] as { req?: unknown; res?: unknown } | undefined;
        if (!(first && typeof first === "object" && ("req" in first || "res" in first))) logged.push(args);
      });
    }

    const connected = await app.api("POST", "/api/storage/shares", connectBody());
    expect(connected.status).toBe(200);
    const mountPath = path.join(app.dir, "storage", "media");
    expect(connected.body.share).toMatchObject({
      server: "nas.local",
      port: null,
      share: "media",
      userName: "walker",
      passwordRemembered: true,
      status: "connected",
      mountPath,
      locations: [],
    });

    // The mount went to the address that was checked, not to the name.
    const mount = mac.state.calls.find((call) => call.file === "/usr/bin/osascript")!;
    expect(JSON.parse(mount.input!)).toMatchObject({ op: "mount", url: "smb://192.168.1.20/media", user: "walker", remember: true });

    // It is in the (pretend) Keychain, and nowhere Outpost keeps or sends things.
    expect([...mac.state.keychain.values()]).toEqual([PASSWORD]);
    const row = app.ctx.db.select().from(networkShares).get()!;
    expect(row).toMatchObject({
      server: "nas.local",
      port: 445,
      share: "media",
      userName: "walker",
      passwordInKeychain: true,
      lastAddress: "192.168.1.20",
    });
    for (const part of [PASSWORD, "hunter2", JSON.stringify(PASSWORD).slice(1, -1)]) {
      expect(JSON.stringify(row)).not.toContain(part);
      expect(databaseBytes(app.dir)).not.toContain(part);
      expect(JSON.stringify(connected.body)).not.toContain(part);
      expect(JSON.stringify(events)).not.toContain(part);
      expect(JSON.stringify(logged)).not.toContain(part);
      expect(JSON.stringify((await app.api("GET", "/api/storage/shares")).body)).not.toContain(part);
      for (const call of mac.state.calls) expect(call.args.join("\n")).not.toContain(part);
    }
    expect(events).toContainEqual({ type: "storage.changed" });

    // The share is offered as a storage location through the ordinary path.
    const location = await app.api("POST", "/api/storage/locations", {
      name: "NAS library",
      path: path.join(mountPath, "Outpost"),
      kind: "network",
    });
    expect(location.status).toBe(200);
    expect(fs.existsSync(path.join(mountPath, "Outpost", ".outpost-location.json"))).toBe(true);
    const listed = await app.api("GET", "/api/storage/shares");
    expect(listed.body.shares[0].locations).toEqual([{ id: location.body.location.id, name: "NAS library" }]);
  });

  it("stores nothing at all when the password is wrong", async () => {
    const { app, mac } = await macApp();
    const refused = await app.api("POST", "/api/storage/shares", connectBody({ password: "not the password" }));
    expect(refused.status).toBe(403);
    expect(refused.body.error.details.reason).toBe("wrong_password");
    expect(refused.body.error.message).toMatch(/did not accept/);
    expect(JSON.stringify(refused.body)).not.toContain("not the password");
    expect(app.ctx.db.select().from(networkShares).all()).toEqual([]);
    expect(mac.state.keychain.size).toBe(0);
    expect(mac.state.mounts).toEqual([]);
    expect(databaseBytes(app.dir)).not.toContain("not the password");
  });

  it("stops passing guesses to the server after five wrong passwords, for a while", async () => {
    const { app, mac } = await macApp();
    const now = vi.spyOn(Date, "now");
    let clock = 1_800_000_000_000;
    now.mockImplementation(() => clock);
    try {
      for (let guess = 1; guess <= 5; guess += 1) {
        const refused = await app.api("POST", "/api/storage/shares", connectBody({ password: `guess ${guess}` }));
        expect(refused.body.error.details.reason, `guess ${guess}`).toBe("wrong_password");
      }
      const asked = mac.state.calls.length;
      // The sixth is turned away here: the server never hears it, even though it is right.
      // Outpost has no sign-in, so without this anyone on the network could try passwords through it.
      const held = await app.api("POST", "/api/storage/shares", connectBody());
      expect(held.status).toBe(403);
      expect(held.body.error.message).toMatch(/Too many wrong passwords for this share\. Try again in \d+ seconds\./);
      expect(mac.state.calls.length).toBe(asked);
      // A different share is not held up by it.
      mac.state.shares.push("other");
      expect((await app.api("POST", "/api/storage/shares", connectBody({ share: "other" }))).status).toBe(200);
      // After the wait, the right password works and the count is forgotten.
      clock += 61_000;
      expect((await app.api("POST", "/api/storage/shares", connectBody())).status).toBe(200);
    } finally {
      now.mockRestore();
    }
  });

  it("does not keep the password when asked not to remember it", async () => {
    const { app, mac } = await macApp();
    const connected = await app.api("POST", "/api/storage/shares", connectBody({ rememberPassword: false }));
    expect(connected.body.share).toMatchObject({ status: "connected", passwordRemembered: false });
    expect(mac.state.keychain.size).toBe(0);
    expect(databaseBytes(app.dir)).not.toContain("hunter2");
  });

  it("refuses hostile names before running anything", async () => {
    const { app, mac } = await macApp();
    for (const value of hostile) {
      for (const field of ["server", "share", "userName"]) {
        const response = await app.api("POST", "/api/storage/shares", connectBody({ [field]: value }));
        expect(response.status, `${field}=${JSON.stringify(value)}`).toBe(400);
      }
    }
    for (const password of ["", "two\nlines"]) {
      expect((await app.api("POST", "/api/storage/shares", connectBody({ password }))).status).toBe(400);
    }
    expect((await app.api("POST", "/api/storage/shares", connectBody({ port: 0 }))).status).toBe(400);
    expect(mac.state.calls).toEqual([]);
    expect(app.ctx.db.select().from(networkShares).all()).toEqual([]);
  });

  it("only connects to addresses on the home network", async () => {
    const { app, mac, deps } = await macApp();
    deps.allowLoopback = false;
    for (const server of ["example.com", "8.8.8.8", "rebind.example", "127.0.0.1", "localhost"]) {
      const response = await app.api("POST", "/api/storage/shares", connectBody({ server }));
      expect(response.status, server).toBe(503);
    }
    const publicName = await app.api("POST", "/api/storage/shares", connectBody({ server: "example.com" }));
    expect(publicName.body.error.message).toMatch(/only connects to file servers on your own network/);
    // Nothing was mounted, and no program was asked to.
    expect(mac.state.calls.filter((call) => call.file === "/usr/bin/osascript")).toEqual([]);
    expect(app.ctx.db.select().from(networkShares).all()).toEqual([]);

    // A name with public and private addresses is reached at the private one.
    const dual = await app.api("POST", "/api/storage/shares", connectBody({ server: "dual.local" }));
    expect(dual.status).toBe(200);
    const mount = mac.state.calls.find((call) => call.file === "/usr/bin/osascript")!;
    expect(JSON.parse(mount.input!).url).toBe("smb://192.168.1.21/media");
  });

  it("allows this computer itself only when private downloads are allowed, as the tests are", async () => {
    const { app, deps, mac } = await macApp();
    expect(deps.allowLoopback).toBe(true); // the test server sets OUTPOST_ALLOW_PRIVATE_DOWNLOADS
    deps.allowLoopback = false;
    expect((await app.api("POST", "/api/storage/shares", connectBody({ server: "127.0.0.1:44445" }))).status).toBe(503);
    expect(mac.state.calls.filter((call) => call.file === "/usr/bin/osascript")).toEqual([]);
    deps.allowLoopback = true;
    const local = await app.api("POST", "/api/storage/shares", connectBody({ server: "127.0.0.1:44445" }));
    expect(local.status).toBe(200);
    expect(local.body.share).toMatchObject({ server: "127.0.0.1", port: 44445 });
    const mount = mac.state.calls.find((call) => call.file === "/usr/bin/osascript")!;
    expect(JSON.parse(mount.input!).url).toBe("smb://127.0.0.1:44445/media");
  });

  it("says plainly when the server or the share is not there", async () => {
    const { app, deps, mac } = await macApp();
    const unknown = await app.api("POST", "/api/storage/shares", connectBody({ server: "nowhere.local" }));
    expect(unknown.status).toBe(503);
    expect(unknown.body.error).toMatchObject({ details: { reason: "server_not_found" } });
    expect(unknown.body.error.message).toMatch(/No computer called nowhere\.local/);

    deps.probe = async () => "timeout";
    const silent = await app.api("POST", "/api/storage/shares", connectBody());
    expect(silent.body.error.details.reason).toBe("server_not_found");
    expect(silent.body.error.message).toMatch(/did not answer/);

    deps.probe = async () => "refused";
    const closed = await app.api("POST", "/api/storage/shares", connectBody());
    expect(closed.body.error.message).toMatch(/not offering file sharing/);
    // The system was never asked to wait for a server that is not there.
    expect(mac.state.calls.filter((call) => call.file === "/usr/bin/osascript")).toEqual([]);

    deps.probe = async () => "open";
    const missing = await app.api("POST", "/api/storage/shares", connectBody({ share: "nothing-here" }));
    expect(missing.status).toBe(503);
    expect(missing.body.error.details.reason).toBe("share_not_found");
    expect(app.ctx.db.select().from(networkShares).all()).toEqual([]);
  });

  it("uses a connection that is already there instead of making a second one", async () => {
    const { app, mac } = await macApp();
    const mountPoint = path.join(app.dir, "storage", "media");
    fs.mkdirSync(mountPoint, { recursive: true });
    // Connected from the Finder's Network list, which names it after the Bonjour service.
    mac.state.mounts.push({ host: "NAS._smb._tcp.local", port: 445, share: "media", user: "walker", mountPoint });
    const adopted = await app.api("POST", "/api/storage/shares", connectBody());
    expect(adopted.status).toBe(200);
    expect(adopted.body.share).toMatchObject({ status: "connected", mountPath: mountPoint, passwordRemembered: false });
    expect(adopted.body.note).toMatch(/already connected/);
    expect(mac.state.calls.filter((call) => call.file === "/usr/bin/osascript")).toEqual([]);
    expect(mac.state.keychain.size).toBe(0);
  });
});

describe("reconnecting, disconnecting and forgetting", () => {
  async function connectedApp() {
    const made = await macApp();
    const { body } = await made.app.api("POST", "/api/storage/shares", connectBody());
    return { ...made, id: body.share.id as string, mountPath: body.share.mountPath as string };
  }

  it("reconnects from the Keychain without the password passing through Outpost", async () => {
    const { app, mac, id } = await connectedApp();
    expect((await app.api("POST", `/api/storage/shares/${id}/disconnect`, {})).body.share).toMatchObject({ status: "disconnected" });
    expect(mac.state.mounts).toEqual([]);
    mac.state.calls.length = 0;

    const again = await app.api("POST", `/api/storage/shares/${id}/reconnect`, {});
    expect(again.status).toBe(200);
    expect(again.body.share).toMatchObject({ status: "connected", passwordRemembered: true });
    const mount = mac.state.calls.find((call) => call.file === "/usr/bin/osascript")!;
    const sent = JSON.parse(mount.input!);
    expect(sent).not.toHaveProperty("password");
    expect(mount.input).not.toContain("hunter2");
    expect(sent.keychain).toEqual({
      service: "Outpost network share",
      account: "walker@nas.local/media",
      label: "Outpost: //nas.local/media",
    });
  });

  it("connects remembered shares again at start-up, but not ones a person disconnected", async () => {
    const { app, mac, id } = await connectedApp();
    // As after a restart of the Mac: the share is no longer mounted.
    mac.state.mounts = [];
    fs.rmSync(path.join(app.dir, "storage", "media"), { recursive: true });
    expect((await app.api("GET", "/api/storage/shares")).body.shares[0].status).toBe("disconnected");
    await app.ctx.services.shares.reconnectRemembered();
    expect((await app.api("GET", "/api/storage/shares")).body.shares[0].status).toBe("connected");

    await app.api("POST", `/api/storage/shares/${id}/disconnect`, {});
    await app.ctx.services.shares.reconnectRemembered();
    expect(mac.state.mounts).toEqual([]);
    expect((await app.api("GET", "/api/storage/shares")).body.shares[0].status).toBe("disconnected");
  });

  it("does not hand an unanswering server to the system when nobody is waiting", async () => {
    const { app, mac, deps } = await connectedApp();
    mac.state.mounts = [];
    mac.state.calls.length = 0;
    // The quick check could not tell (as when the Mac itself is offline).
    deps.probe = async () => "unreachable";
    await app.ctx.services.shares.reconnectRemembered();
    expect(mac.state.calls.filter((call) => call.file === "/usr/bin/osascript")).toEqual([]);
    expect((await app.api("GET", "/api/storage/shares")).body.shares[0].status).toBe("server_not_found");
    // A person pressing Reconnect is worth the longer wait.
    const { body } = await app.api("GET", "/api/storage/shares");
    const asked = await app.api("POST", `/api/storage/shares/${body.shares[0].id}/reconnect`, {});
    expect(asked.status).toBe(200);
    expect(mac.state.calls.filter((call) => call.file === "/usr/bin/osascript")).toHaveLength(1);
  });

  it("stops asking once the password is refused, and says so", async () => {
    const { app, mac, id } = await connectedApp();
    mac.state.mounts = [];
    mac.state.password = "changed on the NAS";
    await app.ctx.services.shares.reconnectRemembered();
    const listed = (await app.api("GET", "/api/storage/shares")).body.shares[0];
    expect(listed).toMatchObject({ status: "wrong_password" });
    expect(listed.statusDetail).toMatch(/did not accept/);
    mac.state.calls.length = 0;
    await app.ctx.services.shares.reconnectRemembered();
    expect(mac.state.calls.filter((call) => call.file === "/usr/bin/osascript")).toEqual([]);

    // Typing the new password connects it and replaces what the Keychain holds.
    const fixed = await app.api("POST", `/api/storage/shares/${id}/reconnect`, { password: "changed on the NAS" });
    expect(fixed.body.share).toMatchObject({ status: "connected", passwordRemembered: true });
    expect([...mac.state.keychain.values()]).toEqual(["changed on the NAS"]);
    expect(databaseBytes(app.dir)).not.toContain("changed on the NAS");
  });

  it("asks for the password when none is remembered", async () => {
    const { app, mac } = await macApp();
    const { body } = await app.api("POST", "/api/storage/shares", connectBody({ rememberPassword: false }));
    mac.state.mounts = [];
    const refused = await app.api("POST", `/api/storage/shares/${body.share.id}/reconnect`, {});
    expect(refused.status).toBe(400);
    expect(refused.body.error.details.reason).toBe("needs_password");
    expect((await app.api("GET", "/api/storage/shares")).body.shares[0].status).toBe("needs_password");

    // The Keychain item was deleted behind Outpost's back.
    const remembered = await app.api("POST", `/api/storage/shares/${body.share.id}/reconnect`, {
      password: PASSWORD,
      rememberPassword: true,
    });
    expect(remembered.body.share.passwordRemembered).toBe(true);
    mac.state.mounts = [];
    mac.state.keychain.clear();
    const gone = await app.api("POST", `/api/storage/shares/${body.share.id}/reconnect`, {});
    expect(gone.body.error.message).toMatch(/no longer in the Keychain/);
    expect((await app.api("GET", "/api/storage/shares")).body.shares[0]).toMatchObject({
      status: "needs_password",
      passwordRemembered: false,
    });
  });

  it("will not disconnect a share with work in progress on it without being told to", async () => {
    const { app, mac, id, mountPath } = await connectedApp();
    const location = await app.api("POST", "/api/storage/locations", {
      name: "NAS library",
      path: path.join(mountPath, "Outpost"),
      kind: "network",
    });
    const now = Date.now();
    app.ctx.db
      .insert(downloads)
      .values({
        id: "download-on-the-share",
        kind: "zim",
        title: "Wikipedia (English)",
        url: "http://localhost/wikipedia.zim",
        locationId: location.body.location.id,
        relPath: "collections/zim/wikipedia.zim",
        state: "running",
        meta: {},
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const refused = await app.api("POST", `/api/storage/shares/${id}/disconnect`, {});
    expect(refused.status).toBe(409);
    expect(refused.body.error.details).toEqual({ reason: "work_in_progress", work: ["Download: Wikipedia (English)"] });
    expect(mac.state.mounts).toHaveLength(1);
    expect(mac.state.calls.filter((call) => call.file === "/usr/sbin/diskutil")).toEqual([]);

    const forgetRefused = await app.api("DELETE", `/api/storage/shares/${id}`);
    expect(forgetRefused.status).toBe(409);
    expect(mac.state.keychain.size).toBe(1);

    const confirmed = await app.api("POST", `/api/storage/shares/${id}/disconnect`, { confirm: true });
    expect(confirmed.status).toBe(200);
    expect(mac.state.mounts).toEqual([]);
    expect(mac.state.calls.filter((call) => call.file === "/usr/sbin/diskutil")[0]!.args).toEqual(["unmount", mountPath]);
    // The location is still Outpost's; it just cannot be reached until the share is back.
    expect(app.ctx.services.storage.get(location.body.location.id).status).toBe("unavailable");
    expect(confirmed.body.share.locations).toEqual([{ id: location.body.location.id, name: "NAS library" }]);
  });

  it("never forces a share that macOS says is in use", async () => {
    const { app, mac, id } = await connectedApp();
    mac.state.busy = true;
    const refused = await app.api("POST", `/api/storage/shares/${id}/disconnect`, { confirm: true });
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/vim still has files open/);
    expect(mac.state.mounts).toHaveLength(1);
    for (const call of mac.state.calls.filter((entry) => entry.file === "/usr/sbin/diskutil")) expect(call.args).not.toContain("force");
  });

  it("forgets a share: disconnects it, removes the Keychain item, and leaves files alone", async () => {
    const { app, mac, id, mountPath } = await connectedApp();
    fs.writeFileSync(path.join(mountPath, "keep-me.txt"), "a person's file");
    const forgotten = await app.api("DELETE", `/api/storage/shares/${id}`);
    expect(forgotten.status).toBe(200);
    expect(mac.state.mounts).toEqual([]);
    expect(mac.state.keychain.size).toBe(0);
    expect(app.ctx.db.select().from(networkShares).all()).toEqual([]);
    expect(fs.readFileSync(path.join(mac.state.away(mountPath), "keep-me.txt"), "utf8")).toBe("a person's file");
    expect((await app.api("DELETE", `/api/storage/shares/${id}`)).status).toBe(404);
  });

  it("keeps the share if the Keychain item could not be removed", async () => {
    const { app, mac, id } = await connectedApp();
    mac.state.keychainBroken = true;
    const failed = await app.api("DELETE", `/api/storage/shares/${id}`);
    expect(failed.status).toBe(503);
    expect(failed.body.error.message).toMatch(/could not be removed from the Keychain/);
    expect(app.ctx.db.select().from(networkShares).all()).toHaveLength(1);
  });

  it("lists file servers that announce themselves, and only as host names", async () => {
    const { app, mac } = await macApp();
    mac.state.advertised = [
      { name: "WORKSHOP-NAS", host: "WORKSHOP-NAS.local", port: 445 },
      { name: "Felicity’s MacBook Pro", host: "Felicitys-MacBook-Pro.local", port: 445 },
      { name: "Odd one", host: 'bad"host.local', port: 445 },
    ];
    const { body } = await app.api("GET", "/api/storage/shares/discover");
    expect(body).toEqual({
      supported: true,
      servers: [
        { name: "Felicity’s MacBook Pro", host: "felicitys-macbook-pro.local", port: null },
        { name: "WORKSHOP-NAS", host: "workshop-nas.local", port: null },
      ],
    });
  });
});

describe("instructions for Docker and Linux", () => {
  const hints = { uid: 1000, gid: 1000, mountBase: "/storage" };

  it("writes the Compose lines in the shape the documentation uses, without a password", () => {
    const steps = dockerShareInstructions({ protocol: "smb", host: "192.168.1.20", share: "Family Photos", userName: "walker" }, hints);
    const text = steps.map((step) => `${step.code ?? ""}\n${step.more?.code ?? ""}`).join("\n");
    expect(text).toContain("NAS_USER=walker");
    expect(text).toContain(`NAS_PASSWORD=${PASSWORD_PLACEHOLDER}`);
    expect(text).toContain("  nas-family-photos:\n    driver: local\n    driver_opts:\n      type: cifs");
    expect(text).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Compose's own placeholders, meant literally
      '      o: "addr=192.168.1.20,username=${NAS_USER},password=${NAS_PASSWORD},uid=1000,gid=1000,file_mode=0664,dir_mode=0775,vers=3.0"',
    );
    expect(text).toContain('      device: "//192.168.1.20/Family Photos"');
    expect(text).toContain("      - nas-family-photos:/storage/family-photos\n");
    expect(text).toContain("      - nas-family-photos:/storage/family-photos:ro");
    expect(text).toContain("docker compose up -d");

    const nfs = dockerShareInstructions({ protocol: "nfs", host: "192.168.1.20", exportPath: "/volume1/outpost" }, hints);
    const nfsText = nfs.map((step) => step.code ?? "").join("\n");
    expect(nfsText).toContain('      o: "addr=192.168.1.20,rw,nfsvers=4.1,soft,timeo=150"');
    expect(nfsText).toContain('      device: ":/volume1/outpost"');
    expect(nfsText).not.toContain("NAS_PASSWORD");
  });

  it("writes the fstab line and the credentials-file steps", () => {
    const steps = linuxShareInstructions(
      { protocol: "smb", host: "nas.local", port: 4450, share: "Family Photos", userName: "walker" },
      { uid: 1001, gid: 1002, mountBase: "/mnt" },
    );
    const text = steps.map((step) => `${step.code ?? ""}\n${step.more?.code ?? ""}`).join("\n");
    expect(text).toContain(`username=walker\npassword=${PASSWORD_PLACEHOLDER}`);
    expect(text).toContain("sudo chmod 600 /root/.outpost-smb-family-photos");
    expect(text).toContain(
      "//nas.local/Family\\040Photos  /mnt/family-photos  cifs  credentials=/root/.outpost-smb-family-photos,port=4450,uid=1001,gid=1002,file_mode=0664,dir_mode=0775,vers=3.0,nofail  0  0",
    );
    expect(text).toContain("sudo mkdir -p /mnt/family-photos\nsudo mount /mnt/family-photos");

    const nfs = linuxShareInstructions(
      { protocol: "nfs", host: "192.168.1.20", exportPath: "/volume1/outpost" },
      { uid: 1000, gid: 1000, mountBase: "/mnt" },
    );
    expect(nfs.map((step) => step.code ?? "").join("\n")).toContain(
      "192.168.1.20:/volume1/outpost  /mnt/outpost  nfs  rw,nfsvers=4.1,soft,timeo=150,nofail  0  0",
    );
  });

  it("will not write instructions from hostile input", () => {
    expect(shareInstructionProblem({ protocol: "smb", host: "nas.local", share: "media", userName: "walker" })).toBeUndefined();
    expect(shareInstructionProblem({ protocol: "nfs", host: "nas.local", exportPath: "/volume1/outpost" })).toBeUndefined();
    for (const value of hostile) {
      expect(
        shareInstructionProblem({ protocol: "smb", host: value, share: "media", userName: "walker" }),
        JSON.stringify(value),
      ).toBeTruthy();
      expect(
        shareInstructionProblem({ protocol: "smb", host: "nas.local", share: value, userName: "walker" }),
        JSON.stringify(value),
      ).toBeTruthy();
      expect(
        shareInstructionProblem({ protocol: "smb", host: "nas.local", share: "media", userName: value }),
        JSON.stringify(value),
      ).toBeTruthy();
      expect(shareInstructionProblem({ protocol: "nfs", host: "nas.local", exportPath: value }), JSON.stringify(value)).toBeTruthy();
    }
    for (const exportPath of ["/a/../b", "relative/path", "/with space", '/quote"', "/semi;colon"]) {
      expect(shareInstructionProblem({ protocol: "nfs", host: "nas.local", exportPath }), exportPath).toBeTruthy();
    }
  });
});
