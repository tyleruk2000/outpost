import { EventEmitter } from "node:events";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { watchForFaults } from "../src/core/faults.ts";

function fakeApp() {
  const log = { error: vi.fn(), fatal: vi.fn() };
  return { app: { log } as unknown as FastifyInstance, log };
}

describe("faults nothing else caught", () => {
  it("logs a rejected promise nobody handled and carries on", () => {
    const { app, log } = fakeApp();
    const source = new EventEmitter();
    const stop = vi.fn();
    watchForFaults(app, source, stop);
    const reason = new Error("a background check failed");
    source.emit("unhandledRejection", reason);
    expect(log.error).toHaveBeenCalledWith({ err: reason }, expect.stringContaining("carries on"));
    expect(stop).not.toHaveBeenCalled();
  });

  it("logs an uncaught exception and stops in order once, with code 1", () => {
    const { app, log } = fakeApp();
    const source = new EventEmitter();
    const stop = vi.fn();
    watchForFaults(app, source, stop);
    source.emit("uncaughtException", new Error("broken"));
    source.emit("uncaughtException", new Error("broken again while stopping"));
    expect(log.fatal).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith(app, 1);
  });
});
