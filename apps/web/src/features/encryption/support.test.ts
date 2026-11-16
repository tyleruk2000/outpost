/** Passphrase rules, what the browser keeps, the unlock session, and small formatting helpers. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkedKeys,
  devicePrivateKey,
  devicePrivateKeys,
  onDeviceKeysChanged,
  removeDevicePrivateKey,
  saveDevicePrivateKey,
  setKeyChecked,
} from "./device-keys";
import type { UnlockedKey } from "./engine";
import { fingerprintGroups, formatFingerprint, keyLabel, safeDownloadName, slug } from "./format";
import { assessPassphrase, proquint, suggestPassphrase } from "./passphrase";
import { holdUnlocked, keepUnlocked, lock, lockAll, subscribeUnlocked, UNLOCK_IDLE_MS, unlockedKey, unlockedSnapshot } from "./session";

describe("a suggested passphrase", () => {
  it("is made of proquints, 16 bits each, as the published scheme writes them", () => {
    // From the proposal's own table: 127.0.0.1 is lusab-babad.
    expect(`${proquint(0x7f00)}-${proquint(0x0001)}`).toBe("lusab-babad");
    // 63.84.220.193 is gutih-tugad; 147.67.119.2 is natag-lisaf.
    expect(`${proquint((63 << 8) | 84)}-${proquint((220 << 8) | 193)}`).toBe("gutih-tugad");
    expect(`${proquint((147 << 8) | 67)}-${proquint((119 << 8) | 2)}`).toBe("natag-lisaf");
    expect(proquint(0)).toBe("babab");
    expect(proquint(0xffff)).toBe("zuzuz");
  });

  it("uses exactly the random values it is given, five words by default", () => {
    const made = suggestPassphrase(undefined, (values) => values.set([0, 0xffff, 0x7f00, 1, 0x1234]));
    expect(made).toBe("babab-zuzuz-lusab-babad-damuh");
    expect(suggestPassphrase()).toMatch(
      /^([bdfghjklmnprstvz][aiou][bdfghjklmnprstvz][aiou][bdfghjklmnprstvz]-){4}[bdfghjklmnprstvz][aiou][bdfghjklmnprstvz][aiou][bdfghjklmnprstvz]$/,
    );
    expect(suggestPassphrase()).not.toBe(suggestPassphrase());
    expect(suggestPassphrase(3).split("-")).toHaveLength(3);
  });

  it("is credited with its exact strength only while it is the one that was suggested", () => {
    const suggested = suggestPassphrase();
    expect(assessPassphrase(suggested, { suggested })).toMatchObject({ bits: 80, deviceOk: true, networkOk: true });
    // Typed by hand, the same shape proves nothing about how it was chosen.
    expect(assessPassphrase("babab-babab-babab-babab-babab").bits).toBeNull();
    // Three words are 48 bits: enough for this device, not for the network.
    const short = suggestPassphrase(3);
    expect(assessPassphrase(short, { suggested: short })).toMatchObject({ bits: 48, deviceOk: true, networkOk: false });
  });
});

describe("a typed passphrase", () => {
  it("is refused when it is empty, short, a run, or made from what the key says", () => {
    expect(assessPassphrase("")).toMatchObject({ deviceOk: false, networkOk: false });
    expect(assessPassphrase("hunter2")).toMatchObject({ deviceOk: false, networkOk: false });
    expect(assessPassphrase("aaaaaaaaaaaaaaaaaaaaaaaa")).toMatchObject({ deviceOk: false, networkOk: false });
    expect(assessPassphrase("abcdefghijklmnopqrstuvwxyz")).toMatchObject({ deviceOk: false, networkOk: false });
    expect(assessPassphrase("9876543210")).toMatchObject({ deviceOk: false });
    const leaning = assessPassphrase("ada lovelace is my name ok", { facts: ["Ada Lovelace", "ada@example.org"] });
    expect(leaning).toMatchObject({ deviceOk: false, networkOk: false });
    expect(leaning.summary).toContain("lovelace");
  });

  it("is enough for this device at 12 characters, and for the network only at 20 with variety", () => {
    expect(assessPassphrase("twelve chars")).toMatchObject({ deviceOk: true, networkOk: false, bits: null });
    expect(assessPassphrase("nineteen characters")).toMatchObject({ deviceOk: true, networkOk: false });
    expect(assessPassphrase("correct horse battery staple")).toMatchObject({ deviceOk: true, networkOk: true, bits: null });
    // Long but with few different characters.
    expect(assessPassphrase("abababababababababababab")).toMatchObject({ deviceOk: true, networkOk: false });
    // Counted in characters, not in bytes.
    expect(assessPassphrase("🙂".repeat(11))).toMatchObject({ deviceOk: false });
  });

  it("never claims to know the strength of a phrase someone made up", () => {
    expect(assessPassphrase("correct horse battery staple").summary).toMatch(/cannot tell how guessable/);
  });
});

describe("what this browser keeps", () => {
  const PRIVATE = "-----BEGIN PGP PRIVATE KEY BLOCK-----\n\nabc\n-----END PGP PRIVATE KEY BLOCK-----";
  beforeEach(() => localStorage.clear());

  it("keeps protected private keys by fingerprint, whatever its case", () => {
    expect(devicePrivateKeys()).toEqual({});
    saveDevicePrivateKey("ABCDEF", PRIVATE);
    expect(devicePrivateKey("abcdef")).toBe(PRIVATE);
    expect(devicePrivateKey("ABCDEF")).toBe(PRIVATE);
    expect(Object.keys(devicePrivateKeys())).toEqual(["abcdef"]);
    removeDevicePrivateKey("ABCDEF");
    expect(devicePrivateKey("abcdef")).toBeNull();
  });

  it("remembers which keys were checked, and when", () => {
    setKeyChecked("AAAA", true);
    expect(checkedKeys().aaaa).toBeGreaterThan(0);
    setKeyChecked("aaaa", false);
    expect(checkedKeys()).toEqual({});
  });

  it("ignores storage that is damaged or is not what it wrote", () => {
    localStorage.setItem("outpost.encryption.private-keys.v1", "{not json");
    expect(devicePrivateKeys()).toEqual({});
    localStorage.setItem(
      "outpost.encryption.private-keys.v1",
      JSON.stringify({ a: { privateKey: "not a key" }, b: 5, c: { privateKey: PRIVATE, savedAt: 1 } }),
    );
    expect(Object.keys(devicePrivateKeys())).toEqual(["c"]);
    localStorage.setItem("outpost.encryption.checked.v1", JSON.stringify(["x"]));
    expect(checkedKeys()).toEqual({});
  });

  it("says when something changed", () => {
    const seen = vi.fn();
    const stop = onDeviceKeysChanged(seen);
    saveDevicePrivateKey("abcd", PRIVATE);
    setKeyChecked("abcd", true);
    stop();
    removeDevicePrivateKey("abcd");
    expect(seen).toHaveBeenCalledTimes(2);
  });
});

describe("unlocked keys", () => {
  const key = (fingerprint: string) => ({ fingerprint, forget: vi.fn<() => void>() }) satisfies UnlockedKey;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    lockAll();
    vi.useRealTimers();
  });

  it("are forgotten five minutes after their last use", () => {
    expect(UNLOCK_IDLE_MS).toBe(5 * 60_000);
    const held = key("aa11");
    holdUnlocked(held);
    expect(unlockedSnapshot().has("aa11")).toBe(true);
    vi.advanceTimersByTime(UNLOCK_IDLE_MS - 1000);
    // Using it starts the five minutes again.
    expect(unlockedKey("AA11")).toBe(held);
    vi.advanceTimersByTime(UNLOCK_IDLE_MS - 1000);
    expect(unlockedSnapshot().has("aa11")).toBe(true);
    expect(held.forget).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1001);
    expect(unlockedSnapshot().has("aa11")).toBe(false);
    expect(held.forget).toHaveBeenCalledTimes(1);
    expect(unlockedKey("aa11")).toBeNull();
  });

  it("are kept while a page opened with them is in use, without anything being told", () => {
    const held = key("aa11");
    holdUnlocked(held);
    const told = vi.fn();
    const stop = subscribeUnlocked(told);
    const before = unlockedSnapshot();
    // A key press every four minutes, for twenty.
    for (let press = 0; press < 5; press += 1) {
      vi.advanceTimersByTime(4 * 60_000);
      expect(keepUnlocked("AA11")).toBe(true);
    }
    expect(held.forget).not.toHaveBeenCalled();
    expect(told).not.toHaveBeenCalled();
    expect(unlockedSnapshot()).toBe(before);
    expect(unlockedSnapshot().get("aa11")).toBe(Date.now() + UNLOCK_IDLE_MS);
    // Then nothing: five minutes after the last press it is forgotten, and cannot be kept any longer.
    vi.advanceTimersByTime(UNLOCK_IDLE_MS);
    expect(held.forget).toHaveBeenCalledTimes(1);
    expect(told).toHaveBeenCalledTimes(1);
    expect(keepUnlocked("aa11")).toBe(false);
    expect(unlockedSnapshot().size).toBe(0);
    stop();
  });

  it("are wiped when locked, one or all", () => {
    const first = key("aa11");
    const second = key("bb22");
    holdUnlocked(first);
    holdUnlocked(second);
    lock("AA11");
    expect(first.forget).toHaveBeenCalledTimes(1);
    expect([...unlockedSnapshot().keys()]).toEqual(["bb22"]);
    lockAll();
    expect(second.forget).toHaveBeenCalledTimes(1);
    expect(unlockedSnapshot().size).toBe(0);
  });

  it("wipe the old copy when the same key is unlocked again", () => {
    const first = key("aa11");
    const second = key("aa11");
    holdUnlocked(first);
    holdUnlocked(second);
    expect(first.forget).toHaveBeenCalledTimes(1);
    expect(unlockedKey("aa11")).toBe(second);
  });

  it("are all forgotten when the tab goes away", () => {
    const held = key("aa11");
    holdUnlocked(held);
    window.dispatchEvent(new Event("pagehide"));
    expect(held.forget).toHaveBeenCalledTimes(1);
    expect(unlockedSnapshot().size).toBe(0);
  });
});

describe("showing keys and naming files", () => {
  it("groups a fingerprint in fours with a wider gap in the middle, as gpg prints it", () => {
    const fingerprint = "151fbadc2a20b68334bd7c9846c88eda032bf66d";
    expect(fingerprintGroups(fingerprint)).toHaveLength(10);
    expect(formatFingerprint(fingerprint)).toBe("151F BADC 2A20 B683 34BD  7C98 46C8 8EDA 032B F66D");
    expect(fingerprintGroups("ab".repeat(32))).toHaveLength(16);
  });

  it("labels a key by its name, then its address, then its ID", () => {
    expect(keyLabel({ name: "Ada", email: "ada@example.org", keyId: "0123456789abcdef" })).toBe("Ada");
    expect(keyLabel({ name: "", email: "ada@example.org", keyId: "0123456789abcdef" })).toBe("ada@example.org");
    expect(keyLabel({ name: "", email: null, keyId: "0123456789abcdef" })).toBe("Key 0123456789ABCDEF");
  });

  it("never lets a name from inside a message choose where a file goes", () => {
    expect(safeDownloadName("../../etc/passwd", "file")).toBe("etc passwd");
    expect(safeDownloadName("C:\\Users\\me\\secret.txt", "file")).toBe("C Users me secret.txt");
    expect(safeDownloadName("..", "file")).toBe("file");
    expect(safeDownloadName("", "file")).toBe("file");
    expect(safeDownloadName("report\u0000.pdf\n", "file")).toBe("report .pdf");
    expect(safeDownloadName("a".repeat(500), "file")).toHaveLength(120);
    expect(safeDownloadName("normal name.pdf", "file")).toBe("normal name.pdf");
  });

  it("makes a plain file name from a person's name", () => {
    expect(slug("Ada Lovelace", "key")).toBe("ada-lovelace");
    expect(slug("Zoë Müller-Öz", "key")).toBe("zoe-muller-oz");
    expect(slug("数字", "key")).toBe("key");
  });
});
