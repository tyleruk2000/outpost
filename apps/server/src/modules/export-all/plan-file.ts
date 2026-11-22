/**
 * The JSON file a power plan or a communication plan is written as in "Take everything
 * out", and reading one back in. The file is a small wrapper round the plan as its
 * screen sends it, so what is read back is checked by the same rules as a plan typed in.
 */
import { PLAN_FILE_FORMATS, PLAN_FILE_MAX_BYTES, PLAN_FILE_VERSION, type PlanFile } from "@outpost/shared";
import { z } from "zod";
import { badRequest } from "../../core/errors.ts";

type Kind = keyof typeof PLAN_FILE_FORMATS;

const WORDS: Record<Kind, { what: string; other: string }> = {
  power: { what: "a power plan", other: "communication plan" },
  radio: { what: "a communication plan", other: "power plan" },
};

/** The body of a request to read a plan file back in: the file's text. */
export const planFileBody = z.object({ text: z.string().min(1, "That file is empty.").max(PLAN_FILE_MAX_BYTES) }).strict();

export function planFile<T>(kind: Kind, plan: T, now: number): PlanFile<T> {
  return { format: PLAN_FILE_FORMATS[kind], version: PLAN_FILE_VERSION, exported: new Date(now).toISOString(), plan };
}

/**
 * The plan in a file's text, not yet checked: the `plan` of an Outpost plan file, or
 * the whole file when it is a bare plan. Throws a `bad_request` that says what is wrong.
 */
export function readPlanFile(kind: Kind, text: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw badRequest(`That file is not JSON, so it cannot be read as ${WORDS[kind].what}.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest(`That file does not hold ${WORDS[kind].what}.`);
  const record = value as Record<string, unknown>;
  if (typeof record.format === "string") {
    const other = (Object.keys(PLAN_FILE_FORMATS) as Kind[]).find((key) => PLAN_FILE_FORMATS[key] === record.format && key !== kind);
    if (other) throw badRequest(`That file is a ${WORDS[kind].other}. Bring it in on its own screen.`);
    if (record.format !== PLAN_FILE_FORMATS[kind]) throw badRequest(`That file does not hold ${WORDS[kind].what}.`);
    if (typeof record.version === "number" && record.version > PLAN_FILE_VERSION)
      throw badRequest("That file was written by a newer Outpost. Update this one, then bring it in again.");
    return record.plan;
  }
  return record;
}
