/**
 * Pictures on their way into a page. While a file uploads, a placeholder with a real
 * progress bar stands where the picture will go; the picture itself only enters the
 * document, and with it the undo history and the next save, once the server has it.
 */

import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { type Editor, Extension } from "@tiptap/react";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { uploadAttachment } from "../notes-data";
import type { HostRef } from "./host";

type UploadAction = { add: { id: string; pos: number; name: string } } | { remove: { id: string } };

const uploadsKey = new PluginKey<DecorationSet>("noteUploads");
const bars = new Map<string, HTMLElement>();
let nextUpload = 0;

function placeholder(id: string, name: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "note-upload";
  box.contentEditable = "false";
  box.setAttribute("role", "status");
  const label = document.createElement("span");
  label.className = "note-upload-name";
  label.textContent = `Uploading ${name}`;
  const track = document.createElement("span");
  track.className = "note-upload-track";
  const bar = document.createElement("span");
  bar.className = "note-upload-bar";
  track.append(bar);
  box.append(label, track);
  bars.set(id, bar);
  return box;
}

export const Uploads = Extension.create({
  name: "noteUploads",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: uploadsKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            let next = set.map(tr.mapping, tr.doc);
            const action = tr.getMeta(uploadsKey) as UploadAction | undefined;
            if (action && "add" in action) {
              const { id, pos, name } = action.add;
              next = next.add(tr.doc, [Decoration.widget(pos, () => placeholder(id, name), { id, side: -1, key: id })]);
            } else if (action && "remove" in action) {
              next = next.remove(next.find(undefined, undefined, (spec) => spec.id === action.remove.id));
              bars.delete(action.remove.id);
            }
            return next;
          },
        },
        props: {
          decorations: (state) => uploadsKey.getState(state),
        },
      }),
    ];
  },
});

function placeholderPos(editor: Editor, id: string): number | null {
  const found = uploadsKey.getState(editor.state)?.find(undefined, undefined, (spec) => spec.id === id);
  return found?.[0]?.from ?? null;
}

/** The nearest place after `pos` where a block can go: after the block the position is in. */
export function blockBoundaryAfter(editor: Editor, pos: number): number {
  const { doc } = editor.state;
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  if ($pos.depth === 0) return $pos.pos;
  // Inside a summary or a table row there is no room for a block; step out until there is.
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const container = $pos.node(depth - 1);
    const index = $pos.indexAfter(depth - 1);
    const image = editor.schema.nodes.image;
    if (image && container.canReplaceWith(index, index, image)) return $pos.after(depth);
  }
  return $pos.after(1);
}

const isPicture = (file: File) => file.type.startsWith("image/");

/**
 * Uploads each file and puts the picture at `pos` when it arrives. Files that are not
 * pictures are refused here; a picture the server will not take is refused with the
 * server's own explanation.
 */
export function uploadImages(editor: Editor, host: HostRef, files: readonly File[], pos: number): void {
  const at = blockBoundaryAfter(editor, pos);
  for (const file of files) {
    if (file.type && !isPicture(file)) {
      notify.error(
        `“${file.name}” is not a picture. Only pictures can go in the text of a page; add other files to the Library and embed them from there.`,
      );
      continue;
    }
    nextUpload += 1;
    const id = `upload-${nextUpload}`;
    editor.view.dispatch(
      editor.state.tr.setMeta(uploadsKey, { add: { id, pos: at, name: file.name } } satisfies UploadAction).setMeta("addToHistory", false),
    );

    const done = () => {
      if (!editor.isDestroyed)
        editor.view.dispatch(editor.state.tr.setMeta(uploadsKey, { remove: { id } } satisfies UploadAction).setMeta("addToHistory", false));
    };

    uploadAttachment(file, host.current.noteId, (fraction) => {
      const bar = bars.get(id);
      if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
    }).then(
      (attachment) => {
        const target = editor.isDestroyed ? null : placeholderPos(editor, id);
        const usable = attachment.mime.startsWith("image/");
        if (target === null || !usable) {
          // The placeholder was deleted meanwhile, or the file turned out not to be a picture.
          done();
          void api.delete(`/api/attachments/${attachment.id}`).catch(() => {});
          if (!usable) notify.error(`“${file.name}” is not a picture, so it was not added to the page.`);
          return;
        }
        const before = editor.state.doc.resolve(target).nodeBefore;
        // An empty line left where the picture was asked for is replaced by it.
        const from = before?.type.name === "paragraph" && before.content.size === 0 ? target - before.nodeSize : target;
        editor
          .chain()
          .command(({ tr }) => {
            tr.setMeta(uploadsKey, { remove: { id } } satisfies UploadAction);
            return true;
          })
          .insertContentAt({ from, to: target }, { type: "image", attrs: { src: attachment.url, alt: null, title: null } })
          .run();
      },
      (error: unknown) => {
        done();
        if (!(error instanceof DOMException && error.name === "AbortError")) notify.error(errorMessage(error));
      },
    );
  }
}

/** Files carried by a paste or a drop. */
export function filesOf(data: DataTransfer | null): File[] {
  return data ? Array.from(data.files) : [];
}
