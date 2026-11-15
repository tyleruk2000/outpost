/**
 * What the editor's extensions need from the page around them. The extensions are
 * created once per editor, so they read these through one object that stays the same
 * while the functions behind it are kept current.
 */
import type { NoteRef } from "@outpost/shared";

export interface EditorHost {
  /** The page being edited; uploads are filed under it and new pages go inside it. */
  noteId: string;
  /** Goes to an in-app address without reloading. */
  navigate(to: string): void;
  /** Opens the file picker for pictures; they are inserted at `pos`. */
  pickImage(pos: number): void;
  /** Opens the document picker; the chosen document is embedded at `pos`. */
  pickDocument(pos: number): void;
  /** Makes a new page inside this one and answers with it, or nothing if that failed. */
  createSubPage(title: string): Promise<NoteRef | undefined>;
}

export type HostRef = { current: EditorHost };
