import type { ReactNode } from "react";
import { Contour } from "@/components/contour";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";

/** The one screen shown outside the shell: the app loaded but its server is not answering. */
function Frame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-spine px-4 py-10 text-spine-ink">
      <Contour seed={21} columns={96} rows={60} levels={11} className="absolute inset-0 -z-10 size-full text-spine-ink-muted opacity-25" />
      <main className="w-full max-w-[26rem]">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark className="size-8" />
          <span className="font-title text-heading">Outpost</span>
        </div>
        <div className="rounded-panel bg-page p-6 text-ink shadow-dialog sm:p-8">
          <h1 className="font-title text-heading">{title}</h1>
          <p className="mt-1.5 text-small text-ink-muted">{lead}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-5 text-small text-spine-ink-muted">Knowledge beyond the network. Everything here is served from this device.</p>
      </main>
    </div>
  );
}

export function ServerDown({ onRetry }: { onRetry: () => void }) {
  return (
    <Frame title="The server is not responding" lead="The Outpost app loaded, but it cannot reach its server on this device.">
      <p className="text-small text-ink-muted">
        If you just started or restarted Outpost, give it a few seconds. Otherwise check that the Outpost service or container is running.
      </p>
      <Button variant="primary" className="mt-5" onClick={onRetry}>
        Try again
      </Button>
    </Frame>
  );
}
