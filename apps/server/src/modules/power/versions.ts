/**
 * Saving a plan or a device replaces it whole, so two devices editing the same one could
 * each save over the other. A save says which version it was made from
 * (`baseUpdatedAt`, the `updatedAt` it was opened at or last saved as); one made from an
 * older version than is kept is refused, as notes and contacts do, and the screen asks
 * which to keep.
 */
import { z } from "zod";
import { conflict } from "../../core/errors.ts";

const baseSchema = z.object({ baseUpdatedAt: z.number().int().nonnegative().optional() });

/** Takes `baseUpdatedAt` off a saved body: the version of the plan or device the change was made from. */
export function withoutBase(raw: unknown): { body: unknown; baseUpdatedAt: number | undefined } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { body: raw, baseUpdatedAt: undefined };
  const { baseUpdatedAt, ...body } = raw as Record<string, unknown>;
  return { body, baseUpdatedAt: baseSchema.parse({ baseUpdatedAt }).baseUpdatedAt };
}

/** Refuses a change made from an older version than the one kept: another device saved in between. */
export function checkBase(what: "plan" | "device", kept: number, base: number | undefined): void {
  if (base === undefined || base === kept) return;
  throw conflict(
    `This ${what} was changed somewhere else, in another tab or on another device, after you opened it. Nothing was saved over it.`,
    { updatedAt: kept },
  );
}

/** Each save is later than the one before, even two in one millisecond, so that a version is never mistaken for another. */
export const nextUpdatedAt = (previous: number): number => Math.max(Date.now(), previous + 1);
