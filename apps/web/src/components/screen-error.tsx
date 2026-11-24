/**
 * What a person sees when a screen fails while it is being drawn, instead of an empty
 * window: the sidebar and the More sheet stay, and the screen says what happened and
 * how to get back. Moving to another screen clears it.
 *
 * The usual cause in a tab left open is an update: the server now has a new build, and
 * the part of the old one this screen needed is no longer there to be fetched.
 */
import { RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode, useEffect, useRef } from "react";
import { Link } from "react-router";
import { useServerConnection } from "@/lib/events";
import { useServerDown } from "./connection-notice";
import { Page } from "./page";
import { Button } from "./ui/button";

/** Whether `error` is a part of the app that could not be fetched, rather than a fault in it. */
export function isMissingPart(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Unable to preload CSS/i.test(
    message,
  );
}

export function ScreenFailed({ error }: { error: unknown }) {
  const missing = isMissingPart(error);
  const connected = useServerConnection();
  const down = useServerDown();
  const unreachable = missing && (down || !connected);
  // A part that could not be fetched while the server was away is fetched once it answers again: the page is loaded
  // afresh, which also brings the current version if Outpost was updated meanwhile (owner's review, 24 Nov 2026).
  const answering = connected && !down;
  const wasAway = useRef(!answering);
  useEffect(() => {
    if (!answering) wasAway.current = true;
    else if (missing && wasAway.current) window.location.reload();
  }, [answering, missing]);
  return (
    <Page width="reading">
      <h1 className="font-title text-title">{missing ? "This screen could not be loaded" : "This screen stopped working"}</h1>
      <p className="mt-2 text-ink-muted">
        {unreachable
          ? "Outpost's server cannot be reached, so this screen could not be fetched. It opens by itself once the server answers again."
          : missing
            ? "Outpost may have been updated since this tab was opened. Reloading fetches the current version."
            : "Something went wrong while it was being shown. Nothing you saved is affected. Reloading usually puts it right."}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          <RefreshCw /> Reload
        </Button>
        <Button asChild>
          <Link to="/">Go to Home</Link>
        </Button>
      </div>
      {!missing && error instanceof Error ? (
        <details className="mt-8 text-small text-ink-muted">
          <summary className="cursor-pointer">What went wrong</summary>
          <p className="mt-2 font-mono break-words">{error.message}</p>
        </details>
      ) : null}
    </Page>
  );
}

export class ScreenErrorBoundary extends Component<{ path: string; children: ReactNode }, { error: unknown; path: string }> {
  override state = { error: undefined as unknown, path: this.props.path };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  static getDerivedStateFromProps(props: { path: string }, state: { error: unknown; path: string }) {
    // Another screen was chosen: try drawing again.
    return props.path === state.path ? null : { error: undefined, path: props.path };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("A screen failed while it was being shown", error, info.componentStack);
  }

  override render() {
    return this.state.error === undefined ? this.props.children : <ScreenFailed error={this.state.error} />;
  }
}
