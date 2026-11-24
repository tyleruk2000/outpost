import type { HouseholdsResponse, MarkerDto } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hereHome, household, households, oneHouseholdOf, placeHome } from "@/features/households/test-support";
import { api } from "@/lib/api";
import { originText, parseOrigin, REPEATERS_ORIGIN_KEY, useOrigin, useStoredOrigin } from "./origin";

const marker = (id: string, name: string, icon: MarkerDto["icon"]): MarkerDto =>
  ({
    id,
    name,
    lat: 54.43,
    lon: -2.96,
    icon,
    color: null,
    note: "",
    isFavorite: false,
    noteId: null,
    createdAt: 0,
    updatedAt: 0,
  }) as unknown as MarkerDto;

function origin(markers: MarkerDto[], answer: HouseholdsResponse = oneHouseholdOf(markers)) {
  vi.spyOn(api, "get").mockImplementation(async (path: string) => (path === "/api/households" ? answer : { markers }) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useOrigin(useStoredOrigin(REPEATERS_ORIGIN_KEY)), { wrapper });
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the place distances are measured from", () => {
  it("is the home place until another is chosen", async () => {
    const { result } = origin([marker("hut", "Club hut", "mast"), marker("home", "Home", "home")]);
    await waitFor(() => expect(result.current.position).toEqual({ lat: 54.43, lon: -2.96 }));
    expect(result.current.value).toEqual({ kind: "home" });
    expect(result.current.name).toBe("Home");
  });

  it("is Home with no position when the household has no home", async () => {
    const { result } = origin([marker("hut", "Club hut", "mast")]);
    await waitFor(() => expect(result.current.markers).toHaveLength(1));
    expect(result.current.value.kind).toBe("home");
    expect(result.current.home).toBeNull();
    expect(result.current.position).toBeNull();
  });

  it("is the current household's home place when there are several", async () => {
    const hut = marker("hut", "Club hut", "mast");
    const home = marker("home", "Home", "home");
    const answer = households(
      [household({ home: placeHome(home) }), household({ id: "h2", name: "Club", position: 1, homePlaceId: "hut", home: placeHome(hut) })],
      "h2",
    );
    const { result } = origin([hut, home], answer);
    await waitFor(() => expect(result.current.name).toBe("Club hut"));
  });

  it("is where a portable household was last said to be, named with its age", async () => {
    const at = Date.now() - 3 * 3_600_000;
    const answer = households([household({ kind: "portable", name: "Caravan", home: hereHome("Where Caravan is now", 54.5, -3.1, at) })]);
    const { result } = origin([marker("hut", "Club hut", "mast")], answer);
    await waitFor(() => expect(result.current.name).toBe("Where Caravan is now, as of 3 hours ago"));
    expect(result.current.position).toEqual({ lat: 54.5, lon: -3.1 });
  });

  it("is a point tapped on the map, named by where it is, and remembered", async () => {
    const { result } = origin([marker("home", "Home", "home")]);
    await waitFor(() => expect(result.current.name).toBe("Home"));
    act(() => result.current.set({ kind: "point", lat: 51.4612, lon: -0.1903 }));
    expect(result.current.name).toBe("a point on the map (51.46, -0.19)");
    expect(result.current.position).toEqual({ lat: 51.4612, lon: -0.1903 });
    expect(JSON.parse(localStorage.getItem(REPEATERS_ORIGIN_KEY) ?? "null")).toBe("point:51.46120,-0.19030");
  });

  it("reads the choices older versions kept, the middle of the map among them, as Home", () => {
    for (const old of ["none", "map", "typed", "household-here", "", "point:95,0", "at:1,2:"])
      expect(parseOrigin(old)).toEqual({ kind: "home" });
    expect(parseOrigin("here")).toEqual({ kind: "here" });
    expect(parseOrigin("place:abc")).toEqual({ kind: "place", id: "abc" });
    const found = { kind: "at", lat: 54.5, lon: -3.1, name: "Keswick: Market Square" } as const;
    expect(parseOrigin(originText(found))).toEqual(found);
  });
});
