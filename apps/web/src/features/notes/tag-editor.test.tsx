import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { addTags, MAX_TAG_LENGTH, MAX_TAGS, TagEditor } from "./tag-editor";

describe("addTags", () => {
  it("adds a trimmed tag at the end", () => {
    expect(addTags(["kit"], "  winter ")).toEqual(["kit", "winter"]);
  });

  it("splits on commas and skips blanks", () => {
    expect(addTags([], "ropes, , ice axe,")).toEqual(["ropes", "ice axe"]);
  });

  it("skips a tag that is already there, whatever its capitals", () => {
    expect(addTags(["Winter"], "winter, WINTER, summer")).toEqual(["Winter", "summer"]);
  });

  it("cuts a tag to the length the server keeps", () => {
    expect(addTags([], "x".repeat(80))[0]).toHaveLength(MAX_TAG_LENGTH);
  });

  it("stops at the most tags a page can have", () => {
    const many = Array.from({ length: MAX_TAGS }, (_, index) => `tag ${index}`);
    expect(addTags(many, "one more")).toEqual(many);
  });
});

function Harness({ initial = [] as string[], onChange = (_tags: string[]) => {} }) {
  const [tags, setTags] = useState(initial);
  return (
    <TagEditor
      tags={tags}
      onChange={(next) => {
        setTags(next);
        onChange(next);
      }}
    />
  );
}

const tagNames = () => screen.queryAllByRole("listitem").map((item) => item.textContent);

describe("TagEditor", () => {
  it("adds a tag on Enter and clears the field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Add a tag" });
    await user.type(input, "avalanche{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["avalanche"]);
    expect(tagNames()).toEqual(["avalanche"]);
    expect(input).toHaveValue("");
  });

  it("adds a tag on a comma, without keeping the comma", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["kit"]} />);
    await user.type(screen.getByRole("textbox", { name: "Add a tag" }), "winter,ropes,");
    expect(tagNames()).toEqual(["kit", "winter", "ropes"]);
  });

  it("removes the last tag on Backspace in an empty field", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["kit", "winter"]} />);
    await user.type(screen.getByRole("textbox", { name: "Add a tag" }), "{Backspace}");
    expect(tagNames()).toEqual(["kit"]);
  });

  it("uses Backspace to edit text while there is some", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["kit"]} />);
    const input = screen.getByRole("textbox", { name: "Add a tag" });
    await user.type(input, "ab{Backspace}");
    expect(input).toHaveValue("a");
    expect(tagNames()).toEqual(["kit"]);
  });

  it("removes a tag when its button is pressed", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["kit", "winter"]} />);
    await user.click(screen.getByRole("button", { name: "Remove tag kit" }));
    expect(tagNames()).toEqual(["winter"]);
  });

  it("does not add the same tag twice", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={["Kit"]} onChange={onChange} />);
    await user.type(screen.getByRole("textbox", { name: "Add a tag" }), "kit{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(tagNames()).toEqual(["Kit"]);
  });

  it("keeps what was typed when the field loses focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("textbox", { name: "Add a tag" }), "half typed");
    await user.tab();
    expect(tagNames()).toEqual(["half typed"]);
  });

  it("splits pasted text on commas and new lines", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("textbox", { name: "Add a tag" }));
    await user.paste("map, compass\nwhistle");
    expect(tagNames()).toEqual(["map", "compass", "whistle"]);
  });

  it("shows tags without controls when the page cannot be edited", () => {
    render(<TagEditor tags={["kit"]} onChange={() => {}} readOnly />);
    expect(tagNames()).toEqual(["kit"]);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
