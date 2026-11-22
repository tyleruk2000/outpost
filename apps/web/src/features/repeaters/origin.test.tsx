import type { HouseholdsResponse, MarkerDto } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hereHome, household, households, oneHouseholdOf, placeHome } from "@/features/households/test-support";
import { api } from "@/lib/api";
import { useOrigin } from "./origin";

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
  return renderHook(() => useOrigin(), { wrapper });
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the place distances are measured from", () => {
  it("is the home place until another is chosen", async () => {
    const { result } = origin([marker("hut", "Club hut", "mast"), marker("home", "Home", "home")]);
    await waitFor(() => expect(result.current.name).toBe("Home"));
    expect(result.current.choice).toBe("place:home");
    expect(result.current.position).toEqual({ lat: 54.43, lon: -2.96 });
  });

  it("is no place when none is the home place", async () => {
    const { result } = origin([marker("hut", "Club hut", "mast")]);
    await waitFor(() => expect(result.current.markers).toHaveLength(1));
    expect(result.current.choice).toBe("none");
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
    expect(result.current.choice).toBe("place:hut");
  });

  it("is where a portable household was last said to be, named with its age", async () => {
    const at = Date.now() - 3 * 3_600_000;
    const answer = households([household({ kind: "portable", name: "Caravan", home: hereHome("Where Caravan is now", 54.5, -3.1, at) })]);
    const { result } = origin([marker("hut", "Club hut", "mast")], answer);
    await waitFor(() => expect(result.current.name).toBe("Where Caravan is now, as of 3 hours ago"));
    expect(result.current.choice).toBe("household-here");
    expect(result.current.position).toEqual({ lat: 54.5, lon: -3.1 });
  });

  it("stays no place once a person has chosen no place", async () => {
    const { result } = origin([marker("home", "Home", "home")]);
    await waitFor(() => expect(result.current.name).toBe("Home"));
    act(() => result.current.setChoice("none"));
    expect(result.current.choice).toBe("none");
    expect(result.current.position).toBeNull();
  });
});
