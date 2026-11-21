/**
 * Who may change a setting held to the computer Outpost runs on: one that opens a port or
 * a device there (the mesh radio set-up), or lets other programs read what Outpost holds
 * (the switch for other programs' tools). Accepted from that computer (`core/local.ts`),
 * or from every device when whoever starts Outpost sets OUTPOST_ALLOW_REMOTE_SETTINGS.
 *
 * In a container no request looks as if it comes from the computer itself, so the option
 * is the only way there, even in a browser on that computer. The answer says which, so a
 * screen can say why a control is disabled and the exact line that would allow it.
 *
 * The option is its own, not OUTPOST_ALLOW_REMOTE_ERASE: allowing every device to change
 * the radio set-up is not allowing every device to erase the household's notes. The mesh
 * radio accepted the erase option before this one existed, and still does (`legacy`).
 */
import { REMOTE_SETTINGS_OPTION, type SettingRight } from "@outpost/shared";
import type { Config } from "../config.ts";
import { AppError } from "./errors.ts";
import { containerReason, localBy, type RequestOrigin } from "./local.ts";

const LEGACY_OPTION = "OUTPOST_ALLOW_REMOTE_ERASE";

export function settingRight(
  request: RequestOrigin,
  config: Pick<Config, "lanAccess" | "ownAddressIsLocal" | "allowRemoteSettings" | "allowRemoteErase">,
  options: { legacy?: boolean; inContainer?: boolean } = {},
): SettingRight {
  const inContainer = options.inContainer ?? containerReason() !== null;
  if (config.allowRemoteSettings) return { allowed: true, reason: "option", option: REMOTE_SETTINGS_OPTION, inContainer };
  if (options.legacy && config.allowRemoteErase) return { allowed: true, reason: "option", option: LEGACY_OPTION, inContainer };
  const by = localBy(request, config);
  if (by) return { allowed: true, reason: "local", option: REMOTE_SETTINGS_OPTION, localBy: by, inContainer };
  return { allowed: false, reason: "remote", option: REMOTE_SETTINGS_OPTION, inContainer };
}

/**
 * What a refusal says: `what` cannot be changed from this device and why, and the line to
 * add. Same words as the screen's notice, so a person who meets either learns what to do.
 */
export function settingRefusal(what: string, because: string, inContainer: boolean): AppError {
  const where = inContainer
    ? "Outpost runs in a container, where no request looks as if it comes from the computer itself"
    : "this device is not the computer Outpost runs on";
  return new AppError(
    "forbidden",
    `${what} can only be changed at the computer Outpost runs on, because ${because}, and ${where}. To allow it from every device, add ${REMOTE_SETTINGS_OPTION}=true to Outpost's .env file and restart Outpost (in Docker: sudo docker compose up -d).`,
  );
}
