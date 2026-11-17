/**
 * How a transport joins the board: the whole of what a radio link (or anything else that
 * carries messages beyond this Outpost) needs, without a change to the board's tables.
 *
 * A message belongs to a channel. "board" is the household's own; a transport names the
 * channels it carries in its own way ("meshtastic:LongFast", "meshcore:public"). The
 * board stores every message the same way, and the screen shows any channel with the
 * same list.
 *
 * Out: `ctx.services.board.addTransport(transport)`. Each message posted from a device
 * here on a channel the transport `carries` is handed to its `send` once it is stored.
 * The person who posted it is not kept waiting: `send` runs afterwards, and a failure is
 * logged and recorded on the message through `setMeta` (for the screen to say), never
 * thrown back at the person.
 *
 * In: `ctx.services.board.receive(incoming)`. A message heard by the transport is stored
 * with `source` set to the transport's name and `externalId` set to its own id for the
 * message, so that the same message heard twice (a repeat over the mesh, a reconnect) is
 * kept once: `receive` returns null for one it already has. It is announced like any
 * other (the `board.changed` event, and `onMessage` listeners), and is not handed to
 * transports again, so that two links cannot echo a message between them.
 *
 * `onMessage(listener)` tells a module of every new message, posted here or received.
 *
 * Nothing here opens a port, a device or a connection: a transport does that itself, only
 * once a person has set it up, and closes it in `ctx.onClose`.
 */
import type { BoardMessage, BoardPosition, CheckInStatus } from "@outpost/shared";

export interface BoardTransport {
  /** Stored as `source` on what it brings in: "meshtastic", "meshcore". Not "here". */
  name: string;
  /** Whether this transport carries a channel. */
  carries(channel: string): boolean;
  /** Called once a message posted here on a channel it carries has been stored. */
  send(message: BoardMessage): void | Promise<void>;
  /**
   * Asked before a message is stored on a channel it carries: the reason it cannot go
   * (too long for the radio, a file), in words for a person, or null. A reason refuses
   * the message; nothing is stored and nothing is cut.
   */
  refuse?(outgoing: OutgoingCheck): string | null;
}

/** What `refuse` is asked about. */
export interface OutgoingCheck {
  channel: string;
  kind: "message" | "checkin" | "file";
  author: string;
  body: string;
  status?: CheckInStatus | null;
  place?: string | null;
}

/** A message that came in by a transport. */
export interface IncomingMessage {
  channel: string;
  /** The transport's name. */
  source: string;
  /** The transport's own id for the message; one already kept is not kept again. */
  externalId: string;
  /** The sender's name as the transport knows it (a node's long name). Cut to the board's limit. */
  author: string;
  body: string;
  kind?: "message" | "checkin";
  status?: CheckInStatus | null;
  place?: string | null;
  position?: BoardPosition | null;
  /** Anything the transport wants kept with it (node id, signal report). At most 4 KB as JSON. */
  meta?: Record<string, unknown>;
}

export type MessageListener = (message: BoardMessage, how: "posted" | "received") => void;
