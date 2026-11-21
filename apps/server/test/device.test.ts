/**
 * The device Outpost runs on: the status screen's lines from made-up system files, the
 * event-loop measure, setting the clock through a stand-in for the helper on the host
 * (the real clock is never touched), and /metrics.
 */
import fs from "node:fs";
import path from "node:path";
import type { DeviceStatus, ServerClock } from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import { readCardWear, readMemory, readTemperature, readThrottling } from "../src/modules/device/hardware.ts";
import { isPrivateAddress } from "../src/modules/device/index.ts";
import { createVitals } from "../src/modules/device/vitals.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const apps: TestApp[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});
async function start(env: Record<string, string> = {}) {
  const app = await createTestApp(env);
  apps.push(app);
  return app;
}

/** A Raspberry Pi's files, as the kernel keeps them. */
const PI_FILES: Record<string, string> = {
  "/proc/meminfo": "MemTotal:        8245000 kB\nMemFree:          100000 kB\nMemAvailable:     400000 kB\n",
  "/sys/class/thermal/thermal_zone0/temp": "81250\n",
  "/sys/class/thermal/thermal_zone0/type": "cpu-thermal\n",
  // Under-voltage now (bit 0), and since start-up (bit 16).
  "/sys/devices/platform/soc/soc:firmware/get_throttled": "10001\n",
  "/sys/block/mmcblk0/device/type": "SD\n",
  "/sys/block/mmcblk0/device/name": "SN128\n",
};
const PI_DIRS: Record<string, string[]> = {
  "/sys/class/thermal": ["thermal_zone0", "cooling_device0"],
  "/sys/block": ["loop0", "mmcblk0"],
};
const fakeRead = (files: Record<string, string>) => (file: string) => files[file] ?? null;
const fakeList = (dirs: Record<string, string[]>) => (dir: string) => dirs[dir] ?? [];

describe("what the system says", () => {
  it("reads memory, temperature, the Pi's power flags and a card's wear from the kernel's files", () => {
    const read = fakeRead(PI_FILES);
    const list = fakeList(PI_DIRS);
    expect(readMemory(read)).toMatchObject({ totalBytes: 8245000 * 1024, availableBytes: 400000 * 1024, limitBytes: null });
    expect(readTemperature(read, list)).toEqual({ celsius: 81.25, sensor: "cpu-thermal" });
    expect(readThrottling(read)).toMatchObject({ underVoltageNow: true, underVoltageSinceStart: true, throttledNow: false });
    expect(readCardWear(read, list)).toEqual([{ device: "mmcblk0", type: "SD", name: "SN128", lifeUsedPercent: null, reserve: null }]);

    const emmc = fakeRead({
      "/sys/block/mmcblk1/device/type": "MMC\n",
      "/sys/block/mmcblk1/device/life_time": "0x02 0x09\n",
      "/sys/block/mmcblk1/device/pre_eol_info": "0x02\n",
    });
    expect(readCardWear(emmc, fakeList({ "/sys/block": ["mmcblk1"] }))[0]).toMatchObject({ lifeUsedPercent: [80, 90], reserve: "warning" });
    // A container's memory limit, when it is below the computer's memory.
    const limited = fakeRead({ ...PI_FILES, "/sys/fs/cgroup/memory.max": "1073741824\n", "/sys/fs/cgroup/memory.current": "1000000000\n" });
    expect(readMemory(limited)).toMatchObject({ limitBytes: 1073741824, usedInLimitBytes: 1000000000 });
    expect(readMemory(fakeRead({ ...PI_FILES, "/sys/fs/cgroup/memory.max": "max\n" })).limitBytes).toBeNull();
    // Nothing at all: a Mac.
    expect(readTemperature(fakeRead({}), fakeList({}))).toBeNull();
    expect(readThrottling(fakeRead({}))).toBeNull();
  });
});

describe("the event-loop delay", () => {
  it("measures only once there is work, and keeps the worst hold-up", async () => {
    const vitals = createVitals({ jobsRunning: () => false });
    expect(vitals.eventLoop()).toMatchObject({ measuring: false, worst: null });
    vitals.touch();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const held = Date.now();
    while (Date.now() - held < 250) {
      // The server's thread, held up.
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
    const loop = vitals.eventLoop();
    expect(loop.measuring).toBe(true);
    expect(loop.worst?.ms).toBeGreaterThan(150);
    expect(vitals.worstSince(60)).toBeGreaterThan(150);
    vitals.close();
    expect(vitals.eventLoop().measuring).toBe(false);
  });
});

describe("the status screen", () => {
  it("says how each thing stands, and what to do, in words", async () => {
    const app = await start();
    app.ctx.services.device.system = { read: fakeRead(PI_FILES), list: fakeList(PI_DIRS) };
    const { status, body } = await app.api<DeviceStatus>("GET", "/api/device/status");
    expect(status).toBe(200);
    const check = (id: string) => body.checks.find((entry) => entry.id === id);
    const storage = body.checks.find((entry) => entry.group === "storage");
    expect(storage).toMatchObject({ state: "good", summary: expect.stringMatching(/^Connected\. .* free of /) });
    expect(check("database")).toMatchObject({ state: "good", summary: expect.stringMatching(/Not checked yet/) });
    expect(check("backup")).toMatchObject({ state: "attention", summary: "No backup has been made." });
    expect(check("backup")?.advice).toMatch(/Automatic backups/);
    expect(check("card:mmcblk0")).toMatchObject({ state: "unknown", title: "SD card", summary: expect.stringMatching(/do not report/) });
    expect(check("temperature")).toMatchObject({ state: "attention", summary: expect.stringMatching(/81\.3 °C/) });
    expect(check("power")).toMatchObject({ state: "problem", summary: "The power supply is not giving enough now." });
    expect(check("memory")?.summary).toMatch(/free for programs/);
    expect(check("jobs")).toMatchObject({ state: "good", summary: "Nothing running." });
    expect(check("slow")?.state).toBe("good");
    // The request itself started the measuring.
    expect(body.eventLoop.measuring).toBe(true);
  });
});

describe("the server's clock", () => {
  /** Stands in for the service on the host: answers each request as deploy/pi/set-clock.sh does, without moving any clock. */
  function standInHelper(dir: string, outcome = "ok") {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "helper"), "deploy/pi/install.sh\n");
    const seen: number[] = [];
    const timer = setInterval(() => {
      const file = path.join(dir, "request");
      if (!fs.existsSync(file)) return;
      const [id, offset] = fs.readFileSync(file, "utf8").trim().split(" ");
      fs.rmSync(file);
      seen.push(Number(offset));
      fs.writeFileSync(path.join(dir, "result"), `${id} ${outcome}\n`);
    }, 20);
    return { seen, stop: () => clearInterval(timer) };
  }

  it("says why it cannot be set where there is no way to", async () => {
    const app = await start();
    app.ctx.services.device.clock = { ...app.ctx.services.device.clock, inContainer: true, platform: "linux" };
    const { body } = await app.api<ServerClock>("GET", "/api/device/clock");
    expect(Math.abs(body.now - Date.now())).toBeLessThan(5_000);
    expect(body.setting).toMatchObject({ possible: false, allowed: false, how: null });
    expect(body.setting.reason).toMatch(/container cannot set the clock .*deploy\/pi\/install\.sh/);
    const refused = await app.api("POST", "/api/device/clock", { deviceNow: Date.now() + 3_600_000 });
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toMatch(/container/);
  });

  it("is set through the helper from this computer, by the difference from the device's clock", async () => {
    const app = await start();
    const helper = standInHelper(app.ctx.services.device.clock.helperDir);
    try {
      const { body } = await app.api<ServerClock>("GET", "/api/device/clock");
      expect(body.setting).toMatchObject({ possible: true, allowed: true, how: "helper", reason: null });
      const set = await app.api("POST", "/api/device/clock", { deviceNow: Date.now() + 3_600_000 });
      expect(set.status).toBe(200);
      expect(set.body.movedMs).toBeGreaterThan(3_590_000);
      expect(helper.seen).toHaveLength(1);
      expect(Math.abs((helper.seen[0] ?? 0) - 3_600_000)).toBeLessThan(10_000);
      // A device whose own clock cannot be right is not believed.
      const wrong = await app.api("POST", "/api/device/clock", { deviceNow: Date.UTC(2001, 0, 1) });
      expect(wrong.status).toBe(400);
      expect(helper.seen).toHaveLength(1);
    } finally {
      helper.stop();
    }
  });

  it("is refused to another device unless the start-up option allows it, and says the option", async () => {
    const other = { remoteAddress: "192.168.1.50" };
    const app = await start({ OUTPOST_LAN_ACCESS: "true" });
    const helper = standInHelper(app.ctx.services.device.clock.helperDir);
    try {
      const { body } = await app.api<ServerClock>("GET", "/api/device/clock", undefined, other);
      expect(body.setting).toMatchObject({ possible: true, allowed: false });
      expect(body.setting.reason).toMatch(/OUTPOST_ALLOW_REMOTE_CLOCK=true/);
      expect((await app.api("POST", "/api/device/clock", { deviceNow: Date.now() }, other)).status).toBe(403);
      expect(helper.seen).toHaveLength(0);
    } finally {
      helper.stop();
    }

    const allowing = await start({ OUTPOST_LAN_ACCESS: "true", OUTPOST_ALLOW_REMOTE_CLOCK: "true" });
    const second = standInHelper(allowing.ctx.services.device.clock.helperDir, "failed date: cannot set date: Operation not permitted");
    try {
      const failed = await allowing.api("POST", "/api/device/clock", { deviceNow: Date.now() }, other);
      expect(failed.status).toBe(500);
      expect(failed.body.error.message).toMatch(/could not: date: cannot set date/);
      expect(second.seen).toHaveLength(1);
    } finally {
      second.stop();
    }
  });
});

describe("/metrics", () => {
  it("is off unless asked for, and then only for this computer and the local network", async () => {
    const off = await start();
    const closed = await off.api("GET", "/metrics");
    expect(closed.status).toBe(404);
    expect(closed.body.error.message).toMatch(/OUTPOST_METRICS=true/);

    const app = await start({ OUTPOST_METRICS: "true", OUTPOST_LAN_ACCESS: "true" });
    await app.api("GET", "/api/health");
    const response = await app.api("GET", "/metrics");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/plain; version=0\.0\.4/);
    const text = response.body as string;
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toMatch(/^# HELP outpost_info /m);
    expect(text).toMatch(/^outpost_info\{version="[^"]+"\} 1$/m);
    expect(text).toMatch(/^outpost_http_request_duration_seconds_bucket\{method="GET",route="\/api\/health",le="\+Inf"\} 1$/m);
    expect(text).toMatch(/^outpost_http_request_duration_seconds_count\{method="GET",route="\/api\/health"\} 1$/m);
    expect(text).toMatch(/^outpost_storage_location_up\{location="[^"]+",name="[^"]+",kind="internal"\} 1$/m);
    expect(text).toMatch(/^outpost_database_bytes\{file="main"\} \d+$/m);
    expect(text).toMatch(/^# TYPE outpost_backup_age_seconds gauge$/m);
    // Every name is declared once.
    const types = text.match(/^# TYPE (\S+)/gm) ?? [];
    expect(new Set(types).size).toBe(types.length);

    // From a private network, as Prometheus in a container on the Pi reaches it.
    expect((await app.api("GET", "/metrics", undefined, { remoteAddress: "172.18.0.5" })).status).toBe(200);
    expect((await app.api("GET", "/metrics", undefined, { remoteAddress: "::ffff:192.168.1.134" })).status).toBe(200);
    // From the internet, or through a proxy for it.
    expect((await app.api("GET", "/metrics", undefined, { remoteAddress: "8.8.8.8" })).status).toBe(403);
    expect((await app.api("GET", "/metrics", undefined, { headers: { "x-forwarded-for": "203.0.113.9" } })).status).toBe(403);
  });

  it("knows a private address", () => {
    for (const address of ["127.0.0.1", "::1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "fd00::1", "::ffff:10.0.0.1"])
      expect(isPrivateAddress(address)).toBe(true);
    for (const address of ["8.8.8.8", "2001:db8::1", "172.32.0.1", undefined, "not an address"])
      expect(isPrivateAddress(address)).toBe(false);
  });
});
