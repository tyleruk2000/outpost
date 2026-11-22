import { Check } from "lucide-react";
import { DropdownMenu as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Menu = Primitive.Root;
export const MenuTrigger = Primitive.Trigger;
export const MenuGroup = Primitive.Group;

/**
 * The panel of a menu, a popover or a drop-down's list. Its layer is above a dialog's:
 * any of them may be opened from inside a dialog, and at the layer below (where the
 * page's own floating things sit) it opened under the dialog, unseen and out of reach.
 */
export const floating =
  "z-(--z-popover) min-w-44 rounded-panel border border-border bg-raised p-1 text-small text-ink shadow-float data-[state=open]:animate-enter focus:outline-none";

const item =
  "flex cursor-default items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 outline-none select-none data-highlighted:bg-surface-strong data-disabled:opacity-45 max-md:min-h-11 max-md:py-2.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted";

export function MenuContent({ className, sideOffset = 6, align = "end", ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        // On a short screen (a phone on its side, a window zoomed to 200%) the menu scrolls rather than running off the edge.
        className={cn(floating, "max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto", className)}
        {...props}
      />
    </Primitive.Portal>
  );
}

export function MenuItem({ className, danger, ...props }: ComponentProps<typeof Primitive.Item> & { danger?: boolean }) {
  return (
    <Primitive.Item
      className={cn(item, danger && "text-danger data-highlighted:bg-danger-soft [&_svg]:text-danger", className)}
      {...props}
    />
  );
}

export function MenuCheckItem({ className, children, ...props }: ComponentProps<typeof Primitive.CheckboxItem>) {
  return (
    <Primitive.CheckboxItem className={cn(item, "relative pr-8", className)} {...props}>
      <span className="flex-1">{children}</span>
      <Primitive.ItemIndicator className="absolute right-2.5">
        <Check className="text-primary!" />
      </Primitive.ItemIndicator>
    </Primitive.CheckboxItem>
  );
}

export const MenuRadioGroup = Primitive.RadioGroup;

/** One of a set of which only one is chosen, as in a `MenuRadioGroup`. */
export function MenuRadioItem({ className, children, ...props }: ComponentProps<typeof Primitive.RadioItem>) {
  return (
    <Primitive.RadioItem className={cn(item, "relative pr-8", className)} {...props}>
      <span className="flex-1">{children}</span>
      <Primitive.ItemIndicator className="absolute right-2.5">
        <Check className="text-primary!" />
      </Primitive.ItemIndicator>
    </Primitive.RadioItem>
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return <Primitive.Label className={cn("px-2.5 pt-1.5 pb-1 text-micro font-medium text-ink-faint", className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}
