import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { setClockChoice, setDeviceClockStyle } from "@/lib/clock";

afterEach(() => cleanup());

// A test file that asks for the plain Node environment (`// @vitest-environment node`,
// for code that needs Node's own streams and cryptography) has no window to prepare.
const inBrowserLikeEnvironment = typeof window !== "undefined";

// Times are written as the device writes them. The tests run as a device on the 24-hour clock,
// whatever language the machine they run on is set to; a test of the 12-hour clock says so itself.
beforeEach(() => {
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
