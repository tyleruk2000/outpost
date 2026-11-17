/**
 * The Text size choice under Appearance: every word in Outpost a step smaller or larger, on
 * this device only, like the theme. It scales the root font size (`lib/theme`), and
 * `public/pre-paint.js` puts it on the page before anything is drawn, so nothing jumps.
 */
import { Segmented } from "@/components/ui/misc";
import { type TextSize, useTheme } from "@/lib/theme";
import { SettingRow } from "./parts";

const NAMES: Record<TextSize, string> = { smaller: "Smaller", default: "Default", larger: "Larger", largest: "Largest" };

export function TextSizeSetting() {
  const { textSize, setTextSize } = useTheme();
  return (
    <div id="text-size" className="scroll-mt-16 md:scroll-mt-6">
      <SettingRow
        label="Text size"
        hint="All text in Outpost, on this device, on top of the text size the device itself is set to."
        control={
          <Segmented
            label="Text size"
            value={textSize}
            onChange={setTextSize}
            options={(Object.keys(NAMES) as TextSize[]).map((size) => ({ value: size, label: NAMES[size] }))}
          />
        }
      />
    </div>
  );
}
