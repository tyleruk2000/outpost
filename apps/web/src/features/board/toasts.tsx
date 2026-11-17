/**
 * While Outpost is open in a tab, a new message or check-in from someone else shows the
 * app's own toast, unless the board is already on screen. Several at once make one
 * toast. This is the event itself: nothing polls, and there are no push notifications,
 * so nothing here can wake a locked phone. Mounted once, in the app shell.
 */
import type { BoardEvent } from "@outpost/shared";
import { useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { useServerEvent } from "@/lib/events";
import { notify } from "@/lib/notify";
import { plural } from "@/lib/utils";
import { deviceName } from "./data";

export function BoardToasts() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const held = useRef<BoardEvent[]>([]);
  const timer = useRef<number | undefined>(undefined);
  useServerEvent("board.changed", (payload) => {
    const event = payload.data as BoardEvent | undefined;
    if (event?.action !== "posted" || event.channel !== "board") return;
    if (pathname === "/messages") return;
    const me = deviceName();
    if (me && event.author?.toLowerCase() === me.toLowerCase()) return;
    held.current.push(event);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const events = held.current.splice(0);
      const last = events.at(-1);
      if (!last) return;
      const help = events.find((entry) => entry.kind === "checkin" && entry.status === "help");
      const words =
        events.length > 1
          ? `${plural(events.length, "new message")} on the board`
          : last.kind === "checkin"
            ? `${last.author} checked in${last.status === "safe" ? ": safe" : last.status === "help" ? ": needs help" : ""}`
            : `${last.author}: ${last.excerpt ?? ""}`;
      // Someone needing help is said at once, with the alert's mark, as an error is.
      const show = help ? notify.error : toast;
      show(help && events.length > 1 ? `${help.author} needs help. ${words}.` : words, {
        action: { label: "Open", onClick: () => navigate("/messages") },
      });
    }, 400);
  });
  return null;
}
