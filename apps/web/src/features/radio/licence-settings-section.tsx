/**
 * Settings → Radio licence (outpost-ywbh.1): whether someone in the household holds an
 * amateur licence, and the callsign. Off by default. It only leaves out the reminders
 * that transmitting needs a licence; Outpost transmits nothing either way, and the
 * callsign is never sent anywhere. The Morse trainer starts from this callsign when it
 * has none of its own.
 */
import { LICENCE_HELP_PATH, RADIO_LICENCE_SETTING, type Settings } from "@outpost/shared";
import { Link } from "react-router";
import { Switch } from "@/components/ui/misc";
import { SettingRow, SettingsSection, TextSetting } from "@/features/settings/parts";

export function RadioLicenceSettingsSection({
  settings,
  disabled,
  save,
}: {
  settings: Settings;
  disabled: boolean;
  save: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  const licensed = settings["radio.licensed"] === true;
  return (
    <SettingsSection
      id="radio-licence"
      title="Radio licence"
      description={
        <>
          What the radio screens say about licences.{" "}
          <Link to={LICENCE_HELP_PATH} className="text-primary underline underline-offset-2">
            What needs a radio licence
          </Link>
        </>
      }
    >
      <SettingRow
        htmlFor="radio-licensed"
        label={RADIO_LICENCE_SETTING.label}
        hint={RADIO_LICENCE_SETTING.about}
        control={
          <Switch id="radio-licensed" checked={licensed} disabled={disabled} onCheckedChange={(next) => save("radio.licensed", next)} />
        }
      />
      {licensed ? (
        <SettingRow
          htmlFor="radio-callsign"
          label={RADIO_LICENCE_SETTING.callsignLabel}
          hint="Optional. Kept on this server for the Morse trainer to start from; never sent."
          control={
            <TextSetting
              id="radio-callsign"
              value={settings["radio.callsign"] ?? ""}
              disabled={disabled}
              onSave={(value) => save("radio.callsign", value.trim().toUpperCase())}
              placeholder="M7ABC"
              mono
            />
          }
        />
      ) : null}
    </SettingsSection>
  );
}
