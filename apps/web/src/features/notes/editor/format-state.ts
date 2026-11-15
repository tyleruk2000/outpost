/** What the toolbars need to know about the selection, read once per transaction. */
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { Bold, Code, Highlighter, Italic, type LucideIcon, Strikethrough, Underline } from "lucide-react";
import { modKey } from "@/lib/utils";
import { activeBlockKind } from "./blocks";

export interface MarkButton {
  mark: "bold" | "italic" | "underline" | "strike" | "code" | "highlight";
  label: string;
  shortcut: string;
  icon: LucideIcon;
}

export const markButtons: MarkButton[] = [
  { mark: "bold", label: "Bold", shortcut: `${modKey} B`, icon: Bold },
  { mark: "italic", label: "Italic", shortcut: `${modKey} I`, icon: Italic },
  { mark: "underline", label: "Underline", shortcut: `${modKey} U`, icon: Underline },
  { mark: "strike", label: "Strikethrough", shortcut: `${modKey} Shift S`, icon: Strikethrough },
  { mark: "code", label: "Code", shortcut: `${modKey} E`, icon: Code },
  { mark: "highlight", label: "Highlight", shortcut: `${modKey} Shift H`, icon: Highlighter },
];

export interface FormatState {
  marks: string;
  href: string | null;
  kind: string | undefined;
  inCode: boolean;
  inTable: boolean;
  /** The kind of list item the cursor is in, for indenting. */
  listItem: "listItem" | "taskItem" | null;
  empty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export function useFormatState(editor: Editor): FormatState {
  return useEditorState({
    editor,
    selector: ({ editor: current }): FormatState => ({
      // One string, so that an unchanged set of marks is an unchanged value.
      marks: markButtons
        .filter((button) => current.isActive(button.mark))
        .map((button) => button.mark)
        .join(" "),
      href: current.isActive("link") ? String(current.getAttributes("link").href ?? "") : null,
      kind: activeBlockKind(current)?.id,
      inCode: current.isActive("codeBlock"),
      inTable: current.isActive("table"),
      listItem: current.isActive("taskItem") ? "taskItem" : current.isActive("listItem") ? "listItem" : null,
      empty: current.state.selection.empty,
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
    equalityFn: (a, b) =>
      b !== null &&
      a.marks === b.marks &&
      a.href === b.href &&
      a.kind === b.kind &&
      a.inCode === b.inCode &&
      a.inTable === b.inTable &&
      a.listItem === b.listItem &&
      a.empty === b.empty &&
      a.canUndo === b.canUndo &&
      a.canRedo === b.canRedo,
  });
}
