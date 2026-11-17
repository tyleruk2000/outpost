/** The top of a page: an optional cover picture, the icon, and the title. */
import { ImagePlus, SmilePlus } from "lucide-react";
import { type KeyboardEvent, type Ref, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { IconPicker } from "./icon-picker";

/** Quiet controls that appear with the pointer or the keyboard, and are always there on touch screens. */
const reveal =
  "opacity-0 transition-opacity duration-150 group-hover/reveal:opacity-100 group-focus-within/reveal:opacity-100 [@media(hover:none)]:opacity-100";

export function PageCover({
  url,
  editable,
  uploading,
  onChange,
  onRemove,
}: {
  url: string;
  editable: boolean;
  uploading: boolean;
  onChange(): void;
  onRemove(): void;
}) {
  return (
    <div className="group/reveal relative h-36 w-full bg-surface md:h-52">
      <img src={url} alt="" className="size-full object-cover" />
      {editable ? (
        <div
          className={cn(
            "absolute right-4 bottom-3 flex gap-1.5 md:right-6 [@media(hover:none)]:hidden",
            reveal,
            uploading && "opacity-100",
          )}
        >
          <Button size="sm" onClick={onChange} loading={uploading}>
            Change cover
          </Button>
          <Button size="sm" onClick={onRemove} disabled={uploading}>
            Remove
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function PageTitle({
  ref,
  value,
  editable,
  onChange,
  onEnter,
  onBlur,
}: {
  ref?: Ref<HTMLTextAreaElement>;
  value: string;
  editable: boolean;
  onChange(title: string): void;
  /** Enter, or the down arrow at the end, moves into the text. */
  onEnter(): void;
  onBlur(): void;
}) {
  const local = useRef<HTMLTextAreaElement | null>(null);

  // A title is one line of text that may wrap, so the field grows to fit it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the height follows the text
  useLayoutEffect(() => {
    const field = local.current;
    if (!field) return;
    field.style.height = "0";
    field.style.height = `${field.scrollHeight}px`;
  }, [value]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    const atEnd = event.currentTarget.selectionStart === event.currentTarget.value.length;
    if (event.key === "Enter" || (event.key === "ArrowDown" && atEnd)) {
      event.preventDefault();
      onEnter();
    }
  };

  return (
    <textarea
      ref={(element) => {
        local.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      }}
      rows={1}
      value={value}
      readOnly={!editable}
      onChange={(event) => onChange(event.target.value.replace(/\n/g, " "))}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      maxLength={300}
      aria-label="Page title"
      placeholder="Untitled"
      enterKeyHint="next"
      className="block w-full resize-none overflow-hidden bg-transparent font-title text-display text-ink placeholder:text-ink-faint focus:outline-none max-md:text-title"
    />
  );
}

/** The icon above the title, and the "add" buttons for whichever of icon and cover the page lacks. */
export function PageAdornments({
  icon,
  hasCover,
  editable,
  coverUploading,
  iconButtonRef,
  onIcon,
  onAddCover,
}: {
  icon: string | null;
  hasCover: boolean;
  editable: boolean;
  coverUploading: boolean;
  iconButtonRef: Ref<HTMLButtonElement>;
  onIcon(icon: string | null): void;
  onAddCover(): void;
}) {
  if (!editable) return icon ? <div className="mb-2 text-[3rem] leading-none">{icon}</div> : null;

  return (
    <div className={cn("flex flex-wrap items-end gap-1", icon ? "mb-2" : "-ml-2.5 mb-1 min-h-8")}>
      <IconPicker icon={icon} onChange={onIcon}>
        {icon ? (
          <button
            ref={iconButtonRef}
            type="button"
            aria-label={`Page icon ${icon}. Change it`}
            className="-ml-1.5 grid size-16 place-content-center rounded-panel text-[3rem] leading-none hover:bg-surface-strong"
          >
            <span aria-hidden>{icon}</span>
          </button>
        ) : (
          <Button ref={iconButtonRef} variant="ghost" size="sm" className={reveal}>
            <SmilePlus /> Add icon
          </Button>
        )}
      </IconPicker>
      {hasCover ? null : (
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddCover}
          disabled={coverUploading}
          className={cn(reveal, coverUploading && "opacity-100")}
        >
          {coverUploading ? <Spinner /> : <ImagePlus />} Add cover
        </Button>
      )}
    </div>
  );
}
