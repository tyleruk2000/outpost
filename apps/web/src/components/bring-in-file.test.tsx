import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { placesWords } from "@/features/weather/places-view";
import { notify } from "@/lib/notify";
import { BringInFile } from "./bring-in-file";

const fileOf = (name: string, text: string) => new File([text], name, { type: "application/json" });
const chooser = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input[type="file"]')!;

describe("bringing a file back in", () => {
  it("hands each file's text to the screen and says what each made in one message", async () => {
    const success = vi.spyOn(toast, "success").mockImplementation(() => "");
    const failed = vi.spyOn(notify, "error").mockImplementation(() => "");
    const onFile = vi.fn(async (text: string, name: string) => {
      if (name === "bad.json") throw new Error("That file does not hold a power plan.");
      return `${JSON.parse(text).plan.name} added.`;
    });
    const { container } = render(
      <BringInFile accept=".json" maxBytes={1000} multiple onFile={onFile}>
        Bring in a plan
      </BringInFile>,
    );
    expect(screen.getByRole("button", { name: "Bring in a plan" })).toBeEnabled();
    await userEvent.upload(chooser(container), [
      fileOf("shack.json", JSON.stringify({ plan: { name: "Shack" } })),
      fileOf("bad.json", "{}"),
      fileOf("big.json", "x".repeat(2000)),
      fileOf("hut.json", JSON.stringify({ plan: { name: "Hut" } })),
    ]);
    await waitFor(() => expect(success).toHaveBeenCalledWith("Shack added. Hut added."));
    expect(onFile).toHaveBeenCalledTimes(3);
    expect(failed).toHaveBeenCalledWith("bad.json: That file does not hold a power plan.");
    expect(failed.mock.calls.some(([words]) => String(words).startsWith("big.json is larger than"))).toBe(true);
    success.mockRestore();
    failed.mockRestore();
  });

  it("says in words what a file of weather places made", () => {
    expect(placesWords({ added: [], already: 2, noRoom: 0, notPoints: 1 })).toBe(
      "No places added. 2 were in the list already. 1 line or shape passed over: only points are places.",
    );
    expect(placesWords({ added: [{} as never], already: 0, noRoom: 3, notPoints: 0 })).toBe(
      "1 place added. 3 places left out: the list holds 12. Press Update now to fetch their forecasts.",
    );
  });
});
