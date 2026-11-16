/**
 * The body of a page: a Tiptap editor created once per page, with its menus. It tells
 * the page that something changed and nothing more; the page decides when to read the
 * document and save it, so typing never waits on serialising a long page.
 */
import type { NoteDoc, NoteRef } from "@outpost/shared";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { BlockHandle } from "./block-handle";
import { DocumentPicker } from "./document-picker";
import "./editor.css";
import { buildExtensions } from "./extensions";
import type { EditorHost } from "./host";
import { SelectionToolbar } from "./selection-toolbar";
import { TableMenu } from "./table-menu";
import { TouchBar } from "./touch-bar";
import { filesOf, uploadImages } from "./uploads";
import { useIsTouch } from "./use-touch";

export interface NoteEditorProps {
  noteId: string;
  /** The document to start from. Later changes go through the editor instance. */
  content: NoteDoc;
  editable: boolean;
  onChange(): void;
  onBlur(): void;
  /** Hands the editor to the page once, and `null` when it goes away. */
  onEditor(editor: Editor | null): void;
  createSubPage(title: string): Promise<NoteRef | undefined>;
  /**
   * False for an encrypted page, which holds text only: a picture is uploaded to the
   * server as a file of its own, in the clear, so one added here would not be protected.
   */
  pictures?: boolean;
}

const NO_PICTURES = "An encrypted page holds text only. A picture would be stored on Outpost as a separate file, not encrypted.";

export function NoteEditor({ noteId, content, editable, onChange, onBlur, onEditor, createSubPage, pictures = true }: NoteEditorProps) {
  const navigate = useNavigate();
  const touch = useIsTouch();
  const fileInput = useRef<HTMLInputElement>(null);
  const imagePos = useRef(0);
  const [documentPos, setDocumentPos] = useState<number | null>(null);

  const host = useRef<EditorHost>(null as unknown as EditorHost);
  host.current = {
    noteId,
    navigate,
    pickImage(pos) {
      if (!pictures) {
        toast(NO_PICTURES);
        return;
      }
      imagePos.current = pos;
      fileInput.current?.click();
    },
    pickDocument: setDocumentPos,
    createSubPage,
  };
  const callbacks = useRef({ onChange, onBlur });
  callbacks.current = { onChange, onBlur };
  const picturesRef = useRef(pictures);
  picturesRef.current = pictures;

  // Everything the editor is built from is fixed for its lifetime, so it is never re-created.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the first values are the ones the editor is made with
  const options = useMemo(
    () => ({
      extensions: buildExtensions(host),
      content,
      editable,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          class: "prose note-editor",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": "Page content",
        },
        handlePaste(_view: unknown, event: ClipboardEvent) {
          const files = filesOf(event.clipboardData);
          const current = editorRef.current;
          // Text copied from a word processor also carries a picture of itself; the text wins.
          if (!current || files.length === 0 || event.clipboardData?.types.includes("text/html")) return false;
          event.preventDefault();
          if (!picturesRef.current) {
            toast(NO_PICTURES);
            return true;
          }
          uploadImages(current, host, files, current.state.selection.from);
          return true;
        },
        handleDrop(
          view: { posAtCoords(coords: { left: number; top: number }): { pos: number } | null },
          event: DragEvent,
          _slice: unknown,
          moved: boolean,
        ) {
          const files = filesOf(event.dataTransfer);
          const current = editorRef.current;
          if (!current || moved || files.length === 0) return false;
          event.preventDefault();
          if (!picturesRef.current) {
            toast(NO_PICTURES);
            return true;
          }
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? current.state.selection.from;
          uploadImages(current, host, files, at);
          return true;
        },
      },
      onUpdate: () => callbacks.current.onChange(),
      onBlur: () => callbacks.current.onBlur(),
    }),
    [],
  );
  const editorRef = useRef<Editor | null>(null);
  const editor = useEditor(options, []);
  editorRef.current = editor;

  // biome-ignore lint/correctness/useExhaustiveDependencies: onEditor is the page's stable setter
  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor]);

  /** A click under the last block: carry on writing there, adding a line if the page ends in something that is not a paragraph. */
  const writeAtEnd = () => {
    const { doc, schema } = editor.state;
    // Focus now, not a frame later as Tiptap does, so the next key cannot land elsewhere.
    editor.view.focus();
    const paragraph = doc.lastChild?.type.name === "paragraph" ? null : schema.nodes.paragraph?.create();
    if (paragraph) editor.chain().insertContentAt(doc.content.size, paragraph.toJSON()).focus("end").run();
    else editor.commands.focus("end");
  };

  return (
    <div className="note-editor-frame">
      <EditorContent editor={editor} />
      {editable ? (
        <>
          {/* A larger target for the pointer only; the keyboard is already in the text. */}
          <div aria-hidden className="note-editor-tail" onClick={writeAtEnd} />
          <SelectionToolbar editor={editor} />
          <TableMenu editor={editor} />
          {touch ? <TouchBar editor={editor} /> : <BlockHandle editor={editor} />}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            aria-hidden
            tabIndex={-1}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) uploadImages(editor, host, files, imagePos.current);
            }}
          />
          {documentPos !== null ? (
            <DocumentPicker
              onClose={() => setDocumentPos(null)}
              onPick={(document) => {
                const at = Math.min(documentPos, editor.state.doc.content.size);
                setDocumentPos(null);
                editor
                  .chain()
                  .focus()
                  .insertContentAt(at, {
                    type: "documentEmbed",
                    attrs: { documentId: document.id, title: document.title || document.originalName },
                  })
                  .run();
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
