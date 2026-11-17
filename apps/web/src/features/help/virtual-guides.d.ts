// The modules apps/web/guides-plugin.ts makes from docs/ as the app is built.

declare module "virtual:outpost-guides" {
  /** A heading a guide can be opened at: its id, its words, and its depth (2 or 3). */
  export type GuideSection = [id: string, title: string, depth: number];
  export interface GuideIndexEntry {
    /** The page's own first heading. */
    title: string;
    /** The day its file last changed (YYYY-MM-DD), from git when the app was built; absent where git could not say. */
    changed?: string;
    sections: GuideSection[];
  }
  export const GUIDE_INDEX: Record<string, GuideIndexEntry>;
  /** Links in docs/ that lead nowhere. Expected to be empty. */
  export const GUIDE_PROBLEMS: string[];
  /** Every page of docs/, relative to it, as the build found them. */
  export const GUIDE_DOCS: string[];
  /** The words of each guide drawn from Markdown, loaded when it is opened. */
  export const GUIDE_LOADERS: Record<string, () => Promise<{ default: import("@outpost/shared").MarkdownBlock[] }>>;
}
