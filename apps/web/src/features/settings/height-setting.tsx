/**
 * The Heights choice under Appearance: whether heights on the map screens (the ground
 * under the pointer, a route's profile and climb, a line-of-sight check) are written in
 * metres or feet. Kept in this browser, like the theme and the clock (`lib/heights`).
 */
import { Segmented } from "@/components/ui/misc";
import { heightText, useHeightChoice } from "@/lib/heights";
import { SettingRow } from "./parts";

export function HeightSetting() {
  const [unit, setUnit] = useHeightChoice();
  return (
    <div id="heights" className="md:scroll-mt-6">
      <SettingRow
        label="Heights"
        hint={`How heights are written on the maps: the ground, a route's climb, a line-of-sight check. ${heightText(312, "m")} or ${heightText(312, "ft")}. Distances are always kilometres with miles beside them, and a height you type (an aerial's) is always in metres.`}
        control={
          <Segmented
            label="Heights"
            value={unit}
            onChange={setUnit}
            options={[
              { value: "m", label: "Metres" },
              { value: "ft", label: "Feet" },
            ]}
          />
        }
      />
    </div>
  );
}
