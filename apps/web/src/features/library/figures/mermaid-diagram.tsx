/**
 * A diagram written as a ```mermaid block, shown as a picture.
 *
 * The drawing code (and Mermaid itself) is fetched the first time a diagram comes near
 * the screen, and each diagram is drawn only then: a long chapter with six diagrams
 * does not draw six pictures before a person can read its first line. If the text is
 * not a diagram Mermaid can draw, it is shown as written.
 */
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/lib/theme";
import { Figure, FigureSource } from "./figure-frame";
import type { DrawnDiagram } from "./mermaid-render";

type State = { status: "waiting" } | { status: "drawn"; diagram: DrawnDiagram } | { status: "failed" };

const loadRenderer = () => import("./mermaid-render");

/** The nearest ancestor that scrolls up and down: the reading pane, not the window, is what a document scrolls in. */
function scroller(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return null;
}

/** True once the element has come within a screen or so of being seen. */
function useNear(): [ref: React.RefObject<HTMLDivElement | null>, near: boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const element = ref.current;
    if (near || !element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      // The margin is measured from the pane the document scrolls in, so a diagram is drawn a little before it is reached.
      { root: scroller(element), rootMargin: "800px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);
  return [ref, near];
}

export default function MermaidDiagram({ source }: { source: string }) {
  const [ref, near] = useNear();
  const { resolved } = useTheme();
  const [state, setState] = useState<State>({ status: "waiting" });

  // biome-ignore lint/correctness/useExhaustiveDependencies: drawn again when the theme changes, in the new theme's colours
  useEffect(() => {
    if (!near) return;
    let stale = false;
    let url: string | undefined;
    void (async () => {
      try {
        const renderer = await loadRenderer();
        // The theme is put on the page by an effect that runs after this one; read the tokens once it has.
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (stale) return;
        const diagram = await renderer.drawDiagram(source, renderer.readPalette());
        if (stale) return URL.revokeObjectURL(diagram.url);
        url = diagram.url;
        setState({ status: "drawn", diagram });
      } catch {
        if (!stale) setState({ status: "failed" });
      }
    })();
    return () => {
      stale = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [near, source, resolved]);

  if (state.status === "failed") {
    return <FigureSource reason="This diagram could not be drawn, so its source is shown as written." source={source} />;
  }
  if (state.status === "waiting") {
    return (
      <div ref={ref} className="doc-figure doc-figure-pending" role="img" aria-label="Diagram, being drawn" aria-busy>
        Drawing the diagram…
      </div>
    );
  }
  const { diagram } = state;
  return (
    <Figure
      label="Diagram"
      width={diagram.width}
      below={
        <details>
          <summary>Diagram as text</summary>
          <pre>
            <code>{source}</code>
          </pre>
        </details>
      }
    >
      <img src={diagram.url} alt={diagram.description} width={diagram.width} height={diagram.height} decoding="async" draggable={false} />
    </Figure>
  );
}
