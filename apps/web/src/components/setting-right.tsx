/**
 * Why a setting held to the computer Outpost runs on cannot be changed from this device,
 * and the exact line that allows it from every device (`SettingRight`). A control that is
 * disabled always says why beside it: never a greyed-out form with no reason.
 */
import { localByReason, type SettingRight } from "@outpost/shared";
import { Copy, MonitorSmartphone } from "lucide-react";

import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { notify } from "@/lib/notify";

/** A line to type or paste somewhere else, with a button that copies it. */
export function CopyLine({ text, label }: { text: string; label?: string }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <code className="min-w-0 rounded-control bg-surface px-2 py-1 font-mono text-[0.8125rem] text-ink [overflow-wrap:anywhere]">
        {text}
      </code>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Copy ${label ?? text}`}
        onClick={() =>
          void copyText(text).then((done) =>
            done ? toast.success("Copied.") : notify.error("This browser would not copy it. Select the line and copy it by hand."),
          )
        }
      >
        <Copy aria-hidden /> Copy
      </Button>
    </div>
  );
}

/** "Can't be changed from this device", why, and what whoever looks after Outpost can do about it. */
export function NotFromThisDevice({
  right,
  what,
  because,
  scope,
  id,
}: {
  right: SettingRight;
  /** "The mesh radio set-up": starts the sentence. */
  what: string;
  /** "it opens a port or a device on that computer". */
  because: string;
  /** What every device could then change: "the mesh radio set-up and the switch for other programs". */
  scope: string;
  id?: string;
}) {
  return (
    <Notice tone="info" icon={<MonitorSmartphone aria-hidden />} title="Can't be changed from this device">
      <div id={id} className="grid gap-2">
        <p>
          {what} can only be changed at the computer Outpost runs on, because {because}.{" "}
          {right.inContainer
            ? "Outpost runs in a container, where no request looks as if it comes from that computer, so this holds in a browser on it too."
            : "This device is not that computer."}
        </p>
        <div>
          <p>To allow it from every device, add this line to Outpost's .env file (in Docker, the one beside compose.yaml):</p>
          <CopyLine text={`${right.option}=true`} label="the line for the .env file" />
        </div>
        <div>
          {right.inContainer ? (
            <>
              <p>Then restart Outpost from that folder:</p>
              <CopyLine text="sudo docker compose up -d" label="the command that restarts Outpost" />
            </>
          ) : (
            <p>Then stop Outpost and start it again.</p>
          )}
        </div>
        <p className="text-ink-muted">Outpost has no accounts: with it on, every device on the home network can change {scope}.</p>
      </div>
    </Notice>
  );
}

/** Under a control that is offered: why it is offered on this device. */
export function rightReason(right: SettingRight): string {
  return right.reason === "option"
    ? `Offered on every device because Outpost was started with ${right.option}=true.`
    : `Offered here because ${localByReason(right.localBy)}.`;
}

/** What every device could change with OUTPOST_ALLOW_REMOTE_SETTINGS on, said the same everywhere. */
export const REMOTE_SETTINGS_SCOPE = "the mesh radio set-up and the switch that lets other programs use Outpost's tools";
