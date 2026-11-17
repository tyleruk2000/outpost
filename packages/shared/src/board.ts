/**
 * Shapes for Messages: the household's board on the home network, with check-ins and
 * files sent from one device to another.
 *
 * There are no accounts. A person is a name chosen once on each device and kept there;
 * anyone who can open Outpost can post under any name and read everything. The board is
 * one shared place, like a board on the kitchen wall: no private messages, no read
 * receipts, no typing indicators, no reactions.
 *
 * A message belongs to a channel. "board" is the household's own; a transport (a radio
 * link, added later) carries channels of its own and says where a message came in by
 * (`source`). See docs/messages.md.
 */

/** The household's own board. */
export const BOARD_CHANNEL = "board";

/** What a channel's name may be: "board", or a transport's own ("meshtastic:LongFast"). */
export const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9:._-]{0,63}$/;

/** The limits the server holds every request to; the screen says them before anything is sent. */
export const BOARD_LIMITS = {
  /** Characters in a name. */
  name: 40,
  /** Characters in a message: room for a pasted list or a set of instructions. */
  body: 10_000,
  /** Characters in a place in words ("gone to Mum's"). */
  place: 120,
  /** Messages, check-ins, edits and removals from one address in a minute. A household never meets it. */
  postsPerMinute: 30,
  /** Files sent from one address in an hour. */
  filesPerHour: 30,
  /** The largest file that can be sent. */
  fileBytes: 200_000_000,
  /** Files kept on the board at once. */
  filesKept: 100,
  /** All the files kept at once, together. */
  keptBytes: 4_000_000_000,
  /** Messages in one page of the history. */
  page: 50,
} as const;

/** Days a sent file is kept when nobody has chosen; 0 in the setting keeps files until they are removed. */
export const BOARD_FILE_DAYS_DEFAULT = 7;
export const BOARD_FILE_DAYS_MAX = 365;

export type BoardKind = "message" | "checkin";
export type CheckInStatus = "safe" | "help" | "other";

export interface BoardPosition {
  lat: number;
  lon: number;
  /** How far off the device said it might be, in metres. */
  accuracyM: number | null;
}

export interface BoardFile {
  id: string;
  name: string;
  sizeBytes: number;
  /** A picture the server looked at and found to be one (PNG, JPEG, GIF or WebP): it may be shown in place. */
  picture: boolean;
  /** When it goes by itself; null keeps it until someone removes it. */
  expiresAt: number | null;
  /** Set once its bytes are gone. */
  gone: { at: number; reason: "expired" | "removed" } | null;
  /** Where it is saved from; null once it is gone. Always a download, never a page. */
  url: string | null;
}

export interface BoardMessage {
  id: string;
  channel: string;
  /** "here" for one written on a device of this Outpost; otherwise the transport it came in by. */
  source: string;
  kind: BoardKind;
  author: string;
  /** Plain text. Never drawn as markup. Empty once removed. */
  body: string;
  status: CheckInStatus | null;
  place: string | null;
  position: BoardPosition | null;
  file: BoardFile | null;
  createdAt: number;
  /** Sent back as `baseUpdatedAt` with an edit, so that a change made meanwhile on another device is not overwritten. */
  updatedAt: number;
  edited: { at: number; by: string } | null;
  removed: { at: number; by: string } | null;
}

export interface BoardMessagesResponse {
  /** Oldest first: the newest is at the bottom, as on the screen. */
  messages: BoardMessage[];
  /** Pass as `before` for the page of older messages; null when this page reaches the start. */
  older: string | null;
}

/** The latest check-in of one person, or none. */
export interface BoardCheckInLine {
  name: string;
  latest: {
    id: string;
    status: CheckInStatus;
    /** The words they chose, for "other"; may also be added to "safe" or "help". */
    body: string;
    place: string | null;
    hasPosition: boolean;
    createdAt: number;
  } | null;
}

export interface BoardSummaryResponse {
  /** Each person's latest check-in: the household's people first, as Outpost holds them, then anyone else who has checked in. */
  checkIns: BoardCheckInLine[];
  /** Names to offer when a device chooses one: the household under Supplies and the people of the emergency plans. */
  people: string[];
  /** Messages newer than `since` (when asked), not counting removed ones. */
  newSince: number;
  /** The newest message's time, or null on an empty board. */
  newestAt: number | null;
  /** Days a sent file is kept; 0 keeps it until removed. */
  fileDays: number;
  limits: { [K in keyof typeof BOARD_LIMITS]: number };
}

export interface BoardPostInput {
  author: string;
  body: string;
  channel?: string;
}

export interface BoardCheckInInput {
  author: string;
  status: CheckInStatus;
  body?: string;
  place?: string | null;
  position?: BoardPosition | null;
  channel?: string;
}

export interface BoardEditInput {
  by: string;
  body?: string;
  place?: string | null;
  status?: CheckInStatus;
  baseUpdatedAt: number;
}

export interface BoardRemoveInput {
  by: string;
}

export interface BoardMessageResponse {
  message: BoardMessage;
}

/** What `board.changed` carries: enough for a toast, and nothing a refetch would not show. */
export interface BoardEvent {
  action: "posted" | "edited" | "removed" | "expired" | "cleared";
  channel: string;
  kind?: BoardKind;
  author?: string;
  /** The first words, for a toast. */
  excerpt?: string;
  status?: CheckInStatus | null;
}

/** What the board keeps: counted for "what is stored", and erased with everything else. */
export interface BoardKept {
  messages: number;
  /** Sent files whose bytes are still kept, and their size. */
  files: number;
  fileBytes: number;
}
