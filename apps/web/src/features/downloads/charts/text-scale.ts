import { useState } from "react";

/**
 * How much larger than 16px the page's text is: 1 normally, 2 with the text at 200%.
 * Charts are drawn in pixels and keep room for their labels by counting characters, so
 * that room, and the height that keeps labels apart, grow by this much. Read once when
 * the chart is first drawn.
 */
export function useTextScale(): number {
  const [scale] = useState(() => {
    const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    return Number.isFinite(size) && size > 16 ? size / 16 : 1;
  });
  return scale;
}
