/**
 * Where something is kept to "the computer Outpost runs on" (restoring a backup, deleting stored ones, keeping
 * fewer, a backup passphrase, erasing everything) and Outpost runs in a container, no browser counts as that
 * computer, not even one on it. On a Raspberry Pi, deploy/pi/on-this-pi.sh opens Outpost as the Pi for as long as
 * it runs: this says so, with the two lines to type, beside each of those. Nothing where Outpost is not in a
 * container, where "open Outpost there" is the whole answer.
 */
import { Link } from "react-router";
import { CopyLine } from "@/components/setting-right";
import { useSystem } from "@/lib/queries";

/** The Pi set-up guide's part about this, at /help/deployment. */
export const ON_THIS_PI_GUIDE = "/help/deployment#h-10-things-kept-to-the-pi-itself";

export function OnThisPi({ className }: { className?: string }) {
  const system = useSystem();
  if (!system.data?.host.inContainer) return null;
  return (
    <div className={className ?? "mt-2 grid gap-1 text-small text-ink-muted"}>
      <p>
        Outpost runs in Docker here, where no browser counts as that computer. On a Raspberry Pi, open Outpost through the Pi: from a
        laptop, sign in with a tunnel and start it, then open{" "}
        <span className="font-mono text-[0.8125rem] text-ink">http://localhost:8090</span> on the laptop. Ctrl-C closes it again.
      </p>
      <CopyLine text="ssh -L 8090:localhost:8090 yourname@outpost.local" label="the command that signs in to the Pi" />
      <CopyLine text="cd outpost && ./deploy/pi/on-this-pi.sh" label="the command that opens Outpost as the Pi" />
      <p>
        <Link to={ON_THIS_PI_GUIDE} className="text-primary underline decoration-1 underline-offset-2 hover:decoration-2">
          Things kept to the Pi itself
        </Link>
      </p>
    </div>
  );
}
