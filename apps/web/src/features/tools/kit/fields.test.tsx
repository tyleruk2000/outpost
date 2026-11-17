/**
 * A choice remembered on this device, under a name that can change with another choice
 * (the "From" unit of Weight, then of Volume): each name keeps its own choice.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChoice } from "./fields";

const weights = [
  { value: "g", label: "grams" },
  { value: "lb", label: "pounds" },
];
const volumes = [
  { value: "ml", label: "millilitres" },
  { value: "cup", label: "US cups" },
];

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function switching() {
  return renderHook(
    ({ kind }: { kind: "weight" | "volume" }) =>
      useChoice(`test.from.${kind}`, kind === "weight" ? weights : volumes, kind === "weight" ? "g" : "ml"),
    { initialProps: { kind: "weight" as "weight" | "volume" } },
  );
}

describe("a choice whose name follows another choice", () => {
  it("keeps the choice made under each name when switching between them", () => {
    const { result, rerender } = switching();
    act(() => result.current[1]("lb"));
    rerender({ kind: "volume" });
    expect(result.current[0]).toBe("ml");
    act(() => result.current[1]("cup"));
    rerender({ kind: "weight" });
    expect(result.current[0]).toBe("lb");
    rerender({ kind: "volume" });
    expect(result.current[0]).toBe("cup");
  });

  it("keeps them for the visit when the browser refuses to remember anything", () => {
    const refuse = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(refuse);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(refuse);
    const { result, rerender } = switching();
    act(() => result.current[1]("lb"));
    rerender({ kind: "volume" });
    act(() => result.current[1]("cup"));
    rerender({ kind: "weight" });
    expect(result.current[0]).toBe("lb");
  });
});
