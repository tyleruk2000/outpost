import "@testing-library/jest-dom/vitest";
import net from "node:net";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach, expect } from "vitest";
import { setClockChoice, setDeviceClockStyle } from "@/lib/clock";
import { setDeviceRegion } from "@/lib/region";

afterEach(() => cleanup());

// How long findBy… and waitFor wait for what they wait for. Testing Library's own 1 s is a
// guess at how fast a screen comes up, and on a busy machine (every suite at once, a build
// beside them) it is not: a screen loaded when a button is pressed is compiled first, and
// one render of a large screen can take seconds. A wait that comes true is not slowed by
// this; one that never does fails a little before the test's own limit (20 s), saying
// what it was waiting for.
configure({ asyncUtilTimeout: 15_000 });

// A machine that runs these tests may have a real Ollama on it, and no test may depend on that. A
// connection to the port Ollama listens on is refused before it is made, as if nothing were there,
// and fails the test that tried it. (The server's tests have the same guard: apps/server/test/no-ollama.ts.)
const OLLAMA_PORT = 11434;
const ollamaAttempts: string[] = [];
const connect = net.Socket.prototype.connect;
// biome-ignore lint/suspicious/noExplicitAny: the arguments are passed through as they came
net.Socket.prototype.connect = function guarded(this: net.Socket, ...args: any[]) {
  // `net.connect` hands its arguments over already gathered into one list; a direct call gives them loose.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const port = first && typeof first === "object" ? first.port : first;
  if (Number(port) === OLLAMA_PORT) {
    ollamaAttempts.push(`port ${OLLAMA_PORT}`);
    process.nextTick(() =>
      this.destroy(Object.assign(new Error("connect ECONNREFUSED (refused by the test suite)"), { code: "ECONNREFUSED" })),
    );
    return this;
  }
  return connect.apply(this, args as never);
} as typeof connect;
afterEach(() => {
  expect(ollamaAttempts.splice(0), "a test contacted the address a real Ollama listens on").toEqual([]);
});

// A test file that asks for the plain Node environment (`// @vitest-environment node`,
// for code that needs Node's own streams and cryptography) has no window to prepare.
const inBrowserLikeEnvironment = typeof window !== "undefined";

// Times are written as the device writes them. The tests run as a device on the 24-hour clock,
// whatever language the machine they run on is set to; a test of the 12-hour clock says so itself.
// In the same way the tests run as a device in Great Britain, where its region decides a first
// choice (the date's style, the emergency number, a forecast's units); a test of another region says so.
setDeviceRegion("GB");
beforeEach(() => {
  setDeviceRegion("GB");
  if (!inBrowserLikeEnvironment) return;
  setDeviceClockStyle("24");
  setClockChoice("device");
});

// jsdom has no matchMedia; components only need it to exist.
if (inBrowserLikeEnvironment && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Radix components measure and scroll; jsdom does neither.
if (inBrowserLikeEnvironment && !("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (inBrowserLikeEnvironment) {
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
}
