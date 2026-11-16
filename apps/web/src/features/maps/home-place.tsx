/**
 * The home place, for screens other than the map: the saved place with the home icon,
 * the first saved if several (`homePlaceOf` in `@outpost/shared`). A screen that needs
 * one and finds none shows `NoHomePlace`: one line, and a link to the Maps screen.
 */
import { NO_HOME_PLACE } from "@outpost/shared";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

export function NoHomePlace({ className }: { className?: string }) {
  return (
    <p className={cn("text-small text-ink-muted", className)}>
      {NO_HOME_PLACE}{" "}
      <Link to="/maps" className="text-primary underline underline-offset-2">
        Open Maps
      </Link>
    </p>
  );
}
