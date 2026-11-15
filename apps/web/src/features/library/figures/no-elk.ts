/**
 * Stands in for elkjs, the ELK layout engine.
 *
 * Mermaid 12 bundles elkjs for its optional "elk" layout. elkjs is licensed EPL-2.0 (or
 * GPL-3.0-or-later), which is not among the licences Outpost links (see "Dependency
 * licences" in docs/architecture.md), and it is 1.5 MB that no diagram here needs:
 * Outpost draws every diagram with Mermaid's dagre layout. So the build is told to use
 * this file wherever Mermaid asks for elkjs (see `resolve.alias` in vite.config.ts), and
 * elkjs is not shipped at all.
 *
 * A diagram that asks for ELK by name (`flowchart-elk`) is drawn with dagre instead; see
 * mermaid-render.ts. If anything still reaches this, the diagram fails and is shown as
 * its source, like any other diagram that cannot be drawn.
 */
export default class NoElk {
  layout(): Promise<never> {
    return Promise.reject(new Error("The ELK layout engine is not included in Outpost."));
  }
}
