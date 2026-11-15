/**
 * In-process event bus. The HTTP layer streams these to browsers (see modules/system)
 * so that progress and changes show up without polling.
 */
import { EventEmitter } from "node:events";

export interface AppEvent {
  /** Dotted topic, e.g. "job.progress", "download.updated", "storage.changed". */
  type: string;
  /** Identifier of the thing that changed, when there is one. */
  id?: string;
  data?: unknown;
}

export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(event: AppEvent): void {
    this.emitter.emit("event", event);
  }

  subscribe(listener: (event: AppEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
