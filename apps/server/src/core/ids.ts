import { createHash, randomBytes } from "node:crypto";
import { monotonicFactory } from "ulid";

const ulid = monotonicFactory();

/** Sortable unique identifier used for every row Outpost creates. */
export const newId = (): string => ulid().toLowerCase();

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

export const sha256Hex = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");
