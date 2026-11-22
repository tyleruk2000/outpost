/**
 * Which household the papers are for, and how a household that moves is written on paper.
 * A fixed household's home is an address-like saved place; a portable household's "home"
 * is only where a person last said it was, so the papers say where it was and when, and
 * print the people and the kit it travels with rather than an address.
 */
import type { HouseholdDto, HouseholdHome, HouseholdKind, SuppliesResponse } from "@outpost/shared";
import { useMemo } from "react";
import { useHouseholds } from "@/features/households/use-household";
import { appLocale } from "@/lib/region";

export interface PaperHousehold {
  id: string;
  name: string;
  kind: HouseholdKind;
  /** True when there are several households, so that a paper names the one it is for. */
  several: boolean;
  home: HouseholdHome | null;
}

/** The current household for the papers; null while it is read (or when it cannot be). */
export function usePaperHousehold(): { which: PaperHousehold | null; isPending: boolean; error: unknown } {
  const query = useHouseholds();
  const which = useMemo((): PaperHousehold | null => {
    const list: HouseholdDto[] = Array.isArray(query.data?.households) ? query.data.households : [];
    const household = list.find((entry) => entry.id === query.data?.currentId) ?? list[0];
    return household
      ? { id: household.id, name: household.name, kind: household.kind, several: list.length > 1, home: household.home }
      : null;
  }, [query.data]);
  return {
    which,
    isPending: query.isPending,
    error: query.error,
  };
}

/** "3 hours", "2 days", "5 weeks": how long before `now` a position was set. */
export function ageWords(ms: number): string {
  const hours = ms / 3_600_000;
  const count = (value: number, unit: string) => `${value} ${unit}${value === 1 ? "" : "s"}`;
  if (hours < 1) return "less than an hour";
  if (hours < 48) return count(Math.round(hours), "hour");
  const days = hours / 24;
  if (days < 14) return count(Math.round(days), "day");
  if (days < 70) return count(Math.round(days / 7), "week");
  return count(Math.round(days / 30.44), "month");
}

const longDate = () => new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric" });

/** "Where The van was on 20 November 2026", with the name it was given when one was. */
export function whereWasWords(name: string, home: { name: string; at?: number | null }): string {
  const when = home.at == null ? "" : ` on ${longDate().format(home.at)}`;
  const given = home.name && home.name !== `Where ${name} is now` ? ` (${home.name})` : "";
  return `Where ${name} was${when}${given}`;
}

/** The first place on a page of places: home, or where a portable household was last said to be. */
export function paperHomePlace(
  which: Pick<PaperHousehold, "name" | "kind"> | null,
  home: { name: string; lat: number; lon: number; at?: number | null } | null,
): { role: string; name: string; lat: number; lon: number } | null {
  if (!home) return null;
  if (which?.kind === "portable") return { role: "Last position", name: whereWasWords(which.name, home), lat: home.lat, lon: home.lon };
  return { role: "Home", name: home.name || "Home", lat: home.lat, lon: home.lon };
}

/** "14 things in Supplies, in the van and the roof box": what a portable household carries, from Supplies; null with nothing kept. */
export function kitWords(supplies: Pick<SuppliesResponse, "items"> | null): string | null {
  const items = supplies?.items ?? [];
  if (items.length === 0) return null;
  const places = [...new Set(items.map((item) => item.location.trim()).filter(Boolean))];
  const where = places.length === 0 ? "" : `, in ${places.length <= 3 ? joinAnd(places) : `${joinAnd(places.slice(0, 3))} and elsewhere`}`;
  return `${items.length} ${items.length === 1 ? "thing" : "things"} in Supplies${where}`;
}

function joinAnd(list: string[]): string {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}
