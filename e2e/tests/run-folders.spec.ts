import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Playwright empties its output folder when a run starts. A run on ports of its own
 * (OUTPOST_E2E_PORT) writes to a folder named after the port, so that it cannot delete
 * the traces of another run going on beside it (playwright.config.ts).
 */
test("a run on ports of its own keeps its traces in a folder of its own", () => {
  const port = process.env.OUTPOST_E2E_PORT;
  const e2e = path.resolve(import.meta.dirname, "..");
  const folder = path.relative(e2e, test.info().project.outputDir);
  if (process.env.OUTPOST_E2E_OUTPUT) expect(test.info().project.outputDir).toBe(path.resolve(e2e, process.env.OUTPOST_E2E_OUTPUT));
  else if (port && port !== "8471") expect(folder).toBe(`test-results-${port}`);
  else expect(folder).toBe("test-results");
});
