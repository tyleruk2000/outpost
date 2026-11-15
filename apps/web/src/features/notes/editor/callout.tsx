/** A tinted panel for a note, a warning, a success or a danger. The kind is changed from its icon. */
import { NOTE_CALLOUT_VARIANTS, type NoteCalloutVariant } from "@outpost/shared";
import {
  mergeAttributes,
  Node,
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
  wrappingInputRule,
} from "@tiptap/react";
import { CircleCheck, Info, type LucideIcon, OctagonAlert, TriangleAlert } from "lucide-react";
import { Menu, MenuCheckItem, MenuContent, MenuLabel, MenuTrigger } from "@/components/ui/menu";

export const calloutKinds: Record<NoteCalloutVariant, { label: string; icon: LucideIcon }> = {
  info: { label: "Note", icon: Info },
  warning: { label: "Warning", icon: TriangleAlert },
  success: { label: "Success", icon: CircleCheck },
  danger: { label: "Danger", icon: OctagonAlert },
};

const asVariant = (value: unknown): NoteCalloutVariant =>
  (NOTE_CALLOUT_VARIANTS as readonly unknown[]).includes(value) ? (value as NoteCalloutVariant) : "info";

function CalloutView({ node, editor, updateAttributes }: ReactNodeViewProps) {
  const variant = asVariant(node.attrs.variant);
  const kind = calloutKinds[variant];

  return (
    <NodeViewWrapper className="callout" data-variant={variant}>
      <span className="callout-icon" contentEditable={false}>
        {editor.isEditable ? (
          <Menu>
            <MenuTrigger asChild>
              <button type="button" aria-label={`${kind.label}. Change the kind of callout`} className="callout-kind">
                <kind.icon aria-hidden />
              </button>
            </MenuTrigger>
            <MenuContent align="start" data-editor-popup onCloseAutoFocus={(event) => event.preventDefault()}>
              <MenuLabel>Kind of callout</MenuLabel>
              {NOTE_CALLOUT_VARIANTS.map((option) => {
                const Icon = calloutKinds[option].icon;
                return (
                  <MenuCheckItem key={option} checked={option === variant} onCheckedChange={() => updateAttributes({ variant: option })}>
                    <span className="flex items-center gap-2.5">
                      <Icon aria-hidden /> {calloutKinds[option].label}
                    </span>
                  </MenuCheckItem>
                );
              })}
            </MenuContent>
          </Menu>
        ) : (
          <span role="img" aria-label={kind.label} className="callout-kind">
            <kind.icon aria-hidden />
          </span>
        )}
      </span>
      <NodeViewContent className="callout-body" />
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: "info",
        parseHTML: (element) => asVariant(element.getAttribute("data-variant")),
        renderHTML: (attributes) => ({ "data-variant": asVariant(attributes.variant) }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div.callout",
        contentElement: (element) =>
          (element as HTMLElement).querySelector<HTMLElement>(":scope > .callout-body") ?? (element as HTMLElement),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ class: "callout" }, HTMLAttributes),
      ["span", { class: "callout-icon", "aria-hidden": "true" }],
      ["div", { class: "callout-body" }, 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },

  addInputRules() {
    // "!!! " at the start of a line, as in several Markdown dialects.
    return [wrappingInputRule({ find: /^!!!\s$/, type: this.type })];
  },
});
