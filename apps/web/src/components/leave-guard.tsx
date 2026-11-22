/**
 * Asks before changes that are not saved are left behind: a dialog when a link or Back
 * would take the person to another screen, and the browser's own question when the tab
 * is reloaded or closed.
 *
 * The in-app question needs the data router (main.tsx); where a screen is drawn without
 * one (a unit test in a MemoryRouter) only the reload question is asked.
 */
import { useContext, useEffect, useRef } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router";
import { ConfirmDialog } from "@/components/ui/dialog";

export interface LeaveGuardProps {
  /** Ask before another screen is opened. */
  when: boolean;
  /** Ask before the tab is reloaded or closed; by default the same as `when`. */
  beforeUnload?: boolean;
  /** What is not saved, for the question: "the changes to this sheet". */
  what?: string;
  /** Ask also when only the query changes: a form in one tab of a screen whose tabs are chosen by ?view=. */
  query?: boolean;
}

function warn(event: BeforeUnloadEvent) {
  event.preventDefault();
  // Older browsers show the question only when this is set; its words are their own.
  event.returnValue = "";
}

export function LeaveGuard({ when, beforeUnload = when, what = "your changes", query = false }: LeaveGuardProps) {
  const inDataRouter = useContext(UNSAFE_DataRouterContext) !== null;
  useEffect(() => {
    if (!beforeUnload) return;
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [beforeUnload]);
  return inDataRouter ? <AskBeforeLeaving when={when} what={what} query={query} /> : null;
}

function AskBeforeLeaving({ when, what, query }: { when: boolean; what: string; query: boolean }) {
  // A move to another screen (and, with `query`, to another tab of this one); a change of #part leaves nothing behind.
  // Read at the moment of the move, so that a screen that saves or deletes and then moves on (inside flushSync)
  // is not asked about what it has just dealt with.
  const asking = useRef(when);
  asking.current = when;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      asking.current && (currentLocation.pathname !== nextLocation.pathname || (query && currentLocation.search !== nextLocation.search)),
  );
  // Saved in the meantime: let the move go on.
  useEffect(() => {
    if (blocker.state === "blocked" && !when) blocker.proceed();
  }, [blocker, when]);
  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      onOpenChange={(open) => {
        if (!open && blocker.state === "blocked") blocker.reset();
      }}
      title="Leave without saving?"
      description={`${what[0]!.toUpperCase()}${what.slice(1)} are not saved yet. Leaving now loses them.`}
      cancelLabel="Stay here"
      confirmLabel="Leave without saving"
      onConfirm={() => blocker.state === "blocked" && blocker.proceed()}
    />
  );
}
