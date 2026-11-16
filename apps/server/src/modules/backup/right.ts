/**
 * Where a request must come from before it may restore a backup, delete a stored one,
 * lower how many are kept, or restart the server to apply a restore.
 *
 * Outpost has no accounts. Restoring replaces every note, saved place and library
 * record at once, and deleting backups removes the way back from that, so both follow
 * the rule "erase everything" set: accepted from the computer Outpost runs on, or from
 * anywhere when whoever starts Outpost set OUTPOST_ALLOW_REMOTE_ERASE. One option
 * covers all of them, because they are the same decision: whether every device on the
 * network may do what cannot be taken back.
 */
import type { BackupRight } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";
import { isLocalRequest, type RequestOrigin } from "../../core/local.ts";

const OPTION = "OUTPOST_ALLOW_REMOTE_ERASE";

export function backupRight(request: RequestOrigin, ctx: AppContext): BackupRight {
  if (ctx.config.allowRemoteErase) return { allowed: true, reason: "option", option: OPTION };
  return isLocalRequest(request, ctx.config)
    ? { allowed: true, reason: "local", option: OPTION }
    : { allowed: false, reason: "remote", option: OPTION };
}

/** Throws `forbidden`, saying why and what to do, unless the request has the right. `action` starts the sentence. */
export function assertBackupRight(request: RequestOrigin, ctx: AppContext, action: string): void {
  if (backupRight(request, ctx).allowed) return;
  throw new AppError(
    "forbidden",
    `${action} can only be done on the computer Outpost runs on. Open Outpost there, or start it with ${OPTION}=true to allow it from other devices.`,
  );
}
