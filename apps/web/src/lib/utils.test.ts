import { describe, expect, it } from "vitest";
import { cn, plural } from "./utils";

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
