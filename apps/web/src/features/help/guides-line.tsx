/** The line in Settings, under This installation, that leads to the guides for installing and looking after Outpost. */
import { Link } from "react-router";

export function GuidesLine() {
  return (
    <p className="text-small text-ink-muted">
      <span className="font-medium text-ink">Guides.</span> How to install Outpost, move it to a Raspberry Pi, keep backups and put right
      what goes wrong are under{" "}
      <Link to="/help" className="text-primary underline decoration-1 underline-offset-2 hover:decoration-2">
        Help
      </Link>
      , and read with no internet.
    </p>
  );
}
