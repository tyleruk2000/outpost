import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { addTags, TagEditor } from "./document-tags";

/** The editor wired to state, as the document screen wires it to the server. */
function Harness({ initial, save }: { initial: string[]; save: (tags: string[]) => Promise<unknown> }) {
  const [tags, setTags] = useState(initial);
  return (
    <TagEditor
      tags={tags}
      suggestions={["water", "radio"]}
      onChange={async (next) => {
        await save(next);
        setTags(next);
      }}
    />
  );
}

const field = () => screen.getByLabelText("Tags");
const chips = () => screen.queryAllByRole("button", { name: /^Remove tag / }).map((chip) => chip.textContent);

describe("addTags", () => {
  it("splits on commas, trims, and skips blanks and repeats whatever their capitals", () => {
    expect(addTags(["Water"], " first  aid , water,, Radio ")).toEqual(["Water", "first aid", "Radio"]);
  });
});

describe("tag editor", () => {
  it("adds a tag with Enter and saves the whole list", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Harness initial={["water"]} save={save} />);
    await userEvent.type(field(), "first aid{Enter}");
    expect(save).toHaveBeenCalledWith(["water", "first aid"]);
    expect(chips()).toEqual(["water", "first aid"]);
    expect(field()).toHaveValue("");
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("adds a tag with a comma, without the comma", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Harness initial={[]} save={save} />);
    await userEvent.type(field(), "rope,");
    expect(save).toHaveBeenCalledWith(["rope"]);
    expect(field()).toHaveValue("");
  });

  it("does not save a tag that is already there", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Harness initial={["water"]} save={save} />);
    await userEvent.type(field(), "WATER{Enter}");
    expect(save).not.toHaveBeenCalled();
    expect(chips()).toEqual(["water"]);
  });

  it("removes the last tag with Backspace in the empty field, but not while text is being edited", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Harness initial={["water", "rope"]} save={save} />);
    await userEvent.type(field(), "ab{Backspace}");
    expect(save).not.toHaveBeenCalled();
    await userEvent.type(field(), "{Backspace}{Backspace}");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(["water"]);
  });

  it("removes a tag with a click and keeps the keyboard in the field", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Harness initial={["water", "rope"]} save={save} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove tag water" }));
    expect(save).toHaveBeenCalledWith(["rope"]);
    expect(chips()).toEqual(["rope"]);
    expect(field()).toHaveFocus();
  });

  it("adds what was typed when the field is left", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Harness initial={[]} save={save} />);
    await userEvent.type(field(), "maps");
    await userEvent.tab();
    expect(save).toHaveBeenCalledWith(["maps"]);
  });

  it("on a refused save says why, puts the tags back, and returns what was typed to the field", async () => {
    const save = vi.fn().mockRejectedValue(new ApiError(400, "bad_request", "The tag is too long. Keep tags to 50 characters or fewer."));
    render(<Harness initial={["water"]} save={save} />);
    await userEvent.type(field(), "a very long tag{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("The tag is too long. Keep tags to 50 characters or fewer.");
    expect(chips()).toEqual(["water"]);
    expect(field()).toHaveValue("a very long tag");
  });

  it("offers existing tags that are not on the document yet", () => {
    const { container } = render(<Harness initial={["water"]} save={vi.fn()} />);
    const options = [...container.querySelectorAll("datalist option")].map((option) => option.getAttribute("value"));
    expect(options).toEqual(["radio"]);
  });
});
