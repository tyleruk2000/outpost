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
import { keepLookingForShares } from "../src/modules/storage/shares/routes.ts";
import type { ListedShare, ShareLister } from "../src/modules/storage/shares/smb-list.ts";
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
  /** Empty for a guest. */
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
    /** More names the pretend network knows, and the addresses they stand for. */
    lookupAlso: {} as Record<string, string>,
    /** Shares guests may open. */
    guestShares: [] as string[],
    /** Whether the server lets guests in at all. */
    guests: false,
    /**
     * Behave as macOS really does when it is NOT told to sign in afresh: a second mount
     * from a server it already has a sign-in with succeeds whatever password it is given.
     */
    reusesSignIn: false,
    /** What the server answers when asked for its shares. Defaults to its disk shares. */
    listing: undefined as ListedShare[] | undefined,
    /** What the list reader was asked, without the password. */
    listed: [] as Array<{ address: string; port: number; user: string | undefined; typedPassword: boolean }>,
    /** Make the list reader answer this instead of talking to the pretend server. */
    listAnswer: undefined as Awaited<ReturnType<ShareLister>> | undefined,
  };
  /** The pretend server's answer to a sign-in and a request for its shares. */
  const list: ShareLister = async (request) => {
    state.listed.push({ address: request.address, port: request.port, user: request.user, typedPassword: request.password !== undefined });
    if (state.listAnswer) return state.listAnswer;
    if (request.user === undefined) {
      if (!state.guests) return { kind: "guest_refused" };
    } else if (request.password !== state.password) {
      return { kind: "wrong_password" };
    }
    const shares =
      state.listing ??
      [...state.shares, ...state.guestShares].map((name): ListedShare => ({ name, kind: "disk", special: false, comment: "" }));
    return { kind: "listed", shares };
  };
  const ok = (stdout: string) => ({ code: 0, stdout, stderr: "", timedOut: false });
  const run: CommandRunner = async (file, args, opts) => {
    state.calls.push({ file, args: [...args], input: opts.input });
    if (file === "/sbin/mount") {
      const lines = state.mounts.map(
        (mount) =>
          `//${mount.user ? encodeURIComponent(mount.user) : "GUEST:"}@${encodeURIComponent(mount.host)}${mount.port === 445 ? "" : `:${mount.port}`}/${encodeURIComponent(mount.share)} on ${mount.mountPoint} (smbfs, nodev, nosuid, mounted by someone)`,
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
        user?: string;
        password?: string;
        remember?: boolean;
        guest?: boolean;
        keychain?: { service: string; account: string };
      };
      const key = input.keychain ? `${input.keychain.service}|${input.keychain.account}` : "";
      if (input.op === "forget") {
        if (state.keychainBroken) return ok(JSON.stringify({ keychain: -25308 }));
        const had = state.keychain.delete(key);
        return ok(JSON.stringify({ keychain: had ? 0 : -25300 }));
      }
      const url = new URL(input.url);
      const share = decodeURIComponent(url.pathname.slice(1));
      const port = url.port ? Number(url.port) : 445;
      let password = input.password;
      if (!input.guest && typeof password !== "string") {
        const kept = state.keychain.get(key);
        if (kept === undefined) return ok(JSON.stringify({ status: null, keychain: -25300 }));
        password = kept;
      }
      // The real helper always asks for a fresh sign-in; a helper that did not would be let in on an old one.
      const riding = state.reusesSignIn ? state.mounts.find((mount) => mount.host === url.hostname && mount.port === port) : undefined;
      if (!riding) {
        if (input.guest) {
          if (!state.guests) return ok(JSON.stringify({ status: 80 }));
          if (!state.guestShares.includes(share)) return ok(JSON.stringify({ status: 60 }));
        } else {
          if (password !== state.password) return ok(JSON.stringify({ status: 80 }));
          if (![...state.shares, ...state.guestShares].includes(share)) return ok(JSON.stringify({ status: 2 }));
        }
      }
      const mountPoint = path.join(root, share);
      if (state.mounts.some((mount) => mount.mountPoint === mountPoint)) return ok(JSON.stringify({ status: 17 }));
      if (fs.existsSync(away(mountPoint))) fs.renameSync(away(mountPoint), mountPoint);
      else fs.mkdirSync(mountPoint, { recursive: true });
      state.mounts.push({
        host: url.hostname,
        port,
        share,
        user: riding ? riding.user : input.guest ? "" : (input.user ?? ""),
        mountPoint,
      });
      const answer: Record<string, unknown> = { status: 0, mountPoints: [mountPoint] };
      if (input.remember === true && !input.guest) {
        state.keychain.set(key, password ?? "");
        answer.stored = true;
        answer.storeStatus = 0;
      }
      return ok(JSON.stringify(answer));
    }
    return { code: null, stdout: "", stderr: "", timedOut: false };
  };
  return { state, run, list };
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
  deps.listShares = mac.list;
  deps.lookup = async (host) => {
    if (host === "nas.local") return [{ address: "192.168.1.20", family: 4 }];
    if (mac.state.lookupAlso[host]) return [{ address: mac.state.lookupAlso[host]!, family: 4 }];
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
      "//walker@ATTIC-NAS._smb._tcp.local/Docs on /Volumes/Docs (smbfs, nodev, nosuid, mounted by someone)",
      "//outposttest@127.0.0.1:44445/outpost-test on /Volumes/outpost-test (smbfs, nodev, nosuid, mounted by someone)",
      "//me@192.168.1.20/Family%20Photos on /Volumes/Family Photos (smbfs, nodev, nosuid, mounted by someone)",
      "nas:/volume1/x on /Volumes/x (nfs, nodev, nosuid, mounted by someone)",
      "//GUEST:@127.0.0.1:44445/public on /Volumes/public (smbfs, nodev, nosuid, noowners, mounted by someone)",
    ].join("\n");
    expect(parseMountTable(table)).toEqual([
      { host: "attic-nas._smb._tcp.local", port: 445, share: "Docs", user: "walker", mountPoint: "/Volumes/Docs" },
      { host: "127.0.0.1", port: 44445, share: "outpost-test", user: "outposttest", mountPoint: "/Volumes/outpost-test" },
      { host: "192.168.1.20", port: 445, share: "Family Photos", user: "me", mountPoint: "/Volumes/Family Photos" },
      // A guest's connection has no user to speak of.
      { host: "127.0.0.1", port: 44445, share: "public", user: undefined, mountPoint: "/Volumes/public" },
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
    // A name is passed to dns-sd as an argument: one that would be read as an option is left out.
    expect(parseBrowse(`${browse}\n19:55:44.511  Add        2  14 local.               _smb._tcp.           -i en0`)).toEqual([
      "Felicity’s MacBook Pro",
      "WORKSHOP-NAS",
    ]);
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

  // The same signs the local-only rule uses (core/local.ts containerReason), so that the
  // two never disagree about where Outpost runs. Made-up files: see docs/development/storage-and-https.md.
  const none = { exists: () => false, read: () => null };
  const only = (contents: Record<string, string>) => ({
    exists: (file: string) => file in contents,
    read: (file: string) => contents[file] ?? null,
  });
  it.each([
    ["Docker", {}, only({ "/.dockerenv": "" })],
    ["Podman", {}, only({ "/run/.containerenv": "" })],
    ["Podman, by the variable it sets", { container: "podman" }, none],
    ["LXC", { container: "lxc" }, none],
    ["LXC, by its control group", {}, only({ "/proc/self/cgroup": "0::/lxc.payload.outpost/init.scope\n" })],
    ["Kubernetes", { KUBERNETES_SERVICE_HOST: "10.96.0.1" }, none],
    ["a Kubernetes control group", {}, only({ "/proc/self/cgroup": "0::/kubepods/besteffort/pod1234/0123456789ab\n" })],
  ])("knows it is in a container under %s", (_what, env, files) => {
    expect(detectHost(env, "linux", files)).toEqual({ os: "linux", inContainer: true });
    expect(shareHostMode(detectHost(env, "linux", files), { portable: false })).toBe("docker");
  });

  it("does not take a plain Linux computer for a container", () => {
    expect(detectHost({}, "linux", only({ "/proc/self/cgroup": "0::/user.slice/user-1000.slice/session-2.scope\n" }))).toEqual({
      os: "linux",
      inContainer: false,
    });
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
      // What reaches the file server: a mount by the helper, or a sign-in by the list reader.
      const mounts = () => mac.state.calls.filter((call) => call.file === "/usr/bin/osascript").length;
      const asked = mounts();
      const looked = mac.state.listed.length;
      // The sixth is turned away here: the server never hears it, even though it is right.
      // Outpost has no sign-in, so without this anyone on the network could try passwords through it.
      const held = await app.api("POST", "/api/storage/shares", connectBody());
      expect(held.status).toBe(403);
      expect(held.body.error.message).toMatch(/Too many wrong passwords for this user on this server\. Try again in \d+ seconds\./);
      expect(held.body.error.details).toMatchObject({ reason: "wrong_password", retryAfterSeconds: 60 });
      expect(mounts()).toBe(asked);
      expect(mac.state.listed.length).toBe(looked);
      // The count belongs to the user on that server, so another of its shares is held up too...
      mac.state.shares.push("other");
      expect((await app.api("POST", "/api/storage/shares", connectBody({ share: "other" }))).status).toBe(403);
      // ...and so is the same server under another name, or the user name in other letters.
      mac.state.lookupAlso = { "nas-again.local": "192.168.1.20" };
      expect((await app.api("POST", "/api/storage/shares", connectBody({ server: "nas-again.local" }))).status).toBe(403);
      expect((await app.api("POST", "/api/storage/shares", connectBody({ server: "192.168.1.20", userName: "WALKER" }))).status).toBe(403);
      expect(mounts()).toBe(asked);
      expect(mac.state.listed.length).toBe(looked);
      // After the wait, the right password works and the count is forgotten.
      clock += 61_000;
      expect((await app.api("POST", "/api/storage/shares", connectBody())).status).toBe(200);
      for (let guess = 1; guess <= 4; guess += 1) {
        expect((await app.api("POST", "/api/storage/shares", connectBody({ share: "other", password: "no" }))).status).toBe(403);
      }
      expect((await app.api("POST", "/api/storage/shares", connectBody({ share: "other" }))).status).toBe(200);
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

  it("says whether anything is still to be connected, so that it is tried again only then", async () => {
    const { app, mac, deps } = await connectedApp();
    expect(await app.ctx.services.shares.reconnectRemembered()).toBe(false);
    mac.state.mounts = [];
    deps.probe = async () => "unreachable";
    expect(await app.ctx.services.shares.reconnectRemembered()).toBe(true);
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
      // A name under a domain the device controls, and an address: connecting would ask the computer's DNS server.
      { name: "Tracker", host: "beacon.attacker.example", port: 445 },
      { name: "Elsewhere", host: "8.8.8.8", port: 445 },
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

describe("looking again for shares that should be connected", () => {
  it("goes on while a share could not be connected", () => {
    expect(keepLookingForShares(true, [{ status: "available" }])).toBe(true);
  });

  it("goes on while a location is away, though every share's mount is still listed", () => {
    // A NAS that has just gone: the Mac still lists its mount, so no share reads as missing.
    expect(keepLookingForShares(false, [{ status: "available" }, { status: "unavailable" }])).toBe(true);
  });

  it("stops once every share is connected and every location is there", () => {
    expect(keepLookingForShares(false, [{ status: "available" }, { status: "available" }])).toBe(false);
    expect(keepLookingForShares(false, [])).toBe(false);
  });
});

describe("exploring a server instead of typing a share's name", () => {
  const listBody = (extra: Record<string, unknown> = {}) => ({ server: "nas.local", userName: "walker", password: PASSWORD, ...extra });
  const signIns = (mac: ReturnType<typeof fakeMac>) => mac.state.listed.length;
  const mountsAsked = (mac: ReturnType<typeof fakeMac>) => mac.state.calls.filter((call) => call.file === "/usr/bin/osascript").length;

  it("lists the folders a server shares, and only those a library could live on", async () => {
    const { app, mac } = await macApp();
    mac.state.listing = [
      { name: "media", kind: "disk", special: false, comment: "Films and music" },
      { name: "Family Photos", kind: "disk", special: false, comment: "" },
      { name: "Übungen", kind: "disk", special: false, comment: "tab\tand\u0000nul" },
      { name: "backup$", kind: "disk", special: false, comment: "" },
      { name: "IPC$", kind: "ipc", special: true, comment: "IPC Service" },
      { name: "print$", kind: "disk", special: false, comment: "Printer Drivers" },
      { name: "ADMIN$", kind: "disk", special: true, comment: "Remote Admin" },
      { name: "C$", kind: "disk", special: true, comment: "Default share" },
      { name: "laser", kind: "printer", special: false, comment: "" },
      { name: "tape", kind: "device", special: false, comment: "" },
      { name: "MEDIA", kind: "disk", special: false, comment: "the same share in other letters" },
    ];
    const { status, body } = await app.api("POST", "/api/storage/shares/list", listBody());
    expect(status).toBe(200);
    expect(body).toEqual({
      shares: [
        { name: "backup$", hidden: true, comment: null, mountPath: null },
        { name: "Family Photos", hidden: false, comment: null, mountPath: null },
        { name: "media", hidden: false, comment: "Films and music", mountPath: null },
        { name: "Übungen", hidden: false, comment: "tab and nul", mountPath: null },
      ],
      unusable: 0,
    });
    // It asked the address that was checked, as the user given, and nothing was mounted or kept.
    expect(mac.state.listed).toEqual([{ address: "192.168.1.20", port: 445, user: "walker", typedPassword: true }]);
    expect(mountsAsked(mac)).toBe(0);
    expect(app.ctx.db.select().from(networkShares).all()).toEqual([]);
    expect(mac.state.keychain.size).toBe(0);
    for (const part of [PASSWORD, "hunter2"]) {
      expect(JSON.stringify(body)).not.toContain(part);
      expect(databaseBytes(app.dir)).not.toContain(part);
      for (const call of mac.state.calls) expect(call.args.join("\n")).not.toContain(part);
    }
  });

  it("treats every name the server sends as untrusted", async () => {
    const { app, mac } = await macApp();
    mac.state.listing = [
      { name: "media", kind: "disk", special: false, comment: "" },
      ...hostile.filter(Boolean).map((name): ListedShare => ({ name, kind: "disk", special: false, comment: "" })),
      { name: "../../etc", kind: "disk", special: false, comment: "" },
      { name: "a/b", kind: "disk", special: false, comment: "" },
      { name: "x".repeat(500), kind: "disk", special: false, comment: "" },
      { name: "", kind: "disk", special: false, comment: "" },
    ];
    const { body } = await app.api("POST", "/api/storage/shares/list", listBody());
    // Only the one name that passes the same rule as a typed name is offered; the rest are counted.
    expect(body.shares.map((share: { name: string }) => share.name)).toEqual(["media"]);
    expect(body.unusable).toBe(mac.state.listing.length - 1);
    // And a hostile name cannot be connected by asking for it directly either.
    for (const share of ['nas"; do shell script "id', "a/b", "../../etc"]) {
      expect((await app.api("POST", "/api/storage/shares", connectBody({ share }))).status).toBe(400);
    }
    expect(mountsAsked(mac)).toBe(0);
  });

  it("says which shares are connected on this Mac already", async () => {
    const { app, mac } = await macApp({ shares: ["media", "films"] });
    await app.api("POST", "/api/storage/shares", connectBody());
    const { body } = await app.api("POST", "/api/storage/shares/list", listBody());
    expect(body.shares).toEqual([
      { name: "films", hidden: false, comment: null, mountPath: null },
      { name: "media", hidden: false, comment: null, mountPath: path.join(app.dir, "storage", "media") },
    ]);
    expect(mac.state.mounts).toHaveLength(1);
  });

  it("counts a wrong password when listing towards the same wait as connecting", async () => {
    const { app, mac } = await macApp();
    const now = vi.spyOn(Date, "now");
    let clock = 1_800_000_000_000;
    now.mockImplementation(() => clock);
    try {
      // Three misses looking at the list, two more trying to connect: five in all, for one user on one server.
      for (let guess = 1; guess <= 3; guess += 1) {
        const refused = await app.api("POST", "/api/storage/shares/list", listBody({ password: `list guess ${guess}` }));
        expect(refused.status).toBe(403);
        expect(refused.body.error).toMatchObject({
          message: "The server did not accept that user name and password.",
          details: { reason: "wrong_password" },
        });
        expect(JSON.stringify(refused.body)).not.toContain("list guess");
      }
      for (let guess = 1; guess <= 2; guess += 1) {
        expect((await app.api("POST", "/api/storage/shares", connectBody({ password: `connect guess ${guess}` }))).status).toBe(403);
      }
      const reached = signIns(mac) + mountsAsked(mac);
      // Now neither way of trying a password reaches the server, even with the right one.
      const heldList = await app.api("POST", "/api/storage/shares/list", listBody());
      expect(heldList.status).toBe(403);
      expect(heldList.body.error.message).toMatch(/Too many wrong passwords for this user on this server\. Try again in 60 seconds\./);
      expect(heldList.body.error.details).toEqual({ reason: "wrong_password", retryAfterSeconds: 60 });
      expect((await app.api("POST", "/api/storage/shares", connectBody())).status).toBe(403);
      expect((await app.api("POST", "/api/storage/shares/list", listBody({ server: "192.168.1.20", userName: "Walker" }))).status).toBe(
        403,
      );
      expect(signIns(mac) + mountsAsked(mac)).toBe(reached);
      // Someone else's account on the same server is not held up, and nor is a guest (who offers no password).
      mac.state.guests = true;
      expect((await app.api("POST", "/api/storage/shares/list", listBody({ userName: "other", password: "also wrong" }))).status).toBe(403);
      expect((await app.api("POST", "/api/storage/shares/list", { server: "nas.local", guest: true })).status).toBe(200);
      // A further miss after the wait doubles it; the right password clears the count.
      clock += 61_000;
      expect((await app.api("POST", "/api/storage/shares/list", listBody({ password: "sixth" }))).body.error.details.reason).toBe(
        "wrong_password",
      );
      expect((await app.api("POST", "/api/storage/shares/list", listBody())).body.error.details.retryAfterSeconds).toBe(120);
      clock += 121_000;
      expect((await app.api("POST", "/api/storage/shares/list", listBody())).status).toBe(200);
      for (let guess = 1; guess <= 4; guess += 1) await app.api("POST", "/api/storage/shares/list", listBody({ password: "again" }));
      expect((await app.api("POST", "/api/storage/shares/list", listBody())).status).toBe(200);
    } finally {
      now.mockRestore();
    }
  });

  it("counts a user name the server does not know as a wrong guess too", async () => {
    const { app, mac } = await macApp();
    mac.state.listAnswer = { kind: "unknown_user" };
    const refused = await app.api("POST", "/api/storage/shares/list", listBody({ userName: "nobody" }));
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toBe("nas.local has no user called nobody. Check the user name.");
    for (let guess = 2; guess <= 5; guess += 1) await app.api("POST", "/api/storage/shares/list", listBody({ userName: "nobody" }));
    expect((await app.api("POST", "/api/storage/shares/list", listBody({ userName: "nobody" }))).body.error.message).toMatch(
      /Too many wrong passwords/,
    );
  });

  it("lets a guest look and connect only where the server allows guests", async () => {
    const { app, mac } = await macApp();
    const refused = await app.api("POST", "/api/storage/shares/list", { server: "nas.local", guest: true });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatchObject({ details: { reason: "guest_refused" } });
    expect(refused.body.error.message).toMatch(/does not let guests look at its shared folders/);
    expect((await app.api("POST", "/api/storage/shares", { server: "nas.local", share: "media", guest: true })).status).toBe(503);
    expect(mountsAsked(mac)).toBe(0);

    mac.state.guests = true;
    mac.state.guestShares = ["public"];
    const listed = await app.api("POST", "/api/storage/shares/list", { server: "nas.local", guest: true });
    expect(listed.body.shares.map((share: { name: string }) => share.name)).toEqual(["media", "public"]);
    expect(mac.state.listed.at(-1)).toEqual({ address: "192.168.1.20", port: 445, user: undefined, typedPassword: false });

    // A share guests may not open says so, and leaves nothing behind.
    const closed = await app.api("POST", "/api/storage/shares", { server: "nas.local", share: "media", guest: true });
    expect(closed.status).toBe(503);
    expect(closed.body.error.message).toMatch(/no share called "media" that a guest can open/);
    expect(app.ctx.db.select().from(networkShares).all()).toEqual([]);

    const connected = await app.api("POST", "/api/storage/shares", {
      server: "nas.local",
      share: "public",
      guest: true,
      rememberPassword: true,
    });
    expect(connected.status).toBe(200);
    expect(connected.body.share).toMatchObject({
      share: "public",
      guest: true,
      userName: "",
      passwordRemembered: false,
      status: "connected",
    });
    // The helper was told "guest" and given no name, no password and nothing to do with the Keychain.
    const sent = JSON.parse(mac.state.calls.filter((call) => call.file === "/usr/bin/osascript").at(-1)!.input!);
    expect(sent).toEqual({ op: "mount", url: "smb://192.168.1.20/public", guest: true });
    expect(mac.state.keychain.size).toBe(0);

    // A guest's share is one Outpost can bring back by itself.
    mac.state.mounts = [];
    await app.ctx.services.shares.reconnectRemembered();
    expect((await app.api("GET", "/api/storage/shares")).body.shares[0]).toMatchObject({ status: "connected", guest: true });
    // Forgetting it has no Keychain item to remove, and does not go looking for one.
    const before = mountsAsked(mac);
    expect((await app.api("DELETE", `/api/storage/shares/${connected.body.share.id}`)).status).toBe(200);
    expect(mountsAsked(mac)).toBe(before);
  });

  it("checks the sign-in itself, so an old sign-in on the Mac cannot stand in for a password", async () => {
    const { app, mac } = await macApp({ shares: ["media", "private"] });
    await app.api("POST", "/api/storage/shares", connectBody());
    const asked = mountsAsked(mac);
    // From here the pretend Mac does what a real one does unless told to sign in afresh:
    // it would mount another share from the same server whatever password it was handed.
    mac.state.reusesSignIn = true;
    const wrong = await app.api("POST", "/api/storage/shares", connectBody({ share: "private", password: "anything at all" }));
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.details.reason).toBe("wrong_password");
    const guest = await app.api("POST", "/api/storage/shares", { server: "nas.local", share: "private", guest: true });
    expect(guest.status).toBe(503);
    // Neither request got as far as asking for a mount.
    expect(mountsAsked(mac)).toBe(asked);
    expect(mac.state.mounts.map((mount) => mount.share)).toEqual(["media"]);
    // And the helper itself always asks macOS for a fresh sign-in.
    expect(MAC_HELPER).toContain('open.setObjectForKey(true, "ForceNewSession")');
  });

  it("says plainly why a list could not be had, and that the name can still be typed", async () => {
    const { app, mac, deps } = await macApp();
    const cases: Array<[Awaited<ReturnType<ShareLister>>, number, string, RegExp]> = [
      [
        { kind: "unsupported", why: "protocol" },
        503,
        "cannot_list",
        /speaks a version of SMB .* You can still connect a share by typing its name\./,
      ],
      [{ kind: "unsupported", why: "sign_in" }, 503, "cannot_list", /kind of sign-in/],
      [{ kind: "not_allowed" }, 503, "cannot_list", /accepted the sign-in, but does not let this account see its list/],
      [
        { kind: "failed", detail: "c0000001 from the server \u0000" },
        503,
        "cannot_list",
        /could not read the list of shared folders from nas\.local\. You can still/,
      ],
      [{ kind: "no_answer" }, 503, "server_not_found", /did not answer/],
      [{ kind: "account_unusable", why: "locked" }, 403, "failed", /has locked this account/],
    ];
    for (const [answer, status, reason, message] of cases) {
      mac.state.listAnswer = answer;
      const response = await app.api("POST", "/api/storage/shares/list", listBody());
      expect(response.status, answer.kind).toBe(status);
      expect(response.body.error.details.reason, answer.kind).toBe(reason);
      expect(response.body.error.message, answer.kind).toMatch(message);
      // The server's own words stay in the log.
      expect(response.body.error.message).not.toContain("c0000001");
    }
    // None of those is a wrong password: the count is untouched.
    mac.state.listAnswer = undefined;
    expect((await app.api("POST", "/api/storage/shares/list", listBody())).status).toBe(200);

    // A server that is not on the home network, or not there, is never asked.
    const asked = signIns(mac);
    expect((await app.api("POST", "/api/storage/shares/list", listBody({ server: "example.com" }))).body.error.message).toMatch(
      /only connects to file servers on your own network/,
    );
    expect((await app.api("POST", "/api/storage/shares/list", listBody({ server: "8.8.8.8" }))).status).toBe(503);
    deps.allowLoopback = false;
    expect((await app.api("POST", "/api/storage/shares/list", listBody({ server: "127.0.0.1" }))).status).toBe(503);
    deps.probe = async () => "timeout";
    expect((await app.api("POST", "/api/storage/shares/list", listBody())).body.error.details.reason).toBe("server_not_found");
    for (const server of hostile) expect((await app.api("POST", "/api/storage/shares/list", listBody({ server }))).status).toBe(400);
    for (const userName of hostile) expect((await app.api("POST", "/api/storage/shares/list", listBody({ userName }))).status).toBe(400);
    expect((await app.api("POST", "/api/storage/shares/list", listBody({ password: "two\nlines" }))).status).toBe(400);
    expect(signIns(mac)).toBe(asked);
  });

  it("does not list anything in a container or on Linux", async () => {
    const { app, mac, deps } = await macApp();
    for (const mode of ["docker", "linux", "unsupported"] as const) {
      deps.mode = mode;
      expect((await app.api("POST", "/api/storage/shares/list", listBody())).status).toBe(415);
      expect((await app.api("GET", "/api/storage/shares/mounted")).body).toEqual({ mounts: [] });
      expect((await app.api("POST", "/api/storage/shares/adopt", { mountPath: "/Volumes/media" })).status).toBe(415);
    }
    expect(signIns(mac)).toBe(0);
    expect(mac.state.calls).toEqual([]);
  });
});

describe("volumes that are connected on the Mac already", () => {
  it("lists those inside the storage roots with their server and share, and says which Outpost may use", async () => {
    const { app, mac } = await macApp();
    const root = path.join(app.dir, "storage");
    for (const name of ["Docs", "Family Photos", "odd"]) fs.mkdirSync(path.join(root, name), { recursive: true });
    mac.state.mounts.push(
      // From the Finder's Network list, which names the server after its Bonjour service.
      { host: "attic-nas._smb._tcp.local", port: 445, share: "Docs", user: "walker", mountPoint: path.join(root, "Docs") },
      { host: "192.168.1.20", port: 4450, share: "Family Photos", user: "", mountPoint: path.join(root, "Family Photos") },
      // Not inside a storage root: left out altogether.
      { host: "nas.local", port: 445, share: "elsewhere", user: "walker", mountPoint: "/Users/someone/elsewhere" },
      // A server name that could never be typed.
      { host: "felicity’s macbook pro._smb._tcp.local", port: 445, share: "odd", user: "walker", mountPoint: path.join(root, "odd") },
    );
    const { body } = await app.api("GET", "/api/storage/shares/mounted");
    expect(body.mounts).toEqual([
      {
        server: "attic-nas.local",
        port: null,
        share: "Docs",
        userName: "walker",
        mountPath: path.join(root, "Docs"),
        usable: true,
        problem: null,
        shareId: null,
      },
      {
        server: "192.168.1.20",
        port: 4450,
        share: "Family Photos",
        userName: null,
        mountPath: path.join(root, "Family Photos"),
        usable: true,
        problem: null,
        shareId: null,
      },
      expect.objectContaining({ share: "odd", usable: false, problem: expect.stringMatching(/characters Outpost does not accept/) }),
    ]);
  });

  it("uses one with a tap: no password, nothing mounted, and the share is remembered", async () => {
    const { app, mac } = await macApp();
    const mountPoint = path.join(app.dir, "storage", "Docs");
    fs.mkdirSync(mountPoint, { recursive: true });
    mac.state.mounts.push({ host: "attic-nas._smb._tcp.local", port: 445, share: "Docs", user: "walker", mountPoint });
    mac.state.lookupAlso = { "attic-nas.local": "192.168.1.30" };

    const adopted = await app.api("POST", "/api/storage/shares/adopt", { mountPath: mountPoint });
    expect(adopted.status).toBe(200);
    expect(adopted.body.share).toMatchObject({
      server: "attic-nas.local",
      share: "Docs",
      userName: "walker",
      guest: false,
      passwordRemembered: false,
      status: "connected",
      mountPath: mountPoint,
    });
    expect(adopted.body.note).toBeUndefined();
    // The file server was not contacted at all.
    expect(mac.state.listed).toEqual([]);
    expect(mac.state.calls.every((call) => call.file === "/sbin/mount")).toBe(true);
    expect(mac.state.keychain.size).toBe(0);

    // It is now marked as Outpost's, and using it again changes nothing.
    expect((await app.api("GET", "/api/storage/shares/mounted")).body.mounts[0].shareId).toBe(adopted.body.share.id);
    const again = await app.api("POST", "/api/storage/shares/adopt", { mountPath: mountPoint });
    expect(again.body.share.id).toBe(adopted.body.share.id);
    expect(app.ctx.db.select().from(networkShares).all()).toHaveLength(1);

    // The folder on it becomes a location through the ordinary path.
    const location = await app.api("POST", "/api/storage/locations", {
      name: "Docs on the NAS",
      path: path.join(mountPoint, "Outpost"),
      kind: "network",
    });
    expect(location.status).toBe(200);
    expect((await app.api("GET", "/api/storage/shares")).body.shares[0].locations).toEqual([
      { id: location.body.location.id, name: "Docs on the NAS" },
    ]);
  });

  it("only ever adopts a volume in the system's own list of mounts", async () => {
    const { app, mac } = await macApp();
    const inside = path.join(app.dir, "storage", "plain-folder");
    fs.mkdirSync(inside, { recursive: true });
    mac.state.mounts.push({ host: "nas.local", port: 445, share: "elsewhere", user: "walker", mountPoint: "/Users/someone/elsewhere" });
    // An ordinary folder, a path outside the roots, a mount outside the roots, and nonsense.
    expect((await app.api("POST", "/api/storage/shares/adopt", { mountPath: inside })).status).toBe(404);
    expect((await app.api("POST", "/api/storage/shares/adopt", { mountPath: "/etc" })).status).toBe(404);
    expect((await app.api("POST", "/api/storage/shares/adopt", { mountPath: "/Users/someone/elsewhere" })).status).toBe(400);
    expect((await app.api("POST", "/api/storage/shares/adopt", { mountPath: "" })).status).toBe(400);
    expect((await app.api("POST", "/api/storage/shares/adopt", {})).status).toBe(400);
    expect(app.ctx.db.select().from(networkShares).all()).toEqual([]);
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
