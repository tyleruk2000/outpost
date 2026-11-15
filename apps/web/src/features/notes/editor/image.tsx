/**
 * A picture in the text. The model stores `src`, `alt` and `title` only, so the size
 * attributes Tiptap's image carries are left out.
 */
import { Image } from "@tiptap/extension-image";
import { NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { Ellipsis, ImageOff, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";

function ImageView({ node, editor, selected, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const src = String(node.attrs.src ?? "");
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(alt);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (open) setDraft(alt);
  }, [open, alt]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new address deserves a new attempt
  useEffect(() => setBroken(false), [src]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    updateAttributes({ alt: draft.trim() || null });
    setOpen(false);
  };

  return (
    <NodeViewWrapper className="note-image" data-selected={selected || undefined} data-open={open || undefined}>
      {broken ? (
        <div className="note-image-missing" data-drag-handle>
          <ImageOff aria-hidden />
          <span>{alt ? `This picture could not be loaded: ${alt}` : "This picture could not be loaded."}</span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          title={typeof node.attrs.title === "string" ? node.attrs.title : undefined}
          onError={() => setBroken(true)}
          data-drag-handle
        />
      )}
      {editor.isEditable ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Picture options" className="note-image-tools">
              <Ellipsis aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72" data-editor-popup>
            <form onSubmit={save} className="grid gap-3">
              <Field label="Description" hint="Read aloud by screen readers, and shown if the picture cannot load.">
                {(ids) => (
                  <Input
                    {...ids}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={1000}
                    placeholder="What the picture shows"
                    autoFocus
                  />
                )}
              </Field>
              <div className="flex items-center justify-between gap-2">
                <Button variant="danger-ghost" size="sm" onClick={deleteNode}>
                  <Trash2 /> Remove picture
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Save
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
      ) : null}
    </NodeViewWrapper>
  );
}

export const NoteImage = Image.extend({
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
}).configure({ inline: false, allowBase64: true });
