/** Code blocks, highlighted with lowlight's common languages, with a language picker on the block. */
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

const NAMES: Record<string, string> = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  diff: "Diff",
  go: "Go",
  graphql: "GraphQL",
  ini: "INI, TOML",
  java: "Java",
  javascript: "JavaScript",
  json: "JSON",
  kotlin: "Kotlin",
  less: "Less",
  lua: "Lua",
  makefile: "Makefile",
  markdown: "Markdown",
  objectivec: "Objective-C",
  perl: "Perl",
  php: "PHP",
  python: "Python",
  r: "R",
  ruby: "Ruby",
  rust: "Rust",
  scss: "SCSS",
  shell: "Shell session",
  sql: "SQL",
  swift: "Swift",
  typescript: "TypeScript",
  vbnet: "VB.NET",
  wasm: "WebAssembly",
  xml: "HTML, XML",
  yaml: "YAML",
};

/** Languages offered in the picker: the ones lowlight can colour, by the names people use. */
export const codeLanguages = lowlight
  .listLanguages()
  .filter((language) => NAMES[language] !== undefined)
  .map((language) => ({ value: language, label: NAMES[language] ?? language }))
  .sort((a, b) => a.label.localeCompare(b.label));

function CodeBlockView({ node, editor, updateAttributes }: ReactNodeViewProps) {
  const language = typeof node.attrs.language === "string" ? node.attrs.language : "";
  // A language set by an import that lowlight does not know is kept, and still listed.
  const known = language === "" || codeLanguages.some((option) => option.value === language);

  return (
    <NodeViewWrapper className="note-code">
      {editor.isEditable ? (
        <select
          contentEditable={false}
          aria-label="Language of this code"
          value={language}
          onChange={(event) => updateAttributes({ language: event.target.value || null })}
          className="note-code-language"
        >
          <option value="">Plain text</option>
          {known ? null : <option value={language}>{language}</option>}
          {codeLanguages.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : language ? (
        <span className="note-code-language" contentEditable={false}>
          {NAMES[language] ?? language}
        </span>
      ) : null}
      <pre>
        <NodeViewContent<"code"> as="code" className={language ? `language-${language}` : undefined} />
      </pre>
    </NodeViewWrapper>
  );
}

export const NoteCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({ lowlight, defaultLanguage: null });
