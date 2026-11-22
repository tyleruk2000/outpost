/**
 * The reading choices: typeface, text size and spacing. Settings, Appearance shows them as
 * rows; a reader shows the same three behind its "Text" button. Both change the same
 * choices, kept in this browser (`lib/theme`).
 */
import { Type } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, Segmented, Tooltip } from "@/components/ui/misc";
import { type ReadingFace, type ReadingSpacing, type TextSize, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const TEXT_SIZE_NAMES: Record<TextSize, string> = { smaller: "Smaller", default: "Default", larger: "Larger", largest: "Largest" };

export const FACE_OPTIONS: Array<{ value: ReadingFace; label: ReactNode }> = [
  { value: "serif", label: <span className="font-serif">Serif</span> },
  { value: "sans", label: "Sans" },
];

export const SPACING_OPTIONS: Array<{ value: ReadingSpacing; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "wide", label: "Wide" },
];

/** "Text" in a reader's bar: typeface, size and spacing for reading, without leaving the page. */
export function ReadingTextControl({ className }: { className?: string }) {
  const { reading, setReading, textSize, setTextSize, spacing, setSpacing } = useTheme();
  return (
    <Popover>
      <Tooltip label="Text: typeface, size and spacing">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={cn("shrink-0 max-md:size-11 max-md:px-0", className)} aria-label="Text">
            <Type /> <span className="max-md:sr-only">Text</span>
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="grid w-[min(20rem,calc(100vw-1rem))] gap-4 p-4" aria-label="Text">
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-small font-medium text-ink">Typeface</legend>
          <Segmented label="Typeface" value={reading} onChange={setReading} options={FACE_OPTIONS} className="w-full" />
        </fieldset>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-small font-medium text-ink">Size</legend>
          <Segmented
            label="Size"
            value={textSize}
            onChange={setTextSize}
            options={(Object.keys(TEXT_SIZE_NAMES) as TextSize[]).map((size) => ({ value: size, label: TEXT_SIZE_NAMES[size] }))}
            className="w-full"
          />
        </fieldset>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-small font-medium text-ink">Spacing</legend>
          <Segmented label="Spacing" value={spacing} onChange={setSpacing} options={SPACING_OPTIONS} className="w-full" />
        </fieldset>
        <p className="text-small text-ink-muted">Size is for all of Outpost. Kept on this device; also under Settings, Appearance.</p>
      </PopoverContent>
    </Popover>
  );
}
