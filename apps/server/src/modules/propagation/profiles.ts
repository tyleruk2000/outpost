/**
 * Radio and antenna profiles: the equipment a person owns, saved once and picked in the
 * planner. Plain rows; nothing here is used unless a prediction is asked for with it.
 */
import {
  type AntennaProfile,
  type AntennaProfileInput,
  hasStatedLength,
  isSlopingAntenna,
  type ModeId,
  type RadioProfile,
  type RadioProfileInput,
} from "@outpost/shared";
import { asc, eq } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { antennaProfiles, radioProfiles } from "../../db/schema.ts";

export interface ProfilesService {
  radios(): RadioProfile[];
  createRadio(input: RadioProfileInput): RadioProfile;
  updateRadio(id: string, input: RadioProfileInput): RadioProfile;
  removeRadio(id: string): void;
  antennas(): AntennaProfile[];
  createAntenna(input: AntennaProfileInput): AntennaProfile;
  updateAntenna(id: string, input: AntennaProfileInput): AntennaProfile;
  removeAntenna(id: string): void;
}

export function createProfilesService(ctx: AppContext): ProfilesService {
  const { db } = ctx;
  const changed = () => ctx.events.publish({ type: "propagation.changed" });

  const radio = (row: typeof radioProfiles.$inferSelect): RadioProfile => ({ ...row, modes: row.modes as ModeId[] });
  const getRadio = (id: string) => {
    const row = db.select().from(radioProfiles).where(eq(radioProfiles.id, id)).get();
    if (!row) throw notFound("The radio profile");
    return radio(row);
  };
  /** A wire's length is part of an antenna only for the kinds that have one; every other profile is as it was before lengths were kept. */
  // A sloping wire's slope and bearing likewise belong to that kind alone.
  const antenna = ({ lengthM, slopeDeg, highEndDeg, ...row }: typeof antennaProfiles.$inferSelect): AntennaProfile => ({
    ...row,
    ...(hasStatedLength(row.kind) && lengthM !== null ? { lengthM } : {}),
    ...(isSlopingAntenna(row.kind) ? { slopeDeg: slopeDeg ?? undefined, highEndDeg } : {}),
  });
  const lengthOf = (input: AntennaProfileInput) => (hasStatedLength(input.kind) ? (input.lengthM ?? null) : null);
  const slopeOf = (input: AntennaProfileInput) =>
    isSlopingAntenna(input.kind)
      ? { slopeDeg: input.slopeDeg ?? null, highEndDeg: input.highEndDeg ?? null }
      : { slopeDeg: null, highEndDeg: null };
  const getAntenna = (id: string): AntennaProfile => {
    const row = db.select().from(antennaProfiles).where(eq(antennaProfiles.id, id)).get();
    if (!row) throw notFound("The antenna profile");
    return antenna(row);
  };

  return {
    radios: () => db.select().from(radioProfiles).orderBy(asc(radioProfiles.name)).all().map(radio),
    createRadio(input) {
      const now = Date.now();
      const id = newId();
      db.insert(radioProfiles)
        .values({ id, ...input, createdAt: now, updatedAt: now })
        .run();
      changed();
      return getRadio(id);
    },
    updateRadio(id, input) {
      getRadio(id);
      db.update(radioProfiles)
        .set({ ...input, updatedAt: Date.now() })
        .where(eq(radioProfiles.id, id))
        .run();
      changed();
      return getRadio(id);
    },
    removeRadio(id) {
      getRadio(id);
      db.delete(radioProfiles).where(eq(radioProfiles.id, id)).run();
      changed();
    },
    antennas: () => db.select().from(antennaProfiles).orderBy(asc(antennaProfiles.name)).all().map(antenna),
    createAntenna(input) {
      const now = Date.now();
      const id = newId();
      db.insert(antennaProfiles)
        .values({ id, ...input, lengthM: lengthOf(input), ...slopeOf(input), createdAt: now, updatedAt: now })
        .run();
      changed();
      return getAntenna(id);
    },
    updateAntenna(id, input) {
      getAntenna(id);
      db.update(antennaProfiles)
        // The length is set every time, to nothing for a kind that has none: left out, the old one would stay.
        .set({ ...input, lengthM: lengthOf(input), ...slopeOf(input), updatedAt: Date.now() })
        .where(eq(antennaProfiles.id, id))
        .run();
      changed();
      return getAntenna(id);
    },
    removeAntenna(id) {
      getAntenna(id);
      db.delete(antennaProfiles).where(eq(antennaProfiles.id, id)).run();
      changed();
    },
  };
}
