import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Menu, MenuCheckItem, MenuContent, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { formatNumber } from "@/lib/utils";

export interface Choice<T extends string> {
  value: T;
  label: string;
  /** How many documents this choice would show. */
  count?: number;
}

/**
 * A button that opens a short list to pick one thing from: a filter ("Type: PDF") or
 * the sort order. With `anyLabel` the choice can be cleared; an active filter is tinted
 * so a narrowed list is noticeable at a glance.
 */
export function ChoiceMenu<T extends string>({
  label,
  value,
  choices,
  onChange,
  anyLabel,
  icon,
  align = "start",
}: {
  label: string;
  value: T | "";
  choices: Array<Choice<T>>;
  onChange: (value: T | "") => void;
  anyLabel?: string;
  icon?: ReactNode;
  align?: "start" | "end";
}) {
  const current = choices.find((choice) => choice.value === value);
  const filtering = Boolean(anyLabel && value);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          variant={filtering ? "soft" : "secondary"}
          size="sm"
          className="max-w-[min(14rem,100%)] shrink-0"
          aria-label={`${label}: ${current?.label ?? value ?? anyLabel}`}
        >
          {icon}
          <span className="truncate">
            {anyLabel ? (value ? `${label}: ${current?.label ?? value}` : label) : (current?.label ?? label)}
          </span>
          <ChevronDown aria-hidden className="-mr-1 opacity-70" />
        </Button>
      </MenuTrigger>
      <MenuContent
        align={align}
        className="scroll-quiet max-h-(--radix-dropdown-menu-content-available-height) max-w-72 min-w-52 overflow-y-auto"
      >
        {anyLabel ? (
          <>
            <MenuCheckItem className="relative" checked={!value} onCheckedChange={() => onChange("")}>
              {anyLabel}
            </MenuCheckItem>
            <MenuSeparator />
          </>
        ) : null}
        {choices.map((choice) => (
          <MenuCheckItem
            key={choice.value}
            className="relative"
            checked={choice.value === value}
            onCheckedChange={() => onChange(choice.value)}
          >
            <span className="flex items-baseline justify-between gap-4">
              <span className="truncate">{choice.label}</span>
              {choice.count !== undefined ? <span className="tabular text-micro text-ink-muted">{formatNumber(choice.count)}</span> : null}
            </span>
          </MenuCheckItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
