/**
 * The Clock choice under Appearance: whether times of day are written on the 24-hour
 * clock or the 12-hour one, everywhere in the app. Kept in this browser, like the theme,
 * and following the device until someone chooses (`lib/clock`).
 */
import { Segmented } from "@/components/ui/misc";
import { clockText, deviceClockStyle, useClockChoice } from "@/lib/clock";
import { SettingRow } from "./parts";

const STYLE_NAMES = { "24": "24-hour", "12": "12-hour" } as const;

export function ClockSetting() {
  const [clock, setClock] = useClockChoice();
  return (
    <SettingRow
      label="Clock"
      hint={`How times of day are written everywhere in Outpost: ${clockText(14, 30, "24")} or ${clockText(14, 30, "12")}. This device uses the ${STYLE_NAMES[deviceClockStyle()]} clock, as far as its browser says. UTC, where it is shown, is always 24-hour.`}
      control={
        <Segmented
          label="Clock"
          value={clock}
          onChange={setClock}
          options={[
            { value: "device", label: "As this device" },
            { value: "24", label: STYLE_NAMES["24"] },
            { value: "12", label: STYLE_NAMES["12"] },
          ]}
        />
      }
    />
  );
}
