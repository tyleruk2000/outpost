/**
 * The sheet drawn on screen: the preview in "Print or save as PDF", and what the
 * browser's own Print prints. It draws the same list the PDF writer does (sheet.ts), in
 * the same units, so the two cannot drift apart.
 *
 * This is a picture of a piece of paper, not part of the interface: white, with black
 * lettering in the PDF's typeface, whatever the app's theme. That is why its colours
 * and type do not come from the design tokens.
 */
import type { Rgb, Sheet, SheetItem } from "./sheet";

/** Helvetica, or what each system draws in its place with the same widths (Arial, Liberation Sans). */
const SHEET_FONT = "Helvetica, Arial, 'Liberation Sans', sans-serif";

const css = (color: Rgb) => `rgb(${color.map((part) => Math.round(part * 255)).join(" ")})`;

function Item({ item, pictures }: { item: SheetItem; pictures: Readonly<Record<string, string | undefined>> }) {
  switch (item.kind) {
    case "image": {
      const href = pictures[item.id];
      // Before its picture has been drawn, the map's place is held by the colour of land.
      return href ? (
        <image href={href} x={item.x} y={item.y} width={item.width} height={item.height} preserveAspectRatio="none" />
      ) : (
        <rect x={item.x} y={item.y} width={item.width} height={item.height} fill="rgb(236 239 239)" />
      );
    }
    case "rect":
      return (
        <rect
          x={item.x}
          y={item.y}
          width={item.width}
          height={item.height}
          fill={item.fill ? css(item.fill) : "none"}
          stroke={item.stroke ? css(item.stroke) : undefined}
          strokeWidth={item.stroke ? (item.lineWidth ?? 0.5) : undefined}
        />
      );
    case "line":
      return <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke={css(item.color)} strokeWidth={item.width} />;
    case "polygon":
      return <polygon points={item.points.map((point) => point.join(",")).join(" ")} fill={css(item.fill)} />;
    case "text":
      return (
        <text
          x={item.x}
          y={item.y}
          fontSize={item.size}
          fontWeight={item.bold ? 700 : 400}
          fill={css(item.color)}
          textAnchor={item.anchor ?? "start"}
          transform={item.upward ? `rotate(-90 ${item.x} ${item.y})` : undefined}
        >
          {item.text}
        </text>
      );
  }
}

export function SheetView({
  sheet,
  pictures,
  label,
  className,
  actualSize,
}: {
  sheet: Sheet;
  /** An address (an object URL) for each picture the sheet refers to; one that is missing is drawn as a blank. */
  pictures: Readonly<Record<string, string | undefined>>;
  /** What the picture is, for someone who cannot see it. */
  label: string;
  className?: string;
  /** Laid out at the paper's real size, for printing; otherwise it scales to the room it is given. */
  actualSize?: boolean;
}) {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${sheet.width} ${sheet.height}`}
      className={className}
      style={{ fontFamily: SHEET_FONT, ...(actualSize ? { width: `${sheet.width}pt`, height: `${sheet.height}pt` } : {}) }}
    >
      <rect width={sheet.width} height={sheet.height} fill="rgb(255 255 255)" />
      {sheet.items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the list is drawn in order and never re-ordered
        <Item key={index} item={item} pictures={pictures} />
      ))}
    </svg>
  );
}
