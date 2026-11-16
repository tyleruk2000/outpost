import { afterEach, describe, expect, it, vi } from "vitest";
import { cn, localId, plural } from "./utils";

describe("cn", () => {
  it("keeps a custom text size next to a text colour", () => {
    expect(cn("text-small text-ink")).toBe("text-small text-ink");
    expect(cn("text-small", "text-lead")).toBe("text-lead");
    expect(cn("text-ink", "text-danger")).toBe("text-danger");
  });

  it("merges the project's radius and shadow names", () => {
    expect(cn("rounded-control", "rounded-panel")).toBe("rounded-panel");
    expect(cn("shadow-float", "shadow-dialog")).toBe("shadow-dialog");
  });
});

describe("plural", () => {
  it("agrees with the count", () => {
    expect(plural(1, "document")).toBe("1 document");
    expect(plural(0, "document")).toBe("0 documents");
    expect(plural(1234, "entry", "entries")).toBe("1,234 entries");
  });
});

describe("localId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gives a different 32-character identifier each time", () => {
    const made = new Set(Array.from({ length: 200 }, () => localId()));
    expect(made.size).toBe(200);
    for (const id of made) expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("works on a page that is not secure, where the browser offers no randomUUID", () => {
    // What a phone sees at http://192.168.x.x: getRandomValues is there, randomUUID is not.
    vi.stubGlobal("crypto", { getRandomValues: <T extends ArrayBufferView<ArrayBuffer>>(bytes: T) => realCrypto.getRandomValues(bytes) });
    expect(localId()).toMatch(/^[0-9a-f]{32}$/);
    // And where there is no crypto at all, it still gives one.
    vi.stubGlobal("crypto", undefined);
    expect(localId()).toMatch(/^[0-9a-f]{32}$/);
  });
});

const realCrypto = globalThis.crypto;
