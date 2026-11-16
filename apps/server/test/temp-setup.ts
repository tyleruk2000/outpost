/** Removes the folders a test file made with tempDir (temp.ts) once its tests have run. Loaded for every test file (vitest.config.ts). */
import { afterAll } from "vitest";
import { removeTempDirs } from "./temp.ts";

afterAll(removeTempDirs);
