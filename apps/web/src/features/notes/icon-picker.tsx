/** Chooses the emoji shown beside a page's title: a small curated grid, or any emoji typed or pasted. */
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import { emojiGroups, firstEmoji } from "./emoji";

export function IconPicker({
  icon,
  onChange,
  children,
}: {
  icon: string | null;
  onChange(icon: string | null): void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [invalid, setInvalid] = useState(false);

  const choose = (next: string | null) => {
    onChange(next);
    setOpen(false);
    setTyped("");
    setInvalid(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const emoji = firstEmoji(typed);
    if (emoji) choose(emoji);
    else setInvalid(true);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-[19.5rem] max-w-[calc(100vw-1.5rem)] p-0">
        <div className="scroll-quiet max-h-[min(19rem,45dvh)] overflow-y-auto px-2.5 pt-1 pb-2">
          {emojiGroups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="px-1 pt-2 pb-1 text-micro font-medium text-ink-faint">{group.label}</h3>
              <div className="grid grid-cols-8">
                {group.emoji.map((emoji) => (
                  <button
                    key={emoji.char}
                    type="button"
                    title={emoji.name}
                    aria-label={emoji.name}
                    aria-pressed={emoji.char === icon}
                    onClick={() => choose(emoji.char)}
                    className="grid aspect-square place-content-center rounded-control text-[1.25rem] leading-none hover:bg-surface-strong aria-pressed:bg-primary-soft"
                  >
                    <span aria-hidden>{emoji.char}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <form onSubmit={submit} className="border-t border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <input
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setInvalid(false);
              }}
              aria-label="Any other emoji"
              aria-invalid={invalid || undefined}
              placeholder="Or paste any emoji"
              className="h-8 min-w-0 flex-1 rounded-control border border-border-strong bg-page px-2.5 text-small text-ink placeholder:text-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus max-md:h-10 max-md:text-body"
            />
            <Button type="submit" size="sm" disabled={!typed.trim()}>
              Use
            </Button>
            {icon ? (
              <Button variant="ghost" size="sm" onClick={() => choose(null)}>
                Remove
              </Button>
            ) : null}
          </div>
          {invalid ? (
            <p role="alert" className="mt-1.5 text-micro text-danger">
              That does not start with an emoji. Paste one from your keyboard's emoji panel.
            </p>
          ) : null}
        </form>
      </PopoverContent>
    </Popover>
  );
}
