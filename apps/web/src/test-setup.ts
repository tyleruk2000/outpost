import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// A test file that asks for the plain Node environment (`// @vitest-environment node`,
// for code that needs Node's own streams and cryptography) has no window to prepare.
const inBrowserLikeEnvironment = typeof window !== "undefined";

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
