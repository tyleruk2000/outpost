import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

const secure = (value: boolean) => Object.defineProperty(window, "isSecureContext", { configurable: true, value });
const clipboard = (value: unknown) => Object.defineProperty(navigator, "clipboard", { configurable: true, value });
const execCommand = (result: boolean | (() => boolean)) => {
  const fn = vi.fn(typeof result === "function" ? result : () => result);
  Object.defineProperty(document, "execCommand", { configurable: true, value: fn });
  return fn;
};

describe("copyText", () => {
  afterEach(() => {
    secure(false);
    clipboard(undefined);
  });

  it("uses the clipboard on a secure page", async () => {
    secure(true);
    const writeText = vi.fn(async () => {});
    clipboard({ writeText });
    const legacy = execCommand(false);
    expect(await copyText("51.5, -0.1")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("51.5, -0.1");
    expect(legacy).not.toHaveBeenCalled();
  });

  it("falls back to the older copy over plain http, and leaves nothing on the page", async () => {
    secure(false);
    const legacy = execCommand(() => {
      expect((document.activeElement as HTMLTextAreaElement | null)?.value ?? document.querySelector("textarea")?.value).toBe("abc");
      return true;
    });
    expect(await copyText("abc")).toBe(true);
    expect(legacy).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back when the clipboard refuses, and says when neither way worked", async () => {
    secure(true);
    clipboard({ writeText: vi.fn(async () => Promise.reject(new Error("denied"))) });
    execCommand(() => {
      throw new Error("not supported");
    });
    expect(await copyText("abc")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });
});
