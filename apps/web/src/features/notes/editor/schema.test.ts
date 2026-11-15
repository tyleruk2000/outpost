import { NOTE_BLOCK_TYPES, NOTE_INLINE_TYPES, NOTE_MARK_TYPES, type NoteDoc, type NoteNodeJson } from "@outpost/shared";
import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildExtensions } from "./extensions";
import { normaliseHref } from "./link";
import { filterSlashItems } from "./slash-menu";

const text = (value: string, ...marks: NoteNodeJson["marks"] & object) =>
  marks.length ? { type: "text" as const, text: value, marks } : { type: "text" as const, text: value };
const p = (...content: NoteNodeJson[]) => (content.length ? { type: "paragraph", content } : { type: "paragraph" });
const cell = { colspan: 1, rowspan: 1, colwidth: null };

/** One of everything the page model allows, written the way the server stores it. */
const everything = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [text("Ridge walk")] },
    { type: "heading", attrs: { level: 2 }, content: [text("Plan")] },
    { type: "heading", attrs: { level: 3 }, content: [text("Details")] },
    p(
      text("Plain, "),
      text("bold", { type: "bold" }),
      text(", "),
      text("italic", { type: "italic" }),
      text(", "),
      text("struck", { type: "strike" }),
      text(", "),
      text("code", { type: "code" }),
      text(", "),
      text("underlined", { type: "underline" }),
      text(", "),
      text("highlighted", { type: "highlight" }),
      text(", "),
      text("a link", { type: "link", attrs: { href: "https://example.org/route" } }),
      text(" and "),
      text("an in-app link", { type: "link", attrs: { href: "/library" } }),
      text("."),
      { type: "hardBreak" },
      text("See "),
      { type: "pageLink", attrs: { noteId: "01JABCDEFGHJKMNPQRSTVWXYZ0", label: "Kit list" } },
      text(" first."),
    ),
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [p(text("Map")), { type: "bulletList", content: [{ type: "listItem", content: [p(text("1:25 000"))] }] }],
        },
      ],
    },
    { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [p(text("Third step"))] }] },
    {
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true }, content: [p(text("Headtorch"))] },
        { type: "taskItem", attrs: { checked: false }, content: [p(text("Spare batteries"))] },
      ],
    },
    { type: "blockquote", content: [p(text("The summit is optional."))] },
    { type: "codeBlock", attrs: { language: "bash" }, content: [text("rsync -a notes/ backup/")] },
    { type: "codeBlock", attrs: { language: null }, content: [text("plain")] },
    { type: "horizontalRule" },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", attrs: cell, content: [p(text("Leg"))] },
            { type: "tableHeader", attrs: cell, content: [p(text("Time"))] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", attrs: cell, content: [p(text("Hut to col"))] },
            { type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: [120] }, content: [p(text("1 h 40"))] },
          ],
        },
      ],
    },
    { type: "image", attrs: { src: "/api/attachments/01JATTACHMENT0000000000000", alt: "The ridge at dawn", title: null } },
    { type: "callout", attrs: { variant: "warning" }, content: [p(text("Cornices after fresh snow."))] },
    { type: "callout", attrs: { variant: "info" }, content: [p(text("Note"))] },
    { type: "callout", attrs: { variant: "success" }, content: [p(text("Done"))] },
    { type: "callout", attrs: { variant: "danger" }, content: [p(text("Stop"))] },
    { type: "documentEmbed", attrs: { documentId: "01JDOCUMENT000000000000000", title: "Avalanche handbook" } },
    {
      type: "details",
      content: [
        { type: "detailsSummary", content: [text("Bail-out points")] },
        { type: "detailsContent", content: [p(text("The east gully, before the second tower."))] },
      ],
    },
    p(),
  ],
} satisfies NoteNodeJson;

let editor: Editor | undefined;
afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

const create = (content: unknown) => {
  editor = new Editor({ extensions: buildExtensions(null), content: content as NoteDoc });
  return editor;
};

function collect(node: NoteNodeJson, nodes: Set<string>, marks: Set<string>): void {
  nodes.add(node.type);
  for (const mark of node.marks ?? []) marks.add(mark.type);
  for (const child of node.content ?? []) collect(child, nodes, marks);
}

describe("the editor's schema", () => {
  it("has exactly the node and mark types of the shared model", () => {
    const { schema } = create(everything);
    expect(Object.keys(schema.nodes).sort()).toEqual(["doc", ...NOTE_BLOCK_TYPES, ...NOTE_INLINE_TYPES].sort());
    expect(Object.keys(schema.marks).sort()).toEqual([...NOTE_MARK_TYPES].sort());
  });

  it("the test document uses every type of the model", () => {
    const nodes = new Set<string>();
    const marks = new Set<string>();
    collect(everything, nodes, marks);
    expect([...nodes].sort()).toEqual(["doc", ...NOTE_BLOCK_TYPES, ...NOTE_INLINE_TYPES].sort());
    expect([...marks].sort()).toEqual([...NOTE_MARK_TYPES].sort());
  });

  it("round-trips a document with every node type through getJSON unchanged", () => {
    expect(create(everything).getJSON()).toEqual(everything);
  });

  it("round-trips the same document through HTML, as copy and paste does", () => {
    const html = create(everything).getHTML();
    editor?.destroy();
    expect(create(html).getJSON()).toEqual(everything);
  });

  it("writes the callout markup that prose.css styles", () => {
    const html = create({
      type: "doc",
      content: [{ type: "callout", attrs: { variant: "danger" }, content: [p(text("Stop"))] }],
    }).getHTML();
    const root = document.createElement("div");
    root.innerHTML = html;
    const callout = root.querySelector("div.callout");
    expect(callout?.getAttribute("data-variant")).toBe("danger");
    expect(callout?.children[0]?.className).toBe("callout-icon");
    expect(callout?.children[1]?.className).toBe("callout-body");
    expect(callout?.querySelector(".callout-body > p")?.textContent).toBe("Stop");
  });

  it("adds no attributes of its own to the model's nodes", () => {
    const json = create({
      type: "doc",
      content: [
        { type: "orderedList", content: [{ type: "listItem", content: [p(text("One"))] }] },
        p(text("link", { type: "link", attrs: { href: "https://example.org" } })),
        { type: "image", attrs: { src: "/api/attachments/a" } },
        { type: "codeBlock" },
        { type: "callout", content: [p()] },
      ],
    }).getJSON() as NoteNodeJson;
    const [list, paragraph, image, code, callout] = json.content ?? [];
    expect(list?.attrs).toEqual({ start: 1 });
    expect(paragraph?.attrs).toBeUndefined();
    expect(paragraph?.content?.[0]?.marks).toEqual([{ type: "link", attrs: { href: "https://example.org" } }]);
    expect(image?.attrs).toEqual({ src: "/api/attachments/a", alt: null, title: null });
    expect(code?.attrs).toEqual({ language: null });
    expect(callout?.attrs).toEqual({ variant: "info" });
  });

  it("falls back to an info callout for a variant it does not know", () => {
    const html = '<div class="callout" data-variant="shouting"><div class="callout-body"><p>Hello</p></div></div>';
    expect((create(html).getJSON() as NoteNodeJson).content?.[0]).toMatchObject({ type: "callout", attrs: { variant: "info" } });
  });
});

describe("markdown shortcuts", () => {
  const typed = (input: string) => {
    const instance = create({ type: "doc", content: [p()] });
    instance.commands.focus();
    for (const char of input) {
      const { from, to } = instance.state.selection;
      // Input rules listen to handleTextInput, which is what typing a character calls.
      const handled = instance.view.someProp("handleTextInput", (handler) =>
        handler(instance.view, from, to, char, () => instance.state.tr.insertText(char, from, to)),
      );
      if (!handled) instance.view.dispatch(instance.state.tr.insertText(char, from, to));
    }
    return (instance.getJSON() as NoteNodeJson).content?.[0];
  };

  it.each([
    ["# ", { type: "heading", attrs: { level: 1 } }],
    ["### ", { type: "heading", attrs: { level: 3 } }],
    ["- ", { type: "bulletList" }],
    ["1. ", { type: "orderedList" }],
    ["[] ", { type: "taskList" }],
    ["[ ] ", { type: "taskList" }],
    ["> ", { type: "blockquote" }],
    ["``` ", { type: "codeBlock" }],
    ["!!! ", { type: "callout", attrs: { variant: "info" } }],
  ])("%j starts a block", (input, expected) => {
    expect(typed(input)).toMatchObject(expected);
  });

  it("--- becomes a divider", () => {
    expect(typed("---")).toMatchObject({ type: "horizontalRule" });
  });

  it("**bold** and `code` become marks", () => {
    expect(typed("**bold** ")?.content?.[0]).toMatchObject({ text: "bold", marks: [{ type: "bold" }] });
    expect(typed("`code` ")?.content?.[0]).toMatchObject({ text: "code", marks: [{ type: "code" }] });
  });

  it("a web address followed by a space becomes a link", () => {
    expect(typed("see https://example.org/a ")?.content?.[1]).toMatchObject({
      text: "https://example.org/a",
      marks: [{ type: "link", attrs: { href: "https://example.org/a" } }],
    });
  });
});

describe("links", () => {
  it("accepts in-app paths and web and mail addresses only", () => {
    expect(normaliseHref("/notes/abc")).toBe("/notes/abc");
    expect(normaliseHref("https://example.org/x")).toBe("https://example.org/x");
    expect(normaliseHref("mailto:hut@example.org")).toBe("mailto:hut@example.org");
    expect(normaliseHref("hut@example.org")).toBe("mailto:hut@example.org");
    expect(normaliseHref("example.org/path")).toBe("https://example.org/path");
    expect(normaliseHref("javascript:alert(1)")).toBeNull();
    expect(normaliseHref("data:text/html,x")).toBeNull();
    expect(normaliseHref("//evil.example")).toBeNull();
    expect(normaliseHref("ftp://example.org")).toBeNull();
    expect(normaliseHref("two words")).toBeNull();
    expect(normaliseHref("")).toBeNull();
  });

  it("drops an unsafe link from pasted HTML but keeps its words", () => {
    const json = create('<p><a href="javascript:alert(1)">click</a></p>').getJSON() as NoteNodeJson;
    expect(json.content?.[0]?.content).toEqual([{ type: "text", text: "click" }]);
  });
});

describe("the slash menu", () => {
  it("offers every block of the brief", () => {
    const labels = filterSlashItems("").map((item) => item.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Text",
        "Heading 1",
        "Heading 2",
        "Heading 3",
        "Bulleted list",
        "Numbered list",
        "To-do list",
        "Quote",
        "Callout",
        "Warning callout",
        "Code block",
        "Table",
        "Divider",
        "Toggle",
        "Image",
        "Link to page",
        "Embed a document",
        "Page",
      ]),
    );
  });

  it("filters by name and by other words for the same thing", () => {
    expect(filterSlashItems("head").map((item) => item.label)).toEqual(["Heading 1", "Heading 2", "Heading 3"]);
    expect(filterSlashItems("todo")[0]?.label).toBe("To-do list");
    expect(filterSlashItems("zzz")).toEqual([]);
  });
});
