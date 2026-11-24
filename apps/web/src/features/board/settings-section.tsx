/** Settings → Message board: how long a file sent on the board is kept. */
import type { Settings } from "@outpost/shared";
import { Select } from "@/components/ui/misc";
import { SettingRow, SettingsSection } from "@/features/settings/parts";
import { plural } from "@/lib/utils";

const DAY_CHOICES = ["1", "3", "7", "14", "30", "90", "0"] as const;

export function BoardSettingsSection({
  settings,
  save,
}: {
  settings: Settings;
  save: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  const value = String(settings["board.fileDays"]);
  const options = DAY_CHOICES.map((days) => ({
    value: days,
    label: days === "0" ? "Until someone removes it" : plural(Number(days), "day"),
  }));
  if (!DAY_CHOICES.includes(value as (typeof DAY_CHOICES)[number]))
    options.unshift({ value: value as (typeof DAY_CHOICES)[number], label: plural(Number(value), "day") });
  return (
    <SettingsSection id="board" title="Message board" description="The household's board under Messages.">
      <SettingRow
        htmlFor="board-file-days"
        label="Keep files sent on the board"
        hint="Then the file is removed by itself and its message says so. A change holds for files already sent too."
        control={
          <Select
            id="board-file-days"
            value={value as (typeof DAY_CHOICES)[number]}
            // Not disabled while the choice saves: a list that closes onto a disabled button drops the keyboard's place
            // to the top of the page (owner's review, 24 Nov 2026). A second choice simply saves again.
            onChange={(next) => save("board.fileDays", Number(next))}
            options={options}
            className="w-60 max-w-full"
          />
        }
      />
    </SettingsSection>
  );
}
